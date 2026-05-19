// ============================================================
// Economics Panel - Tariffs, P&L, and energy flows
// ============================================================

import { useState, useEffect } from 'react';
import type { BESSCommand, GridState, TariffPeriod } from '../../types';
import { TARIFF } from '../../config';
import { PanelCard } from '../ui/PanelPrimitives';

const TARIFF_COLORS = {
    'off-peak': '#22c55e',
    'mid-peak': '#facc15',
    'peak': '#ef4444',
} as const;

const TARIFF_LABELS = {
    'off-peak': 'LOW',
    'mid-peak': 'SHOULDER',
    'peak': 'PEAK',
} as const;

function formatHour(hour: number): string {
    return hour.toString().padStart(2, '0');
}

const TARIFF_WINDOW_LABELS: Record<TariffPeriod, string> = {
    'off-peak': `00-${formatHour(TARIFF.periods.offPeakEnd)} / ${formatHour(TARIFF.periods.peakEnd)}-24`,
    'mid-peak': `${formatHour(TARIFF.periods.offPeakEnd)}-${formatHour(TARIFF.periods.midPeakEnd)}`,
    'peak': `${formatHour(TARIFF.periods.midPeakEnd)}-${formatHour(TARIFF.periods.peakEnd)}`,
};

const TIMELINE_SEGMENTS = [
    {
        period: 'off-peak' as const,
        spanHours: TARIFF.periods.offPeakEnd,
        title: `Off-peak 00-${formatHour(TARIFF.periods.offPeakEnd)}`,
        className: 'rounded-l-full bg-green-600/60',
    },
    {
        period: 'mid-peak' as const,
        spanHours: TARIFF.periods.midPeakEnd - TARIFF.periods.offPeakEnd,
        title: `Mid-peak ${formatHour(TARIFF.periods.offPeakEnd)}-${formatHour(TARIFF.periods.midPeakEnd)}`,
        className: 'bg-yellow-500/60',
    },
    {
        period: 'peak' as const,
        spanHours: TARIFF.periods.peakEnd - TARIFF.periods.midPeakEnd,
        title: `Peak ${formatHour(TARIFF.periods.midPeakEnd)}-${formatHour(TARIFF.periods.peakEnd)}`,
        className: 'bg-red-500/60',
    },
    {
        period: 'off-peak' as const,
        spanHours: 24 - TARIFF.periods.peakEnd,
        title: `Off-peak ${formatHour(TARIFF.periods.peakEnd)}-24`,
        className: 'rounded-r-full bg-green-600/60',
    },
];

const TIMELINE_TICK_LABELS = [
    '00',
    formatHour(TARIFF.periods.offPeakEnd),
    formatHour(TARIFF.periods.midPeakEnd),
    formatHour(TARIFF.periods.peakEnd),
    '24',
];

function TariffRateInput({ period, value, onCommit }: {
    period: TariffPeriod;
    value: number;
    onCommit: (period: TariffPeriod, value: number) => void;
}) {
    const [draft, setDraft] = useState(String(value));

    useEffect(() => {
        setDraft(String(value));
    }, [value]);

    const commit = () => {
        const n = Number(draft);
        if (draft !== '' && Number.isFinite(n)) {
            onCommit(period, n);
        } else {
            setDraft(String(value));
        }
    };

    return (
        <div className="w-[118px]">
            <label className="sr-only" htmlFor={`tariff-rate-${period}`}>
                {period} tariff rate
            </label>
            <input
                id={`tariff-rate-${period}`}
                data-testid={`tariff-rate-${period}`}
                type="number"
                min={TARIFF.minRateEurMwh}
                max={TARIFF.maxRateEurMwh}
                step={5}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-slate-500"
            />
        </div>
    );
}

interface EconomicsPanelProps {
    gridState: GridState;
    onCommand: (cmd: BESSCommand) => void;
}

function formatSignedEur(value: number): string {
    const sign = value >= 0 ? '+' : '−';
    return `${sign}€${Math.abs(value).toFixed(0)}`;
}

