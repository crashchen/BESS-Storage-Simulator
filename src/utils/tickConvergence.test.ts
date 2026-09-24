import { describe, expect, it, vi } from 'vitest';
import { AUTO_ARB, BESS } from '../config';
import type { GridState } from '../types';
import * as model from './simulationModel';
import { createInitialGridState, simulateTick } from './tickEngine';

const moneyFields = [
    'cumulativeRevenueEur', 'cumulativeBessMarginEur', 'cumulativeSolarExportRevenueEur',
    'cumulativeBessDischargeRevenueEur', 'cumulativeBessGridChargeCostEur', 'cumulativeSolarOpportunityCostEur',
    'cumulativeBessExportRevenueEur', 'cumulativeBessAvoidedImportCostEur',
    'cumulativeBessRestoredLoadAssumedValueEur',
] as const;

function initial(overrides: Partial<GridState> = {}): GridState {
    return { ...createInitialGridState(), simulationStatus: 'running', timeSpeed: 1440, ...overrides };
}

function run(state: GridState, hours: number, maxRealStep: number): GridState {
    const duration = hours * 3600 / state.timeSpeed;
    for (let i = 0; i < Math.ceil(duration / maxRealStep); i++) {
        state = simulateTick(state, Math.min(maxRealStep, duration - i * maxRealStep), i);
    }
    return state;
}

