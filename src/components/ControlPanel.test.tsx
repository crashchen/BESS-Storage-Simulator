import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ControlPanel } from './ControlPanel';
import { makeGridState } from '../test/fixtures';

async function openLeftDrawer(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTitle('Controls'));
}

async function openRightDrawer(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTitle('Metrics'));
}

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

        await openLeftDrawer(user);
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

        await openLeftDrawer(user);
        await user.click(screen.getByRole('button', { name: /^charge$/i }));

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

        await openLeftDrawer(user);
        await user.click(screen.getByTestId('simulation-start'));

        const capacityInput = screen.getByTestId('bess-energy-capacity-input');
        fireEvent.change(capacityInput, { target: { value: '800' } });
        fireEvent.blur(capacityInput);

        expect(onCommand).toHaveBeenCalledWith({ type: 'START_SIMULATION' });
        expect(onCommand).toHaveBeenCalledWith({ type: 'SET_BESS_ENERGY_CAPACITY', payload: 800 });
    });

    it('dispatches tariff rate updates for editable economics inputs', async () => {
        const user = userEvent.setup();
        const onCommand = vi.fn();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={onCommand}
            />,
        );

        await openRightDrawer(user);
        const tariffInput = screen.getByTestId('tariff-rate-peak');
        fireEvent.change(tariffInput, { target: { value: '420' } });
        fireEvent.blur(tariffInput);

        expect(onCommand).toHaveBeenCalledWith({
            type: 'SET_TARIFF_RATE',
            payload: { period: 'peak', value: 420 },
        });
    });

    it('moves focus to the close button when opening a drawer', async () => {
        const user = userEvent.setup();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={vi.fn()}
            />,
        );

        await openLeftDrawer(user);

        expect(screen.getByRole('button', { name: /close .* panel/i })).toHaveFocus();
    });

    it('closes the drawer when pressing Escape', async () => {
        const user = userEvent.setup();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={vi.fn()}
            />,
        );

        await openLeftDrawer(user);
        await user.keyboard('{Escape}');

        expect(screen.queryByRole('button', { name: /close .* panel/i })).not.toBeInTheDocument();
    });

    it('closes the drawer with Escape even after focus has left the drawer (window-level listener)', async () => {
        const user = userEvent.setup();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={vi.fn()}
            />,
        );

        await openLeftDrawer(user);
        // Simulate focus moving outside the drawer (e.g., into the 3D Canvas).
        (document.activeElement as HTMLElement | null)?.blur();
        document.body.focus();

        await user.keyboard('{Escape}');

        expect(screen.queryByRole('button', { name: /close .* panel/i })).not.toBeInTheDocument();
    });

    it('exposes drawers as labelled regions for assistive tech', async () => {
        const user = userEvent.setup();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={vi.fn()}
            />,
        );

        await openLeftDrawer(user);
        const region = screen.getByRole('region', { name: /controls/i });
        expect(region).toBeInTheDocument();
        expect(region.getAttribute('aria-hidden')).toBe('false');
    });

    it('restores focus to the trigger when closing a drawer', async () => {
        const user = userEvent.setup();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={vi.fn()}
            />,
        );

        await openLeftDrawer(user);
        await user.click(screen.getByRole('button', { name: /close .* panel/i }));

        expect(screen.getByTitle('Controls')).toHaveFocus();
    });

    it('reveals the project capacity card and dispatches solar AC capacity changes', async () => {
        const user = userEvent.setup();
        const onCommand = vi.fn();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={onCommand}
            />,
        );

        await openLeftDrawer(user);

        expect(screen.getByText(/project capacity/i)).toBeInTheDocument();
        const solarInput = screen.getByTestId('solar-ac-capacity-input');
        fireEvent.change(solarInput, { target: { value: '140' } });
        fireEvent.blur(solarInput);

        expect(onCommand).toHaveBeenCalledWith({ type: 'SET_SOLAR_AC_CAPACITY', payload: 140 });
    });
});
