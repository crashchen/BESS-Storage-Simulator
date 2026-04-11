import { describe, expect, it } from 'vitest';
import { GRID, SIMULATION } from '../config';
import { createInitialGridState, simulateTick } from './tickEngine';

describe('tickEngine', () => {
    it('produces deterministic output with an injected random source', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
        };

        const first = simulateTick(initial, 1, 1, () => 0.5);
        const second = simulateTick(initial, 1, 1, () => 0.5);

        expect(first).toEqual(second);
    });

    it('switches to idle when SoC is empty and discharge is requested', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            batterySocPercent: 0,
            batteryMode: 'discharging' as const,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batteryMode).toBe('idle');
        expect(next.batteryPowerMw).toBe(0);
    });

    it('switches to idle when SoC is full and charge is requested', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            batterySocPercent: 100,
            batteryMode: 'charging' as const,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batteryMode).toBe('idle');
        expect(next.batteryPowerMw).toBe(0);
    });

    it('clamps state of charge inside the valid range', () => {
        const overcharge = simulateTick({
            ...createInitialGridState(0),
            simulationStatus: 'running',
            batterySocPercent: 99,
            batteryMode: 'charging',
            timeSpeed: SIMULATION.maxTimeSpeed,
        }, 1, 1, () => 0.5);
        const overdischarge = simulateTick({
            ...createInitialGridState(0),
            simulationStatus: 'running',
            batterySocPercent: 1,
            batteryMode: 'discharging',
            timeSpeed: SIMULATION.maxTimeSpeed,
        }, 1, 1, () => 0.5);

        expect(overcharge.batterySocPercent).toBeLessThanOrEqual(100);
        expect(overdischarge.batterySocPercent).toBeGreaterThanOrEqual(0);
    });

    it('locks out auto grid-charging when the projected frequency would dip below the threshold', () => {
        const initial = createInitialGridState(0);
        const heavyDeficitState = {
            ...initial,
            simulationStatus: 'running' as const,
            autoArbEnabled: true,
            timeOfDay: 5,
            dispatchScalePercent: 150,
            batterySocPercent: 30,
            solarOutputMw: 0,
            gridDemandMw: 220,
            gridFrequencyHz: GRID.nominalFrequencyHz,
            batteryMode: 'idle' as const,
            batteryPowerMw: 0,
        };

        const next = simulateTick(heavyDeficitState, 1, 1, () => 0.5);

        expect(next.batteryChargeFromGridMw).toBe(0);
        expect(next.batteryMode).toBe('idle');
    });
});
