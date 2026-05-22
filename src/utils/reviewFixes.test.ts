// ============================================================
// Regression tests for the 2026-05-16 multi-source code review.
// Each block names the finding ID it locks in (see review notes).
// ============================================================

import { describe, expect, it } from 'vitest';
import { AUTO_ARB, GRID, SIMULATION, SOLAR, TARIFF } from '../config';
import { makeGridState } from '../test/fixtures';
import { applyCommand } from './gridReducer';
import {
    clampFinite,
    getElectricityPriceEurMwh,
    getTariffPeriod,
    settleHybridProjectTick,
} from './simulationModel';
import { createInitialGridState, simulateTick } from './tickEngine';

const NOW = 1_700_000_000_000;

// ─── H1: NaN / Infinity payload guards ──────────────────────────
describe('H1 — reducer rejects non-finite payloads', () => {
    it('clampFinite returns the fallback when value is NaN or Infinity', () => {
        expect(clampFinite(NaN, 0, 100, 42)).toBe(42);
        expect(clampFinite(Infinity, 0, 100, 42)).toBe(42);
        expect(clampFinite(-Infinity, 0, 100, 42)).toBe(42);
        expect(clampFinite(50, 0, 100, 42)).toBe(50);
        expect(clampFinite(200, 0, 100, 42)).toBe(100);
    });

    it.each([
        ['SET_DISPATCH_SCALE', 'dispatchScalePercent'],
        ['SET_TIME_SPEED', 'timeSpeed'],
        ['SET_BESS_POWER_RATING', 'batteryPowerRatingMw'],
        ['SET_BESS_ENERGY_CAPACITY', 'batteryEnergyCapacityMwh'],
        ['SET_SOLAR_AC_CAPACITY', 'solarAcCapacityMw'],
        ['SET_SOLAR_DC_CAPACITY', 'solarDcCapacityMwp'],
        ['SET_GRID_PV_EVACUATION', 'gridPvEvacuationMw'],
        ['SET_GRID_BESS_CONNECTION', 'gridBessConnectionMw'],
    ] as const)('%s with NaN payload falls back to prev.%s', (type, field) => {
        const prev = makeGridState();
        const before = prev[field];
        const { next } = applyCommand(prev, { type, payload: Number.NaN } as never, NOW);
        expect(next[field]).toBe(before);
        // No state field should be NaN as a result
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
            const v = next[key];
            if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
        }
    });

    it('SET_TARIFF_RATE with Infinity payload preserves the prior rate', () => {
        const prev = makeGridState();
        const before = prev.tariffRatesEurMwh.peak;
        const { next } = applyCommand(
            prev,
            { type: 'SET_TARIFF_RATE', payload: { period: 'peak', value: Number.POSITIVE_INFINITY } },
            NOW,
        );
        expect(next.tariffRatesEurMwh.peak).toBe(before);
    });
});

// ─── S3: Running-state capacity change clamps live battery power ─
describe('S3 — running capacity change re-clamps batteryPowerMw immediately', () => {
    it('drops batteryPowerMw to new BESS power rating instead of waiting for next tick', () => {
        const prev = makeGridState({
            simulationStatus: 'running',
            batteryPowerMw: 150,
            batteryMode: 'charging',
            batteryPowerRatingMw: 200,
            gridBessConnectionMw: 200,
        });
        const { next } = applyCommand(prev, { type: 'SET_BESS_POWER_RATING', payload: 50 }, NOW);
        expect(next.batteryPowerRatingMw).toBe(50);
        // batteryPowerMw was 150, new transfer limit is min(50, 200) = 50, so should clamp.
        expect(next.batteryPowerMw).toBeLessThanOrEqual(50);
        expect(next.batteryPowerMw).toBeGreaterThanOrEqual(-50);
    });

    it('drops batteryPowerMw to new BESS grid connection', () => {
        const prev = makeGridState({
            simulationStatus: 'running',
            batteryPowerMw: -150,
            batteryMode: 'discharging',
            batteryPowerRatingMw: 200,
            gridBessConnectionMw: 200,
        });
        const { next } = applyCommand(prev, { type: 'SET_GRID_BESS_CONNECTION', payload: 40 }, NOW);
        expect(next.gridBessConnectionMw).toBe(40);
        expect(Math.abs(next.batteryPowerMw)).toBeLessThanOrEqual(40);
    });
});

// ─── S4: Tariff display reflects end-of-step time ────────────────
describe('S4 — display tariff/price use end-of-step time, not midpoint', () => {
    it('a tick crossing 18:00 surfaces "peak" by tick end (not still "mid-peak")', () => {
        const prev = makeGridState({
            simulationStatus: 'running',
            timeOfDay: 17.999,
            timeSpeed: 1,
            tariffPeriod: 'mid-peak',
            autoArbEnabled: false,
            batteryMode: 'idle',
        });
        // 4 seconds at 1× should advance ~4 sim-seconds (negligible), so push speed up.
        const fast = { ...prev, timeSpeed: 3600 }; // 1 real-sec = 1 sim-hour
        const next = simulateTick(fast, 1.0, NOW); // +1h sim → ends at ~18.999
        expect(next.timeOfDay).toBeGreaterThanOrEqual(TARIFF.periods.midPeakEnd);
        expect(next.tariffPeriod).toBe('peak');
        expect(next.currentPriceEurMwh).toBe(prev.tariffRatesEurMwh.peak);
    });

    it('getTariffPeriod at exact boundaries follows < semantics (boundary belongs to next period)', () => {
        expect(getTariffPeriod(0)).toBe('off-peak');
        expect(getTariffPeriod(TARIFF.periods.offPeakEnd - 1e-9)).toBe('off-peak');
        expect(getTariffPeriod(TARIFF.periods.offPeakEnd)).toBe('mid-peak');
        expect(getTariffPeriod(TARIFF.periods.midPeakEnd)).toBe('peak');
        expect(getTariffPeriod(TARIFF.periods.peakEnd)).toBe('off-peak'); // 23:00 → off
    });

    it('getElectricityPriceEurMwh tracks getTariffPeriod at boundaries', () => {
        const rates = TARIFF.defaultRatesEurMwh;
        expect(getElectricityPriceEurMwh(TARIFF.periods.midPeakEnd, rates)).toBe(rates.peak);
        expect(getElectricityPriceEurMwh(TARIFF.periods.peakEnd, rates)).toBe(rates['off-peak']);
    });
});

