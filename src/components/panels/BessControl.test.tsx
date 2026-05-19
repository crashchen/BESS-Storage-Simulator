import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AUTO_ARB } from '../../config';
import { makeGridState } from '../../test/fixtures';
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
    it('shows AUTO dispatch and the configured night reserve target', () => {
        renderDispatchControl({
            dispatchMode: 'auto',
            tariffPeriod: 'off-peak',
            batterySocPercent: 25,
        });

        expect(screen.getByRole('button', { name: /^auto$/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Auto Dispatch')).toBeInTheDocument();
        expect(screen.getByText(`Night reserve ${AUTO_ARB.nightTargetSocPercent.toFixed(0)}%`)).toBeInTheDocument();
        expect(screen.getByText(/auto discharge is locked out/i)).toBeInTheDocument();
    });

    it('surfaces peak export priority copy instead of peak-ready forecast text', () => {
        renderDispatchControl({
            dispatchMode: 'auto',
            tariffPeriod: 'peak',
            batterySocPercent: 88,
            solarOutputMw: 140,
            gridDemandMw: 40,
        });

        expect(screen.getByText(/BESS discharges first/i)).toBeInTheDocument();
        expect(screen.queryByText(/Target \d+% by/)).not.toBeInTheDocument();
    });

    it('does not render the frequency gauge in active-power-only mode', () => {
        renderDispatchControl();

        expect(screen.queryByText('Grid Frequency')).not.toBeInTheDocument();
        expect(screen.getByText('Grid import')).toBeInTheDocument();
        expect(screen.getByText('Grid export')).toBeInTheDocument();
    });
});
