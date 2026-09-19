import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EconomicsPanel } from './EconomicsPanel';
import { makeGridState } from '../../test/fixtures';
import { useGridSimulation } from '../../hooks/useGridSimulation';
import { useDrawerLayout } from '../../hooks/useDrawerLayout';
import { ControlPanel } from '../ControlPanel';

function SimulatorControls() {
    const { state, history, dispatch, simulationResetVersion } = useGridSimulation();
    const layout = useDrawerLayout();
    return <ControlPanel
        gridState={state}
        history={history}
        onCommand={dispatch}
        layout={layout}
        simulationResetVersion={simulationResetVersion}
    />;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('EconomicsPanel tariff inputs', () => {
    it('clears an invalid draft on every Reset even when the applied rate and timestamp stay unchanged', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        const user = userEvent.setup();
        render(<SimulatorControls />);
        await user.click(screen.getByTitle('Metrics'));
        await user.click(screen.getByTitle('Controls'));
        const input = screen.getByRole('spinbutton', { name: 'peak tariff rate' });
        const reset = screen.getByTestId('simulation-reset');

        for (let attempt = 0; attempt < 2; attempt += 1) {
            expect(input).toHaveValue(350);
            fireEvent.change(input, { target: { value: '2000' } });
            fireEvent.blur(input);
            expect(input).toHaveAttribute('aria-invalid', 'true');

            // These commands preserve settings and must not discard an edit.
            await user.click(screen.getByTestId('simulation-pause'));
            await user.click(screen.getByTestId('simulation-stop'));
            expect(input).toHaveValue(2000);
            expect(input).toHaveAttribute('aria-invalid', 'true');

            await user.click(reset);
            expect(screen.getByRole('spinbutton', { name: 'peak tariff rate' })).toBe(input);
            expect(input).toHaveValue(350);
            expect(input).not.toHaveAttribute('aria-invalid');
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(reset).toHaveFocus();
        }
    });

    it.each(['Enter', 'blur'] as const)('rejects 2000 after applying the maximum rate on %s', (trigger) => {
        const onCommand = vi.fn();
        const gridState = makeGridState();
        const { rerender } = render(<EconomicsPanel simulationResetVersion={0} gridState={gridState} onCommand={onCommand} />);
        const input = screen.getByRole('spinbutton', { name: 'peak tariff rate' });
        const commit = () => trigger === 'Enter'
            ? fireEvent.keyDown(input, { key: 'Enter' })
            : fireEvent.blur(input);

        fireEvent.change(input, { target: { value: '1000' } });
        commit();
        expect(onCommand).toHaveBeenLastCalledWith({
            type: 'SET_TARIFF_RATE', payload: { period: 'peak', value: 1000 },
        });

        const appliedState = { ...gridState, tariffRatesEurMwh: { ...gridState.tariffRatesEurMwh, peak: 1000 } };
        rerender(<EconomicsPanel simulationResetVersion={0} gridState={appliedState} onCommand={onCommand} />);
        onCommand.mockClear();
        fireEvent.change(input, { target: { value: '2000' } });
        commit();

        // A simulation tick retains the same applied price. It must not hide the validation error.
        rerender(<EconomicsPanel simulationResetVersion={0} gridState={{ ...appliedState, timestamp: 1 }} onCommand={onCommand} />);
        expect(onCommand).not.toHaveBeenCalled();
        expect(input).toHaveValue(2000);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAccessibleDescription('Enter -500 to 1000 €/MWh. Current: 1000 €/MWh.');

        fireEvent.change(input, { target: { value: '950' } });
        commit();
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(onCommand).toHaveBeenLastCalledWith({
            type: 'SET_TARIFF_RATE', payload: { period: 'peak', value: 950 },
        });
    });

    it('accepts the negative price boundary and rejects prices below it', () => {
        const onCommand = vi.fn();
        const gridState = makeGridState();
        const { rerender } = render(<EconomicsPanel simulationResetVersion={0} gridState={gridState} onCommand={onCommand} />);
        const input = screen.getByRole('spinbutton', { name: 'off-peak tariff rate' });

        fireEvent.change(input, { target: { value: '-500' } });
        fireEvent.blur(input);
        expect(onCommand).toHaveBeenLastCalledWith({
            type: 'SET_TARIFF_RATE', payload: { period: 'off-peak', value: -500 },
        });
        rerender(<EconomicsPanel simulationResetVersion={0}
            gridState={{ ...gridState, tariffRatesEurMwh: { ...gridState.tariffRatesEurMwh, 'off-peak': -500 } }}
            onCommand={onCommand}
        />);
        onCommand.mockClear();

        fireEvent.change(input, { target: { value: '-501' } });
        fireEvent.blur(input);
        expect(onCommand).not.toHaveBeenCalled();
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent('Current: -500 €/MWh.');

        fireEvent.change(input, { target: { value: '-250' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(onCommand).toHaveBeenLastCalledWith({
            type: 'SET_TARIFF_RATE', payload: { period: 'off-peak', value: -250 },
        });
    });

    it('rejects an empty draft and clears its error when the applied rate changes externally', () => {
        const onCommand = vi.fn();
        const gridState = makeGridState();
        const { rerender } = render(<EconomicsPanel simulationResetVersion={0} gridState={gridState} onCommand={onCommand} />);
        const input = screen.getByRole('spinbutton', { name: 'peak tariff rate' });

        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);
        expect(onCommand).not.toHaveBeenCalled();
        expect(input).toHaveAttribute('aria-invalid', 'true');

        rerender(<EconomicsPanel simulationResetVersion={0}
            gridState={{ ...gridState, tariffRatesEurMwh: { ...gridState.tariffRatesEurMwh, peak: 400 } }}
            onCommand={onCommand}
        />);
        expect(input).toHaveValue(400);
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        // Returning to the original rate must not resurrect the retired draft.
        rerender(<EconomicsPanel simulationResetVersion={0} gridState={gridState} onCommand={onCommand} />);
        expect(input).toHaveValue(350);
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
