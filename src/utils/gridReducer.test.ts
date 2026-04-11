import { describe, expect, it } from 'vitest';
import { BESS, GRID, SIMULATION, SOLAR, TARIFF } from '../config';
import { makeGridState } from '../test/fixtures';
import { applyCommand } from './gridReducer';
import { selectBatteryDurationHours, selectGridConnectionTotalMw } from './gridSelectors';
import { computeGridDemandMw, computeSolarOutputMw, getElectricityPriceEurMwh } from './simulationModel';
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

    it('STOP_SIMULATION returns a fresh initial state and requests history/timer/frame resets', () => {
        const prev = makeGridState({
            simulationStatus: 'running',
            batterySocPercent: 25,
            cumulativeRevenueEur: 99999,
        });
        const { next, sideEffects } = applyCommand(prev, { type: 'STOP_SIMULATION' }, NOW);

        expect(next).toEqual(createInitialGridState(NOW));
        expect(sideEffects).toEqual({
            resetHistory: true,
            resetTimerRefs: true,
            resetFrameRef: true,
        });
    });

    it('CHARGE switches to charging mode and disables auto-arb', () => {
        const prev = makeGridState({ batteryMode: 'idle', autoArbEnabled: true });
        const { next, sideEffects } = applyCommand(prev, { type: 'CHARGE' }, NOW);

        expect(next.batteryMode).toBe('charging');
        expect(next.autoArbEnabled).toBe(false);
        expect(sideEffects).toEqual({});
    });

    it('DISCHARGE switches to discharging mode and disables auto-arb', () => {
        const prev = makeGridState({ batteryMode: 'idle', autoArbEnabled: true });
        const { next, sideEffects } = applyCommand(prev, { type: 'DISCHARGE' }, NOW);

        expect(next.batteryMode).toBe('discharging');
        expect(next.autoArbEnabled).toBe(false);
        expect(sideEffects).toEqual({});
    });

    it('IDLE switches to idle mode and disables auto-arb', () => {
        const prev = makeGridState({ batteryMode: 'charging', autoArbEnabled: true });
        const { next, sideEffects } = applyCommand(prev, { type: 'IDLE' }, NOW);

        expect(next.batteryMode).toBe('idle');
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
            autoArbEnabled: false,
            batteryMode: 'discharging',
            batteryPowerMw: -150,
        });
        const { next } = applyCommand(prev, { type: 'TOGGLE_AUTO_ARB' }, NOW);

        expect(next.autoArbEnabled).toBe(true);
        expect(next.batteryMode).toBe('idle');
        expect(next.batteryPowerMw).toBe(0);
    });

    it('SET_AUTO_ARB_ENABLED sets the flag exactly to the payload idempotently', () => {
        const prev = makeGridState({ autoArbEnabled: false, batteryMode: 'charging', batteryPowerMw: 80 });
        const first = applyCommand(prev, { type: 'SET_AUTO_ARB_ENABLED', payload: true }, NOW);
        const second = applyCommand(first.next, { type: 'SET_AUTO_ARB_ENABLED', payload: true }, NOW);

        expect(first.next.autoArbEnabled).toBe(true);
        expect(first.next.batteryMode).toBe('idle');
        expect(first.next.batteryPowerMw).toBe(0);
        expect(second.next.autoArbEnabled).toBe(true);
        expect(second.next.batteryMode).toBe('idle');
        expect(second.next.batteryPowerMw).toBe(0);
    });
});
