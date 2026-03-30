// ============================================================
// BESS Dispatch Control - Mode selection and capacity setup
// ============================================================

import { useCallback } from 'react';
import type { BESSCommand, GridState } from '../../types';
import { getAutoArbOutlook } from '../../utils/simulationModel';
import { ActionButton, Gauge, NumericField, PanelCard } from '../ui/PanelPrimitives';

interface BessControlProps {
    gridState: GridState;
    onCommand: (cmd: BESSCommand) => void;
}

export function BessDispatchControl({ gridState, onCommand }: BessControlProps) {
    const {
        batteryMode,
        batterySocPercent,
        gridFrequencyHz,
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw,
        autoArbEnabled,
        solarAcCapacityMw,
        batteryPowerRatingMw,
        gridConnectionTotalMw,
        gridBessConnectionMw,
        timeOfDay,
    } = gridState;

    const freqWarn = gridFrequencyHz < 49.5 || gridFrequencyHz > 50.5;
    const batteryTransferLimitMw = Math.min(batteryPowerRatingMw, gridBessConnectionMw);
    const autoArbOutlook = getAutoArbOutlook(gridState, timeOfDay);

    const handleMode = useCallback(
        (type: 'CHARGE' | 'DISCHARGE' | 'IDLE') => onCommand({ type } as BESSCommand),
        [onCommand],
    );

    return (
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
    );
}

export function BessCapacitySetup({ gridState, onCommand }: BessControlProps) {
    const {
        batteryPowerRatingMw,
        batteryDurationHours,
        batteryEnergyCapacityMwh,
        gridBessConnectionMw,
    } = gridState;

    const batteryTransferLimitMw = Math.min(batteryPowerRatingMw, gridBessConnectionMw);

    return (
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
    );
}

export function DispatchParameters({ gridState, onCommand }: BessControlProps) {
    const { dispatchScalePercent, gridDemandMw } = gridState;

    return (
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
    );
}
