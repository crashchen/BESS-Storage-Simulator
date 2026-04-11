import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BESS, GRID, SIMULATION, SOLAR } from '../config';
import { computeGridDemandMw, computeSolarOutputMw } from '../utils/simulationModel';
import { useGridSimulation } from './useGridSimulation';

describe('useGridSimulation dispatch', () => {
    let frameCallback: FrameRequestCallback | null = null;
    let nowMs = 1000;

    beforeEach(() => {
        frameCallback = null;
        nowMs = 1000;

        vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            frameCallback = callback;
            return 1;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function advanceFrame(nextNowMs: number) {
        nowMs = nextNowMs;
        act(() => {
            if (!frameCallback) {
                throw new Error('requestAnimationFrame callback was not registered');
            }

            frameCallback(nextNowMs);
        });
    }

    it('clamps time speed above the configured maximum', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'SET_TIME_SPEED', payload: SIMULATION.maxTimeSpeed + 100 });
        });

        expect(result.current.state.timeSpeed).toBe(SIMULATION.maxTimeSpeed);
    });

    it('resets battery mode and power when peak-ready is toggled', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'START_SIMULATION' });
            result.current.dispatch({ type: 'DISCHARGE' });
        });
        advanceFrame(1100);

        expect(result.current.state.batteryMode).toBe('discharging');
        expect(result.current.state.batteryPowerMw).toBeLessThan(0);

        act(() => {
            result.current.dispatch({ type: 'TOGGLE_AUTO_ARB' });
        });

        expect(result.current.state.autoArbEnabled).toBe(true);
        expect(result.current.state.batteryMode).toBe('idle');
        expect(result.current.state.batteryPowerMw).toBe(0);
    });

    it('handles SET_AUTO_ARB_ENABLED idempotently', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'START_SIMULATION' });
            result.current.dispatch({ type: 'DISCHARGE' });
        });
        advanceFrame(1100);

        act(() => {
            result.current.dispatch({ type: 'SET_AUTO_ARB_ENABLED', payload: true });
        });

        expect(result.current.state.autoArbEnabled).toBe(true);
        expect(result.current.state.batteryMode).toBe('idle');
        expect(result.current.state.batteryPowerMw).toBe(0);

        act(() => {
            result.current.dispatch({ type: 'SET_AUTO_ARB_ENABLED', payload: true });
        });

        expect(result.current.state.autoArbEnabled).toBe(true);
        expect(result.current.state.batteryMode).toBe('idle');
        expect(result.current.state.batteryPowerMw).toBe(0);
    });

    it('clamps solar AC capacity and refreshes solar output immediately', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'SET_SOLAR_AC_CAPACITY', payload: SOLAR.maxAcCapacityMw + 25 });
        });

        expect(result.current.state.solarAcCapacityMw).toBe(SOLAR.maxAcCapacityMw);
        expect(result.current.state.solarOutputMw).toBeCloseTo(
            computeSolarOutputMw(result.current.state.timeOfDay, SOLAR.maxAcCapacityMw),
            6,
        );
    });

    it('updates PV evacuation, total grid connection, and grid demand together', () => {
        const { result } = renderHook(() => useGridSimulation());
        const nextPvEvacuationMw = 240;

        act(() => {
            result.current.dispatch({ type: 'SET_GRID_PV_EVACUATION', payload: nextPvEvacuationMw });
        });

        const expectedTotal = nextPvEvacuationMw + GRID.bessConnectionMw;
        const expectedDemand = computeGridDemandMw(
            result.current.state.timeOfDay,
            result.current.state.dispatchScalePercent / 100,
            expectedTotal,
        );

        expect(result.current.state.gridPvEvacuationMw).toBe(nextPvEvacuationMw);
        expect(result.current.state.gridConnectionTotalMw).toBe(expectedTotal);
        expect(result.current.state.gridDemandMw).toBeCloseTo(expectedDemand, 6);
    });

    it('updates BESS grid connection, total grid connection, and grid demand together', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'SET_GRID_BESS_CONNECTION', payload: GRID.maxBessConnectionMw + 20 });
        });

        const expectedTotal = GRID.pvEvacuationMw + GRID.maxBessConnectionMw;
        const expectedDemand = computeGridDemandMw(
            result.current.state.timeOfDay,
            result.current.state.dispatchScalePercent / 100,
            expectedTotal,
        );

        expect(result.current.state.gridBessConnectionMw).toBe(GRID.maxBessConnectionMw);
        expect(result.current.state.gridConnectionTotalMw).toBe(expectedTotal);
        expect(result.current.state.gridDemandMw).toBeCloseTo(expectedDemand, 6);
    });

    it('clamps solar DC capacity changes', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'SET_SOLAR_DC_CAPACITY', payload: SOLAR.minDcCapacityMwp - 2 });
        });

        expect(result.current.state.solarDcCapacityMwp).toBe(SOLAR.minDcCapacityMwp);
    });

    it('preserves stored energy when BESS energy capacity changes', () => {
        const { result } = renderHook(() => useGridSimulation());
        const prevStoredMwh = (result.current.state.batterySocPercent / 100) * result.current.state.batteryEnergyCapacityMwh;
        const nextCapacityMwh = 600;

        act(() => {
            result.current.dispatch({ type: 'SET_BESS_ENERGY_CAPACITY', payload: nextCapacityMwh });
        });

        expect(result.current.state.batteryEnergyCapacityMwh).toBe(nextCapacityMwh);
        expect(result.current.state.batterySocPercent).toBeCloseTo((prevStoredMwh / nextCapacityMwh) * 100, 6);
        expect(result.current.state.batteryDurationHours).toBeCloseTo(nextCapacityMwh / BESS.defaultPowerRatingMw, 6);
    });
});
