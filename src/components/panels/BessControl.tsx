// ============================================================
// BESS Dispatch Control - Mode selection and capacity setup
// ============================================================

import { useCallback } from 'react';
import { AUTO_ARB, BESS, GRID, SIMULATION, SOLAR } from '../../config';
import type { BESSCommand, GridState, TariffPeriod } from '../../types';
import { selectBatteryDurationHours, selectGridConnectionTotalMw } from '../../utils/gridSelectors';
import type { AutoArbPlan } from '../../utils/simulationModel';
import { getAutoArbOutlook, getAutoArbPlan, getBatteryTransferLimitMw } from '../../utils/simulationModel';
import { ActionButton, Gauge, NumericField, PanelCard } from '../ui/PanelPrimitives';

function formatTargetHour(hour: number): string {
    return `${Math.trunc(hour).toString().padStart(2, '0')}:00`;
}

function getDispatchPhaseText(
    tariffPeriod: TariffPeriod,
    timeOfDay: number,
    batterySocPercent: number,
    autoArbPlan: AutoArbPlan,
): string {
    if (tariffPeriod === 'peak') {
        if (batterySocPercent <= 0) return 'Battery depleted — holding idle through peak.';
        if (autoArbPlan.mode === 'discharging' && autoArbPlan.targetPowerMw < 0) {
            return 'Pacing discharge across the evening peak window.';
        }
        return 'Peak window — holding idle (uneconomic to discharge).';
    }
    if (timeOfDay < AUTO_ARB.peakStartHour) {
        if (batterySocPercent >= autoArbPlan.targetSocPercent) return 'Target SoC reached — holding charge until peak.';
        if (autoArbPlan.mode === 'charging' && autoArbPlan.targetPowerMw > 0) {
            if (autoArbPlan.shouldGridTopUp) return 'Solar forecast insufficient — topping up from grid.';
            return 'Absorbing solar surplus toward peak-ready target.';
        }
        return 'Peak-ready idle — awaiting solar surplus or economical grid top-up.';
    }
    // Post-peak (off-peak night)
    if (autoArbPlan.mode === 'charging' && autoArbPlan.targetPowerMw > 0) return "Off-peak grid top-up for tomorrow's peak.";
    return 'Post-peak idle — awaiting next solar cycle.';
}

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
        timeOfDay,
        tariffPeriod,
        tariffRatesEurMwh,
    } = gridState;
    const gridConnectionTotalMw = selectGridConnectionTotalMw(gridState);

    const freqWarn = gridFrequencyHz < GRID.warningFrequencyLowHz || gridFrequencyHz > GRID.warningFrequencyHighHz;
    const batteryTransferLimitMw = getBatteryTransferLimitMw(gridState);
    const autoArbOutlook = getAutoArbOutlook(gridState, timeOfDay);
    const autoArbPlan = getAutoArbPlan(gridState, timeOfDay, solarOutputMw, gridDemandMw, tariffPeriod, tariffRatesEurMwh);
    const peakReadyTargetHour = `${formatTargetHour(AUTO_ARB.peakStartHour)}${timeOfDay >= AUTO_ARB.peakEndHour ? ' (next day)' : ''}`;

    const handleMode = useCallback(
        (type: 'CHARGE' | 'DISCHARGE' | 'IDLE') => onCommand({ type }),
        [onCommand],
    );

    return (
        <PanelCard title="⚡ BESS Dispatch Control">
            <div className="grid grid-cols-4 gap-2">
                <ActionButton label="Charge" active={!autoArbEnabled && batteryMode === 'charging'} color="#22c55e" onClick={() => handleMode('CHARGE')} disabled={batterySocPercent >= 100} />
                <ActionButton label="Idle" active={!autoArbEnabled && batteryMode === 'idle'} color="#64748b" onClick={() => handleMode('IDLE')} />
                <ActionButton label="Discharge" active={!autoArbEnabled && batteryMode === 'discharging'} color="#f59e0b" onClick={() => handleMode('DISCHARGE')} disabled={batterySocPercent <= 0} />
                <ActionButton label="Peak Ready" active={autoArbEnabled} color="#8b5cf6" onClick={() => onCommand({ type: 'TOGGLE_AUTO_ARB' })} />
            </div>

            <div className="mt-4 rounded-lg border border-violet-900/40 bg-violet-950/20 p-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Peak-Ready Dispatch</p>
                    <span className="font-mono text-xs font-bold text-violet-200">
                        Target {autoArbOutlook.targetSocPercent.toFixed(0)}% by {peakReadyTargetHour}
                    </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    {getDispatchPhaseText(
                        tariffPeriod,
                        timeOfDay,
                        batterySocPercent,
                        autoArbPlan,
                    )}
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
                <Gauge
                    label="Grid Frequency"
                    value={gridFrequencyHz}
                    unit="Hz"
                    min={GRID.minFrequencyHz}
                    max={GRID.maxFrequencyHz}
                    color={freqWarn ? '#ef4444' : '#22c55e'}
                    warn={freqWarn}
                />
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
        batteryEnergyCapacityMwh,
    } = gridState;
    const batteryDurationHours = selectBatteryDurationHours(gridState);
    const batteryTransferLimitMw = getBatteryTransferLimitMw(gridState);

    return (
        <PanelCard title="🔋 BESS Capacity Setup">
            <div className="grid gap-3">
                <NumericField
                    label="Power Rating"
                    value={batteryPowerRatingMw}
                    unit="MW"
                    min={BESS.minPowerMw}
                    max={BESS.maxPowerMw}
                    step={1}
                    accentClass="text-cyan-400"
                    testId="bess-power-rating-input"
                    onChange={(value) => onCommand({ type: 'SET_BESS_POWER_RATING', payload: value })}
                />
                <NumericField
                    label="Energy Capacity"
                    value={batteryEnergyCapacityMwh}
                    unit="MWh"
                    min={BESS.minEnergyMwh}
                    max={BESS.maxEnergyMwh}
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
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>Battery PCS / interconnection cap</span>
                        <span className="font-mono">{batteryTransferLimitMw.toFixed(0)} MW effective</span>
                    </div>
                </div>
            </div>
        </PanelCard>
    );
}

