import { lazy, Suspense, useCallback, type ReactNode } from 'react';
import type { BESSCommand, ControlPanelProps, SimulationStatus, TariffPeriod } from '../types';
import { getAutoArbOutlook } from '../utils/simulationModel';

const TelemetryChart = lazy(async () => {
    const module = await import('./TelemetryChart');
    return { default: module.TelemetryChart };
});

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
    const pct = Math.max(0, Math.min(100, ((value - min) / Math.max(max - min, 1e-9)) * 100));

    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400">
                <span>{label}</span>
                <span className={`font-mono font-bold ${warn ? 'animate-pulse text-red-400' : ''}`} style={{ color: warn ? undefined : color }}>
                    {value.toFixed(1)} {unit}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
}

function ActionButton({
    label,
    active,
    color,
    onClick,
    testId,
}: {
    label: string;
    active: boolean;
    color: string;
    onClick: () => void;
    testId?: string;
}) {
    return (
        <button
            onClick={onClick}
            data-testid={testId}
            className={`
                relative rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200
                ${active
                    ? 'scale-[1.02] text-white shadow-lg'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-700/60 hover:text-slate-100'}
            `}
            style={active ? { backgroundColor: color, borderColor: color, boxShadow: `0 0 18px ${color}55` } : undefined}
        >
            {label}
        </button>
    );
}

function NumericField({
    label,
    value,
    unit,
    min,
    max,
    step,
    accentClass,
    onChange,
    testId,
}: {
    label: string;
    value: number;
    unit: string;
    min: number;
    max: number;
    step: number;
    accentClass: string;
    onChange: (value: number) => void;
    testId: string;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{label}</span>
                <span className={`font-mono font-bold ${accentClass}`}>
                    {value.toFixed(step < 1 ? 1 : 0)} {unit}
                </span>
            </div>
            <input
                type="number"
                aria-label={label}
                data-testid={testId}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (Number.isFinite(nextValue)) {
                        onChange(nextValue);
                    }
                }}
                className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-slate-500"
            />
        </label>
    );
}

function PanelCard({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/85 p-4 shadow-2xl backdrop-blur-xl">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                {title}
            </h2>
            {children}
        </section>
    );
}

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

const TARIFF_WINDOW_LABELS: Record<TariffPeriod, string> = {
    'off-peak': '00-06 / 23-24',
    'mid-peak': '06-18',
    'peak': '18-23',
};

