// ============================================================
// Core simulation hook for the Romania solar + BESS project
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BESSCommand, GridSnapshot, GridState } from '../types';
import {
    BESS,
    GRID,
    SIMULATION,
    SOLAR,
    TARIFF,
} from '../config';
import {
    clamp,
    computeGridDemandMw,
    computeSolarOutputMw,
    getBatteryDurationHours,
    getElectricityPriceEurMwh,
} from '../utils/simulationModel';
import { createInitialGridState, simulateTick } from '../utils/tickEngine';

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
        const tickNow = performance.now();
        const prev = simRef.current;

        switch (cmd.type) {
            case 'START_SIMULATION': {
                const nextStatus = 'running';
                lastFrameRef.current = tickNow;
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
                lastFrameRef.current = tickNow;
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
                simRef.current = {
                    ...prev,
                    timeSpeed: clamp(cmd.payload, SIMULATION.minTimeSpeed, SIMULATION.maxTimeSpeed),
                    timestamp: now,
                };
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
            case 'SET_SOLAR_AC_CAPACITY': {
                const solarAcCapacityMw = clamp(cmd.payload, SOLAR.minAcCapacityMw, SOLAR.maxAcCapacityMw);
                const solarOutputMw = computeSolarOutputMw(prev.timeOfDay, solarAcCapacityMw);
                simRef.current = { ...prev, solarAcCapacityMw, solarOutputMw, timestamp: now };
                break;
            }
            case 'SET_SOLAR_DC_CAPACITY': {
                const solarDcCapacityMwp = clamp(cmd.payload, SOLAR.minDcCapacityMwp, SOLAR.maxDcCapacityMwp);
                simRef.current = { ...prev, solarDcCapacityMwp, timestamp: now };
                break;
            }
            case 'SET_GRID_PV_EVACUATION': {
                const gridPvEvacuationMw = clamp(cmd.payload, GRID.minPvEvacuationMw, GRID.maxPvEvacuationMw);
                const gridConnectionTotalMw = gridPvEvacuationMw + prev.gridBessConnectionMw;
                const gridDemandMw = computeGridDemandMw(prev.timeOfDay, prev.dispatchScalePercent / 100, gridConnectionTotalMw);
                simRef.current = { ...prev, gridPvEvacuationMw, gridConnectionTotalMw, gridDemandMw, timestamp: now };
                break;
            }
            case 'SET_GRID_BESS_CONNECTION': {
                const gridBessConnectionMw = clamp(cmd.payload, GRID.minBessConnectionMw, GRID.maxBessConnectionMw);
                const gridConnectionTotalMw = prev.gridPvEvacuationMw + gridBessConnectionMw;
                const gridDemandMw = computeGridDemandMw(prev.timeOfDay, prev.dispatchScalePercent / 100, gridConnectionTotalMw);
                simRef.current = { ...prev, gridBessConnectionMw, gridConnectionTotalMw, gridDemandMw, timestamp: now };
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
            case 'TOGGLE_AUTO_ARB': {
                const nextEnabled = !prev.autoArbEnabled;
                simRef.current = {
                    ...prev,
                    autoArbEnabled: nextEnabled,
                    batteryMode: 'idle',
                    batteryPowerMw: 0,
                    timestamp: now,
                };
                break;
            }
            case 'SET_AUTO_ARB_ENABLED':
                simRef.current = {
                    ...prev,
                    autoArbEnabled: cmd.payload,
                    batteryMode: 'idle',
                    batteryPowerMw: 0,
                    timestamp: now,
                };
                break;
        }

        syncState();
    }, [syncState]);

    useEffect(() => {
        let rafId = 0;
        const bootTime = performance.now();
        lastFrameRef.current = bootTime;
        simRef.current = { ...simRef.current, timestamp: Date.now() };
        setState(simRef.current);

        const tick = () => {
            const now = performance.now();

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