// ─── S1: Cumulative P&L components reconcile to totals ───────────
describe('S1 — auditable P&L breakdown', () => {
    it('settleHybridProjectTick: solarExportRev + dischargeRev − gridChargeCost === projectPnlDelta', () => {
        const s = settleHybridProjectTick({
            solarOutputMw: 80,
            gridDemandMw: 40,
            batteryPowerMw: 30,
            gridPvEvacuationMw: 50,
            currentPriceEurMwh: 200,
            dtHours: 0.25,
        });
        expect(
            s.solarExportRevenueDeltaEur + s.bessDischargeRevenueDeltaEur - s.bessGridChargeCostDeltaEur,
        ).toBeCloseTo(s.projectPnlDeltaEur, 6);
        expect(
            s.bessDischargeRevenueDeltaEur - s.bessGridChargeCostDeltaEur - s.solarOpportunityCostDeltaEur,
        ).toBeCloseTo(s.bessMarginDeltaEur, 6);
    });

    it('createInitialGridState seeds all cumulative components at zero', () => {
        const s = createInitialGridState(0);
        expect(s.cumulativeSolarExportRevenueEur).toBe(0);
        expect(s.cumulativeBessDischargeRevenueEur).toBe(0);
        expect(s.cumulativeBessGridChargeCostEur).toBe(0);
        expect(s.cumulativeSolarOpportunityCostEur).toBe(0);
    });

    it('RESET_SIMULATION clears every cumulative component', () => {
        const prev = makeGridState({
            cumulativeRevenueEur: 1234,
            cumulativeBessMarginEur: 567,
            cumulativeSolarExportRevenueEur: 1000,
            cumulativeBessDischargeRevenueEur: 500,
            cumulativeBessGridChargeCostEur: 200,
            cumulativeSolarOpportunityCostEur: 50,
        });
        const { next } = applyCommand(prev, { type: 'RESET_SIMULATION' }, NOW);
        expect(next.cumulativeRevenueEur).toBe(0);
        expect(next.cumulativeBessMarginEur).toBe(0);
        expect(next.cumulativeSolarExportRevenueEur).toBe(0);
        expect(next.cumulativeBessDischargeRevenueEur).toBe(0);
        expect(next.cumulativeBessGridChargeCostEur).toBe(0);
        expect(next.cumulativeSolarOpportunityCostEur).toBe(0);
    });
});

// ─── H6: 24h smoke test — no NaN/Infinity, cumulative reconciles ─
describe('H6 — 24h auto-arb smoke run stays finite and reconciles', () => {
    it('runs a full sim-day at 240× without producing NaN/Infinity, and components add up to totals', () => {
        // Use a deterministic RNG so the noise floor is reproducible.
        let seed = 0x1234;
        const rng = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };

        let state = createInitialGridState(NOW);
        state = {
            ...state,
            simulationStatus: 'running',
            autoArbEnabled: true,
            timeSpeed: 240,
        };

        // 24 sim-hours / 240× speed = 6 real-minutes; emulate by stepping in 100ms real-time slices.
        const realDtSec = 0.1;
        const simHoursPerStep = (realDtSec * 240) / 3600;
        const totalSteps = Math.ceil(24 / simHoursPerStep) + 1;

        for (let i = 0; i < totalSteps; i++) {
            state = simulateTick(state, realDtSec, NOW + i * realDtSec * 1000, rng);
        }

        for (const key of Object.keys(state) as (keyof typeof state)[]) {
            const v = state[key];
            if (typeof v === 'number') {
                expect(Number.isFinite(v), `${String(key)} should be finite, got ${v}`).toBe(true);
            }
        }
        expect(state.batterySocPercent).toBeGreaterThanOrEqual(0);
        expect(state.batterySocPercent).toBeLessThanOrEqual(100);

        // Project P&L reconciles from its 3 cumulative components, BESS Margin from 3 of its 4.
        expect(
            state.cumulativeSolarExportRevenueEur
            + state.cumulativeBessDischargeRevenueEur
            - state.cumulativeBessGridChargeCostEur,
        ).toBeCloseTo(state.cumulativeRevenueEur, 4);
        expect(
            state.cumulativeBessDischargeRevenueEur
            - state.cumulativeBessGridChargeCostEur
            - state.cumulativeSolarOpportunityCostEur,
        ).toBeCloseTo(state.cumulativeBessMarginEur, 4);
    });
});

// ─── Sanity: config constants are reachable so this file actually exercises them ──
describe('config sanity (to keep imports honest)', () => {
    it('AUTO_ARB / GRID / SIMULATION / SOLAR are all defined', () => {
        expect(AUTO_ARB.peakStartHour).toBeGreaterThan(0);
        expect(GRID.bessConnectionMw).toBeGreaterThan(0);
        expect(SIMULATION.maxTimeSpeed).toBeGreaterThan(SIMULATION.minTimeSpeed);
        expect(SOLAR.dcCapacityMwp).toBeGreaterThan(0);
    });
});
