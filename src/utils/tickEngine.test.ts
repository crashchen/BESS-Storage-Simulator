import { describe, expect, it } from 'vitest';
import { AUTO_ARB, BESS, GRID, SIMULATION } from '../config';
import { computeGridDemandMw, computeSolarOutputMw } from './simulationModel';
import { selectGridConnectionTotalMw } from './gridSelectors';
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
            dispatchMode: 'manual-discharge' as const,
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
            dispatchMode: 'manual-charge' as const,
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
            dispatchMode: 'manual-charge',
            timeSpeed: SIMULATION.maxTimeSpeed,
        }, 1, 1, () => 0.5);
        const overdischarge = simulateTick({
            ...createInitialGridState(0),
            simulationStatus: 'running',
            batterySocPercent: 1,
            batteryMode: 'discharging',
            dispatchMode: 'manual-discharge',
            timeSpeed: SIMULATION.maxTimeSpeed,
        }, 1, 1, () => 0.5);

        expect(overcharge.batterySocPercent).toBeLessThanOrEqual(100);
        expect(overdischarge.batterySocPercent).toBeGreaterThanOrEqual(0);
    });

    it('settles the terminal charge tick before the next tick clamps to idle', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            batterySocPercent: 99,
            batteryMode: 'charging' as const,
            dispatchMode: 'manual-charge' as const,
            timeOfDay: 12,
            timeSpeed: SIMULATION.maxTimeSpeed,
            dispatchScalePercent: 50,
            cumulativeRevenueEur: 1000,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batterySocPercent).toBe(100);
        expect(next.batteryMode).toBe('charging');
        expect(next.batteryPowerMw).toBeGreaterThan(0);
        expect(next.batteryChargeFromSolarMw + next.batteryChargeFromGridMw).toBeGreaterThan(0);
        expect(next.cumulativeRevenueEur).not.toBe(initial.cumulativeRevenueEur);

        const afterClamp = simulateTick(next, 1, 2, () => 0.5);
        expect(afterClamp.batteryMode).toBe('idle');
        expect(afterClamp.batteryPowerMw).toBe(0);
    });

    it('settles the terminal discharge tick before the next tick clamps to idle', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            batterySocPercent: 1,
            batteryMode: 'discharging' as const,
            dispatchMode: 'manual-discharge' as const,
            timeOfDay: 19,
            timeSpeed: SIMULATION.maxTimeSpeed,
            cumulativeRevenueEur: 1000,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batterySocPercent).toBeCloseTo(0, 10);
        expect(next.batteryMode).toBe('discharging');
        expect(next.batteryPowerMw).toBeLessThan(0);
        expect(next.batteryDischargeToLoadMw + next.batteryDischargeToExportMw).toBeGreaterThan(0);
        expect(next.cumulativeRevenueEur).not.toBe(initial.cumulativeRevenueEur);

        const afterClamp = simulateTick(next, 1, 2, () => 0.5);
        expect(afterClamp.batteryMode).toBe('idle');
        expect(afterClamp.batteryPowerMw).toBe(0);
    });

    it('auto off-peak charges toward the configured night reserve instead of discharging', () => {
        const initial = createInitialGridState(0);
        const lowSocNightState = {
            ...initial,
            simulationStatus: 'running' as const,
            autoArbEnabled: true,
            dispatchMode: 'auto' as const,
            timeOfDay: 2,
            dispatchScalePercent: 100,
            batterySocPercent: AUTO_ARB.nightTargetSocPercent - 10,
            batteryMode: 'idle' as const,
            batteryPowerMw: 0,
        };

        const next = simulateTick(lowSocNightState, 1, 1, () => 0.5);

        expect(next.tariffPeriod).toBe('off-peak');
        expect(next.batteryMode).toBe('charging');
        expect(next.batteryChargeFromGridMw).toBeGreaterThan(0);
        expect(next.batteryPowerMw).toBeGreaterThan(0);
        expect(next.gridFrequencyHz).toBe(GRID.nominalFrequencyHz);
    });

    it('auto off-peak does not discharge even when local demand exceeds the PCC import limit', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            autoArbEnabled: true,
            dispatchMode: 'auto' as const,
            timeOfDay: 2,
            dispatchScalePercent: 800,
            batterySocPercent: 80,
            batteryMode: 'idle' as const,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batteryPowerMw).toBe(0);
        expect(next.batteryMode).toBe('idle');
        expect(next.gridOverloadWarning).toBe(true);
        expect(next.gridOverloadMw).toBeGreaterThan(0);
    });

    // AUTO peak pacing: at peak entry with multi-hour window remaining, the
    // dispatched power should equal (usable energy × η_d) / remaining hours.
    // We compute the expected value from config so the assertion catches any
    // regression that drops η_d, forgets the reserve subtraction, or breaks
    // the pacing formula — not just the old "full transfer limit" behaviour.
    it('auto peak dispatch paces discharge over the remaining peak window', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            autoArbEnabled: true,
            dispatchMode: 'auto' as const,
            timeOfDay: 18.0,
            batterySocPercent: 90,
            batteryMode: 'idle' as const,
            dispatchScalePercent: 100,
        };
        const transferLimitMw = Math.min(initial.batteryPowerRatingMw, initial.gridBessConnectionMw);
        const usableEnergyMwh =
            ((initial.batterySocPercent - AUTO_ARB.peakReserveSocPercent) / 100) *
            initial.batteryEnergyCapacityMwh;
        const peakRemainingHours = AUTO_ARB.peakEndHour - initial.timeOfDay;
        const expectedPacedMw = (usableEnergyMwh * BESS.dischargeEfficiency) / peakRemainingHours;

        const next = simulateTick(initial, 0.001, 1, () => 0.5);

        expect(next.batteryPowerMw).toBeLessThan(0);
        expect(Math.abs(next.batteryPowerMw)).toBeLessThan(transferLimitMw);
        // Tight expected value: ~111 MW for default 744 MWh / 0.96 η_d / 5h.
        expect(Math.abs(next.batteryPowerMw)).toBeCloseTo(expectedPacedMw, 0);
    });

    // Near the end of the peak window with energy still available, the same
    // BESS state should approach the transfer limit (less time → faster pace).
    it('auto peak pacing approaches the transfer limit as the window nears its end', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            autoArbEnabled: true,
            dispatchMode: 'auto' as const,
            timeOfDay: 22.7,
            batterySocPercent: 80,
            batteryMode: 'idle' as const,
            dispatchScalePercent: 100,
        };
        const transferLimitMw = Math.min(initial.batteryPowerRatingMw, initial.gridBessConnectionMw);

        const next = simulateTick(initial, 0.001, 1, () => 0.5);

        // With ~18 minutes left and a still-mostly-full BESS, the paced rate
        // should be clamped to the transfer limit.
        expect(next.batteryPowerMw).toBeCloseTo(-transferLimitMw, 1);
    });

    it('allows manual charging regardless of tariff period while respecting active-power limits', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            autoArbEnabled: false,
            dispatchMode: 'manual-charge' as const,
            timeOfDay: 19,
            dispatchScalePercent: 50,
            batterySocPercent: 30,
            batteryMode: 'charging' as const,
            batteryPowerMw: 0,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batteryPowerMw).toBeGreaterThan(0);
        expect(next.batteryChargeFromGridMw + next.batteryChargeFromSolarMw).toBeGreaterThan(0);
        expect(next.gridFrequencyHz).toBe(GRID.nominalFrequencyHz);
        expect(next.batteryMode).toBe('charging');
    });

    it('allows manual charging from solar surplus when it is available', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            autoArbEnabled: false,
            dispatchMode: 'manual-charge' as const,
            timeOfDay: 12,
            dispatchScalePercent: 50,
            batterySocPercent: 30,
            batteryMode: 'charging' as const,
            solarAcCapacityMw: 250,
            solarDcCapacityMwp: 300,
            gridPvEvacuationMw: 260,
            gridBessConnectionMw: 80,
            batteryPowerRatingMw: 80,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batteryPowerMw).toBeGreaterThan(0);
        expect(next.batteryChargeFromSolarMw).toBeGreaterThan(0);
        expect(next.gridFrequencyHz).toBe(GRID.nominalFrequencyHz);
        expect(next.batteryMode).toBe('charging');
    });

    it('auto mid-peak stores PV surplus in the battery before exporting residual power', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            autoArbEnabled: true,
            dispatchMode: 'auto' as const,
            batterySocPercent: 20,
            batteryMode: 'idle' as const,
            timeOfDay: 12,
            timeSpeed: 60,
            dispatchScalePercent: 50,
            solarAcCapacityMw: 180,
            solarDcCapacityMwp: 220,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.solarOutputMw).toBeGreaterThan(next.gridDemandMw);
        expect(next.batteryMode).toBe('charging');
        expect(next.batteryChargeFromSolarMw).toBeGreaterThan(0);
    });

    it('samples solar and demand at the tick midpoint when no tariff boundary is crossed', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            batteryMode: 'idle' as const,
            timeOfDay: 10,
            timeSpeed: 360,
            solarAcCapacityMw: 180,
            solarDcCapacityMwp: 220,
        };
        const dtRealSeconds = 1;
        const dtHours = (dtRealSeconds * initial.timeSpeed) / 3600;
        const midpointTimeOfDay = initial.timeOfDay + dtHours / 2;
        const endTimeOfDay = initial.timeOfDay + dtHours;

        const next = simulateTick(initial, dtRealSeconds, 1, () => 0.5);

        expect(next.timeOfDay).toBeCloseTo(endTimeOfDay, 10);
        expect(next.solarOutputMw).toBeCloseTo(
            computeSolarOutputMw(midpointTimeOfDay, initial.solarAcCapacityMw, initial.solarDcCapacityMwp),
            6,
        );
        expect(next.gridDemandMw).toBeCloseTo(
            computeGridDemandMw(
                midpointTimeOfDay,
                initial.dispatchScalePercent / 100,
                selectGridConnectionTotalMw(initial),
            ),
            6,
        );
    });

    it('splits a boundary-crossing tick so tariff settlement changes at 18:00', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            timeOfDay: 17.99,
            timeSpeed: SIMULATION.maxTimeSpeed,
            batteryMode: 'discharging' as const,
            dispatchMode: 'manual-discharge' as const,
            solarAcCapacityMw: 0,
            solarOutputMw: 0,
            gridDemandMw: 0,
            gridPvEvacuationMw: 0,
            dispatchScalePercent: 0,
            cumulativeRevenueEur: 0,
        };
        const dischargeMw = Math.min(initial.batteryPowerRatingMw, initial.gridBessConnectionMw);
        const expectedRevenueEur =
            dischargeMw * 0.01 * initial.tariffRatesEurMwh['mid-peak'] +
            dischargeMw * 0.03 * initial.tariffRatesEurMwh.peak;
        const wrongPeakOnlyRevenueEur = dischargeMw * 0.04 * initial.tariffRatesEurMwh.peak;

        const next = simulateTick(initial, 0.1, 1, () => 0.5);

        expect(next.cumulativeRevenueEur).toBeCloseTo(expectedRevenueEur, 6);
        expect(next.cumulativeRevenueEur).not.toBeCloseTo(wrongPeakOnlyRevenueEur, 6);
    });

    // PCC overload is observable; this test drives demand high → low and pins
    // that `gridOverloadWarning` correctly flips on then back off, so a future
    // refactor of the settlement branches can't silently mask the signal.
    it('gridOverloadWarning lights and clears as demand crosses the PCC limit', () => {
        const overloadInitial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            timeOfDay: 19,
            timeSpeed: 0,
            dispatchScalePercent: 200,
            batterySocPercent: 0,
            dispatchMode: 'manual-idle' as const,
            batteryMode: 'idle' as const,
            gridPvEvacuationMw: 102,
            gridBessConnectionMw: 50,
        };

        const overloaded = simulateTick(overloadInitial, 1, 1, () => 0.5);
        expect(overloaded.gridOverloadWarning).toBe(true);
        expect(overloaded.gridOverloadMw).toBeGreaterThan(0);

        // Drop demand back into normal range — overload signal must clear.
        const relaxed = simulateTick(
            { ...overloaded, dispatchScalePercent: 40 },
            1,
            2,
            () => 0.5,
        );
        expect(relaxed.gridOverloadWarning).toBe(false);
        expect(relaxed.gridOverloadMw).toBe(0);
    });
});
