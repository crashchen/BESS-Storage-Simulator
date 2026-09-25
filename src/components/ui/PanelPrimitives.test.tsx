import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GRID } from '../../config';
import { useDrawerLayout } from '../../hooks/useDrawerLayout';
import { useGridSimulation } from '../../hooks/useGridSimulation';
import type { BESSCommand } from '../../types';
import { ControlPanel } from '../ControlPanel';
import { ActionButton, NumericField } from './PanelPrimitives';

// Real simulation hook, reducer and drawers; records every dispatched command.
function SimulatorControls({ commands }: { commands: BESSCommand[] }) {
    const { state, history, dispatch, simulationResetVersion } = useGridSimulation();
    const layout = useDrawerLayout();
    return <ControlPanel
        gridState={state}
        history={history}
        onCommand={(cmd) => {
            commands.push(cmd);
            dispatch(cmd);
        }}
        layout={layout}
        simulationResetVersion={simulationResetVersion}
    />;
}

function RestorableField({ onChange }: { onChange: (value: number) => void }) {
    const [value, setValue] = useState(102);
    return (
        <>
            <NumericField
                label="PV Evacuation Limit"
                value={value}
                unit="MW"
                min={5}
                max={500}
                step={1}
                accentClass="text-orange-300"
                testId="pv-evacuation-input"
                onChange={(next) => {
                    onChange(next);
                    setValue(next);
                }}
            />
            {/* Restores the source value without moving focus or editing the field. */}
            <button type="button" onClick={() => setValue(102)}>Restore</button>
        </>
    );
}

describe('PanelPrimitives', () => {
    it('exposes pressed state for active action buttons', () => {
        render(
            <ActionButton
                label="Start"
                active
                color="#22c55e"
                onClick={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: /start/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps invalid numeric drafts visible and announces the range', () => {
        const onChange = vi.fn();

        render(
            <NumericField
                label="Capacity"
                value={10}
                unit="MW"
                min={0}
                max={100}
                step={1}
                accentClass="text-blue-300"
                testId="capacity-input"
                onChange={onChange}
            />,
        );

        const input = screen.getByLabelText('Capacity');
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);

        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent('Enter 0-100 MW.');

        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.blur(input);

        expect(onChange).toHaveBeenCalledWith(50);
        expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('keeps typed and invalid drafts through renders that retain the applied value', () => {
        const onChange = vi.fn();
        const field = (value: number) => (
            <NumericField
                label="Capacity"
                value={value}
                unit="MW"
                min={0}
                max={100}
                step={1}
                accentClass="text-blue-300"
                testId="capacity-input"
                onChange={onChange}
            />
        );
        const { rerender } = render(field(10));
        const input = screen.getByLabelText('Capacity');

        // Simulation ticks re-render the panel while the user is still typing.
        fireEvent.change(input, { target: { value: '4' } });
        rerender(field(10));
        expect(input).toHaveValue(4);

        fireEvent.change(input, { target: { value: '400' } });
        fireEvent.blur(input);
        rerender(field(10));
        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveValue(400);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAccessibleDescription('Enter 0-100 MW.');
    });

    it.each(['blur', 'Enter'] as const)('does not revive a draft committed on %s when its source value returns', (trigger) => {
        const onChange = vi.fn();
        render(<RestorableField onChange={onChange} />);
        const input = screen.getByLabelText('PV Evacuation Limit');
        const commit = () => trigger === 'Enter'
            ? fireEvent.keyDown(input, { key: 'Enter' })
            : fireEvent.blur(input);

        fireEvent.change(input, { target: { value: '20' } });
        commit();
        expect(onChange).toHaveBeenLastCalledWith(20);
        expect(input).toHaveValue(20);

        fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
        expect(input).toHaveValue(102);

        onChange.mockClear();
        commit();
        expect(onChange).not.toHaveBeenCalledWith(20);
        expect(input).toHaveValue(102);
    });

    it.each(['blur', 'Enter'] as const)('shows PV evacuation 102 after Reset and does not recommit 20 on %s', async (trigger) => {
        const commands: BESSCommand[] = [];
        const user = userEvent.setup();
        render(<SimulatorControls commands={commands} />);
        await user.click(screen.getByTitle('Controls'));
        const input = screen.getByRole('spinbutton', { name: 'PV Evacuation Limit' });
        const applied = screen.getByText('PV evac + BESS interconnect').nextElementSibling;
        expect(input).toHaveValue(102);

        await user.clear(input);
        await user.type(input, '20');
        await user.tab();
        expect(commands).toContainEqual({ type: 'SET_GRID_PV_EVACUATION', payload: 20 });
        expect(applied).toHaveTextContent(`20 + ${GRID.bessConnectionMw} MW`);

        await user.click(screen.getByTestId('simulation-reset'));
        expect(input).toHaveValue(102);
        expect(applied).toHaveTextContent(`102 + ${GRID.bessConnectionMw} MW`);

        const afterReset = commands.length;
        await user.click(input);
        await (trigger === 'Enter' ? user.keyboard('{Enter}') : user.tab());
        expect(commands.slice(afterReset)).not.toContainEqual({ type: 'SET_GRID_PV_EVACUATION', payload: 20 });
        expect(input).toHaveValue(102);
        expect(applied).toHaveTextContent(`102 + ${GRID.bessConnectionMw} MW`);
    });
});
