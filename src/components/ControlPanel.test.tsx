import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ControlPanel } from './ControlPanel';
import { makeGridState } from '../test/fixtures';

describe('ControlPanel', () => {
    it('dispatches peak-ready toggle from the control button', async () => {
        const user = userEvent.setup();
        const onCommand = vi.fn();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={onCommand}
            />,
        );

        await user.click(screen.getByRole('button', { name: /peak ready/i }));

        expect(onCommand).toHaveBeenCalledWith({ type: 'TOGGLE_AUTO_ARB' });
    });

    it('dispatches manual charge mode from the dispatch controls', async () => {
        const user = userEvent.setup();
        const onCommand = vi.fn();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={onCommand}
            />,
        );

        await user.click(screen.getAllByRole('button', { name: /^charge$/i }).at(-1)!);

        expect(onCommand).toHaveBeenCalledWith({ type: 'CHARGE' });
    });

    it('dispatches simulation start and BESS capacity changes', async () => {
        const user = userEvent.setup();
        const onCommand = vi.fn();

        render(
            <ControlPanel
                gridState={makeGridState({ simulationStatus: 'stopped' })}
                history={[]}
                onCommand={onCommand}
            />,
        );

        await user.click(screen.getAllByTestId('simulation-start').at(-1)!);

        const capacityInput = screen.getAllByTestId('bess-energy-capacity-input').at(-1)!;
        fireEvent.change(capacityInput, { target: { value: '800' } });

        expect(onCommand).toHaveBeenCalledWith({ type: 'START_SIMULATION' });
        expect(onCommand).toHaveBeenCalledWith({ type: 'SET_BESS_ENERGY_CAPACITY', payload: 800 });
    });

    it('dispatches tariff rate updates for editable economics inputs', () => {
        const onCommand = vi.fn();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={onCommand}
            />,
        );

        fireEvent.change(screen.getAllByTestId('tariff-rate-peak').at(-1)!, { target: { value: '420' } });

        expect(onCommand).toHaveBeenCalledWith({
            type: 'SET_TARIFF_RATE',
            payload: { period: 'peak', value: 420 },
        });
    });
});
