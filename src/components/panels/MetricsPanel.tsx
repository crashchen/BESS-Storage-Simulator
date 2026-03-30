// ============================================================
// Project Metrics Panel - Key specs and status
// ============================================================

import type { GridState, SimulationStatus } from '../../types';
import { PanelCard } from '../ui/PanelPrimitives';

const STATUS_COLORS: Record<SimulationStatus, string> = {
    running: '#22c55e',
    paused: '#38bdf8',
    stopped: '#64748b',
};

const STATUS_LABELS: Record<SimulationStatus, string> = {
    running: 'Running',
    paused: 'Paused',
    stopped: 'Stopped',
};

interface MetricsPanelProps {
    gridState: GridState;
}

export function MetricsPanel({ gridState }: MetricsPanelProps) {
    const {
        projectName,
        projectLocation,
        simulationStatus,
        solarDcCapacityMwp,
        solarAcCapacityMw,
        batteryPowerRatingMw,
        batteryDurationHours,
        batteryEnergyCapacityMwh,
        gridConnectionTotalMw,
        gridPvEvacuationMw,
        gridBessConnectionMw,
        siteYieldKwhPerKwYear,
    } = gridState;

    return (
        <PanelCard title="Key Metrics">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
                        {projectName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{projectLocation}</p>
                </div>
                <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white"
                    style={{ backgroundColor: STATUS_COLORS[simulationStatus] }}
                >
                    {STATUS_LABELS[simulationStatus]}
                </span>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Solar PV</p>
                    <p className="mt-1 font-mono text-base text-yellow-300">{solarDcCapacityMwp.toFixed(0)} MWp DC / {solarAcCapacityMw.toFixed(0)} MW AC</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">BESS</p>
                    <p className="mt-1 font-mono text-base text-cyan-300">{batteryPowerRatingMw.toFixed(0)} MW @ {batteryDurationHours.toFixed(1)} h ({batteryEnergyCapacityMwh.toFixed(0)} MWh)</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Grid Connection</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                        <span className="font-mono text-base text-slate-100">{gridConnectionTotalMw.toFixed(0)} MW total</span>
                        <span>PV evacuation {gridPvEvacuationMw.toFixed(0)} MW</span>
                        <span>BESS injection / evacuation {gridBessConnectionMw.toFixed(0)} MW</span>
                    </div>
                </div>
                <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3 sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Yield Assumption</p>
                    <p className="mt-1 text-xs leading-relaxed text-emerald-100">
                        Fixed-panel annual yield modelled at {siteYieldKwhPerKwYear.toLocaleString()} kWh/kW/year using Romania site data.
                    </p>
                </div>
            </div>
        </PanelCard>
    );
}
