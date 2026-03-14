import { describe, expect, it } from 'vitest';
import { makeGridState } from '../test/fixtures';
import { getAutoArbOutlook, getAutoArbPlan, settleHybridProjectTick } from './simulationModel';

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

        const plan = getAutoArbPlan(state, state.timeOfDay, state.solarOutputMw, state.gridDemandMw, 'mid-peak');

        expect(plan.mode).toBe('charging');
        expect(plan.targetPowerMw).toBeGreaterThan(0);
        expect(plan.shouldGridTopUp).toBe(true);
    });

    it('paces discharge across the peak window instead of requesting full transfer power immediately', () => {
        const state = makeGridState({
            batterySocPercent: 100,
            timeOfDay: 18.25,
            solarOutputMw: 32,
            gridDemandMw: 228,
        });

        const plan = getAutoArbPlan(state, state.timeOfDay, state.solarOutputMw, state.gridDemandMw, 'peak');

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
});
