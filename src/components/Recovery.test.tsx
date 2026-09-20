import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridSnapshot } from '../types';
import { RecoverableTelemetryChart } from './RecoverableTelemetryChart';
import { AppErrorBoundary } from './AppErrorBoundary';
import { importTelemetryChart } from '../utils/importTelemetryChart';

vi.mock('../utils/importTelemetryChart', () => ({ importTelemetryChart: vi.fn() }));
vi.mock('virtual:telemetry-chart-url', () => ({
    default: '/BESS-Storage-Simulator/assets/telemetry-chart-test.js?build=review',
}));

afterEach(() => vi.restoreAllMocks());

function Chart({ history }: { history: GridSnapshot[] }) {
    return <output aria-label="Chart samples">{history.length}</output>;
}

const history: GridSnapshot[] = [8, 9, 10].map(t => ({
    t, solarMw: 0, demandMw: 100, batteryMw: 0, socPercent: 65,
    gridImportMw: 100, gridExportMw: 0, priceEurMwh: 150,
}));

describe('loading and render recovery', () => {
    it('uses fresh production loader URLs after each failure and reuses success across remounts', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const transport = vi.mocked(importTelemetryChart)
            .mockRejectedValueOnce(new Error('offline'))
            .mockRejectedValueOnce(new Error('still offline'))
            .mockResolvedValue({ TelemetryChart: Chart });

        // No load prop: exercise the exact loader used by ControlPanel, mocking
        // only native import. The virtual module supplies a Pages-style URL.
        const view = render(<RecoverableTelemetryChart history={history} />);
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', { name: 'Retry chart' }));
        await screen.findByRole('alert');
        expect(transport).toHaveBeenCalledTimes(2);

        const latestHistory = [...history, history[0]];
        view.rerender(<RecoverableTelemetryChart history={latestHistory} />);
        fireEvent.click(screen.getByRole('button', { name: 'Retry chart' }));
        expect(await screen.findByLabelText('Chart samples')).toHaveTextContent('4');
        expect(transport.mock.calls.map(([url]) => url)).toEqual([0, 1, 2].map(attempt =>
            `${window.location.origin}/BESS-Storage-Simulator/assets/telemetry-chart-test.js?build=review&attempt=${attempt}`,
        ));

        view.unmount();
        render(<RecoverableTelemetryChart history={history} />);
        expect(await screen.findByLabelText('Chart samples')).toHaveTextContent('3');
        expect(transport).toHaveBeenCalledTimes(3);
    });

    it('retries a rejected lazy load with current history and preserves its parent state', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: Chart });
        function Parent() {
            const [samples, setSamples] = useState(history);
            return <>
                <button onClick={() => setSamples(s => [...s, s[0]])}>Record sample</button>
                <output aria-label="History samples">{samples.length}</output>
                <RecoverableTelemetryChart history={samples} load={load} />
            </>;
        }
        render(<Parent />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Telemetry chart unavailable');
        fireEvent.click(screen.getByRole('button', { name: 'Record sample' }));
        expect(screen.getByLabelText('History samples')).toHaveTextContent('4');
        fireEvent.click(screen.getByRole('button', { name: 'Retry chart' }));
        expect(await screen.findByLabelText('Chart samples')).toHaveTextContent('4');
        expect(load).toHaveBeenCalledTimes(2);
        expect(screen.getByLabelText('History samples')).toHaveTextContent('4');
    });

    it('contains repeated failures and explains that reload clears the run', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const load = vi.fn().mockRejectedValue(new Error('missing deployed chunk'));
        render(<RecoverableTelemetryChart history={history} load={load} />);
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', { name: 'Retry chart' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Reload starts a new simulation and clears this run');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('shows a root fallback for an otherwise uncaught render error', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        function Broken(): never { throw new Error('render failure'); }
        render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
        expect(screen.getByRole('alert')).toHaveTextContent('current run cannot be restored');
        expect(screen.getByRole('button', { name: 'Reload simulator' })).toBeInTheDocument();
    });
});