// Observe only booked segments, not dt=0 trial settlements. This accounts for
// sources/destinations independently of the last-segment telemetry in GridState.
function runWithLedger(state: GridState, hours: number, maxRealStep: number) {
    const ledger = { hours: 0, solarCharge: 0, gridCharge: 0, dischargeLoad: 0, dischargeExport: 0,
        pvExport: 0, curtailment: 0, gridImport: 0, gridExport: 0, solar: 0, demand: 0, solarLoad: 0,
        unserved: 0, pvRevenue: 0, dischargeValue: 0, bessExportRevenue: 0,
        avoidedImportCost: 0, restoredLoadAssumedValue: 0, gridCost: 0, opportunityCost: 0,
        overloadDischargeDays: new Set<number>(), pureRestoredSegments: 0 };
    const settle = model.settleHybridProjectTick;
    const observer = vi.spyOn(model, 'settleHybridProjectTick').mockImplementation(input => {
        const result = settle(input);
        const h = input.dtHours;
        if (h > 0) {
            // Derive the economic split independently from baseline import and
            // unserved-load deltas. Do not reuse the three fields under test.
            const pccLimitMw = Math.max(0, input.gridConnectionLimitMw ?? input.gridPvEvacuationMw);
            const unmetAfterSolarMw = Math.max(0, input.gridDemandMw - input.solarOutputMw);
            const baselineImportMw = Math.min(pccLimitMw, unmetAfterSolarMw);
            const baselineOverloadMw = Math.max(0, unmetAfterSolarMw - pccLimitMw);
            const avoidedImportMw = Math.max(0, baselineImportMw - result.gridImportMw);
            const restoredLoadMw = Math.max(0, baselineOverloadMw - result.gridOverloadMw);
            expect(avoidedImportMw + restoredLoadMw).toBeCloseTo(result.batteryDischargeToLoadMw, 7);
            expect(result.bessExportRevenueDeltaEur).toBeCloseTo(result.batteryDischargeToExportMw * h * input.currentPriceEurMwh, 7);
            expect(result.bessAvoidedImportCostDeltaEur).toBeCloseTo(avoidedImportMw * h * input.currentPriceEurMwh, 7);
            expect(result.bessRestoredLoadAssumedValueDeltaEur).toBeCloseTo(restoredLoadMw * h * input.currentPriceEurMwh, 7);
            if (baselineOverloadMw > 1e-9 && result.batteryDischargeToLoadMw > 1e-9) {
                ledger.overloadDischargeDays.add(Math.floor((state.timeOfDay + ledger.hours) / 24));
                if (avoidedImportMw < 1e-9 && restoredLoadMw > 1e-9) ledger.pureRestoredSegments += 1;
            }
            ledger.hours += h;
            ledger.solarCharge += result.batteryChargeFromSolarMw * h;
            ledger.gridCharge += result.batteryChargeFromGridMw * h;
            ledger.dischargeLoad += result.batteryDischargeToLoadMw * h;
            ledger.dischargeExport += result.batteryDischargeToExportMw * h;
            ledger.pvExport += result.solarExportMw * h;
            ledger.curtailment += result.solarCurtailedMw * h;
            ledger.gridImport += result.gridImportMw * h;
            ledger.gridExport += result.gridExportMw * h;
            ledger.solar += input.solarOutputMw * h;
            ledger.demand += input.gridDemandMw * h;
            ledger.solarLoad += Math.min(input.solarOutputMw, input.gridDemandMw) * h;
            ledger.unserved += result.gridOverloadMw * h;
            ledger.pvRevenue += result.solarExportMw * h * input.currentPriceEurMwh;
            ledger.dischargeValue += (result.batteryDischargeToLoadMw + result.batteryDischargeToExportMw) * h * input.currentPriceEurMwh;
            ledger.bessExportRevenue += result.batteryDischargeToExportMw * h * input.currentPriceEurMwh;
            ledger.avoidedImportCost += avoidedImportMw * h * input.currentPriceEurMwh;
            ledger.restoredLoadAssumedValue += restoredLoadMw * h * input.currentPriceEurMwh;
            ledger.gridCost += result.batteryChargeFromGridMw * h * input.currentPriceEurMwh;
            const baselineExport = Math.min(Math.max(0, input.solarOutputMw - input.gridDemandMw), input.gridPvEvacuationMw, input.gridConnectionLimitMw!);
            ledger.opportunityCost += Math.max(0, baselineExport - result.solarExportMw) * h * input.currentPriceEurMwh;
        }
        return result;
    });
    let final: GridState;
    try { final = run(state, hours, maxRealStep); } finally { observer.mockRestore(); }
    expect(ledger.hours).toBeCloseTo(hours, 10);
    expect(ledger.solar).toBeCloseTo(ledger.solarLoad + ledger.solarCharge + ledger.pvExport + ledger.curtailment, 8);
    expect(ledger.demand).toBeCloseTo(ledger.solarLoad + ledger.dischargeLoad + ledger.gridImport - ledger.gridCharge + ledger.unserved, 8);
    expect(ledger.gridExport).toBeCloseTo(ledger.pvExport + ledger.dischargeExport, 8);
    const storedDelta = (final.batterySocPercent - state.batterySocPercent) / 100 * state.batteryEnergyCapacityMwh;
    expect(storedDelta).toBeCloseTo((ledger.solarCharge + ledger.gridCharge) * BESS.chargeEfficiency
        - (ledger.dischargeLoad + ledger.dischargeExport) / BESS.dischargeEfficiency, 7);
    expect(final.cumulativeSolarExportRevenueEur - state.cumulativeSolarExportRevenueEur).toBeCloseTo(ledger.pvRevenue, 7);
    expect(final.cumulativeBessDischargeRevenueEur - state.cumulativeBessDischargeRevenueEur).toBeCloseTo(ledger.dischargeValue, 7);
    expect(final.cumulativeBessExportRevenueEur - state.cumulativeBessExportRevenueEur).toBeCloseTo(ledger.bessExportRevenue, 7);
    expect(final.cumulativeBessAvoidedImportCostEur - state.cumulativeBessAvoidedImportCostEur).toBeCloseTo(ledger.avoidedImportCost, 7);
    expect(final.cumulativeBessRestoredLoadAssumedValueEur - state.cumulativeBessRestoredLoadAssumedValueEur).toBeCloseTo(ledger.restoredLoadAssumedValue, 7);
    expect(ledger.bessExportRevenue + ledger.avoidedImportCost + ledger.restoredLoadAssumedValue).toBeCloseTo(ledger.dischargeValue, 7);
    expect(final.cumulativeBessGridChargeCostEur - state.cumulativeBessGridChargeCostEur).toBeCloseTo(ledger.gridCost, 7);
    expect(final.cumulativeSolarOpportunityCostEur - state.cumulativeSolarOpportunityCostEur).toBeCloseTo(ledger.opportunityCost, 7);
    return { final, ledger };
}

function expectClose(actual: GridState, reference: GridState, euros: number, soc = 0.002) {
    const clockDifference = ((actual.timeOfDay - reference.timeOfDay + 36) % 24) - 12;
    expect(clockDifference).toBeCloseTo(0, 7);
    expect(Math.abs(actual.batterySocPercent - reference.batterySocPercent)).toBeLessThan(soc);
    for (const field of moneyFields) expect(Math.abs(actual[field] - reference[field]), field).toBeLessThan(euros);
}

