// ============================================================
// Core simulation hook for the Romania solar + BESS project
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BESSCommand, GridSnapshot, GridState, TariffPeriod } from '../types';
import {
    clamp,
    computeGridDemandMw,
    computeSolarOutputMw,
    getAutoArbPlan,
    getBatteryDurationHours,
    getBatteryTransferLimitMw,
    getElectricityPriceEurMwh,
    getTariffPeriod,
    settleHybridProjectTick,
} from '../utils/simulationModel';

const F_NOMINAL_HZ = 50.0;
const DROOP_K = 0.0035;
const FREQ_NOISE_SIGMA = 0.012;
const F_MIN_HZ = 47.5;
const F_MAX_HZ = 52.0;

const PROJECT_NAME = 'Romania Hybrid Solar + BESS';
const PROJECT_LOCATION = 'Romania';
const SOLAR_DC_CAPACITY_MWP = 117;
const SOLAR_AC_CAPACITY_MW = 102;
const BESS_POWER_RATING_MW = 188;
const BESS_ENERGY_CAPACITY_MWH = 744;
const GRID_CONNECTION_TOTAL_MW = 288;
const GRID_PV_EVACUATION_MW = 102;
const GRID_BESS_CONNECTION_MW = 186;
const SITE_YIELD_KWH_PER_KW_YEAR = 1380;
const DEFAULT_TARIFF_RATES_EUR_MWH: Record<TariffPeriod, number> = {
    'off-peak': 80,
    'mid-peak': 150,
    'peak': 350,
};

const DISPATCH_SCALE_MIN = 50;
const DISPATCH_SCALE_MAX = 150;
const BESS_POWER_MIN_MW = 50;
const BESS_POWER_MAX_MW = 250;
const BESS_ENERGY_MIN_MWH = 100;
const BESS_ENERGY_MAX_MWH = 1200;

const FREQ_CHARGE_LOCKOUT_HZ = 49.9;
const HISTORY_MAX = 200;
const SNAPSHOT_INTERVAL_MS = 400;
const INITIAL_TIME_OF_DAY = 8.0;
const TARIFF_RATE_MIN = -500;
const TARIFF_RATE_MAX = 1000;
const BESS_CHARGE_EFFICIENCY = 0.96;
const BESS_DISCHARGE_EFFICIENCY = 0.96;

