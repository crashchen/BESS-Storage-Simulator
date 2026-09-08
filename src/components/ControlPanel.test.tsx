import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlPanel as ControlledPanel } from './ControlPanel';
import { makeGridState } from '../test/fixtures';
import { useDrawerLayout } from '../hooks/useDrawerLayout';
import type { ControlPanelProps } from '../types';

function ControlPanel(props: Omit<ControlPanelProps, 'layout' | 'simulationResetVersion'>) {
    const layout = useDrawerLayout();
    return <ControlledPanel {...props} layout={layout} simulationResetVersion={0} />;
}

afterEach(() => vi.unstubAllGlobals());

function mockViewport(initialCompact = false) {
    let compact = initialCompact;
    const listeners = new Set<(event: { matches: boolean }) => void>();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
        get matches() { return compact; },
        addEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
        removeEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
    })));
    return (nextCompact: boolean) => act(() => {
        compact = nextCompact;
        listeners.forEach(listener => listener({ matches: compact }));
    });
}

async function openLeftDrawer(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTitle('Controls'));
}

async function openRightDrawer(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTitle('Metrics'));
}

describe('ControlPanel', () => {
    it.each(['left', 'right'] as const)('keeps the last opened %s drawer when resizing to a narrow viewport', async (lastSide) => {
        const resize = mockViewport();
        const user = userEvent.setup();
        render(<ControlPanel gridState={makeGridState()} history={[]} onCommand={vi.fn()} />);
        await (lastSide === 'left' ? openRightDrawer(user) : openLeftDrawer(user));
        await (lastSide === 'left' ? openLeftDrawer(user) : openRightDrawer(user));
        // Move focus into the panel that will close; resize must not strand it.
        screen.getByRole('button', { name: lastSide === 'left' ? 'Close Metrics & Economics panel' : 'Close Controls panel' }).focus();
        resize(true);
        expect(screen.getAllByRole('region')).toHaveLength(1);
        const survivingLabel = lastSide === 'left' ? 'Controls' : 'Metrics & Economics';
        expect(screen.getByRole('region', { name: survivingLabel })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: `Close ${survivingLabel} panel` })).toHaveFocus();
        resize(false);
        expect(screen.getAllByRole('region')).toHaveLength(1);
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('keeps drawers mutually exclusive when opening on a narrow viewport', async () => {
        mockViewport(true);
        const user = userEvent.setup();
        render(<ControlPanel gridState={makeGridState()} history={[]} onCommand={vi.fn()} />);
        await openLeftDrawer(user);
        await openRightDrawer(user);
        expect(screen.queryByRole('region', { name: 'Controls' })).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Metrics & Economics' })).toBeInTheDocument();
    });

    it('dispatches auto mode from the control button', async () => {
        const user = userEvent.setup();
        const onCommand = vi.fn();

        render(
            <ControlPanel
                gridState={makeGridState({ dispatchMode: 'manual-idle' })}
                history={[]}
                onCommand={onCommand}
            />,
        );

        await openLeftDrawer(user);
        await user.click(screen.getByRole('button', { name: /^auto$/i }));

        expect(onCommand).toHaveBeenCalledWith({ type: 'SET_DISPATCH_MODE', payload: 'auto' });
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

    it('keeps demo scenario presets hidden while the base model is being hardened', async () => {
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

        expect(screen.queryByText('Demo Scenarios')).not.toBeInTheDocument();
        expect(screen.queryByTestId('scenario-preset-evening-peak-discharge')).not.toBeInTheDocument();
        expect(onCommand).not.toHaveBeenCalled();
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

    it('allows both desktop drawers to stay open at the same time', async () => {
        const user = userEvent.setup();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={vi.fn()}
            />,
        );

        await openLeftDrawer(user);
        await openRightDrawer(user);

        expect(screen.getByRole('region', { name: 'Controls' })).toHaveAttribute('aria-hidden', 'false');
        expect(screen.getByRole('region', { name: 'Metrics & Economics' })).toHaveAttribute('aria-hidden', 'false');
    });

    it('closes only the most recently opened drawer when both desktop drawers are open', async () => {
        const user = userEvent.setup();

        render(
            <ControlPanel
                gridState={makeGridState()}
                history={[]}
                onCommand={vi.fn()}
            />,
        );

        await openLeftDrawer(user);
        await openRightDrawer(user);
        await user.keyboard('{Escape}');

        expect(screen.getByRole('region', { name: 'Controls' })).toHaveAttribute('aria-hidden', 'false');
        expect(screen.queryByRole('region', { name: 'Metrics & Economics' })).not.toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('region', { name: 'Controls' })).not.toBeInTheDocument();
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
