import { formatTime } from '../utils/formatTime';
import { selectBessDisplay } from '../utils/bessDisplay';
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
        batterySocPercent,
        solarOutputMw,
        tariffPeriod,
        currentPriceEurMwh,
        cumulativeRevenueEur,
        simulationStatus,
    } = gridState;

    const bessDisplay = selectBessDisplay(gridState);
    const mode = modeBadge[bessDisplay.powerMode];
    const sim = simulationBadge[simulationStatus];
    const tariff = tariffBadge[tariffPeriod];

    return (
        <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 select-none">
            <div className="mx-auto mt-2 flex w-fit max-w-[98vw] flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-slate-700/50 bg-slate-900/80 px-3 py-1.5 shadow-2xl backdrop-blur-xl sm:mt-3 sm:gap-x-3 sm:px-5 sm:py-2.5">
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 sm:text-xs">🕐</span>
                    <span className="font-mono text-xs font-bold tabular-nums text-slate-100 sm:text-sm">
                        {formatTime(timeOfDay)}
                    </span>
                </div>

                <div className="hidden h-4 w-px bg-slate-700 sm:block sm:h-5" />

                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white sm:px-2 sm:text-[10px] ${sim.bg}`}>
                    {sim.label}
                </span>

                <div className="hidden h-4 w-px bg-slate-700 sm:block sm:h-5" />

                <span aria-label={`Selected dispatch: ${bessDisplay.dispatchLabel}`} className="text-[9px] font-bold uppercase tracking-wider text-slate-300 sm:text-[10px]">
                    {bessDisplay.dispatchLabel}
                </span>
                <div
                    aria-label={`BESS power: ${bessDisplay.runLabel}, ${bessDisplay.powerLabel}, ${Math.abs(bessDisplay.powerMw).toFixed(1)} MW`}
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white sm:px-2.5 sm:text-[10px] ${mode.bg} ${mode.glow} transition-all duration-300`}
                >
                    {mode.label}{simulationStatus === 'paused' ? ' SNAPSHOT' : ''}
                </div>

                <div className="hidden h-4 w-px bg-slate-700 sm:block sm:h-5" />

                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 sm:text-xs">🔋</span>
                    <span className="font-mono text-xs font-bold tabular-nums text-blue-400 sm:text-sm">
                        {batterySocPercent.toFixed(0)}%
                    </span>
                </div>

                <div className="hidden h-4 w-px bg-slate-700 sm:block sm:h-5" />

                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 sm:text-xs">☀️</span>
                    <span className="font-mono text-xs font-bold tabular-nums text-yellow-400 sm:text-sm">
                        {solarOutputMw.toFixed(0)}<span className="hidden sm:inline"> MW</span>
                    </span>
                </div>

                <span className="font-mono text-xs font-bold tabular-nums sm:text-sm" style={{ color: tariff.color }}>
                    €{currentPriceEurMwh.toFixed(0)}<span className="hidden sm:inline">/MWh</span>
                </span>

                <div className="hidden h-4 w-px bg-slate-700 sm:block sm:h-5" />

                <span className={`font-mono text-xs font-bold tabular-nums sm:text-sm ${cumulativeRevenueEur >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {cumulativeRevenueEur >= 0 ? '+' : ''}€{cumulativeRevenueEur.toFixed(0)}
                </span>
            </div>
        </div>
    );
}
