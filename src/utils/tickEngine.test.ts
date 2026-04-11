import { describe, expect, it } from 'vitest';
import { FREQUENCY_MODEL, GRID, SIMULATION } from '../config';
import { computeGridDemandMw, computeSolarOutputMw, getAutoArbPlan, getTariffPeriod } from './simulationModel';
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

    it('settles the terminal charge tick before switching the returned mode to idle', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            batterySocPercent: 99,
            batteryMode: 'charging' as const,
            timeOfDay: 5,
            timeSpeed: SIMULATION.maxTimeSpeed,
            cumulativeRevenueEur: 1000,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batterySocPercent).toBe(100);
        expect(next.batteryMode).toBe('idle');
        expect(next.batteryPowerMw).toBeGreaterThan(0);
        expect(next.batteryChargeFromSolarMw + next.batteryChargeFromGridMw).toBeGreaterThan(0);
        expect(next.cumulativeRevenueEur).not.toBe(initial.cumulativeRevenueEur);
    });

    it('settles the terminal discharge tick before switching the returned mode to idle', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            batterySocPercent: 1,
            batteryMode: 'discharging' as const,
            timeOfDay: 19,
            timeSpeed: SIMULATION.maxTimeSpeed,
            cumulativeRevenueEur: 1000,
        };

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batterySocPercent).toBeCloseTo(0, 10);
        expect(next.batteryMode).toBe('idle');
        expect(next.batteryPowerMw).toBeLessThan(0);
        expect(next.batteryDischargeToGridMw).toBeGreaterThan(0);
        expect(next.cumulativeRevenueEur).not.toBe(initial.cumulativeRevenueEur);
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

    it('does not bypass the frequency lockout when a small solar surplus still requires substantial grid charging', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            autoArbEnabled: true,
            batterySocPercent: 20,
            batteryMode: 'idle' as const,
            timeOfDay: 10,
            timeSpeed: 60,
            dispatchScalePercent: 80,
        };
        const dtHours = initial.timeSpeed / 3600;
        const sampledTimeOfDay = initial.timeOfDay + dtHours;
        const solarOutputMw = computeSolarOutputMw(
            sampledTimeOfDay,
            initial.solarAcCapacityMw,
            initial.solarDcCapacityMwp,
        );
        const gridDemandMw = computeGridDemandMw(
            sampledTimeOfDay,
            initial.dispatchScalePercent / 100,
            initial.gridConnectionTotalMw,
        );
        const tariffPeriod = getTariffPeriod(sampledTimeOfDay);
        const plan = getAutoArbPlan(
            initial,
            sampledTimeOfDay,
            solarOutputMw,
            gridDemandMw,
            tariffPeriod,
            initial.tariffRatesEurMwh,
        );
        const projectedFrequencyHz = GRID.nominalFrequencyHz +
            FREQUENCY_MODEL.droopK * (solarOutputMw - gridDemandMw - plan.targetPowerMw);

        expect(plan.mode).toBe('charging');
        expect(plan.targetPowerMw).toBeGreaterThan(Math.max(0, solarOutputMw - gridDemandMw));
        expect(projectedFrequencyHz).toBeLessThan(FREQUENCY_MODEL.chargeLockoutHz);

        const next = simulateTick(initial, 1, 1, () => 0.5);

        expect(next.batteryChargeFromGridMw).toBe(0);
        expect(next.batteryMode).toBe('idle');
    });

    it('splits a boundary-crossing tick so tariff settlement changes at 18:00', () => {
        const initial = {
            ...createInitialGridState(0),
            simulationStatus: 'running' as const,
            timeOfDay: 17.99,
            timeSpeed: SIMULATION.maxTimeSpeed,
            batteryMode: 'discharging' as const,
            solarAcCapacityMw: 0,
            solarOutputMw: 0,
            gridConnectionTotalMw: 0,
            gridDemandMw: 0,
            gridPvEvacuationMw: 0,
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
});
