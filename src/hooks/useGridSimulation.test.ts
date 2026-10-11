import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BESS, GRID, SIMULATION, SOLAR } from '../config';
import { computeGridDemandMw, computeSolarOutputMw } from '../utils/simulationModel';
import { selectBatteryDurationHours, selectGridConnectionTotalMw } from '../utils/gridSelectors';
import { useGridSimulation } from './useGridSimulation';

describe('useGridSimulation dispatch', () => {
    let frameCallback: FrameRequestCallback | null = null;
    let nowMs = 1000;

    beforeEach(() => {
        frameCallback = null;
        nowMs = 1000;

        vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
        vi.spyOn(Date, 'now').mockImplementation(() => 1_700_000_000_000 + nowMs);
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

    function advanceFrames(frameCount: number, frameStepMs = 100) {
        for (let index = 0; index < frameCount; index += 1) {
            advanceFrame(nowMs + frameStepMs);
        }
    }

    it('clamps time speed above the configured maximum', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'SET_TIME_SPEED', payload: SIMULATION.maxTimeSpeed + 100 });
        });

        expect(result.current.state.timeSpeed).toBe(SIMULATION.maxTimeSpeed);
    });

    it('records tick timestamps using wall-clock time instead of performance time', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'START_SIMULATION' });
        });
        advanceFrame(1100);

        expect(result.current.state.timestamp).toBe(1_700_000_001_100);
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
            result.current.dispatch({ type: 'SET_DISPATCH_MODE', payload: 'auto' });
        });

        expect(result.current.state.dispatchMode).toBe('auto');
        expect(result.current.state.batteryMode).toBe('idle');
        expect(result.current.state.batteryPowerMw).toBe(0);
    });

    it('handles SET_DISPATCH_MODE idempotently', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'START_SIMULATION' });
            result.current.dispatch({ type: 'DISCHARGE' });
        });
        advanceFrame(1100);

        act(() => {
            result.current.dispatch({ type: 'SET_DISPATCH_MODE', payload: 'auto' });
        });

        expect(result.current.state.dispatchMode).toBe('auto');
        expect(result.current.state.batteryMode).toBe('idle');
        expect(result.current.state.batteryPowerMw).toBe(0);

        act(() => {
            result.current.dispatch({ type: 'SET_DISPATCH_MODE', payload: 'auto' });
        });

        expect(result.current.state.dispatchMode).toBe('auto');
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
            computeSolarOutputMw(
                result.current.state.timeOfDay,
                SOLAR.maxAcCapacityMw,
                result.current.state.solarDcCapacityMwp,
            ),
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
        expect(selectGridConnectionTotalMw(result.current.state)).toBe(expectedTotal);
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
        expect(selectGridConnectionTotalMw(result.current.state)).toBe(expectedTotal);
        expect(result.current.state.gridDemandMw).toBeCloseTo(expectedDemand, 6);
    });

    it('clamps solar DC capacity changes', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'SET_SOLAR_DC_CAPACITY', payload: SOLAR.minDcCapacityMwp - 2 });
        });

        expect(result.current.state.solarDcCapacityMwp).toBe(SOLAR.minDcCapacityMwp);
    });

    it('updates live solar output when solar DC capacity changes', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'SET_TIME_SPEED', payload: SIMULATION.maxTimeSpeed });
            result.current.dispatch({ type: 'START_SIMULATION' });
        });
        advanceFrames(75);

        const noonishTimeOfDay = result.current.state.timeOfDay;

        act(() => {
            result.current.dispatch({ type: 'PAUSE_SIMULATION' });
            result.current.dispatch({ type: 'SET_SOLAR_DC_CAPACITY', payload: result.current.state.solarAcCapacityMw });
        });
        const acMatchedOutputMw = result.current.state.solarOutputMw;

        act(() => {
            result.current.dispatch({ type: 'SET_SOLAR_DC_CAPACITY', payload: result.current.state.solarAcCapacityMw * 1.5 });
        });

        expect(result.current.state.timeOfDay).toBeCloseTo(11, 6);
        expect(noonishTimeOfDay).toBeCloseTo(11, 6);
        expect(result.current.state.solarOutputMw).toBeGreaterThan(acMatchedOutputMw);
        expect(result.current.state.solarOutputMw).toBeCloseTo(
            computeSolarOutputMw(
                noonishTimeOfDay,
                result.current.state.solarAcCapacityMw,
                result.current.state.solarDcCapacityMwp,
            ),
            6,
        );
    });

    it('stores telemetry history on the simulated-time axis', () => {
        const { result } = renderHook(() => useGridSimulation());

        act(() => {
            result.current.dispatch({ type: 'SET_TIME_SPEED', payload: 240 });
            result.current.dispatch({ type: 'START_SIMULATION' });
        });
        advanceFrame(1100);

        expect(result.current.history).toHaveLength(1);
        expect(result.current.history[0]?.t).toBeCloseTo(8.0 + (0.1 * 240) / 3600, 3);
    });

    it('retains precise simulated intervals when switching from 1x to 1440x', () => {
        const { result } = renderHook(() => useGridSimulation());
        act(() => {
            result.current.dispatch({ type: 'SET_TIME_SPEED', payload: 1 });
            result.current.dispatch({ type: 'START_SIMULATION' });
        });
        advanceFrames(5);
        const slow = result.current.history;
        expect(slow).toHaveLength(2);
        expect(slow[1].t - slow[0].t).toBeCloseTo(0.4 / 3600, 10);

        act(() => result.current.dispatch({ type: 'SET_TIME_SPEED', payload: 1440 }));
        advanceFrames(4);
        const fast = result.current.history;
        expect(fast[2].t - fast[1].t).toBeCloseTo(0.4 * 1440 / 3600, 10);
    });

    it('keeps history monotonic through midnight and rolling-window eviction', () => {
        const { result } = renderHook(() => useGridSimulation());
        act(() => {
            result.current.dispatch({ type: 'SET_TIME_SPEED', payload: 1440 });
            result.current.dispatch({ type: 'START_SIMULATION' });
        });
        advanceFrames(900);
        expect(result.current.state.timeOfDay).toBeCloseTo(20, 6);
        expect(result.current.history).toHaveLength(SIMULATION.historyMaxPoints);
        expect(result.current.history.at(-1)!.t).toBeGreaterThan(43);
        expect(result.current.history.some(s => s.t < 24)).toBe(true);
        result.current.history.slice(1).forEach((sample, index) => {
            expect(sample.t - result.current.history[index].t).toBeCloseTo(0.16, 8);
        });
    });

    it('excludes paused wall time and resumes the same chart clock', () => {
        const { result } = renderHook(() => useGridSimulation());
        act(() => result.current.dispatch({ type: 'START_SIMULATION' }));
        advanceFrames(5);
        const history = result.current.history;
        act(() => result.current.dispatch({ type: 'PAUSE_SIMULATION' }));
        advanceFrame(nowMs + 60_000);
        expect(result.current.history).toBe(history);
        act(() => result.current.dispatch({ type: 'START_SIMULATION' }));
        advanceFrames(1);
        expect(result.current.history.at(-1)!.t - history.at(-1)!.t)
            .toBeCloseTo(0.1 * result.current.state.timeSpeed / 3600, 10);
    });

    it.each([
        { type: 'STOP_SIMULATION' },
        { type: 'RESET_SIMULATION' },
        { type: 'APPLY_SCENARIO_PRESET', payload: 'evening-peak-discharge' },
    ] as const)('reanchors telemetry after $type', (command) => {
        const { result } = renderHook(() => useGridSimulation());
        act(() => {
            result.current.dispatch({ type: 'SET_TIME_SPEED', payload: 1440 });
            result.current.dispatch({ type: 'START_SIMULATION' });
        });
        advanceFrames(410);
        expect(result.current.history.at(-1)!.t).toBeGreaterThan(24);
        act(() => result.current.dispatch(command));
        expect(result.current.history).toEqual([]);
        const { timeOfDay, timeSpeed } = result.current.state;
        act(() => result.current.dispatch({ type: 'START_SIMULATION' }));
        advanceFrames(1);
        expect(result.current.history[0].t).toBeCloseTo(timeOfDay + 0.1 * timeSpeed / 3600, 10);
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
        expect(selectBatteryDurationHours(result.current.state)).toBeCloseTo(nextCapacityMwh / BESS.defaultPowerRatingMw, 6);
    });
});