export function ControlPanel({ gridState, history, onCommand }: ControlPanelProps) {
    const {
        projectName,
        projectLocation,
        simulationStatus,
        batteryMode,
        batterySocPercent,
        gridFrequencyHz,
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw,
        batteryChargeFromSolarMw,
        batteryChargeFromGridMw,
        batteryDischargeToGridMw,
        solarExportMw,
        solarCurtailedMw,
        projectNetExportMw,
        timeSpeed,
        dispatchScalePercent,
        tariffPeriod,
        tariffRatesEurMwh,
        currentPriceEurMwh,
        cumulativeRevenueEur,
        cumulativeBessMarginEur,
        autoArbEnabled,
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

    const freqWarn = gridFrequencyHz < 49.5 || gridFrequencyHz > 50.5;
    const tariffColor = TARIFF_COLORS[tariffPeriod];
    const batteryTransferLimitMw = Math.min(batteryPowerRatingMw, gridBessConnectionMw);
    const autoArbOutlook = getAutoArbOutlook(gridState, gridState.timeOfDay);
    const handleMode = useCallback(
        (type: 'CHARGE' | 'DISCHARGE' | 'IDLE') => onCommand({ type } as BESSCommand),
        [onCommand],
    );

    return (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 top-[4.75rem] z-10 select-none">
            <div className="mx-auto grid h-full max-w-[1520px] gap-4 xl:grid-cols-[minmax(380px,420px)_minmax(360px,420px)] xl:justify-between">
                <div className="pointer-events-auto flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                    <PanelCard title="▶ Simulation Run State">
                        <div className="grid grid-cols-3 gap-2">
                            <ActionButton label="Start" active={simulationStatus === 'running'} color="#22c55e" testId="simulation-start" onClick={() => onCommand({ type: 'START_SIMULATION' })} />
                            <ActionButton label="Pause" active={simulationStatus === 'paused'} color="#38bdf8" testId="simulation-pause" onClick={() => onCommand({ type: 'PAUSE_SIMULATION' })} />
                            <ActionButton label="Stop" active={simulationStatus === 'stopped'} color="#64748b" testId="simulation-stop" onClick={() => onCommand({ type: 'STOP_SIMULATION' })} />
                        </div>

                        <div className="mt-4">
                            <div className="mb-1 flex justify-between text-xs text-slate-400">
                                <span>Simulation Speed</span>
                                <span className="font-mono font-bold text-cyan-400">{timeSpeed}×</span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={1440}
                                value={timeSpeed}
                                onChange={(event) => onCommand({ type: 'SET_TIME_SPEED', payload: Number(event.target.value) })}
                                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-500"
                            />
                        </div>
                    </PanelCard>

                    <PanelCard title="⚡ BESS Dispatch Control">
                        <div className="grid grid-cols-4 gap-2">
                            <ActionButton label="Charge" active={!autoArbEnabled && batteryMode === 'charging'} color="#22c55e" onClick={() => handleMode('CHARGE')} />
                            <ActionButton label="Idle" active={!autoArbEnabled && batteryMode === 'idle'} color="#64748b" onClick={() => handleMode('IDLE')} />
                            <ActionButton label="Discharge" active={!autoArbEnabled && batteryMode === 'discharging'} color="#f59e0b" onClick={() => handleMode('DISCHARGE')} />
                            <ActionButton label="Peak Ready" active={autoArbEnabled} color="#8b5cf6" onClick={() => onCommand({ type: 'TOGGLE_AUTO_ARB' })} />
                        </div>

                        <div className="mt-4 rounded-lg border border-violet-900/40 bg-violet-950/20 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Peak-Ready Dispatch</p>
                                <span className="font-mono text-xs font-bold text-violet-200">
                                    Target {autoArbOutlook.targetSocPercent.toFixed(0)}% by 18:00
                                </span>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-slate-300">
                                Forecasts remaining PV surplus against the 18:00-23:00 peak deficit. If solar alone will miss the peak-ready target, it tops up earlier from the grid and then paces discharge across the evening peak instead of dumping the battery all at once.
                            </p>
                            <div className="mt-2 grid gap-1 text-[11px] text-slate-400">
                                <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                                    <span className="whitespace-nowrap">Forecast solar recharge</span>
                                    <span className="font-mono tabular-nums text-slate-300">
                                        {autoArbOutlook.forecastSolarChargeMwh.toFixed(0)} MWh
                                    </span>
                                </div>
                                <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                                    <span className="whitespace-nowrap">Peak discharge need</span>
                                    <span className="font-mono tabular-nums text-slate-300">
                                        {autoArbOutlook.forecastPeakDemandMwh.toFixed(0)} MWh
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3">
                            <Gauge label="Battery SoC" value={batterySocPercent} unit="%" min={0} max={100} color="#3b82f6" />
                            <Gauge label="Grid Frequency" value={gridFrequencyHz} unit="Hz" min={49} max={51} color={freqWarn ? '#ef4444' : '#22c55e'} warn={freqWarn} />
                            <Gauge label="Solar Output" value={solarOutputMw} unit="MW" min={0} max={solarAcCapacityMw} color="#facc15" />
                            <Gauge label="Grid Demand" value={gridDemandMw} unit="MW" min={0} max={gridConnectionTotalMw} color="#f97316" />
                            <Gauge label="Battery Power" value={Math.abs(batteryPowerMw)} unit="MW" min={0} max={batteryTransferLimitMw} color={batteryPowerMw >= 0 ? '#22c55e' : '#f59e0b'} />
                        </div>
                    </PanelCard>

                    <PanelCard title="🔋 BESS Capacity Setup">
                        <div className="grid gap-3">
                            <NumericField
                                label="Power Rating"
                                value={batteryPowerRatingMw}
                                unit="MW"
                                min={50}
                                max={250}
                                step={1}
                                accentClass="text-cyan-400"
                                testId="bess-power-rating-input"
                                onChange={(value) => onCommand({ type: 'SET_BESS_POWER_RATING', payload: value })}
                            />
                            <NumericField
                                label="Energy Capacity"
                                value={batteryEnergyCapacityMwh}
                                unit="MWh"
                                min={100}
                                max={1200}
                                step={10}
                                accentClass="text-sky-300"
                                testId="bess-energy-capacity-input"
                                onChange={(value) => onCommand({ type: 'SET_BESS_ENERGY_CAPACITY', payload: value })}
                            />

                            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span>Derived Storage Duration</span>
                                    <span className="font-mono font-bold text-emerald-300">{batteryDurationHours.toFixed(1)} h</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                                    <span>Battery PCS / interconnection cap</span>
                                    <span className="font-mono">{batteryTransferLimitMw.toFixed(0)} MW effective</span>
                                </div>
                            </div>
                        </div>
                    </PanelCard>

                    <PanelCard title="🎛️ Dispatch Parameters">
                        <div>
                            <div className="mb-1 flex justify-between text-xs text-slate-400">
                                <span>Grid Dispatch Scale</span>
                                <span className="font-mono font-bold text-orange-400">
                                    {dispatchScalePercent}% <span className="text-slate-500">({gridDemandMw.toFixed(0)} MW)</span>
                                </span>
                            </div>
                            <input
                                type="range"
                                min={50}
                                max={150}
                                value={dispatchScalePercent}
                                onChange={(event) => onCommand({ type: 'SET_DISPATCH_SCALE', payload: Number(event.target.value) })}
                                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-orange-500"
                            />
                        </div>
                    </PanelCard>
                </div>

                <div className="pointer-events-auto flex min-h-0 flex-col gap-3 overflow-y-auto pl-1">
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

                    <PanelCard title="💶 Economics">
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="cursor-default rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider text-white"
                                        style={{ backgroundColor: tariffColor, boxShadow: `0 0 10px ${tariffColor}44` }}
                                    >
                                        {TARIFF_LABELS[tariffPeriod]}
                                    </button>
                                    <span className="text-xs text-slate-500">Market Price Window</span>
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
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Solar → Grid</p>
                                    <p className="mt-1 font-mono text-base font-bold text-yellow-300">{solarExportMw.toFixed(0)} MW</p>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Solar → BESS</p>
                                    <p className="mt-1 font-mono text-base font-bold text-emerald-300">{batteryChargeFromSolarMw.toFixed(0)} MW</p>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Grid → BESS</p>
                                    <p className="mt-1 font-mono text-base font-bold text-cyan-300">{batteryChargeFromGridMw.toFixed(0)} MW</p>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">BESS → Grid</p>
                                    <p className="mt-1 font-mono text-base font-bold text-amber-300">{batteryDischargeToGridMw.toFixed(0)} MW</p>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Net Export</p>
                                    <p className={`mt-1 font-mono text-base font-bold ${projectNetExportMw >= 0 ? 'text-slate-100' : 'text-rose-300'}`}>
                                        {projectNetExportMw >= 0 ? '+' : ''}{projectNetExportMw.toFixed(0)} MW
                                    </p>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Curtailment</p>
                                    <p className="mt-1 font-mono text-base font-bold text-rose-300">{solarCurtailedMw.toFixed(0)} MW</p>
                                </div>
                            </div>

                            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Settlement Logic</p>
                                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                                    `Project P&amp;L` includes direct PV sales, grid-paid charging, and BESS discharge revenue.
                                    `BESS Margin` isolates the storage uplift, where `Solar → BESS` is treated as delayed sale value rather than as grid power purchased.
                                </p>
                            </div>

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
                                                <span className="text-xs text-slate-500">{TARIFF_WINDOW_LABELS[period]}</span>
                                            </div>
                                            <div className="w-[118px]">
                                                <label className="sr-only" htmlFor={`tariff-rate-${period}`}>
                                                    {period} tariff rate
                                                </label>
                                                <input
                                                    id={`tariff-rate-${period}`}
                                                    data-testid={`tariff-rate-${period}`}
                                                    type="number"
                                                    min={-500}
                                                    max={1000}
                                                    step={5}
                                                    value={tariffRatesEurMwh[period]}
                                                    onChange={(event) => {
                                                        const value = Number(event.target.value);
                                                        if (Number.isFinite(value)) {
                                                            onCommand({ type: 'SET_TARIFF_RATE', payload: { period, value } });
                                                        }
                                                    }}
                                                    className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-slate-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="-mt-1 text-[11px] leading-relaxed text-slate-500">
                                These inputs are coarse wholesale price windows, not retail tariffs. EU spot markets can clear below zero.
                            </p>

                            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                                <div className="flex-[6] rounded-l-full bg-green-600/60" title="Off-peak 00-06" />
                                <div className="flex-[12] bg-yellow-500/60" title="Mid-peak 06-18" />
                                <div className="flex-[5] bg-red-500/60" title="Peak 18-23" />
                                <div className="flex-[1] rounded-r-full bg-green-600/60" title="Off-peak 23-00" />
                            </div>
                            <div className="-mt-1 flex justify-between text-[8px] text-slate-600">
                                <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
                            </div>
                        </div>
                    </PanelCard>

                    {history.length > 2 && (
                        <PanelCard title="📊 Real-Time Telemetry">
                            <Suspense fallback={<div className="h-[170px] animate-pulse rounded-lg bg-slate-800/60" />}>
                                <TelemetryChart history={history} />
                            </Suspense>
                        </PanelCard>
                    )}
                </div>
            </div>
        </div>
    );
}
