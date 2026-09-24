import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AUTO_ARB } from '../../config';
import { makeGridState } from '../../test/fixtures';
import { applyCommand } from '../../utils/gridReducer';
import { createInitialGridState } from '../../utils/tickEngine';
import { BessDispatchControl } from './BessControl';

function renderDispatchControl(overrides = {}) {
    return render(
        <BessDispatchControl
            gridState={makeGridState(overrides)}
            onCommand={vi.fn()}
        />,
    );
}

describe('BessDispatchControl active-power copy', () => {
    it('shows AUTO dispatch and the configured evening entry target', () => {
        renderDispatchControl({
            dispatchMode: 'auto',
            tariffPeriod: 'off-peak',
            batterySocPercent: 25,
        });

        expect(screen.getByRole('button', { name: /^auto$/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Dispatch status')).toBeInTheDocument();
        expect(screen.getByText(`Peak entry target ${AUTO_ARB.peakEntryTargetSocPercent.toFixed(0)}%`)).toBeInTheDocument();
        expect(screen.getByText(/auto discharge is locked out/i)).toBeInTheDocument();
    });

    it('labels the overnight target without promising peak entry when the price gate is off', () => {
        renderDispatchControl({
            dispatchMode: 'auto',
            tariffPeriod: 'off-peak',
            tariffRatesEurMwh: { 'off-peak': 80, 'mid-peak': 150, peak: 175 },
        });

        expect(screen.getByText('Night charge target 40%')).toBeInTheDocument();
        expect(screen.queryByText('Peak entry target 40%')).not.toBeInTheDocument();
    });

    it('surfaces peak export priority copy instead of peak-ready forecast text', () => {
        renderDispatchControl({
            dispatchMode: 'auto',
            tariffPeriod: 'peak',
            batterySocPercent: 88,
            solarOutputMw: 140,
            gridDemandMw: 40,
        });

        expect(screen.getByText(/AUTO policy: pace discharge/i)).toBeInTheDocument();
        expect(screen.getByText(/PV export has priority at the PCC/i)).toBeInTheDocument();
        expect(screen.getByLabelText('BESS operating status')).toHaveTextContent('Running · Idle · 0.0 MW');
        expect(screen.queryByText(/Target \d+% by/)).not.toBeInTheDocument();
    });

    it('does not render the frequency gauge in active-power-only mode', () => {
        renderDispatchControl();

        expect(screen.queryByText('Grid Frequency')).not.toBeInTheDocument();
        expect(screen.getByText('Grid import')).toBeInTheDocument();
        expect(screen.getByText('Grid export')).toBeInTheDocument();
    });

    it('explains an idle reserve-bound AUTO sample instead of claiming actual discharge', () => {
        renderDispatchControl({ tariffPeriod: 'peak', batterySocPercent: AUTO_ARB.peakReserveSocPercent });

        expect(screen.getByLabelText('BESS operating status')).toHaveTextContent('Running · Idle · 0.0 MW');
        expect(screen.getByText(/At or below the 12% peak reserve/)).toBeInTheDocument();
        expect(screen.getByText('Selected dispatch: AUTO')).toBeInTheDocument();
    });

    it('shows paused snapshot power separately from manual intent after a tariff edit', () => {
        const preset = applyCommand(createInitialGridState(), {
            type: 'APPLY_SCENARIO_PRESET', payload: 'negative-price-charge',
        }, 1).next;
        const { rerender } = render(<BessDispatchControl gridState={preset} onCommand={vi.fn()} />);
        expect(screen.getByLabelText('BESS operating status')).toHaveTextContent('Paused snapshot · Charging · 70.0 MW');

        const edited = applyCommand(preset, {
            type: 'SET_TARIFF_RATE', payload: { period: 'off-peak', value: -60 },
        }, 2).next;
        rerender(<BessDispatchControl gridState={edited} onCommand={vi.fn()} />);

        expect(screen.getByLabelText('BESS operating status')).toHaveTextContent('Paused snapshot · Idle · 0.0 MW');
        expect(screen.getByText('Selected dispatch: Manual charge')).toBeInTheDocument();
        expect(screen.queryByText(/Peak entry target 40%/)).not.toBeInTheDocument();
        expect(screen.getByText(/time and earnings are frozen/)).toBeInTheDocument();
    });
});