export function ProjectCapacitySetup({ gridState, onCommand }: BessControlProps) {
    const {
        solarAcCapacityMw,
        solarDcCapacityMwp,
        gridPvEvacuationMw,
        gridBessConnectionMw,
    } = gridState;
    const gridConnectionTotalMw = selectGridConnectionTotalMw(gridState);

    return (
        <PanelCard title="🏗️ Project Capacity">
            <div className="grid gap-3">
                <NumericField
                    label="Solar AC Capacity"
                    value={solarAcCapacityMw}
                    unit="MW"
                    min={SOLAR.minAcCapacityMw}
                    max={SOLAR.maxAcCapacityMw}
                    step={1}
                    accentClass="text-yellow-300"
                    testId="solar-ac-capacity-input"
                    onChange={(value) => onCommand({ type: 'SET_SOLAR_AC_CAPACITY', payload: value })}
                />
                <NumericField
                    label="Solar DC Capacity"
                    value={solarDcCapacityMwp}
                    unit="MWp"
                    min={SOLAR.minDcCapacityMwp}
                    max={SOLAR.maxDcCapacityMwp}
                    step={1}
                    accentClass="text-amber-300"
                    testId="solar-dc-capacity-input"
                    onChange={(value) => onCommand({ type: 'SET_SOLAR_DC_CAPACITY', payload: value })}
                />
                <NumericField
                    label="PV Evacuation Limit"
                    value={gridPvEvacuationMw}
                    unit="MW"
                    min={GRID.minPvEvacuationMw}
                    max={GRID.maxPvEvacuationMw}
                    step={1}
                    accentClass="text-orange-300"
                    testId="grid-pv-evacuation-input"
                    onChange={(value) => onCommand({ type: 'SET_GRID_PV_EVACUATION', payload: value })}
                />
                <NumericField
                    label="BESS Grid Connection"
                    value={gridBessConnectionMw}
                    unit="MW"
                    min={GRID.minBessConnectionMw}
                    max={GRID.maxBessConnectionMw}
                    step={1}
                    accentClass="text-cyan-300"
                    testId="grid-bess-connection-input"
                    onChange={(value) => onCommand({ type: 'SET_GRID_BESS_CONNECTION', payload: value })}
                />

                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Derived Total Grid Connection</span>
                        <span className="font-mono font-bold text-emerald-300">{gridConnectionTotalMw.toFixed(0)} MW</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>PV evac + BESS interconnect</span>
                        <span className="font-mono">{gridPvEvacuationMw.toFixed(0)} + {gridBessConnectionMw.toFixed(0)} MW</span>
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
                        {dispatchScalePercent}% <span className="text-slate-400">({gridDemandMw.toFixed(0)} MW)</span>
                    </span>
                </div>
                <input
                    type="range"
                    min={SIMULATION.dispatchScaleMin}
                    max={SIMULATION.dispatchScaleMax}
                    value={dispatchScalePercent}
                    aria-label="Grid Dispatch Scale"
                    aria-valuetext={`${dispatchScalePercent}% demand scale, ${gridDemandMw.toFixed(0)} MW`}
                    onChange={(event) => onCommand({ type: 'SET_DISPATCH_SCALE', payload: Number(event.target.value) })}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-orange-500"
                />
            </div>
        </PanelCard>
    );
}