describe('energy-event integration', () => {
    it('reconciles independently derived value across three days with overload on multiple days', () => {
        const start = initial({
            timeOfDay: 18,
            dispatchMode: 'manual-discharge',
            batterySocPercent: 100,
            batteryPowerRatingMw: 20,
            gridBessConnectionMw: 20,
            dispatchScalePercent: 150,
        });
        const { final, ledger } = runWithLedger(start, 72, 0.1);

        expect(final.timeOfDay).toBeCloseTo(18, 7);
        expect(ledger.overloadDischargeDays.size).toBeGreaterThanOrEqual(2);
        expect(ledger.pureRestoredSegments).toBeGreaterThan(0);
        expect(ledger.restoredLoadAssumedValue).toBeGreaterThan(0);
        expect(ledger.avoidedImportCost).toBeGreaterThan(0);
    });

    it.each([150, -25])('settles the small-battery charge boundary consistently at %s EUR/MWh', price => {
        const start = initial({ timeOfDay: 12, dispatchMode: 'manual-charge', gridPvEvacuationMw: 5,
            batteryEnergyCapacityMwh: 10, batterySocPercent: 80, dispatchScalePercent: 50,
            tariffRatesEurMwh: { 'off-peak': price, 'mid-peak': price, peak: price } });
        const reference = runWithLedger(start, 0.04, 0.0001);
        for (const dt of [0.1, 1 / 60, 0.001]) {
            const result = runWithLedger(start, 0.04, dt);
            expect(result.final.batterySocPercent).toBe(100);
            expect(result.final.batteryPowerMw).toBe(0);
            expectClose(result.final, reference.final, 0.001);
            for (const leg of ['solarCharge', 'gridCharge', 'pvExport', 'curtailment'] as const) {
                expect(Math.abs(result.ledger[leg] - reference.ledger[leg]), leg).toBeLessThan(0.00001);
            }
        }
        expect(reference.ledger.gridCharge).toBeGreaterThan(1);
        expect(reference.final.cumulativeRevenueEur * price).toBeLessThan(0);
    });

    it('keeps local/export discharge energy and revenue when a tick crosses empty', () => {
        const start = initial({ timeOfDay: 8, dispatchMode: 'manual-discharge', batteryEnergyCapacityMwh: 10, batterySocPercent: 20 });
        const coarse = runWithLedger(start, 0.04, 0.1);
        const fine = runWithLedger(start, 0.04, 0.0001);
        expect(coarse.final.batterySocPercent).toBe(0);
        expect(coarse.final.batteryPowerMw).toBe(0);
        expect(coarse.ledger.dischargeLoad).toBeGreaterThan(0);
        expect(coarse.ledger.dischargeExport).toBeGreaterThan(0);
        expect(coarse.ledger.dischargeLoad + coarse.ledger.dischargeExport).toBeCloseTo(2 * BESS.dischargeEfficiency, 8);
        expectClose(coarse.final, fine.final, 0.001);
        for (const leg of ['dischargeLoad', 'dischargeExport', 'gridImport', 'gridExport'] as const) {
            expect(Math.abs(coarse.ledger[leg] - fine.ledger[leg]), leg).toBeLessThan(0.0001);
        }
    });

    it.each([0, 100])('switches off grid reserve charging at 40%% with demand scale %s', dispatchScalePercent => {
        const start = initial({ timeOfDay: 5.9, dispatchMode: 'auto', batteryEnergyCapacityMwh: 10,
            batterySocPercent: 39, dispatchScalePercent });
        const coarse = runWithLedger(start, 0.04, 0.1);
        const fine = runWithLedger(start, 0.04, 0.0001);
        expect(coarse.ledger.gridCharge).toBeGreaterThan(0);
        expect(coarse.final.batteryChargeFromGridMw).toBe(0);
        if (dispatchScalePercent === 0) {
            expect(coarse.final.batterySocPercent).toBeGreaterThan(40);
            expect(coarse.final.batteryChargeFromSolarMw).toBeGreaterThan(0);
        } else {
            expect(coarse.final.batterySocPercent).toBe(40);
            expect(coarse.final.batteryPowerMw).toBe(0);
        }
        expectClose(coarse.final, fine.final, 0.01);
    });

    it('times charging from actual PCC-limited power instead of the PCS request', () => {
        const start = initial({ timeOfDay: 8, dispatchMode: 'manual-charge', dispatchScalePercent: 150,
            batteryEnergyCapacityMwh: 10, batterySocPercent: 80 });
        const coarse = runWithLedger(start, 0.04, 0.1);
        const fine = runWithLedger(start, 0.04, 0.0001);
        expect(coarse.final.batterySocPercent).toBe(100);
        expect(coarse.ledger.gridCharge).toBeCloseTo(2 / BESS.chargeEfficiency, 7);
        expectClose(coarse.final, fine.final, 0.01);
    });

    it.each([90, 82.144, 70])('handles full SoC before/at/after the tariff boundary from %s%%', batterySocPercent => {
        const start = initial({ timeOfDay: 17.99, dispatchMode: 'manual-charge', dispatchScalePercent: 0,
            batteryEnergyCapacityMwh: 10, batterySocPercent });
        const coarse = runWithLedger(start, 0.04, 0.1);
        const fine = runWithLedger(start, 0.04, 0.0001);
        expect(coarse.final.batterySocPercent).toBe(100);
        expect(coarse.final.tariffPeriod).toBe('peak');
        expectClose(coarse.final, fine.final, 0.01);
    });

    it('splits the midnight demand wrap even though the tariff remains off-peak', () => {
        const start = initial({ timeOfDay: 23.99, dispatchMode: 'manual-charge', dispatchScalePercent: 150 });
        const coarse = runWithLedger(start, 0.04, 0.1);
        const fine = runWithLedger(start, 0.04, 0.0001);
        expect(coarse.final.timeOfDay).toBeCloseTo(0.03, 10);
        expectClose(coarse.final, fine.final, 0.01);
        expect(Math.abs(coarse.ledger.gridImport - fine.ledger.gridImport)).toBeLessThan(0.0001);
    });
});

