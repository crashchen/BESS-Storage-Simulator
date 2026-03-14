// ============================================================
// @Agent-UI (Dashboard Designer) — StatusHud
// Minimal top-bar overlay showing time, battery mode badge,
// grid frequency, and electricity price indicator.
// ============================================================

import { formatTime } from '../utils/formatTime';
import type { StatusHudProps, TariffPeriod } from '../types';

const modeBadge = {
    idle: { label: 'IDLE', bg: 'bg-slate-600', glow: '' },
    charging: { label: 'CHARGING', bg: 'bg-green-600', glow: 'shadow-[0_0_12px_rgba(34,197,94,0.5)]' },
    discharging: { label: 'DISCHARGING', bg: 'bg-amber-600', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.5)]' },
};

const tariffBadge: Record<TariffPeriod, { label: string; color: string }> = {
    'off-peak': { label: '€0.08', color: '#22c55e' },
    'mid-peak': { label: '€0.15', color: '#facc15' },
    'peak': { label: '€0.35', color: '#ef4444' },
};

export function StatusHud({ gridState }: StatusHudProps) {
    const {
        timeOfDay, batteryMode, gridFrequencyHz,
        batterySocPercent, solarOutputKw,
        tariffPeriod, cumulativeRevenueEur, autoArbEnabled,
    } = gridState;
    const badge = modeBadge[batteryMode];
    const freqOk = gridFrequencyHz >= 49.5 && gridFrequencyHz <= 50.5;
    const tb = tariffBadge[tariffPeriod];

    return (
        <div className="absolute top-0 left-0 right-0 pointer-events-none select-none">
            <div className="mx-auto mt-3 flex items-center justify-center gap-3 px-5 py-2.5 w-fit rounded-full border border-slate-700/50 bg-slate-900/75 backdrop-blur-xl shadow-2xl">
                {/* Time */}
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">🕐</span>
                    <span className="text-sm font-mono font-bold text-slate-200 tabular-nums">
                        {formatTime(timeOfDay)}
                    </span>
                </div>

                <div className="w-px h-5 bg-slate-700" />

                {/* Battery mode badge */}
                <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider text-white ${badge.bg} ${badge.glow} transition-all duration-300`}>
                    {autoArbEnabled ? 'AUTO ARB' : badge.label}
                </div>

                <div className="w-px h-5 bg-slate-700" />

                {/* SoC */}
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">🔋</span>
                    <span className="text-sm font-mono font-bold text-blue-400 tabular-nums">
                        {batterySocPercent.toFixed(0)}%
                    </span>
                </div>

                <div className="w-px h-5 bg-slate-700" />

                {/* Solar */}
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">☀️</span>
                    <span className="text-sm font-mono font-bold text-yellow-400 tabular-nums">
                        {solarOutputKw.toFixed(0)} kW
                    </span>
                </div>

                <div className="w-px h-5 bg-slate-700" />

                {/* Frequency */}
                <div className="flex items-center gap-1.5">
                    <span
                        className={`w-2 h-2 rounded-full ${freqOk ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
                    />
                    <span className={`text-sm font-mono font-bold tabular-nums ${freqOk ? 'text-green-400' : 'text-red-400'}`}>
                        {gridFrequencyHz.toFixed(2)} Hz
                    </span>
                </div>

                <div className="w-px h-5 bg-slate-700" />

                {/* Price badge */}
                <div className="flex items-center gap-1.5">
                    <span
                        className="text-sm font-mono font-bold tabular-nums"
                        style={{ color: tb.color }}
                    >
                        {tb.label}
                    </span>
                </div>

                <div className="w-px h-5 bg-slate-700" />

                {/* Revenue */}
                <span className={`text-sm font-mono font-bold tabular-nums ${cumulativeRevenueEur >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {cumulativeRevenueEur >= 0 ? '+' : ''}€{cumulativeRevenueEur.toFixed(2)}
                </span>
            </div>
        </div>
    );
}
