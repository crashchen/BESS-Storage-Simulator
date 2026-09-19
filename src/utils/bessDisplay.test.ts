import { describe, expect, it } from 'vitest';
import { AUTO_ARB, BESS } from '../config';
import type { GridState } from '../types';
import { selectBessDisplay } from './bessDisplay';
import { applyCommand } from './gridReducer';
import { createInitialGridState, simulateTick } from './tickEngine';

function runningState(overrides: Partial<GridState> = {}): GridState {
    return { ...createInitialGridState(), simulationStatus: 'running', ...overrides };
}

describe('BESS display from sampled power', () => {
    it('separates a running charge request from the zero reading before its first tick', () => {
        const requested = applyCommand(runningState(), { type: 'CHARGE' }, 1).next;
        expect(requested.batteryMode).toBe('charging');
        expect(requested.batteryPowerMw).toBe(0);
        expect(selectBessDisplay(requested)).toMatchObject({
            powerMode: 'idle',
            powerMw: 0,
            dispatchLabel: 'Manual charge',
            statusLabel: 'Idle',
            readingNote: 'No BESS transfer in the current power sample.',
        });

        const afterTick = simulateTick(requested, 0.1, 2);
        expect(afterTick.batteryPowerMw).toBeGreaterThan(0);
        expect(selectBessDisplay(afterTick)).toMatchObject({ powerMode: 'charging', readingNote: null });
    });

    it('retains paused preset power, then shows idle after an edit resets the sample', () => {
        const preset = applyCommand(createInitialGridState(), {
            type: 'APPLY_SCENARIO_PRESET', payload: 'summer-midday-surplus',
        }, 1).next;
        const snapshotBeforeDisplay = structuredClone(preset);
        expect(selectBessDisplay(preset)).toMatchObject({
            statusLabel: 'Paused snapshot',
            powerMode: 'charging',
            powerMw: preset.batteryPowerMw,
            dispatchLabel: 'Manual charge',
        });
        expect(preset).toEqual(snapshotBeforeDisplay);

        const retimed = applyCommand(preset, { type: 'SET_TIME_SPEED', payload: 480 }, 2).next;
        expect(selectBessDisplay(retimed).powerMode).toBe('charging');
        expect(retimed.batteryPowerMw).toBe(preset.batteryPowerMw);

        const edited = applyCommand(retimed, {
            type: 'SET_TARIFF_RATE', payload: { period: 'mid-peak', value: 200 },
        }, 3).next;
        expect(edited.batteryMode).toBe('charging');
        expect(edited.batteryPowerMw).toBe(0);
        expect(selectBessDisplay(edited)).toMatchObject({
            powerMode: 'idle',
            powerLabel: 'Idle',
            statusLabel: 'Paused snapshot',
            dispatchLabel: 'Manual charge',
        });
        expect(selectBessDisplay(edited).readingNote).toMatch(/time and earnings are frozen/);
    });

    it('qualifies a paused running sample without clearing it, and keeps stopped intent separate', () => {
        const requested = applyCommand(runningState(), { type: 'DISCHARGE' }, 1).next;
        const active = simulateTick(requested, 0.1, 2);
        const paused = applyCommand(active, { type: 'PAUSE_SIMULATION' }, 3).next;
        expect(selectBessDisplay(paused)).toMatchObject({
            powerMw: active.batteryPowerMw,
            powerMode: 'discharging',
            statusLabel: 'Paused snapshot',
        });

        const stopped = applyCommand(paused, { type: 'STOP_SIMULATION' }, 4).next;
        expect(selectBessDisplay(stopped)).toMatchObject({
            statusLabel: 'Stopped',
            powerMode: 'idle',
            powerMw: 0,
            dispatchLabel: 'Manual discharge',
        });
        expect(selectBessDisplay(stopped).readingNote).toMatch(/Start the simulation/);
    });

    it.each([
        { dispatchMode: 'manual-charge' as const, startSoc: 99.99, endSoc: 100, mode: 'charging', nextNote: /Battery full/ },
        { dispatchMode: 'manual-discharge' as const, startSoc: 0.01, endSoc: 0, mode: 'discharging', nextNote: /Battery empty/ },
    ])('preserves the final $mode sample when a tick reaches the SoC boundary', ({ dispatchMode, startSoc, endSoc, mode, nextNote }) => {
        const initial = runningState({ dispatchMode, batterySocPercent: startSoc });
        const energyToBoundary = Math.abs(endSoc - startSoc) / 100 * initial.batteryEnergyCapacityMwh;
        const powerMw = Math.min(initial.batteryPowerRatingMw, initial.gridBessConnectionMw);
        const hoursToBoundary = mode === 'charging'
            ? energyToBoundary / (powerMw * BESS.chargeEfficiency)
            : energyToBoundary * BESS.dischargeEfficiency / powerMw;
        // End exactly at the event; a crossing tick would include an idle remainder.
        const endOfTransfer = simulateTick(initial, hoursToBoundary * 3600 / initial.timeSpeed, 1);
        expect(endOfTransfer.batterySocPercent).toBe(endSoc);
        expect(selectBessDisplay(endOfTransfer)).toMatchObject({ powerMode: mode, readingNote: null });

        const atLimit = simulateTick(endOfTransfer, 0.1, 2);
        expect(selectBessDisplay(atLimit).powerMode).toBe('idle');
        expect(selectBessDisplay(atLimit).readingNote).toMatch(nextNote);
    });

    it.each([
        [0.049, 'idle', 0], [-0.049, 'idle', 0],
        [0.05, 'charging', 0.05], [-0.05, 'discharging', -0.05],
    ] as const)('uses the one-decimal display threshold for %s MW', (powerMw, mode, displayedPower) => {
        const display = selectBessDisplay(runningState({ batteryPowerMw: powerMw, batteryMode: 'charging' }));
        expect(display.powerMode).toBe(mode);
        expect(display.powerMw).toBe(displayedPower);
        expect(Math.abs(display.powerMw).toFixed(1)).toBe(mode === 'idle' ? '0.0' : '0.1');
    });
});