describe('peak pacing horizon floor', () => {
    it.each([13, 27])('integrates the capped/exponential pacing law above reserve from %s%%', batterySocPercent => {
        const start = initial({ timeOfDay: 22.75, dispatchMode: 'auto', batterySocPercent,
            batteryEnergyCapacityMwh: 10, batteryPowerRatingMw: 5, gridBessConnectionMw: 5,
            solarAcCapacityMw: 0, dispatchScalePercent: 0 });
        const hours = 0.2;
        const usable = (batterySocPercent - AUTO_ARB.peakReserveSocPercent) / 100 * 10;
        const cappedHours = Math.max(0, usable * BESS.dischargeEfficiency / 5 - 0.25);
        const remaining = (usable - 5 * cappedHours / BESS.dischargeEfficiency) * Math.exp(-(hours - cappedHours) / 0.25);
        const expectedSoc = AUTO_ARB.peakReserveSocPercent + remaining / 10 * 100;
        const expectedValue = (usable - remaining) * BESS.dischargeEfficiency * start.tariffRatesEurMwh.peak;
        for (const dt of [0.5, 0.1, 1 / 60, 0.001]) {
            const result = runWithLedger(start, hours, dt).final;
            expect(result.batterySocPercent).toBeCloseTo(expectedSoc, 8);
            expect(result.cumulativeBessDischargeRevenueEur).toBeCloseTo(expectedValue, 7);
            expect(result.batterySocPercent).toBeGreaterThan(AUTO_ARB.peakReserveSocPercent);
        }
    });

    it('crosses the horizon floor and 23:00 without discharging below reserve', () => {
        const start = initial({ timeOfDay: 22.74, dispatchMode: 'auto', batterySocPercent: 13 });
        const coarse = runWithLedger(start, 0.3, 0.1);
        const fine = runWithLedger(start, 0.3, 0.0001);
        expect(coarse.final.tariffPeriod).toBe('off-peak');
        expect(coarse.final.batterySocPercent).toBeGreaterThanOrEqual(AUTO_ARB.peakReserveSocPercent);
        expectClose(coarse.final, fine.final, 0.01);
    });
});

describe('representative fixed-horizon convergence', () => {
    it.each([100, 150])('keeps the 40%% evening target through three AUTO days at %s%% demand', dispatchScalePercent => {
        const start = initial({ timeOfDay: 6, batterySocPercent: AUTO_ARB.peakEntryTargetSocPercent,
            dispatchScalePercent });
        let state = start;
        for (let day = 0; day < 3; day++) {
            state = run(state, 12, 0.1);
            expect(state.timeOfDay).toBeCloseTo(18, 8);
            expect(state.batterySocPercent).toBeCloseTo(AUTO_ARB.peakEntryTargetSocPercent, 8);
            const dischargeBeforePeak = state.cumulativeBessDischargeRevenueEur;
            state = run(state, 5, 0.1);
            expect(state.cumulativeBessDischargeRevenueEur).toBeGreaterThan(dischargeBeforePeak);
            state = run(state, 7, 0.1);
            expect(state.batterySocPercent).toBeCloseTo(AUTO_ARB.peakEntryTargetSocPercent, 8);
        }
        const fine = run(start, 72, 1 / 60);
        expectClose(state, fine, 6);
        if (dispatchScalePercent === 150) {
            expect(state.cumulativeBessRestoredLoadAssumedValueEur).toBeGreaterThan(0);
        } else {
            expect(state.cumulativeBessRestoredLoadAssumedValueEur).toBe(0);
        }
    });

    it.each([
        [0, 744], [8, 744], [0, 10], [8, 10],
    ])('converges across a full day from %sh with %s MWh', (timeOfDay, batteryEnergyCapacityMwh) => {
        const start = initial({ timeOfDay, batteryEnergyCapacityMwh });
        const reference = run(start, 24, 0.001);
        expectClose(run(start, 24, 0.1), reference, 3);
        expectClose(run(start, 24, 1 / 60), reference, 0.2);
    });
});
