// ============================================================
// Pure reducer for GridState command handling.
// `applyCommand` turns a (prev, cmd, now) triple into a next
// GridState plus a small side-effects manifest that the hook
// uses to drive history/timer-ref resets outside the reducer.
// ============================================================

import { BESS, FREQUENCY_MODEL, GRID, SIMULATION, SOLAR, TARIFF } from '../config';
import { SCENARIO_PRESETS_BY_ID } from '../scenarios';
import type { BESSCommand, GridState } from '../types';
import {
    clamp,
    clampFinite,
    computeGridDemandMw,
    computeSolarOutputMw,
    getBatteryTransferLimitMw,
    getElectricityPriceEurMwh,
    getTariffPeriod,
    settleHybridProjectTick,
} from './simulationModel';
import { selectGridConnectionTotalMw } from './gridSelectors';
import { createInitialGridState } from './tickEngine';

export interface ReducerSideEffects {
    resetHistory?: boolean;
    resetTimerRefs?: boolean;
    resetFrameRef?: boolean;
}

export interface ReducerResult {
    next: GridState;
    sideEffects: ReducerSideEffects;
}

const NO_SIDE_EFFECTS: ReducerSideEffects = {};
const SOC_EMPTY_EPSILON = 1e-9;
const SOC_FULL_EPSILON = 100 - 1e-9;

/**
 * Re-clamp the live battery power to the current transfer limit and refresh the
 * instantaneous flow fields, without advancing simulation time or accumulators.
 * Used after running-state capacity changes so UI doesn't show stale flows.
 */
function reconcileRunningFlows(state: GridState, now: number): GridState {
    const transferLimitMw = getBatteryTransferLimitMw(state);
    const clampedBatteryPowerMw = clamp(state.batteryPowerMw, -transferLimitMw, transferLimitMw);
    const currentPriceEurMwh = getElectricityPriceEurMwh(state.timeOfDay, state.tariffRatesEurMwh);
    const settlement = settleHybridProjectTick({
        solarOutputMw: state.solarOutputMw,
        gridDemandMw: state.gridDemandMw,
        batteryPowerMw: clampedBatteryPowerMw,
        gridPvEvacuationMw: state.gridPvEvacuationMw,
        currentPriceEurMwh,
        dtHours: 0,
    });
    return {
        ...state,
        batteryPowerMw: clampedBatteryPowerMw,
        batteryChargeFromSolarMw: settlement.batteryChargeFromSolarMw,
        batteryChargeFromGridMw: settlement.batteryChargeFromGridMw,
        batteryDischargeToGridMw: settlement.batteryDischargeToGridMw,
        solarExportMw: settlement.solarExportMw,
        solarCurtailedMw: settlement.solarCurtailedMw,
        projectNetExportMw: settlement.projectNetExportMw,
        timestamp: now,
    };
}

function reconcileStaticTelemetry(state: GridState, now: number): GridState {
    const solarOutputMw = computeSolarOutputMw(
        state.timeOfDay,
        state.solarAcCapacityMw,
        state.solarDcCapacityMwp,
    );
    const gridDemandMw = computeGridDemandMw(
        state.timeOfDay,
        state.dispatchScalePercent / 100,
        selectGridConnectionTotalMw(state),
    );
    const tariffPeriod = getTariffPeriod(state.timeOfDay);
    const currentPriceEurMwh = getElectricityPriceEurMwh(state.timeOfDay, state.tariffRatesEurMwh);
    const settlement = settleHybridProjectTick({
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw: 0,
        gridPvEvacuationMw: state.gridPvEvacuationMw,
        currentPriceEurMwh,
        dtHours: 0,
    });

    return {
        ...state,
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw: 0,
        batteryChargeFromSolarMw: settlement.batteryChargeFromSolarMw,
        batteryChargeFromGridMw: settlement.batteryChargeFromGridMw,
        batteryDischargeToGridMw: settlement.batteryDischargeToGridMw,
        solarExportMw: settlement.solarExportMw,
        solarCurtailedMw: settlement.solarCurtailedMw,
        projectNetExportMw: settlement.projectNetExportMw,
        tariffPeriod,
        currentPriceEurMwh,
        timestamp: now,
    };
}

