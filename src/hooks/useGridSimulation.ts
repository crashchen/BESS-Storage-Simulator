// ============================================================
// Core simulation hook for the Romania solar + BESS project
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BESSCommand, GridSnapshot, GridState } from '../types';
import {
    BESS,
    FREQUENCY_MODEL,
    GRID,
    PROJECT,
    SIMULATION,
    SOLAR,
    TARIFF,
} from '../config';
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

function gaussianNoise(sigma: number): number {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

function createInitialGridState(timestamp = 0): GridState {
    const batteryDurationHours = getBatteryDurationHours(BESS.defaultPowerRatingMw, BESS.defaultEnergyCapacityMwh);

    return {
        projectName: PROJECT.name,
        projectLocation: PROJECT.location,
        solarDcCapacityMwp: SOLAR.dcCapacityMwp,
        solarAcCapacityMw: SOLAR.acCapacityMw,
        batteryPowerRatingMw: BESS.defaultPowerRatingMw,
        batteryDurationHours,
        batteryEnergyCapacityMwh: BESS.defaultEnergyCapacityMwh,
        gridConnectionTotalMw: GRID.connectionTotalMw,
        gridPvEvacuationMw: GRID.pvEvacuationMw,
        gridBessConnectionMw: GRID.bessConnectionMw,
        siteYieldKwhPerKwYear: SOLAR.yieldKwhPerKwYear,
        simulationStatus: 'stopped',
        gridFrequencyHz: GRID.nominalFrequencyHz,
        solarOutputMw: computeSolarOutputMw(SIMULATION.initialTimeOfDay, SOLAR.acCapacityMw),
        gridDemandMw: computeGridDemandMw(SIMULATION.initialTimeOfDay, 1.0, GRID.connectionTotalMw),
        dispatchScalePercent: 100,
        batterySocPercent: BESS.initialSocPercent,
        batteryPowerMw: 0,
        batteryChargeFromSolarMw: 0,
        batteryChargeFromGridMw: 0,
        batteryDischargeToGridMw: 0,
        solarExportMw: computeSolarOutputMw(SIMULATION.initialTimeOfDay, SOLAR.acCapacityMw),
        solarCurtailedMw: 0,
        projectNetExportMw: computeSolarOutputMw(SIMULATION.initialTimeOfDay, SOLAR.acCapacityMw),
        batteryMode: 'idle',
        timeOfDay: SIMULATION.initialTimeOfDay,
        timeSpeed: SIMULATION.defaultTimeSpeed,
        timestamp,
        tariffPeriod: getTariffPeriod(SIMULATION.initialTimeOfDay),
        tariffRatesEurMwh: TARIFF.defaultRatesEurMwh,
        currentPriceEurMwh: getElectricityPriceEurMwh(SIMULATION.initialTimeOfDay, TARIFF.defaultRatesEurMwh),
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
    if (prev.autoArbEnabled && requestedMode === 'charging' && !hasSolarSurplus && prev.gridFrequencyHz < FREQUENCY_MODEL.chargeLockoutHz) {
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
        const maxChargeMw = remainingEnergyMwh / Math.max(dtHours * BESS.chargeEfficiency, 1e-9);
        batteryPowerMw = Math.min(batteryPowerMw, maxChargeMw);
    } else if (batteryPowerMw < 0) {
        const availableEnergyMwh = (prev.batterySocPercent / 100) * prev.batteryEnergyCapacityMwh;
        const maxDischargeMw = (availableEnergyMwh * BESS.dischargeEfficiency) / Math.max(dtHours, 1e-9);
        batteryPowerMw = Math.max(batteryPowerMw, -maxDischargeMw);
    }

    const storedEnergyDeltaMwh = batteryPowerMw >= 0
        ? batteryPowerMw * dtHours * BESS.chargeEfficiency
        : (batteryPowerMw * dtHours) / BESS.dischargeEfficiency;
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
        GRID.nominalFrequencyHz + FREQUENCY_MODEL.droopK * uncompensatedMw + gaussianNoise(FREQUENCY_MODEL.noiseSigma),
        GRID.minFrequencyHz,
        GRID.maxFrequencyHz,
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
                    dispatchScalePercent: clamp(cmd.payload, SIMULATION.dispatchScaleMin, SIMULATION.dispatchScaleMax),
                    timestamp: now,
                };
                break;
            case 'SET_TIME_SPEED':
                simRef.current = { ...prev, timeSpeed: Math.max(SIMULATION.minTimeSpeed, cmd.payload), timestamp: now };
                break;
            case 'SET_BESS_POWER_RATING': {
                const batteryPowerRatingMw = clamp(cmd.payload, BESS.minPowerMw, BESS.maxPowerMw);
                simRef.current = {
                    ...prev,
                    batteryPowerRatingMw,
                    batteryDurationHours: getBatteryDurationHours(batteryPowerRatingMw, prev.batteryEnergyCapacityMwh),
                    timestamp: now,
                };
                break;
            }
            case 'SET_BESS_ENERGY_CAPACITY': {
                const batteryEnergyCapacityMwh = clamp(cmd.payload, BESS.minEnergyMwh, BESS.maxEnergyMwh);
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
                    [period]: clamp(value, TARIFF.minRateEurMwh, TARIFF.maxRateEurMwh),
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

            const dtReal = Math.min((now - lastFrameRef.current) / 1000, SIMULATION.maxDeltaTimeSeconds);
            lastFrameRef.current = now;
            elapsedChartSecondsRef.current += dtReal;

            simRef.current = simulateTick(simRef.current, dtReal, now);

            if (now - lastSnapshotRef.current >= SIMULATION.snapshotIntervalMs) {
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

                historyRef.current = historyRef.current.length >= SIMULATION.historyMaxPoints
                    ? [...historyRef.current.slice(-SIMULATION.historyMaxPoints + 1), snap]
                    : [...historyRef.current, snap];
            }

            if (now - lastRenderSyncRef.current >= SIMULATION.renderSyncIntervalMs) {
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
