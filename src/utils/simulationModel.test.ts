import { describe, expect, it } from 'vitest';
import { AUTO_ARB, BESS } from '../config';
import { makeGridState } from '../test/fixtures';
import { computeGridDemandMw, getAutoArbOutlook, getAutoArbPlan, settleHybridProjectTick } from './simulationModel';

describe('simulationModel demand curve', () => {
    it('produces the same demand curve at the Romania baseline (288 MW total)', () => {
        const baselineFormula = (timeOfDay: number) => {
            const base = 92;
            const morningPeak = 155;
            const eveningPeak = 234;
            const middayTrough = 32;
            const morningHump = (morningPeak - base) *
                Math.exp(-Math.pow(timeOfDay - 8, 2) / (2 * 1.6 * 1.6));
            const eveningHump = (eveningPeak - base) *
                Math.exp(-Math.pow(timeOfDay - 19, 2) / (2 * 2.1 * 2.1));
            const middayDip = middayTrough *
                Math.exp(-Math.pow(timeOfDay - 13, 2) / (2 * 2.3 * 2.3));

            return Math.max(0, Math.min(288, base + morningHump + eveningHump - middayDip));
        };

        for (const timeOfDay of [0, 6, 8, 13, 19, 22]) {
            expect(computeGridDemandMw(timeOfDay, 1.0, 288)).toBeCloseTo(baselineFormula(timeOfDay), 6);
        }
    });

    it('scales the demand curve linearly with gridConnectionTotalMw', () => {
        for (const timeOfDay of [6, 12, 19]) {
            const at288 = computeGridDemandMw(timeOfDay, 1.0, 288);
            const at144 = computeGridDemandMw(timeOfDay, 1.0, 144);
            expect(at144).toBeCloseTo(at288 / 2, 6);
        }
    });
});