function reconcileScenarioTelemetry(state: GridState, now: number): GridState {
    const solarOutputMw = computeSolarOutputMw(
        state.timeOfDay,
        state.solarAcCapacityMw,
        state.solarDcCapacityMwp,
    );
    const gridDemandMw = computeGridDemandMw(
        state.timeOfDay,
        state.dispatchScalePercent / 100,
        selectGridConnectionTotalMw(state),
    );
    const transferLimitMw = getBatteryTransferLimitMw(state);
    const requestedBatteryPowerMw = state.batterySocPercent >= SOC_FULL_EPSILON && state.batteryPowerMw > 0
        ? 0
        : state.batterySocPercent <= SOC_EMPTY_EPSILON && state.batteryPowerMw < 0
            ? 0
            : state.batteryPowerMw;
    const batteryPowerMw = clamp(requestedBatteryPowerMw, -transferLimitMw, transferLimitMw);
    const batteryMode = batteryPowerMw > 0
        ? 'charging'
        : batteryPowerMw < 0
            ? 'discharging'
            : state.batteryMode;
    const tariffPeriod = getTariffPeriod(state.timeOfDay);
    const currentPriceEurMwh = getElectricityPriceEurMwh(state.timeOfDay, state.tariffRatesEurMwh);
    const settlement = settleHybridProjectTick({
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw,
        gridPvEvacuationMw: state.gridPvEvacuationMw,
        currentPriceEurMwh,
        dtHours: 0,
    });
    const uncompensatedMw = solarOutputMw - gridDemandMw - batteryPowerMw;
    const gridFrequencyHz = clamp(
        GRID.nominalFrequencyHz + FREQUENCY_MODEL.droopK * uncompensatedMw,
        GRID.minFrequencyHz,
        GRID.maxFrequencyHz,
    );

    return {
        ...state,
        gridFrequencyHz,
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw,
        batteryMode,
        batteryChargeFromSolarMw: settlement.batteryChargeFromSolarMw,
        batteryChargeFromGridMw: settlement.batteryChargeFromGridMw,
        batteryDischargeToGridMw: settlement.batteryDischargeToGridMw,
        solarExportMw: settlement.solarExportMw,
        solarCurtailedMw: settlement.solarCurtailedMw,
        projectNetExportMw: settlement.projectNetExportMw,
        tariffPeriod,
        currentPriceEurMwh,
        timestamp: now,
    };
}