function gaussianNoise(sigma: number): number {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

function createInitialGridState(timestamp = 0): GridState {
    const batteryDurationHours = getBatteryDurationHours(BESS_POWER_RATING_MW, BESS_ENERGY_CAPACITY_MWH);

    return {
        projectName: PROJECT_NAME,
        projectLocation: PROJECT_LOCATION,
        solarDcCapacityMwp: SOLAR_DC_CAPACITY_MWP,
        solarAcCapacityMw: SOLAR_AC_CAPACITY_MW,
        batteryPowerRatingMw: BESS_POWER_RATING_MW,
        batteryDurationHours,
        batteryEnergyCapacityMwh: BESS_ENERGY_CAPACITY_MWH,
        gridConnectionTotalMw: GRID_CONNECTION_TOTAL_MW,
        gridPvEvacuationMw: GRID_PV_EVACUATION_MW,
        gridBessConnectionMw: GRID_BESS_CONNECTION_MW,
        siteYieldKwhPerKwYear: SITE_YIELD_KWH_PER_KW_YEAR,
        simulationStatus: 'stopped',
        gridFrequencyHz: F_NOMINAL_HZ,
        solarOutputMw: computeSolarOutputMw(INITIAL_TIME_OF_DAY, SOLAR_AC_CAPACITY_MW),
        gridDemandMw: computeGridDemandMw(INITIAL_TIME_OF_DAY, 1.0, GRID_CONNECTION_TOTAL_MW),
        dispatchScalePercent: 100,
        batterySocPercent: 65,
        batteryPowerMw: 0,
        batteryChargeFromSolarMw: 0,
        batteryChargeFromGridMw: 0,
        batteryDischargeToGridMw: 0,
        solarExportMw: computeSolarOutputMw(INITIAL_TIME_OF_DAY, SOLAR_AC_CAPACITY_MW),
        solarCurtailedMw: 0,
        projectNetExportMw: computeSolarOutputMw(INITIAL_TIME_OF_DAY, SOLAR_AC_CAPACITY_MW),
        batteryMode: 'idle',
        timeOfDay: INITIAL_TIME_OF_DAY,
        timeSpeed: 240,
        timestamp,
        tariffPeriod: getTariffPeriod(INITIAL_TIME_OF_DAY),
        tariffRatesEurMwh: DEFAULT_TARIFF_RATES_EUR_MWH,
        currentPriceEurMwh: getElectricityPriceEurMwh(INITIAL_TIME_OF_DAY, DEFAULT_TARIFF_RATES_EUR_MWH),
        cumulativeRevenueEur: 0,
        cumulativeBessMarginEur: 0,
        autoArbEnabled: false,
    };
}

function simulateTick(prev: GridState, dtReal: number, now: number): GridState {
    const dtSim = dtReal * prev.timeSpeed;
    const dtHours = dtSim / 3600;

    let timeOfDay = (prev.timeOfDay + dtHours) % 24;
    if (timeOfDay < 0) timeOfDay += 24;

    const solarOutputMw = computeSolarOutputMw(timeOfDay, prev.solarAcCapacityMw);
    const gridDemandMw = computeGridDemandMw(timeOfDay, prev.dispatchScalePercent / 100, prev.gridConnectionTotalMw);
    const tariffPeriod = getTariffPeriod(timeOfDay);
    const currentPriceEurMwh = getElectricityPriceEurMwh(timeOfDay, prev.tariffRatesEurMwh);

    let requestedMode = prev.batteryMode;
    let autoArbPowerMw = 0;

    if (prev.autoArbEnabled) {
        const autoArbPlan = getAutoArbPlan(prev, timeOfDay, solarOutputMw, gridDemandMw, tariffPeriod);
        requestedMode = autoArbPlan.mode;
        autoArbPowerMw = autoArbPlan.targetPowerMw;
    }

    if (prev.batterySocPercent >= 100 && requestedMode === 'charging') {
        requestedMode = 'idle';
    }
    if (prev.batterySocPercent <= 0 && requestedMode === 'discharging') {
        requestedMode = 'idle';
    }

    const hasSolarSurplus = solarOutputMw > gridDemandMw;
    if (prev.autoArbEnabled && requestedMode === 'charging' && !hasSolarSurplus && prev.gridFrequencyHz < FREQ_CHARGE_LOCKOUT_HZ) {
        requestedMode = 'idle';
    }

    const transferLimitMw = getBatteryTransferLimitMw(prev);
    const powerMismatchMw = solarOutputMw - gridDemandMw;
    let batteryPowerMw = 0;

    if (requestedMode === 'charging') {
        if (prev.autoArbEnabled) {
            batteryPowerMw = clamp(autoArbPowerMw, 0, transferLimitMw);
        } else {
            batteryPowerMw = transferLimitMw;
        }
    } else if (requestedMode === 'discharging') {
        if (prev.autoArbEnabled) {
            batteryPowerMw = clamp(autoArbPowerMw, -transferLimitMw, 0);
        } else {
            batteryPowerMw = -transferLimitMw;
        }
    }

    if (batteryPowerMw > 0) {
        const remainingEnergyMwh = ((100 - prev.batterySocPercent) / 100) * prev.batteryEnergyCapacityMwh;
        const maxChargeMw = remainingEnergyMwh / Math.max(dtHours * BESS_CHARGE_EFFICIENCY, 1e-9);
        batteryPowerMw = Math.min(batteryPowerMw, maxChargeMw);
    } else if (batteryPowerMw < 0) {
        const availableEnergyMwh = (prev.batterySocPercent / 100) * prev.batteryEnergyCapacityMwh;
        const maxDischargeMw = (availableEnergyMwh * BESS_DISCHARGE_EFFICIENCY) / Math.max(dtHours, 1e-9);
        batteryPowerMw = Math.max(batteryPowerMw, -maxDischargeMw);
    }

    const storedEnergyDeltaMwh = batteryPowerMw >= 0
        ? batteryPowerMw * dtHours * BESS_CHARGE_EFFICIENCY
        : (batteryPowerMw * dtHours) / BESS_DISCHARGE_EFFICIENCY;
    let batterySocPercent = prev.batterySocPercent + (storedEnergyDeltaMwh / prev.batteryEnergyCapacityMwh) * 100;
    batterySocPercent = clamp(batterySocPercent, 0, 100);

    let batteryMode = requestedMode;
    if (batterySocPercent >= 100 && batteryMode === 'charging') {
        batteryMode = 'idle';
        batteryPowerMw = 0;
    }
    if (batterySocPercent <= 0 && batteryMode === 'discharging') {
        batteryMode = 'idle';
        batteryPowerMw = 0;
    }

    const settlement = settleHybridProjectTick({
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw,
        gridPvEvacuationMw: prev.gridPvEvacuationMw,
        currentPriceEurMwh,
        dtHours,
    });

    const uncompensatedMw = powerMismatchMw - batteryPowerMw;
    const gridFrequencyHz = clamp(
        F_NOMINAL_HZ + DROOP_K * uncompensatedMw + gaussianNoise(FREQ_NOISE_SIGMA),
        F_MIN_HZ,
        F_MAX_HZ,
    );

    const cumulativeRevenueEur = prev.cumulativeRevenueEur + settlement.projectPnlDeltaEur;
    const cumulativeBessMarginEur = prev.cumulativeBessMarginEur + settlement.bessMarginDeltaEur;

    return {
        ...prev,
        gridFrequencyHz,
        solarOutputMw,
        gridDemandMw,
        batterySocPercent,
        batteryPowerMw,
        batteryChargeFromSolarMw: settlement.batteryChargeFromSolarMw,
        batteryChargeFromGridMw: settlement.batteryChargeFromGridMw,
        batteryDischargeToGridMw: settlement.batteryDischargeToGridMw,
        solarExportMw: settlement.solarExportMw,
        solarCurtailedMw: settlement.solarCurtailedMw,
        projectNetExportMw: settlement.projectNetExportMw,
        batteryMode,
        timeOfDay,
        timestamp: now,
        tariffPeriod,
        currentPriceEurMwh,
        cumulativeRevenueEur,
        cumulativeBessMarginEur,
    };
}

export function useGridSimulation() {
    const simRef = useRef<GridState>(createInitialGridState());
    const historyRef = useRef<GridSnapshot[]>([]);
    const elapsedChartSecondsRef = useRef(0);
    const lastFrameRef = useRef(0);
    const lastSnapshotRef = useRef(0);
    const lastRenderSyncRef = useRef(0);

    const [state, setState] = useState<GridState>(createInitialGridState());
    const [history, setHistory] = useState<GridSnapshot[]>([]);

    const syncState = useCallback(() => {
        setState(simRef.current);
    }, []);

    const dispatch = useCallback((cmd: BESSCommand) => {
        const now = Date.now();
        const prev = simRef.current;

        switch (cmd.type) {
            case 'START_SIMULATION': {
                const nextStatus = 'running';
                lastFrameRef.current = now;
                simRef.current = {
                    ...prev,
                    simulationStatus: nextStatus,
                    timestamp: now,
                };
                break;
            }
            case 'PAUSE_SIMULATION':
                simRef.current = {
                    ...prev,
                    simulationStatus: 'paused',
                    timestamp: now,
                };
                break;
            case 'STOP_SIMULATION': {
                const resetState = createInitialGridState(now);
                simRef.current = resetState;
                historyRef.current = [];
                elapsedChartSecondsRef.current = 0;
                lastFrameRef.current = now;
                lastSnapshotRef.current = 0;
                lastRenderSyncRef.current = 0;
                setHistory([]);
                break;
            }
            case 'CHARGE':
                simRef.current = { ...prev, batteryMode: 'charging', autoArbEnabled: false, timestamp: now };
                break;
            case 'DISCHARGE':
                simRef.current = { ...prev, batteryMode: 'discharging', autoArbEnabled: false, timestamp: now };
                break;
            case 'IDLE':
                simRef.current = { ...prev, batteryMode: 'idle', autoArbEnabled: false, timestamp: now };
                break;
            case 'SET_DISPATCH_SCALE':
                simRef.current = {
                    ...prev,
                    dispatchScalePercent: clamp(cmd.payload, DISPATCH_SCALE_MIN, DISPATCH_SCALE_MAX),
                    timestamp: now,
                };
                break;
            case 'SET_TIME_SPEED':
                simRef.current = { ...prev, timeSpeed: Math.max(1, cmd.payload), timestamp: now };
                break;
            case 'SET_BESS_POWER_RATING': {
                const batteryPowerRatingMw = clamp(cmd.payload, BESS_POWER_MIN_MW, BESS_POWER_MAX_MW);
                simRef.current = {
                    ...prev,
                    batteryPowerRatingMw,
                    batteryDurationHours: getBatteryDurationHours(batteryPowerRatingMw, prev.batteryEnergyCapacityMwh),
                    timestamp: now,
                };
                break;
            }
            case 'SET_BESS_ENERGY_CAPACITY': {
                const batteryEnergyCapacityMwh = clamp(cmd.payload, BESS_ENERGY_MIN_MWH, BESS_ENERGY_MAX_MWH);
                simRef.current = {
                    ...prev,
                    batteryEnergyCapacityMwh,
                    batteryDurationHours: getBatteryDurationHours(prev.batteryPowerRatingMw, batteryEnergyCapacityMwh),
                    timestamp: now,
                };
                break;
            }
            case 'SET_TARIFF_RATE': {
                const { period, value } = cmd.payload;
                const tariffRatesEurMwh = {
                    ...prev.tariffRatesEurMwh,
                    [period]: clamp(value, TARIFF_RATE_MIN, TARIFF_RATE_MAX),
                };
                simRef.current = {
                    ...prev,
                    tariffRatesEurMwh,
                    currentPriceEurMwh: getElectricityPriceEurMwh(prev.timeOfDay, tariffRatesEurMwh),
                    timestamp: now,
                };
                break;
            }
            case 'TOGGLE_AUTO_ARB':
                simRef.current = { ...prev, autoArbEnabled: !prev.autoArbEnabled, timestamp: now };
                break;
        }

        syncState();
    }, [syncState]);

    useEffect(() => {
        let rafId = 0;
        const bootTime = Date.now();
        lastFrameRef.current = bootTime;
        simRef.current = { ...simRef.current, timestamp: bootTime };
        setState(simRef.current);

        const tick = () => {
            const now = Date.now();

            if (simRef.current.simulationStatus !== 'running') {
                lastFrameRef.current = now;
                rafId = requestAnimationFrame(tick);
                return;
            }

            const dtReal = Math.min((now - lastFrameRef.current) / 1000, 0.1);
            lastFrameRef.current = now;
            elapsedChartSecondsRef.current += dtReal;

            simRef.current = simulateTick(simRef.current, dtReal, now);

            if (now - lastSnapshotRef.current >= SNAPSHOT_INTERVAL_MS) {
                lastSnapshotRef.current = now;

                const s = simRef.current;
                const snap: GridSnapshot = {
                    t: parseFloat(elapsedChartSecondsRef.current.toFixed(1)),
                    solarMw: parseFloat(s.solarOutputMw.toFixed(1)),
                    demandMw: parseFloat(s.gridDemandMw.toFixed(1)),
                    batteryMw: parseFloat(s.batteryPowerMw.toFixed(1)),
                    socPercent: parseFloat(s.batterySocPercent.toFixed(1)),
                    frequencyHz: parseFloat(s.gridFrequencyHz.toFixed(2)),
                    priceEurMwh: s.currentPriceEurMwh,
                };

                historyRef.current = historyRef.current.length >= HISTORY_MAX
                    ? [...historyRef.current.slice(-HISTORY_MAX + 1), snap]
                    : [...historyRef.current, snap];
            }

            if (now - lastRenderSyncRef.current >= 33) {
                lastRenderSyncRef.current = now;
                setState(simRef.current);
                setHistory(historyRef.current);
            }

            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return { state, history, dispatch };
}