export function EconomicsPanel({ gridState, onCommand }: EconomicsPanelProps) {
    const {
        tariffPeriod,
        tariffRatesEurMwh,
        currentPriceEurMwh,
        cumulativeRevenueEur,
        cumulativeBessMarginEur,
        cumulativeSolarExportRevenueEur,
        cumulativeBessDischargeRevenueEur,
        cumulativeBessGridChargeCostEur,
        cumulativeSolarOpportunityCostEur,
        batteryChargeFromSolarMw,
        batteryChargeFromGridMw,
        batteryDischargeToGridMw,
        solarExportMw,
        solarCurtailedMw,
        gridImportMw,
        gridExportMw,
        gridOverloadMw,
        gridOverloadWarning,
        projectNetExportMw,
    } = gridState;

    const tariffColor = TARIFF_COLORS[tariffPeriod];

    return (
        <PanelCard title="💶 Economics">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider text-white"
                            style={{ backgroundColor: tariffColor, boxShadow: `0 0 10px ${tariffColor}44` }}
                        >
                            {TARIFF_LABELS[tariffPeriod]}
                        </span>
                        <span className="text-xs text-slate-400">Market Price Window</span>
                    </div>
                    <span className="font-mono text-sm font-bold" style={{ color: tariffColor }}>
                        €{currentPriceEurMwh.toFixed(0)}/MWh
                    </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Project P&amp;L</p>
                        <p className={`mt-1 font-mono text-xl font-bold ${cumulativeRevenueEur >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                            {cumulativeRevenueEur >= 0 ? '+' : ''}€{cumulativeRevenueEur.toFixed(0)}
                        </p>
                    </div>
                    <div className="rounded-lg border border-sky-900/40 bg-sky-950/20 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">BESS Margin</p>
                        <p className={`mt-1 font-mono text-xl font-bold ${cumulativeBessMarginEur >= 0 ? 'text-sky-200' : 'text-rose-300'}`}>
                            {cumulativeBessMarginEur >= 0 ? '+' : ''}€{cumulativeBessMarginEur.toFixed(0)}
                        </p>
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Solar → Grid</p>
                        <p className="mt-1 font-mono text-base font-bold text-yellow-300">{solarExportMw.toFixed(0)} MW</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Solar → BESS</p>
                        <p className="mt-1 font-mono text-base font-bold text-emerald-300">{batteryChargeFromSolarMw.toFixed(0)} MW</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Grid → BESS</p>
                        <p className="mt-1 font-mono text-base font-bold text-cyan-300">{batteryChargeFromGridMw.toFixed(0)} MW</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">BESS → Grid</p>
                        <p className="mt-1 font-mono text-base font-bold text-amber-300">{batteryDischargeToGridMw.toFixed(0)} MW</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Grid Import</p>
                        <p className="mt-1 font-mono text-base font-bold text-cyan-300">{gridImportMw.toFixed(0)} MW</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Grid Export</p>
                        <p className="mt-1 font-mono text-base font-bold text-emerald-300">{gridExportMw.toFixed(0)} MW</p>
                    </div>
                    <div className={`
                        rounded-lg border p-3
                        ${gridOverloadWarning
                    ? 'border-rose-500/50 bg-rose-950/30'
                    : 'border-slate-800 bg-slate-950/50'}
                    `}
                    >
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">PCC Overload</p>
                        <p className={`mt-1 font-mono text-base font-bold ${gridOverloadWarning ? 'text-rose-300' : 'text-slate-500'}`}>
                            {gridOverloadMw.toFixed(0)} MW
                        </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Net Export</p>
                        <p className={`mt-1 font-mono text-base font-bold ${projectNetExportMw >= 0 ? 'text-slate-100' : 'text-rose-300'}`}>
                            {projectNetExportMw >= 0 ? '+' : ''}{projectNetExportMw.toFixed(0)} MW
                        </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Curtailment</p>
                        <p className="mt-1 font-mono text-base font-bold text-rose-300">{solarCurtailedMw.toFixed(0)} MW</p>
                    </div>
                </div>

                <details className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-[0.2em] text-slate-400">
                        Settlement Breakdown (auditable)
                    </summary>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                        <span className="font-semibold text-emerald-300">Project P&amp;L</span> = direct PV sales + BESS discharge revenue − grid-paid charging cost.
                        {' '}
                        <span className="font-semibold text-sky-300">BESS Margin</span> = BESS discharge revenue − grid-paid charging cost − <span className="italic">Solar → BESS</span> opportunity cost (delayed sale value).
                    </p>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 font-mono text-[11px] tabular-nums">
                        <span className="text-slate-400">Solar → Grid revenue</span>
                        <span className="text-emerald-300">{formatSignedEur(cumulativeSolarExportRevenueEur)}</span>
                        <span className="text-slate-400">BESS discharge revenue</span>
                        <span className="text-amber-300">{formatSignedEur(cumulativeBessDischargeRevenueEur)}</span>
                        <span className="text-slate-400">Grid → BESS cost</span>
                        <span className="text-rose-300">{formatSignedEur(-cumulativeBessGridChargeCostEur)}</span>
                        <span className="text-slate-400">Solar opportunity cost</span>
                        <span className="text-rose-300">{formatSignedEur(-cumulativeSolarOpportunityCostEur)}</span>
                        <span className="col-span-2 my-1 border-t border-slate-700/60" />
                        <span className="text-slate-300">Project P&amp;L (= row 1 + 2 + 3)</span>
                        <span className={cumulativeRevenueEur >= 0 ? 'text-emerald-200' : 'text-rose-300'}>
                            {formatSignedEur(cumulativeRevenueEur)}
                        </span>
                        <span className="text-slate-300">BESS Margin (= row 2 + 3 + 4)</span>
                        <span className={cumulativeBessMarginEur >= 0 ? 'text-sky-200' : 'text-rose-300'}>
                            {formatSignedEur(cumulativeBessMarginEur)}
                        </span>
                    </div>
                </details>

                <div className="grid gap-2">
                    {(['off-peak', 'mid-peak', 'peak'] as TariffPeriod[]).map((period) => (
                        <div
                            key={period}
                            className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider text-white"
                                        style={{ backgroundColor: TARIFF_COLORS[period] }}
                                    >
                                        {TARIFF_LABELS[period]}
                                    </span>
                                    <span className="text-xs text-slate-400">{TARIFF_WINDOW_LABELS[period]}</span>
                                </div>
                                <TariffRateInput
                                    period={period}
                                    value={tariffRatesEurMwh[period]}
                                    onCommit={(p, v) => onCommand({ type: 'SET_TARIFF_RATE', payload: { period: p, value: v } })}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <p className="-mt-1 text-[11px] leading-relaxed text-slate-400">
                    These inputs are coarse wholesale price windows, not retail tariffs. EU spot markets can clear below zero.
                </p>

                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                    {TIMELINE_SEGMENTS.map((segment) => (
                        <div
                            key={`${segment.period}-${segment.title}`}
                            className={segment.className}
                            title={segment.title}
                            style={{ flexBasis: 0, flexGrow: segment.spanHours }}
                        />
                    ))}
                </div>
                <div className="-mt-1 flex justify-between text-[9px] text-slate-400">
                    {TIMELINE_TICK_LABELS.map((label) => (
                        <span key={label}>{label}</span>
                    ))}
                </div>
            </div>
        </PanelCard>
    );
}
