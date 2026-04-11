// ============================================================
// Core simulation hook for the Romania solar + BESS project
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BESSCommand, GridSnapshot, GridState } from '../types';
import { SIMULATION } from '../config';
import { applyCommand } from '../utils/gridReducer';
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

        const { next, sideEffects } = applyCommand(simRef.current, cmd, now);
        simRef.current = next;

        if (sideEffects.resetHistory) {
            historyRef.current = [];
            elapsedChartSecondsRef.current = 0;
            setHistory([]);
        }
        if (sideEffects.resetTimerRefs) {
            lastSnapshotRef.current = 0;
            lastRenderSyncRef.current = 0;
        }
        if (sideEffects.resetFrameRef) {
            lastFrameRef.current = tickNow;
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
