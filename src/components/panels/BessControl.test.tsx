import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AUTO_ARB } from '../../config';
import { makeGridState } from '../../test/fixtures';
import { BessDispatchControl } from './BessControl';

function formatTargetHour(hour: number): string {
    return `${Math.trunc(hour).toString().padStart(2, '0')}:00`;
}

function renderDispatchControl(overrides = {}) {
    return render(
        <BessDispatchControl
            gridState={makeGridState(overrides)}
            onCommand={vi.fn()}
        />,
    );
}

function getTargetDeadlineText() {
    return screen.getByText((_, element) =>
        element?.tagName === 'SPAN' &&
        /^Target \d+% by /.test(element.textContent ?? ''),
    );
}

describe('BessDispatchControl peak-ready copy', () => {
    it('shows the configured peak-start deadline and target-reached text before peak', () => {
        renderDispatchControl({
            batterySocPercent: 100,
            timeOfDay: 14,
            tariffPeriod: 'mid-peak',
        });

        const deadline = getTargetDeadlineText();
        expect(deadline).toHaveTextContent(`by ${formatTargetHour(AUTO_ARB.peakStartHour)}`);
        expect(deadline).not.toHaveTextContent(/next day|tomorrow/i);
        expect(screen.getByText('Target SoC reached — holding charge until peak.')).toBeInTheDocument();
    });

    it('holds idle during peak when discharge is uneconomic', () => {
        renderDispatchControl({
            batterySocPercent: 100,
            timeOfDay: 19,
            solarOutputMw: 32,
            gridDemandMw: 228,
            tariffPeriod: 'peak',
            tariffRatesEurMwh: { 'off-peak': 80, 'mid-peak': 150, 'peak': -20 },
        });

        expect(screen.queryByText('Pacing discharge across the evening peak window.')).not.toBeInTheDocument();
        expect(screen.getByText('Peak window — holding idle (uneconomic to discharge).')).toBeInTheDocument();
    });

    it('marks the peak-ready deadline as next day after the peak window ends', () => {
        renderDispatchControl({
            batterySocPercent: 25,
            timeOfDay: 23.5,
            tariffPeriod: 'off-peak',
            solarOutputMw: 0,
        });

        expect(getTargetDeadlineText()).toHaveTextContent(`by ${formatTargetHour(AUTO_ARB.peakStartHour)} (next day)`);
    });
});