describe('simulationModel auto-arbitrage', () => {
    it('forecasts a pre-peak top-up target when PV alone cannot fully prepare the battery', () => {
        const state = makeGridState({
            batterySocPercent: 34,
            timeOfDay: 9.5,
        });

        const outlook = getAutoArbOutlook(state, state.timeOfDay);

        expect(outlook.targetSocPercent).toBeGreaterThanOrEqual(92);
        expect(outlook.shouldGridTopUp).toBe(true);
        expect(outlook.forecastPeakDemandMwh).toBeGreaterThan(0);
    });

    it('charges ahead of peak when the forecast says grid support is needed', () => {
        const state = makeGridState({
            batterySocPercent: 38,
            timeOfDay: 14,
            solarOutputMw: 52,
            gridDemandMw: 94,
        });

        const plan = getAutoArbPlan(
            state,
            state.timeOfDay,
            state.solarOutputMw,
            state.gridDemandMw,
            'mid-peak',
            state.tariffRatesEurMwh,
        );

        expect(plan.mode).toBe('charging');
        expect(plan.targetPowerMw).toBeGreaterThan(0);
        expect(plan.shouldGridTopUp).toBe(true);
    });

    it('sizes peak-ready charging against the residual post-forecast grid gap instead of the full energy gap', () => {
        const state = makeGridState({
            batterySocPercent: 60,
            batteryPowerRatingMw: 50,
            gridBessConnectionMw: 50,
            timeOfDay: 10,
        });
        const solarOutputMw = 45;
        const gridDemandMw = 40;
        const timeUntilPeakHours = AUTO_ARB.peakStartHour - state.timeOfDay;
        const currentEnergyMwh = (state.batterySocPercent / 100) * state.batteryEnergyCapacityMwh;
        const plan = getAutoArbPlan(
            state,
            state.timeOfDay,
            solarOutputMw,
            gridDemandMw,
            'mid-peak',
            state.tariffRatesEurMwh,
        );
        const fullGapChargeMw = (plan.targetEnergyMwh - currentEnergyMwh) /
            (timeUntilPeakHours * BESS.chargeEfficiency);

        expect(plan.mode).toBe('charging');
        expect(plan.targetPowerMw).toBeLessThan(fullGapChargeMw);
        expect(plan.targetPowerMw).toBeGreaterThanOrEqual(solarOutputMw - gridDemandMw);
    });

    it('paces discharge across the peak window instead of requesting full transfer power immediately', () => {
        const state = makeGridState({
            batterySocPercent: 100,
            timeOfDay: 18.25,
            solarOutputMw: 32,
            gridDemandMw: 228,
        });

        const plan = getAutoArbPlan(
            state,
            state.timeOfDay,
            state.solarOutputMw,
            state.gridDemandMw,
            'peak',
            state.tariffRatesEurMwh,
        );

        expect(plan.mode).toBe('discharging');
        expect(plan.targetPowerMw).toBeLessThan(0);
        expect(Math.abs(plan.targetPowerMw)).toBeLessThan(Math.min(state.batteryPowerRatingMw, state.gridBessConnectionMw));
    });

    it('tracks project P&L and BESS margin separately when solar charges the battery', () => {
        const settlement = settleHybridProjectTick({
            solarOutputMw: 80,
            gridDemandMw: 40,
            batteryPowerMw: 20,
            gridPvEvacuationMw: 102,
            currentPriceEurMwh: 100,
            dtHours: 1,
        });

        expect(settlement.batteryChargeFromSolarMw).toBe(20);
        expect(settlement.batteryChargeFromGridMw).toBe(0);
        expect(settlement.solarExportMw).toBe(60);
        expect(settlement.projectPnlDeltaEur).toBe(6000);
        expect(settlement.bessMarginDeltaEur).toBe(-2000);
    });

    it('does not charge BESS margin opportunity cost for solar that would have been clipped', () => {
        const settlement = settleHybridProjectTick({
            solarOutputMw: 130,
            gridDemandMw: 0,
            batteryPowerMw: 20,
            gridPvEvacuationMw: 102,
            currentPriceEurMwh: 100,
            dtHours: 1,
        });

        expect(settlement.solarExportMw).toBe(102);
        expect(settlement.bessMarginDeltaEur).toBe(0);
        expect(settlement.projectPnlDeltaEur).toBe(10200);
    });

    it('turns negative-price grid charging into positive project cashflow', () => {
        const settlement = settleHybridProjectTick({
            solarOutputMw: 0,
            gridDemandMw: 120,
            batteryPowerMw: 30,
            gridPvEvacuationMw: 102,
            currentPriceEurMwh: -25,
            dtHours: 1,
        });

        expect(settlement.batteryChargeFromGridMw).toBe(30);
        expect(settlement.projectPnlDeltaEur).toBe(750);
        expect(settlement.bessMarginDeltaEur).toBe(750);
    });

    it('accounts for discharge efficiency when sizing peak discharge', () => {
        const state = makeGridState({
            batterySocPercent: 100,
            timeOfDay: 18.25,
            solarOutputMw: 0,
            gridDemandMw: 9999,
        });

        const plan = getAutoArbPlan(
            state,
            state.timeOfDay,
            0,
            9999,
            'peak',
            state.tariffRatesEurMwh,
        );
        const transferLimit = Math.min(state.batteryPowerRatingMw, state.gridBessConnectionMw);
        const remainingHours = 23 - 18.25;
        const availableStored = (1.0 - (AUTO_ARB.peakReserveSocPercent / 100)) * state.batteryEnergyCapacityMwh;
        const naivePowerMw = Math.min(transferLimit, availableStored / remainingHours);
        const correctedPowerMw = Math.min(transferLimit, (availableStored * BESS.dischargeEfficiency) / remainingHours);

        expect(Math.abs(plan.targetPowerMw)).toBeCloseTo(correctedPowerMw, 4);
        expect(Math.abs(plan.targetPowerMw)).toBeLessThan(naivePowerMw);
    });

    it('does not discharge into peak when peak price is negative', () => {
        const state = makeGridState({
            batterySocPercent: 100,
            timeOfDay: 19,
            solarOutputMw: 32,
            gridDemandMw: 228,
            tariffRatesEurMwh: { 'off-peak': 80, 'mid-peak': 150, 'peak': -20 },
        });

        const plan = getAutoArbPlan(
            state,
            state.timeOfDay,
            state.solarOutputMw,
            state.gridDemandMw,
            'peak',
            state.tariffRatesEurMwh,
        );

        expect(plan.mode).not.toBe('discharging');
        expect(plan.targetPowerMw).toBe(0);
    });

    it('does not pre-charge from grid when peak does not cover round-trip losses', () => {
        const state = makeGridState({
            batterySocPercent: 60,
            timeOfDay: 14,
            solarOutputMw: 0,
            gridDemandMw: 80,
            tariffRatesEurMwh: { 'off-peak': 80, 'mid-peak': 150, 'peak': 140 },
        });

        const plan = getAutoArbPlan(
            state,
            state.timeOfDay,
            state.solarOutputMw,
            state.gridDemandMw,
            'mid-peak',
            state.tariffRatesEurMwh,
        );

        expect(plan.targetPowerMw).toBe(0);
    });
});