export function applyCommand(prev: GridState, cmd: BESSCommand, now: number): ReducerResult {
    switch (cmd.type) {
        case 'START_SIMULATION':
            return {
                next: { ...prev, simulationStatus: 'running', timestamp: now },
                sideEffects: { resetFrameRef: true },
            };

        case 'PAUSE_SIMULATION':
            return {
                next: { ...prev, simulationStatus: 'paused', timestamp: now },
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'STOP_SIMULATION': {
            const fresh = createInitialGridState(now);
            return {
                next: reconcileStaticTelemetry({
                    ...fresh,
                    batteryPowerRatingMw: prev.batteryPowerRatingMw,
                    batteryEnergyCapacityMwh: prev.batteryEnergyCapacityMwh,
                    solarAcCapacityMw: prev.solarAcCapacityMw,
                    solarDcCapacityMwp: prev.solarDcCapacityMwp,
                    gridPvEvacuationMw: prev.gridPvEvacuationMw,
                    gridBessConnectionMw: prev.gridBessConnectionMw,
                    siteYieldKwhPerKwYear: prev.siteYieldKwhPerKwYear,
                    tariffRatesEurMwh: prev.tariffRatesEurMwh,
                    dispatchScalePercent: prev.dispatchScalePercent,
                    timeSpeed: prev.timeSpeed,
                }, now),
                sideEffects: { resetHistory: true, resetTimerRefs: true, resetFrameRef: true },
            };
        }

        case 'RESET_SIMULATION':
            return {
                next: createInitialGridState(now),
                sideEffects: { resetHistory: true, resetTimerRefs: true, resetFrameRef: true },
            };

        case 'CHARGE':
            return {
                next: reconcileStaticTelemetry({
                    ...prev,
                    batteryMode: prev.batterySocPercent >= SOC_FULL_EPSILON ? 'idle' : 'charging',
                    autoArbEnabled: false,
                }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'DISCHARGE':
            return {
                next: reconcileStaticTelemetry({
                    ...prev,
                    batteryMode: prev.batterySocPercent <= SOC_EMPTY_EPSILON ? 'idle' : 'discharging',
                    autoArbEnabled: false,
                }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'IDLE':
            return {
                next: reconcileStaticTelemetry({
                    ...prev, batteryMode: 'idle', autoArbEnabled: false,
                }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'SET_DISPATCH_SCALE': {
            const dispatchScalePercent = clampFinite(
                cmd.payload,
                SIMULATION.dispatchScaleMin,
                SIMULATION.dispatchScaleMax,
                prev.dispatchScalePercent,
            );
            const gridDemandMw = computeGridDemandMw(
                prev.timeOfDay,
                dispatchScalePercent / 100,
                selectGridConnectionTotalMw(prev),
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? reconcileRunningFlows({ ...prev, dispatchScalePercent, gridDemandMw }, now)
                    : reconcileStaticTelemetry({ ...prev, dispatchScalePercent }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_TIME_SPEED':
            return {
                next: {
                    ...prev,
                    timeSpeed: clampFinite(
                        cmd.payload,
                        SIMULATION.minTimeSpeed,
                        SIMULATION.maxTimeSpeed,
                        prev.timeSpeed,
                    ),
                    timestamp: now,
                },
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'SET_BESS_POWER_RATING': {
            const batteryPowerRatingMw = clampFinite(
                cmd.payload,
                BESS.minPowerMw,
                BESS.maxPowerMw,
                prev.batteryPowerRatingMw,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? reconcileRunningFlows({ ...prev, batteryPowerRatingMw }, now)
                    : reconcileStaticTelemetry({ ...prev, batteryPowerRatingMw }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_BESS_ENERGY_CAPACITY': {
            const prevStoredMwh = (prev.batterySocPercent / 100) * prev.batteryEnergyCapacityMwh;
            const batteryEnergyCapacityMwh = clampFinite(
                cmd.payload,
                BESS.minEnergyMwh,
                BESS.maxEnergyMwh,
                prev.batteryEnergyCapacityMwh,
            );
            const batterySocPercent = clamp(
                (prevStoredMwh / Math.max(batteryEnergyCapacityMwh, 1e-9)) * 100,
                0,
                100,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? reconcileRunningFlows({ ...prev, batteryEnergyCapacityMwh, batterySocPercent }, now)
                    : reconcileStaticTelemetry({ ...prev, batteryEnergyCapacityMwh, batterySocPercent }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_SOLAR_AC_CAPACITY': {
            const solarAcCapacityMw = clampFinite(
                cmd.payload,
                SOLAR.minAcCapacityMw,
                SOLAR.maxAcCapacityMw,
                prev.solarAcCapacityMw,
            );
            const solarOutputMw = computeSolarOutputMw(
                prev.timeOfDay,
                solarAcCapacityMw,
                prev.solarDcCapacityMwp,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? reconcileRunningFlows({ ...prev, solarAcCapacityMw, solarOutputMw }, now)
                    : reconcileStaticTelemetry({ ...prev, solarAcCapacityMw }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_SOLAR_DC_CAPACITY': {
            const solarDcCapacityMwp = clampFinite(
                cmd.payload,
                SOLAR.minDcCapacityMwp,
                SOLAR.maxDcCapacityMwp,
                prev.solarDcCapacityMwp,
            );
            const solarOutputMw = computeSolarOutputMw(
                prev.timeOfDay,
                prev.solarAcCapacityMw,
                solarDcCapacityMwp,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? reconcileRunningFlows({ ...prev, solarDcCapacityMwp, solarOutputMw }, now)
                    : reconcileStaticTelemetry({ ...prev, solarDcCapacityMwp }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_GRID_PV_EVACUATION': {
            const gridPvEvacuationMw = clampFinite(
                cmd.payload,
                GRID.minPvEvacuationMw,
                GRID.maxPvEvacuationMw,
                prev.gridPvEvacuationMw,
            );
            const gridConnectionTotalMw = selectGridConnectionTotalMw({
                gridPvEvacuationMw,
                gridBessConnectionMw: prev.gridBessConnectionMw,
            });
            const gridDemandMw = computeGridDemandMw(
                prev.timeOfDay,
                prev.dispatchScalePercent / 100,
                gridConnectionTotalMw,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? reconcileRunningFlows({ ...prev, gridPvEvacuationMw, gridDemandMw }, now)
                    : reconcileStaticTelemetry({ ...prev, gridPvEvacuationMw }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_GRID_BESS_CONNECTION': {
            const gridBessConnectionMw = clampFinite(
                cmd.payload,
                GRID.minBessConnectionMw,
                GRID.maxBessConnectionMw,
                prev.gridBessConnectionMw,
            );
            const gridConnectionTotalMw = selectGridConnectionTotalMw({
                gridPvEvacuationMw: prev.gridPvEvacuationMw,
                gridBessConnectionMw,
            });
            const gridDemandMw = computeGridDemandMw(
                prev.timeOfDay,
                prev.dispatchScalePercent / 100,
                gridConnectionTotalMw,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? reconcileRunningFlows({ ...prev, gridBessConnectionMw, gridDemandMw }, now)
                    : reconcileStaticTelemetry({ ...prev, gridBessConnectionMw }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_TARIFF_RATE': {
            const { period, value } = cmd.payload;
            const tariffRatesEurMwh = {
                ...prev.tariffRatesEurMwh,
                [period]: clampFinite(
                    value,
                    TARIFF.minRateEurMwh,
                    TARIFF.maxRateEurMwh,
                    prev.tariffRatesEurMwh[period],
                ),
            };
            return {
                next: prev.simulationStatus === 'running'
                    ? {
                        ...prev,
                        tariffRatesEurMwh,
                        currentPriceEurMwh: getElectricityPriceEurMwh(prev.timeOfDay, tariffRatesEurMwh),
                        timestamp: now,
                    }
                    : reconcileStaticTelemetry({
                        ...prev,
                        tariffRatesEurMwh,
                    }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'TOGGLE_AUTO_ARB':
            return {
                next: reconcileStaticTelemetry({
                    ...prev,
                    autoArbEnabled: !prev.autoArbEnabled,
                    batteryMode: 'idle',
                }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'SET_AUTO_ARB_ENABLED':
            return {
                next: reconcileStaticTelemetry({
                    ...prev,
                    autoArbEnabled: cmd.payload,
                    batteryMode: 'idle',
                }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'APPLY_SCENARIO_PRESET': {
            const preset = SCENARIO_PRESETS_BY_ID[cmd.payload];
            const fresh = createInitialGridState(now);
            return {
                next: reconcileScenarioTelemetry({
                    ...fresh,
                    ...preset.state,
                    timestamp: now,
                }, now),
                sideEffects: { resetHistory: true, resetTimerRefs: true, resetFrameRef: true },
            };
        }

        default: {
            const _exhaustive: never = cmd;
            return _exhaustive;
        }
    }
}
