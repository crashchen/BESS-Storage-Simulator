import { lazy, Suspense, useState, type ComponentType } from 'react';
import type { GridSnapshot } from '../types';
import { ErrorBoundary } from './ErrorBoundary';
import { importTelemetryChart } from '../utils/importTelemetryChart';
import chartUrl from 'virtual:telemetry-chart-url';

let requestVersion = 0;
let loadedChart: typeof import('./TelemetryChart') | undefined;
const loadChart = async () => {
    if (!loadedChart) {
        const url = new URL(chartUrl, window.location.href);
        url.searchParams.set('attempt', String(requestVersion++));
        loadedChart = await importTelemetryChart(url.href);
    }
    return { default: loadedChart.TelemetryChart };
};

export function RecoverableTelemetryChart({ history, load = loadChart }: {
    history: GridSnapshot[];
    load?: () => Promise<{ default: ComponentType<{ history: GridSnapshot[] }> }>;
}) {
    const [attempt, setAttempt] = useState(() => ({ id: 0, Chart: lazy(load) }));
    const { Chart } = attempt;

    function retry() {
        // A failed React.lazy instance retains its rejected promise. Replace it
        // as well as the boundary. The loader also changes the browser module key;
        // the simulation and history stay in App.
        setAttempt(previous => ({ id: previous.id + 1, Chart: lazy(load) }));
    }

    return (
        <ErrorBoundary key={attempt.id} fallback={
            <div role="alert" className="space-y-3 rounded-lg border border-amber-500/40 p-3 text-xs text-slate-300">
                <p className="font-semibold text-amber-200">Telemetry chart unavailable</p>
                <p>Simulation controls and accumulated results remain available. Retry when your connection is ready.</p>
                <button type="button" onClick={retry} className="rounded border border-slate-500 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">Retry chart</button>
                <p>If retry still fails after an app update, reload the page. Reload starts a new simulation and clears this run.</p>
            </div>
        }>
            <Suspense fallback={
                <div role="status" aria-label="Loading telemetry chart" className="h-[170px] rounded-lg border border-slate-700/60 bg-slate-900/70 p-4 text-xs text-slate-300">
                    <p className="font-semibold text-sky-200">Loading telemetry chart…</p>
                    <div aria-hidden="true" className="mt-4 flex h-24 animate-pulse items-end gap-2 border-b border-slate-700/70 pb-2 motion-reduce:animate-none">
                        {[36, 62, 48, 82, 66, 92, 72, 55, 76, 60].map((height, index) => (
                            <span key={index} className="min-w-0 flex-1 rounded-t bg-sky-500/25" style={{ height: `${height}%` }} />
                        ))}
                    </div>
                </div>
            }>
                <Chart history={history} />
            </Suspense>
        </ErrorBoundary>
    );
}
