import { describe, expect, it } from 'vitest';
import { BESS, GRID, SIMULATION, SOLAR, TARIFF } from '../config';
import { SCENARIO_PRESETS, SCENARIO_PRESETS_BY_ID } from '../scenarios';
import { makeGridState } from '../test/fixtures';
import { applyCommand } from './gridReducer';
import { selectBatteryDurationHours, selectGridConnectionTotalMw } from './gridSelectors';
import {
    computeGridDemandMw,
    computeSolarOutputMw,
    getElectricityPriceEurMwh,
    getTariffPeriod,
    settleHybridProjectTick,
} from './simulationModel';
import { createInitialGridState } from './tickEngine';

const NOW = 1700000000000;

describe('gridReducer applyCommand', () => {
    it('START_SIMULATION marks the sim running and requests a frame-ref reset', () => {
        const prev = makeGridState({ simulationStatus: 'stopped' });
        const { next, sideEffects } = applyCommand(prev, { type: 'START_SIMULATION' }, NOW);

        expect(next.simulationStatus).toBe('running');
        expect(next.timestamp).toBe(NOW);
        expect(sideEffects).toEqual({ resetFrameRef: true });
    });

    it('PAUSE_SIMULATION marks the sim paused without side effects', () => {
        const prev = makeGridState({ simulationStatus: 'running' });
        const { next, sideEffects } = applyCommand(prev, { type: 'PAUSE_SIMULATION' }, NOW);

        expect(next.simulationStatus).toBe('paused');
        expect(next.timestamp).toBe(NOW);
        expect(sideEffects).toEqual({});
    });

    it('STOP_SIMULATION resets simulation but preserves user config', () => {
        const prev = makeGridState({
            simulationStatus: 'running',
            batterySocPercent: 25,
            cumulativeRevenueEur: 99999,
            batteryPowerRatingMw: 250,
            batteryEnergyCapacityMwh: 1000,
            tariffRatesEurMwh: { 'off-peak': 40, 'mid-peak': 120, peak: 400 },
        });
        const { next, sideEffects } = applyCommand(prev, { type: 'STOP_SIMULATION' }, NOW);

        expect(next.simulationStatus).toBe('stopped');
        expect(next.cumulativeRevenueEur).toBe(0);
        expect(next.batterySocPercent).toBe(65); // initial SoC
        // User config preserved
        expect(next.batteryPowerRatingMw).toBe(250);
        expect(next.batteryEnergyCapacityMwh).toBe(1000);
        expect(next.tariffRatesEurMwh).toEqual({ 'off-peak': 40, 'mid-peak': 120, peak: 400 });
        expect(sideEffects).toEqual({
            resetHistory: true,
            resetTimerRefs: true,
            resetFrameRef: true,
        });
    });

    it('RESET_SIMULATION returns a full factory-default state', () => {
        const prev = makeGridState({
            simulationStatus: 'running',
            batterySocPercent: 25,
            cumulativeRevenueEur: 99999,
            batteryPowerRatingMw: 250,
        });
        const { next, sideEffects } = applyCommand(prev, { type: 'RESET_SIMULATION' }, NOW);

        expect(next).toEqual(createInitialGridState(NOW));
        expect(sideEffects).toEqual({
            resetHistory: true,
            resetTimerRefs: true,
            resetFrameRef: true,
        });
    });

    it('APPLY_SCENARIO_PRESET loads an auditable paused demo state and resets transient history refs', () => {
        const preset = SCENARIO_PRESETS_BY_ID['negative-price-charge'];
        const prev = makeGridState({
            simulationStatus: 'running',
            cumulativeRevenueEur: 2500,
            cumulativeBessMarginEur: 1200,
        });

        const { next, sideEffects } = applyCommand(
            prev,
            { type: 'APPLY_SCENARIO_PRESET', payload: preset.id },
            NOW,
        );

        expect(next.simulationStatus).toBe('paused');
        expect(next.timeOfDay).toBe(preset.state.timeOfDay);
        expect(next.dispatchMode).toBe('manual-charge');
        expect(next.currentPriceEurMwh).toBe(-45);
        expect(next.batteryMode).toBe('charging');
        expect(next.batteryPowerMw).toBeGreaterThan(0);
        expect(next.batteryChargeFromGridMw).toBeGreaterThan(0);
        expect(next.cumulativeRevenueEur).toBe(0);
        expect(next.cumulativeBessMarginEur).toBe(0);
        expect(sideEffects).toEqual({
            resetHistory: true,
            resetTimerRefs: true,
            resetFrameRef: true,
        });
    });

    // Table-driven structural smoke for every preset, so a new preset can't slip
    // in with NaN telemetry, an out-of-range SoC, a power command past the
    // transfer limit, or a mode/sign mismatch.
    it.each(SCENARIO_PRESETS.map((p) => [p.id, p] as const))(
        'APPLY_SCENARIO_PRESET %s yields a paused, in-bounds, sign-consistent scene',
        (_id, preset) => {
            const { next, sideEffects } = applyCommand(
                makeGridState({ simulationStatus: 'running', cumulativeRevenueEur: 12345 }),
                { type: 'APPLY_SCENARIO_PRESET', payload: preset.id },
                NOW,
            );

            expect(next.simulationStatus).toBe('paused');
            expect(sideEffects).toEqual({
                resetHistory: true,
                resetTimerRefs: true,
                resetFrameRef: true,
            });

            // Finite telemetry on every numeric channel the UI/HUD subscribes to.
            for (const value of [
                next.batterySocPercent,
                next.batteryPowerMw,
                next.batteryChargeFromSolarMw,
                next.batteryChargeFromGridMw,
                next.batteryDischargeToLoadMw,
                next.batteryDischargeToExportMw,
                next.solarOutputMw,
                next.solarExportMw,
                next.solarCurtailedMw,
                next.gridDemandMw,
                next.gridFrequencyHz,
                next.gridImportMw,
                next.gridExportMw,
                next.gridOverloadMw,
                next.currentPriceEurMwh,
                next.projectNetExportMw,
            ]) {
                expect(Number.isFinite(value)).toBe(true);
            }

            // Range bounds.
            expect(next.batterySocPercent).toBeGreaterThanOrEqual(0);
            expect(next.batterySocPercent).toBeLessThanOrEqual(100);
            expect(next.timeOfDay).toBeGreaterThanOrEqual(0);
            expect(next.timeOfDay).toBeLessThan(24);

            // Battery power must respect the transfer limit (min of rating and grid BESS link).
            const transferLimitMw = Math.min(next.batteryPowerRatingMw, next.gridBessConnectionMw);
            expect(Math.abs(next.batteryPowerMw)).toBeLessThanOrEqual(transferLimitMw + 1e-9);

            // Mode/sign consistency.
            if (next.batteryMode === 'charging') {
                expect(next.batteryPowerMw).toBeGreaterThanOrEqual(0);
            } else if (next.batteryMode === 'discharging') {
                expect(next.batteryPowerMw).toBeLessThanOrEqual(0);
            } else {
                expect(next.batteryPowerMw).toBe(0);
            }

            // Cumulative P&L wiped on preset entry.
            expect(next.cumulativeRevenueEur).toBe(0);
            expect(next.cumulativeBessMarginEur).toBe(0);
        },
    );

    it('APPLY_SCENARIO_PRESET scenarios match their intended demo stories', () => {
        const applyPreset = (id: keyof typeof SCENARIO_PRESETS_BY_ID) => applyCommand(
            makeGridState(),
            { type: 'APPLY_SCENARIO_PRESET', payload: id },
            NOW,
        ).next;

        const solarSurplus = applyPreset('summer-midday-surplus');
        expect(solarSurplus.solarOutputMw).toBeGreaterThan(solarSurplus.gridDemandMw);
        expect(solarSurplus.solarOutputMw).toBeGreaterThan(solarSurplus.gridPvEvacuationMw);
        expect(solarSurplus.batteryMode).toBe('charging');
        expect(solarSurplus.batteryChargeFromSolarMw).toBeGreaterThan(0);
        expect(solarSurplus.batteryChargeFromGridMw).toBe(0);
        expect(solarSurplus.solarCurtailedMw).toBe(0);

        const peakExport = applyPreset('evening-peak-discharge');
        expect(peakExport.tariffPeriod).toBe('peak');
        expect(peakExport.currentPriceEurMwh).toBe(TARIFF.defaultRatesEurMwh.peak);
        expect(peakExport.batteryMode).toBe('discharging');
        expect(peakExport.batteryDischargeToLoadMw + peakExport.batteryDischargeToExportMw).toBeGreaterThan(0);
        expect(peakExport.gridImportMw).toBeLessThan(peakExport.gridDemandMw);
        expect(peakExport.projectNetExportMw).toBe(peakExport.gridExportMw - peakExport.gridImportMw);

        const negativePrice = applyPreset('negative-price-charge');
        expect(negativePrice.tariffPeriod).toBe('off-peak');
        expect(negativePrice.currentPriceEurMwh).toBeLessThan(0);
        expect(negativePrice.solarOutputMw).toBe(0);
        expect(negativePrice.batteryMode).toBe('charging');
        expect(negativePrice.batteryChargeFromGridMw).toBeGreaterThan(0);
        expect(negativePrice.projectNetExportMw).toBeLessThan(0);

        const gridStress = applyPreset('grid-stress-lockout');
        expect(gridStress.gridDemandMw).toBeGreaterThan(gridStress.solarOutputMw);
        expect(gridStress.batteryMode).toBe('idle');
        expect(gridStress.batteryPowerMw).toBe(0);
        expect(gridStress.batteryChargeFromGridMw).toBe(0);
        expect(gridStress.gridOverloadWarning).toBe(true);
        expect(gridStress.gridOverloadMw).toBeGreaterThan(0);
    });

    it('APPLY_SCENARIO_PRESET computes a PCC overload scene without starting the clock', () => {
        const { next } = applyCommand(
            makeGridState(),
            { type: 'APPLY_SCENARIO_PRESET', payload: 'grid-stress-lockout' },
            NOW,
        );

        expect(next.simulationStatus).toBe('paused');
        expect(next.batteryMode).toBe('idle');
        expect(next.batteryPowerMw).toBe(0);
        expect(next.gridFrequencyHz).toBe(GRID.nominalFrequencyHz);
        expect(next.gridImportMw).toBe(selectGridConnectionTotalMw(next));
        expect(next.gridOverloadWarning).toBe(true);
    });

    it('CHARGE switches to charging mode and disables auto-arb', () => {
        const prev = makeGridState({
            batteryMode: 'idle',
            autoArbEnabled: true,
            dispatchMode: 'auto',
        });
        const { next, sideEffects } = applyCommand(prev, { type: 'CHARGE' }, NOW);

        expect(next.batteryMode).toBe('charging');
        expect(next.dispatchMode).toBe('manual-charge');
        expect(next.autoArbEnabled).toBe(false);
        expect(sideEffects).toEqual({});
    });

    it('CHARGE falls back to idle when the battery is already full', () => {
        const prev = makeGridState({
            batterySocPercent: 100,
            batteryMode: 'idle',
            autoArbEnabled: true,
        });
        const { next, sideEffects } = applyCommand(prev, { type: 'CHARGE' }, NOW);

        expect(next.batteryMode).toBe('idle');
        expect(next.dispatchMode).toBe('manual-charge');
        expect(next.autoArbEnabled).toBe(false);
        expect(sideEffects).toEqual({});
    });

    it('DISCHARGE switches to discharging mode and disables auto-arb', () => {
        const prev = makeGridState({ batteryMode: 'idle', autoArbEnabled: true });
        const { next, sideEffects } = applyCommand(prev, { type: 'DISCHARGE' }, NOW);

        expect(next.batteryMode).toBe('discharging');
        expect(next.dispatchMode).toBe('manual-discharge');
        expect(next.autoArbEnabled).toBe(false);
        expect(sideEffects).toEqual({});
    });

    it('DISCHARGE falls back to idle when the battery is already empty', () => {
        const prev = makeGridState({
            batterySocPercent: 0,
            batteryMode: 'idle',
            autoArbEnabled: true,
        });
        const { next, sideEffects } = applyCommand(prev, { type: 'DISCHARGE' }, NOW);

        expect(next.batteryMode).toBe('idle');
        expect(next.dispatchMode).toBe('manual-discharge');
        expect(next.autoArbEnabled).toBe(false);
        expect(sideEffects).toEqual({});
    });

    it('IDLE switches to idle mode and disables auto-arb', () => {
        const prev = makeGridState({ batteryMode: 'charging', autoArbEnabled: true });
        const { next, sideEffects } = applyCommand(prev, { type: 'IDLE' }, NOW);

        expect(next.batteryMode).toBe('idle');
        expect(next.dispatchMode).toBe('manual-idle');
        expect(next.autoArbEnabled).toBe(false);
        expect(sideEffects).toEqual({});
    });

    it('SET_DISPATCH_SCALE clamps the payload to the configured range', () => {
        const prev = makeGridState({ dispatchScalePercent: 100 });
        const { next } = applyCommand(
            prev,
            { type: 'SET_DISPATCH_SCALE', payload: SIMULATION.dispatchScaleMax + 500 },
            NOW,
        );

        expect(next.dispatchScalePercent).toBe(SIMULATION.dispatchScaleMax);
    });

    it('SET_TIME_SPEED clamps the payload to the configured range', () => {
        const prev = makeGridState({ timeSpeed: 60 });
        const { next } = applyCommand(
            prev,
            { type: 'SET_TIME_SPEED', payload: SIMULATION.minTimeSpeed - 10 },
            NOW,
        );

        expect(next.timeSpeed).toBe(SIMULATION.minTimeSpeed);
    });

    it('SET_BESS_POWER_RATING clamps and keeps the derived duration selector accurate', () => {
        const prev = makeGridState({ batteryPowerRatingMw: 188, batteryEnergyCapacityMwh: 744 });
        const { next, sideEffects } = applyCommand(
            prev,
            { type: 'SET_BESS_POWER_RATING', payload: BESS.maxPowerMw + 50 },
            NOW,
        );

        expect(next.batteryPowerRatingMw).toBe(BESS.maxPowerMw);
        expect(selectBatteryDurationHours(next)).toBe(744 / BESS.maxPowerMw);
        expect(sideEffects).toEqual({});
    });

    it('SET_BESS_ENERGY_CAPACITY preserves stored energy across the capacity change', () => {
        const prev = makeGridState({
            batteryPowerRatingMw: 188,
            batteryEnergyCapacityMwh: 744,
            batterySocPercent: 50,
        });
        const prevStoredMwh = (prev.batterySocPercent / 100) * prev.batteryEnergyCapacityMwh;
        const payload = 600;

        const { next } = applyCommand(
            prev,
            { type: 'SET_BESS_ENERGY_CAPACITY', payload },
            NOW,
        );

        expect(next.batteryEnergyCapacityMwh).toBe(payload);
        expect(next.batterySocPercent).toBeCloseTo((prevStoredMwh / payload) * 100, 6);
        expect(selectBatteryDurationHours(next)).toBeCloseTo(payload / 188, 6);
    });

    it('SET_SOLAR_AC_CAPACITY clamps and recomputes solar output with unchanged DC capacity', () => {
        const prev = makeGridState({
            timeOfDay: SOLAR.solarNoon,
            solarAcCapacityMw: 100,
            solarDcCapacityMwp: 120,
        });
        const { next } = applyCommand(
            prev,
            { type: 'SET_SOLAR_AC_CAPACITY', payload: SOLAR.maxAcCapacityMw + 100 },
            NOW,
        );

        expect(next.solarAcCapacityMw).toBe(SOLAR.maxAcCapacityMw);
        expect(next.solarOutputMw).toBeCloseTo(
            computeSolarOutputMw(prev.timeOfDay, SOLAR.maxAcCapacityMw, prev.solarDcCapacityMwp),
            6,
        );
    });

    it('SET_SOLAR_DC_CAPACITY clamps and recomputes solar output with unchanged AC capacity', () => {
        const prev = makeGridState({
            timeOfDay: SOLAR.solarNoon,
            solarAcCapacityMw: 100,
            solarDcCapacityMwp: 120,
        });
        const { next } = applyCommand(
            prev,
            { type: 'SET_SOLAR_DC_CAPACITY', payload: SOLAR.minDcCapacityMwp - 5 },
            NOW,
        );

        expect(next.solarDcCapacityMwp).toBe(SOLAR.minDcCapacityMwp);
        expect(next.solarOutputMw).toBeCloseTo(
            computeSolarOutputMw(prev.timeOfDay, prev.solarAcCapacityMw, SOLAR.minDcCapacityMwp),
            6,
        );
    });

    it('reconciles paused-state telemetry when solar capacity changes', () => {
        const prev = makeGridState({
            simulationStatus: 'paused',
            timeOfDay: SOLAR.solarNoon,
            solarAcCapacityMw: 100,
            solarDcCapacityMwp: 110,
            batteryMode: 'discharging',
            batteryPowerMw: -150,
            batteryChargeFromSolarMw: 12,
            batteryChargeFromGridMw: 8,
            batteryDischargeToLoadMw: 90,
            batteryDischargeToExportMw: 60,
            solarExportMw: 77,
            solarCurtailedMw: 9,
            projectNetExportMw: -4,
        });
        const payload = 160;
        const expectedSolarOutputMw = computeSolarOutputMw(prev.timeOfDay, prev.solarAcCapacityMw, payload);
        const expectedDemandMw = computeGridDemandMw(
            prev.timeOfDay,
            prev.dispatchScalePercent / 100,
            selectGridConnectionTotalMw(prev),
        );
        const expectedPriceEurMwh = getElectricityPriceEurMwh(prev.timeOfDay, prev.tariffRatesEurMwh);
        const expectedSettlement = settleHybridProjectTick({
            solarOutputMw: expectedSolarOutputMw,
            gridDemandMw: expectedDemandMw,
            batteryPowerMw: 0,
            gridPvEvacuationMw: prev.gridPvEvacuationMw,
            currentPriceEurMwh: expectedPriceEurMwh,
            dtHours: 0,
        });

        const { next } = applyCommand(
            prev,
            { type: 'SET_SOLAR_DC_CAPACITY', payload },
            NOW,
        );

        expect(next.solarDcCapacityMwp).toBe(payload);
        expect(next.solarOutputMw).toBeCloseTo(expectedSolarOutputMw, 6);
        expect(next.gridDemandMw).toBeCloseTo(expectedDemandMw, 6);
        expect(next.batteryPowerMw).toBe(0);
        expect(next.batteryChargeFromSolarMw).toBe(expectedSettlement.batteryChargeFromSolarMw);
        expect(next.batteryChargeFromGridMw).toBe(expectedSettlement.batteryChargeFromGridMw);
        expect(next.batteryDischargeToLoadMw).toBe(expectedSettlement.batteryDischargeToLoadMw);
        expect(next.batteryDischargeToExportMw).toBe(expectedSettlement.batteryDischargeToExportMw);
        expect(next.solarExportMw).toBe(expectedSettlement.solarExportMw);
        expect(next.solarCurtailedMw).toBe(expectedSettlement.solarCurtailedMw);
        expect(next.projectNetExportMw).toBe(expectedSettlement.projectNetExportMw);
        expect(next.tariffPeriod).toBe(getTariffPeriod(prev.timeOfDay));
        expect(next.currentPriceEurMwh).toBe(expectedPriceEurMwh);
    });

    it('SET_GRID_PV_EVACUATION updates the field and recomputes demand without storing the total', () => {
        const prev = makeGridState({
            gridPvEvacuationMw: 102,
            gridBessConnectionMw: 186,
            dispatchScalePercent: 100,
            timeOfDay: 10,
        });
        const payload = 180;

        const { next } = applyCommand(
            prev,
            { type: 'SET_GRID_PV_EVACUATION', payload },
            NOW,
        );

        expect(next.gridPvEvacuationMw).toBe(payload);
        expect(selectGridConnectionTotalMw(next)).toBe(payload + prev.gridBessConnectionMw);
        expect('gridConnectionTotalMw' in next).toBe(false);
        expect(next.gridDemandMw).toBeCloseTo(
            computeGridDemandMw(
                prev.timeOfDay,
                prev.dispatchScalePercent / 100,
                payload + prev.gridBessConnectionMw,
            ),
            6,
        );
    });

    it('SET_GRID_BESS_CONNECTION clamps and recomputes demand from the new total', () => {
        const prev = makeGridState({
            gridPvEvacuationMw: 102,
            gridBessConnectionMw: 186,
            dispatchScalePercent: 100,
            timeOfDay: 10,
        });
        const { next } = applyCommand(
            prev,
            { type: 'SET_GRID_BESS_CONNECTION', payload: GRID.maxBessConnectionMw + 25 },
            NOW,
        );

        expect(next.gridBessConnectionMw).toBe(GRID.maxBessConnectionMw);
        expect(selectGridConnectionTotalMw(next)).toBe(prev.gridPvEvacuationMw + GRID.maxBessConnectionMw);
        expect(next.gridDemandMw).toBeCloseTo(
            computeGridDemandMw(
                prev.timeOfDay,
                prev.dispatchScalePercent / 100,
                prev.gridPvEvacuationMw + GRID.maxBessConnectionMw,
            ),
            6,
        );
    });

    it('SET_TARIFF_RATE clamps the new rate and refreshes the current market price', () => {
        const prev = makeGridState({
            timeOfDay: 20,
            tariffRatesEurMwh: { 'off-peak': 80, 'mid-peak': 150, 'peak': 300 },
        });
        const { next } = applyCommand(
            prev,
            { type: 'SET_TARIFF_RATE', payload: { period: 'peak', value: TARIFF.maxRateEurMwh + 100 } },
            NOW,
        );

        expect(next.tariffRatesEurMwh.peak).toBe(TARIFF.maxRateEurMwh);
        expect(next.currentPriceEurMwh).toBe(
            getElectricityPriceEurMwh(prev.timeOfDay, next.tariffRatesEurMwh),
        );
    });

    it('TOGGLE_AUTO_ARB flips auto-arb, resets the battery to idle, and zeroes commanded power', () => {
        const prev = makeGridState({
            simulationStatus: 'paused',
            autoArbEnabled: false,
            dispatchMode: 'manual-idle',
            batteryMode: 'discharging',
            batteryPowerMw: -150,
            batteryChargeFromSolarMw: 20,
            batteryChargeFromGridMw: 5,
            batteryDischargeToLoadMw: 90,
            batteryDischargeToExportMw: 60,
        });
        const { next } = applyCommand(prev, { type: 'TOGGLE_AUTO_ARB' }, NOW);

        expect(next.autoArbEnabled).toBe(true);
        expect(next.dispatchMode).toBe('auto');
        expect(next.batteryMode).toBe('idle');
        expect(next.batteryPowerMw).toBe(0);
        expect(next.batteryChargeFromSolarMw).toBe(0);
        expect(next.batteryChargeFromGridMw).toBe(0);
        expect(next.batteryDischargeToLoadMw).toBe(0);
        expect(next.batteryDischargeToExportMw).toBe(0);
    });

    it('SET_AUTO_ARB_ENABLED sets the flag exactly to the payload idempotently', () => {
        const prev = makeGridState({
            autoArbEnabled: false,
            dispatchMode: 'manual-charge',
            batteryMode: 'charging',
            batteryPowerMw: 80,
        });
        const first = applyCommand(prev, { type: 'SET_AUTO_ARB_ENABLED', payload: true }, NOW);
        const second = applyCommand(first.next, { type: 'SET_AUTO_ARB_ENABLED', payload: true }, NOW);

        expect(first.next.autoArbEnabled).toBe(true);
        expect(first.next.dispatchMode).toBe('auto');
        expect(first.next.batteryMode).toBe('idle');
        expect(first.next.batteryPowerMw).toBe(0);
        expect(second.next.autoArbEnabled).toBe(true);
        expect(second.next.dispatchMode).toBe('auto');
        expect(second.next.batteryMode).toBe('idle');
        expect(second.next.batteryPowerMw).toBe(0);
    });

    // dispatchMode is the new single source of truth; this round-trip pins
    // that going auto → manual → auto cleanly restores `'auto'` semantics
    // (autoArbEnabled flag, dispatchMode, idle-on-takeover).
    it('auto → manual-charge → auto round-trips back to a clean auto state', () => {
        const start = makeGridState({ dispatchMode: 'auto', autoArbEnabled: true, batteryMode: 'idle' });

        const toManual = applyCommand(start, { type: 'CHARGE' }, NOW).next;
        expect(toManual.dispatchMode).toBe('manual-charge');
        expect(toManual.autoArbEnabled).toBe(false);
        expect(toManual.batteryMode).toBe('charging');

        const backToAuto = applyCommand(toManual, { type: 'TOGGLE_AUTO_ARB' }, NOW).next;
        expect(backToAuto.dispatchMode).toBe('auto');
        expect(backToAuto.autoArbEnabled).toBe(true);
        // Taking over from manual resets to idle until the next tick computes
        // the auto policy power.
        expect(backToAuto.batteryMode).toBe('idle');
        expect(backToAuto.batteryPowerMw).toBe(0);
    });
});
