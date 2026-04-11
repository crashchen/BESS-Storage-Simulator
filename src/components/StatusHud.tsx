import { GRID } from '../config';
import { formatTime } from '../utils/formatTime';
import type { SimulationStatus, StatusHudProps, TariffPeriod } from '../types';

const modeBadge = {
    idle: { label: 'IDLE', bg: 'bg-slate-600', glow: '' },
    charging: { label: 'CHARGING', bg: 'bg-green-600', glow: 'shadow-[0_0_12px_rgba(34,197,94,0.5)]' },
    discharging: { label: 'DISCHARGING', bg: 'bg-amber-600', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.5)]' },
};

const simulationBadge: Record<SimulationStatus, { label: string; bg: string }> = {
    running: { label: 'RUN', bg: 'bg-green-600' },
    paused: { label: 'PAUSE', bg: 'bg-sky-600' },
    stopped: { label: 'STOP', bg: 'bg-slate-600' },
};

const tariffBadge: Record<TariffPeriod, { color: string }> = {
    'off-peak': { color: '#22c55e' },
    'mid-peak': { color: '#facc15' },
    'peak': { color: '#ef4444' },
};

export function StatusHud({ gridState }: StatusHudProps) {
    const {
        timeOfDay,
        batteryMode,
        gridFrequencyHz,
        batterySocPercent,
        solarOutputMw,
        tariffPeriod,
        currentPriceEurMwh,
        cumulativeRevenueEur,
        autoArbEnabled,
        simulationStatus,
    } = gridState;

    const mode = modeBadge[batteryMode];
    const sim = simulationBadge[simulationStatus];
    const freqOk = gridFrequencyHz >= GRID.warningFrequencyLowHz && gridFrequencyHz <= GRID.warningFrequencyHighHz;
    const tariff = tariffBadge[tariffPeriod];

    return (
        <div className="pointer-events-none absolute top-0 left-0 right-0 select-none">
            <div className="mx-auto mt-3 flex w-fit items-center justify-center gap-3 rounded-full border border-slate-700/50 bg-slate-900/80 px-5 py-2.5 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">🕐</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-slate-100">
                        {formatTime(timeOfDay)}
                    </span>
                </div>

                <div className="h-5 w-px bg-slate-700" />

                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider text-white ${sim.bg}`}>
                    {sim.label}
                </span>

                <div className="h-5 w-px bg-slate-700" />

                <div className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-white ${mode.bg} ${mode.glow} transition-all duration-300`}>
                    {autoArbEnabled ? 'PEAK READY' : mode.label}
                </div>

                <div className="h-5 w-px bg-slate-700" />

                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">🔋</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-blue-400">
                        {batterySocPercent.toFixed(0)}%
                    </span>
                </div>

                <div className="h-5 w-px bg-slate-700" />

                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">☀️</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-yellow-400">
                        {solarOutputMw.toFixed(0)} MW
                    </span>
                </div>

                <div className="h-5 w-px bg-slate-700" />

                <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${freqOk ? 'bg-green-500' : 'animate-pulse bg-red-500'}`} />
                    <span className={`font-mono text-sm font-bold tabular-nums ${freqOk ? 'text-green-400' : 'text-red-400'}`}>
                        {gridFrequencyHz.toFixed(2)} Hz
                    </span>
                </div>

                <div className="h-5 w-px bg-slate-700" />

                <span className="font-mono text-sm font-bold tabular-nums" style={{ color: tariff.color }}>
                    €{currentPriceEurMwh.toFixed(0)}
                </span>

                <div className="h-5 w-px bg-slate-700" />

                <span className={`font-mono text-sm font-bold tabular-nums ${cumulativeRevenueEur >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {cumulativeRevenueEur >= 0 ? '+' : ''}€{cumulativeRevenueEur.toFixed(0)}
                </span>
            </div>
        </div>
    );
}
