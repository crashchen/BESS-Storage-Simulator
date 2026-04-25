// ============================================================
// Pure reducer for GridState command handling.
// `applyCommand` turns a (prev, cmd, now) triple into a next
// GridState plus a small side-effects manifest that the hook
// uses to drive history/timer-ref resets outside the reducer.
// ============================================================

import { BESS, GRID, SIMULATION, SOLAR, TARIFF } from '../config';
import type { BESSCommand, GridState } from '../types';
import {
    clamp,
    computeGridDemandMw,
    computeSolarOutputMw,
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

        case 'STOP_SIMULATION':
            return {
                next: createInitialGridState(now),
                sideEffects: { resetHistory: true, resetTimerRefs: true, resetFrameRef: true },
            };

        case 'CHARGE':
            return {
                next: reconcileStaticTelemetry({
                    ...prev, batteryMode: 'charging', autoArbEnabled: false,
                }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'DISCHARGE':
            return {
                next: reconcileStaticTelemetry({
                    ...prev, batteryMode: 'discharging', autoArbEnabled: false,
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
            const dispatchScalePercent = clamp(cmd.payload, SIMULATION.dispatchScaleMin, SIMULATION.dispatchScaleMax);
            const gridDemandMw = computeGridDemandMw(
                prev.timeOfDay,
                dispatchScalePercent / 100,
                selectGridConnectionTotalMw(prev),
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? { ...prev, dispatchScalePercent, gridDemandMw, timestamp: now }
                    : reconcileStaticTelemetry({ ...prev, dispatchScalePercent }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_TIME_SPEED':
            return {
                next: {
                    ...prev,
                    timeSpeed: clamp(cmd.payload, SIMULATION.minTimeSpeed, SIMULATION.maxTimeSpeed),
                    timestamp: now,
                },
                sideEffects: NO_SIDE_EFFECTS,
            };

        case 'SET_BESS_POWER_RATING': {
            const batteryPowerRatingMw = clamp(cmd.payload, BESS.minPowerMw, BESS.maxPowerMw);
            return {
                next: prev.simulationStatus === 'running'
                    ? { ...prev, batteryPowerRatingMw, timestamp: now }
                    : reconcileStaticTelemetry({ ...prev, batteryPowerRatingMw }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_BESS_ENERGY_CAPACITY': {
            const prevStoredMwh = (prev.batterySocPercent / 100) * prev.batteryEnergyCapacityMwh;
            const batteryEnergyCapacityMwh = clamp(cmd.payload, BESS.minEnergyMwh, BESS.maxEnergyMwh);
            const batterySocPercent = clamp(
                (prevStoredMwh / Math.max(batteryEnergyCapacityMwh, 1e-9)) * 100,
                0,
                100,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? { ...prev, batteryEnergyCapacityMwh, batterySocPercent, timestamp: now }
                    : reconcileStaticTelemetry({ ...prev, batteryEnergyCapacityMwh, batterySocPercent }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_SOLAR_AC_CAPACITY': {
            const solarAcCapacityMw = clamp(cmd.payload, SOLAR.minAcCapacityMw, SOLAR.maxAcCapacityMw);
            const solarOutputMw = computeSolarOutputMw(
                prev.timeOfDay,
                solarAcCapacityMw,
                prev.solarDcCapacityMwp,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? { ...prev, solarAcCapacityMw, solarOutputMw, timestamp: now }
                    : reconcileStaticTelemetry({ ...prev, solarAcCapacityMw }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_SOLAR_DC_CAPACITY': {
            const solarDcCapacityMwp = clamp(cmd.payload, SOLAR.minDcCapacityMwp, SOLAR.maxDcCapacityMwp);
            const solarOutputMw = computeSolarOutputMw(
                prev.timeOfDay,
                prev.solarAcCapacityMw,
                solarDcCapacityMwp,
            );
            return {
                next: prev.simulationStatus === 'running'
                    ? { ...prev, solarDcCapacityMwp, solarOutputMw, timestamp: now }
                    : reconcileStaticTelemetry({ ...prev, solarDcCapacityMwp }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_GRID_PV_EVACUATION': {
            const gridPvEvacuationMw = clamp(cmd.payload, GRID.minPvEvacuationMw, GRID.maxPvEvacuationMw);
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
                    ? { ...prev, gridPvEvacuationMw, gridDemandMw, timestamp: now }
                    : reconcileStaticTelemetry({ ...prev, gridPvEvacuationMw }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_GRID_BESS_CONNECTION': {
            const gridBessConnectionMw = clamp(cmd.payload, GRID.minBessConnectionMw, GRID.maxBessConnectionMw);
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
                    ? { ...prev, gridBessConnectionMw, gridDemandMw, timestamp: now }
                    : reconcileStaticTelemetry({ ...prev, gridBessConnectionMw }, now),
                sideEffects: NO_SIDE_EFFECTS,
            };
        }

        case 'SET_TARIFF_RATE': {
            const { period, value } = cmd.payload;
            const tariffRatesEurMwh = {
                ...prev.tariffRatesEurMwh,
                [period]: clamp(value, TARIFF.minRateEurMwh, TARIFF.maxRateEurMwh),
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

        default: {
            const _exhaustive: never = cmd;
            return _exhaustive;
        }
    }
}
