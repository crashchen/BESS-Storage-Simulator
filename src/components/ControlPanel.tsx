// ============================================================
// @Agent-UI (Dashboard Designer) — ControlPanel
// 2D overlay with BESS controls, economics panel, gauges, charts.
// Dispatches BESSCommand to the Engine via onCommand prop.
// ============================================================

import { lazy, Suspense, useCallback } from 'react';
import type { ControlPanelProps, BESSCommand } from '../types';

const TelemetryChart = lazy(async () => {
    const module = await import('./TelemetryChart');
    return { default: module.TelemetryChart };
});

// ── Gauge Component ──────────────────────────────────────────
function Gauge({
    label,
    value,
    unit,
    min,
    max,
    color,
    warn,
}: {
    label: string;
    value: number;
    unit: string;
    min: number;
    max: number;
    color: string;
    warn?: boolean;
}) {
    const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400">
                <span>{label}</span>
                <span className={`font-mono font-bold ${warn ? 'text-red-400 animate-pulse' : ''}`} style={{ color: warn ? undefined : color }}>
                    {value.toFixed(1)} {unit}
                </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
}

// ── Mode Button ──────────────────────────────────────────────
function ModeButton({
    label,
    active,
    color,
    onClick,
}: {
    label: string;
    active: boolean;
    color: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`
        relative px-3 py-2 rounded-lg font-semibold text-[10px] uppercase tracking-wider
        transition-all duration-200 cursor-pointer border
        ${active
                    ? 'text-white shadow-lg scale-105'
                    : 'text-slate-400 bg-slate-800/50 border-slate-700 hover:bg-slate-700/60 hover:text-slate-200'
                }
      `}
            style={
                active
                    ? {
                        backgroundColor: color,
                        borderColor: color,
                        boxShadow: `0 0 20px ${color}66, 0 0 40px ${color}22`,
                    }
                    : {}
            }
        >
            {label}
            {active && (
                <span
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-ping"
                    style={{ backgroundColor: color }}
                />
            )}
        </button>
    );
}

// ── Tariff color helpers ─────────────────────────────────────
const TARIFF_COLORS = {
    'off-peak': '#22c55e',
    'mid-peak': '#facc15',
    'peak': '#ef4444',
} as const;

const TARIFF_LABELS = {
    'off-peak': 'OFF-PEAK',
    'mid-peak': 'MID-PEAK',
    'peak': 'PEAK',
} as const;