describe('BESS display policy and known constraints', () => {
    it.each([
        [{ dispatchMode: 'manual-charge', batterySocPercent: 100 }, /Battery full/],
        [{ dispatchMode: 'manual-discharge', batterySocPercent: 0 }, /Battery empty/],
        [{ dispatchMode: 'manual-idle', batterySocPercent: 100 }, /Manual idle selected/],
        [{ dispatchMode: 'auto', tariffPeriod: 'peak', batterySocPercent: AUTO_ARB.peakReserveSocPercent }, /peak reserve/],
        [{ dispatchMode: 'auto', tariffPeriod: 'off-peak', batterySocPercent: 40, solarOutputMw: 0 }, /Night reserve target met/],
        [{ dispatchMode: 'auto', tariffPeriod: 'mid-peak', batterySocPercent: 100, solarOutputMw: 200, gridDemandMw: 100 }, /Battery full/],
        [{ dispatchMode: 'manual-charge', gridBessConnectionMw: 0 }, /transfer capacity is 0 MW/],
    ] satisfies [Partial<GridState>, RegExp][])('describes a known zero-power condition: %j', (overrides, note) => {
        expect(selectBessDisplay(runningState(overrides)).readingNote).toMatch(note);
    });

    it.each([
        { dispatchMode: 'manual-discharge', batterySocPercent: 100 },
        { dispatchMode: 'manual-charge', batterySocPercent: 0 },
        { dispatchMode: 'manual-discharge', batterySocPercent: AUTO_ARB.peakReserveSocPercent, tariffPeriod: 'peak' },
        { dispatchMode: 'auto', tariffPeriod: 'peak', currentPriceEurMwh: -45 },
    ] satisfies Partial<GridState>[])('does not infer a restriction from unrelated SoC or price: %j', (overrides) => {
        expect(selectBessDisplay(runningState(overrides)).readingNote).toBe('No BESS transfer in the current power sample.');
    });

    it('reports policy separately when a PCC-constrained charge settles at zero', () => {
        const constrained = simulateTick(runningState({
            dispatchMode: 'manual-charge',
            timeOfDay: 19.4,
            dispatchScalePercent: 150,
        }), 0.1, 1);
        expect(constrained.gridOverloadMw).toBeGreaterThan(0);
        expect(constrained.batteryPowerMw).toBe(0);
        expect(selectBessDisplay(constrained)).toMatchObject({
            powerMode: 'idle',
            dispatchLabel: 'Manual charge',
            readingNote: 'No BESS transfer in the current power sample.',
        });
        expect(selectBessDisplay(constrained).policyText).toMatch(/requests charging/);
    });
});