// ── Main Panel ───────────────────────────────────────────────
export function ControlPanel({ gridState, history, onCommand }: ControlPanelProps) {
    const {
        batteryMode, batterySocPercent, gridFrequencyHz,
        solarOutputKw, loadDemandKw, batteryPowerKw, timeSpeed,
        loadScalePercent,
        tariffPeriod, currentPriceEurKwh, cumulativeRevenueEur, autoArbEnabled,
    } = gridState;

    const freqWarn = gridFrequencyHz < 49.5 || gridFrequencyHz > 50.5;

    const handleMode = useCallback(
        (type: 'CHARGE' | 'DISCHARGE' | 'IDLE') => onCommand({ type } as BESSCommand),
        [onCommand],
    );

    const tariffColor = TARIFF_COLORS[tariffPeriod];

    return (
        <div className="absolute bottom-4 left-4 w-[380px] max-h-[calc(100vh-6rem)] overflow-y-auto flex flex-col gap-3 select-none pointer-events-auto">
            {/* ── BESS Controls ─────────────────────────────────── */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-xl p-4 shadow-2xl">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                    ⚡ BESS Control
                </h2>

                {/* Mode buttons — 4 columns now with AUTO ARB */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                    <ModeButton label="Charge" active={!autoArbEnabled && batteryMode === 'charging'} color="#22c55e" onClick={() => handleMode('CHARGE')} />
                    <ModeButton label="Idle" active={!autoArbEnabled && batteryMode === 'idle'} color="#64748b" onClick={() => handleMode('IDLE')} />
                    <ModeButton label="Discharge" active={!autoArbEnabled && batteryMode === 'discharging'} color="#f59e0b" onClick={() => handleMode('DISCHARGE')} />
                    <ModeButton label="Auto Arb" active={autoArbEnabled} color="#8b5cf6" onClick={() => onCommand({ type: 'TOGGLE_AUTO_ARB' })} />
                </div>

                {/* Gauges */}
                <div className="flex flex-col gap-3">
                    <Gauge label="Battery SoC" value={batterySocPercent} unit="%" min={0} max={100} color="#3b82f6" />
                    <Gauge label="Grid Frequency" value={gridFrequencyHz} unit="Hz" min={49} max={51} color={freqWarn ? '#ef4444' : '#22c55e'} warn={freqWarn} />
                    <Gauge label="Solar Output" value={solarOutputKw} unit="kW" min={0} max={85} color="#facc15" />
                    <Gauge label="Battery Power" value={Math.abs(batteryPowerKw)} unit="kW" min={0} max={50} color={batteryPowerKw >= 0 ? '#22c55e' : '#f59e0b'} />
                </div>
            </div>

            {/* ── Economics Panel ───────────────────────────────── */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-xl p-4 shadow-2xl">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                    💶 Economics
                </h2>

                <div className="flex flex-col gap-3">
                    {/* Tariff period badge + price */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider text-white"
                                style={{ backgroundColor: tariffColor, boxShadow: `0 0 10px ${tariffColor}44` }}
                            >
                                {TARIFF_LABELS[tariffPeriod]}
                            </span>
                            <span className="text-xs text-slate-500">Tariff</span>
                        </div>
                        <span className="font-mono font-bold text-sm" style={{ color: tariffColor }}>
                            €{currentPriceEurKwh.toFixed(2)}/kWh
                        </span>
                    </div>

                    {/* Revenue */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Total Revenue</span>
                        <span className={`font-mono font-bold text-lg ${cumulativeRevenueEur >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {cumulativeRevenueEur >= 0 ? '+' : ''}€{cumulativeRevenueEur.toFixed(4)}
                        </span>
                    </div>

                    {/* Price schedule visual */}
                    <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
                        <div className="flex-[6] bg-green-600/60 rounded-l-full" title="Off-peak 00-06" />
                        <div className="flex-[12] bg-yellow-500/60" title="Mid-peak 06-18" />
                        <div className="flex-[5] bg-red-500/60" title="Peak 18-23" />
                        <div className="flex-[1] bg-green-600/60 rounded-r-full" title="Off-peak 23-00" />
                    </div>
                    <div className="flex justify-between text-[8px] text-slate-600 -mt-1">
                        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
                    </div>
                </div>
            </div>

            {/* ── Grid Parameters ──────────────────────────────── */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-xl p-4 shadow-2xl">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                    🎛️ Grid Parameters
                </h2>

                <div className="flex flex-col gap-3">
                    <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>Load Scale</span>
                            <span className="font-mono font-bold text-orange-400">{loadScalePercent}% <span className="text-slate-500">({loadDemandKw.toFixed(0)} kW)</span></span>
                        </div>
                        <input
                            type="range"
                            min={50}
                            max={150}
                            value={loadScalePercent}
                            onChange={(e) => onCommand({ type: 'SET_LOAD', payload: Number(e.target.value) })}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-orange-500"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>Sim Speed</span>
                            <span className="font-mono font-bold text-cyan-400">{timeSpeed}×</span>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={1000}
                            value={timeSpeed}
                            onChange={(e) => onCommand({ type: 'SET_TIME_SPEED', payload: Number(e.target.value) })}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-cyan-500"
                        />
                    </div>
                </div>
            </div>

            {/* ── Telemetry Chart ─────────────────────────────────── */}
            {history.length > 2 && (
                <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-xl p-4 shadow-2xl">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                        📊 Real-Time Telemetry
                    </h2>
                    <Suspense fallback={<div className="h-[170px] animate-pulse rounded-lg bg-slate-800/60" />}>
                        <TelemetryChart history={history} />
                    </Suspense>
                </div>
            )}
        </div>
    );
}
