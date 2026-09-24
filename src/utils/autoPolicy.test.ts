import { describe, expect, it } from 'vitest';
import { getEveningPeakHoldThresholdEurMwh, shouldHoldForEveningPeak } from './autoPolicy';

describe('AUTO evening hold tariff hurdle', () => {
    it('uses the same crossover value for the displayed threshold and dispatch decision', () => {
        const rates = { 'off-peak': 80, 'mid-peak': 150, peak: 350 };
        const threshold = getEveningPeakHoldThresholdEurMwh(rates);

        expect(threshold).toBeCloseTo(178.775017, 6);
        expect(shouldHoldForEveningPeak({ ...rates, peak: threshold })).toBe(false);
        expect(shouldHoldForEveningPeak({ ...rates, peak: threshold + 0.001 })).toBe(true);
    });

    it('keeps the peak-above-shoulder guard and detects an unreachable editable threshold', () => {
        const shoulderFloor = { 'off-peak': 1000, 'mid-peak': 150, peak: 150 };
        expect(getEveningPeakHoldThresholdEurMwh(shoulderFloor)).toBe(150);
        expect(shouldHoldForEveningPeak(shoulderFloor)).toBe(false);
        expect(shouldHoldForEveningPeak({ ...shoulderFloor, peak: 150.01 })).toBe(true);

        const unreachable = { 'off-peak': -500, 'mid-peak': 1000, peak: 1000 };
        expect(getEveningPeakHoldThresholdEurMwh(unreachable)).toBeGreaterThan(1000);
        expect(shouldHoldForEveningPeak(unreachable)).toBe(false);
    });

    it.each([
        { night: 80, shoulder: 150, peak: 155, hold: false },
        { night: 80, shoulder: 150, peak: 165, hold: false },
        { night: 80, shoulder: 150, peak: 175, hold: false },
        { night: 80, shoulder: 150, peak: 177.5, hold: false },
        { night: 80, shoulder: 150, peak: 178.5, hold: false },
        { night: 80, shoulder: 150, peak: 178.8, hold: true },
        { night: 80, shoulder: 150, peak: 179, hold: true },
        { night: 80, shoulder: 150, peak: 180, hold: true },
        { night: 80, shoulder: 150, peak: 200, hold: true },
        { night: 80, shoulder: 150, peak: 350, hold: true },
        { night: 80, shoulder: 350, peak: 150, hold: false },
        { night: -40, shoulder: -10, peak: -5, hold: false },
        { night: 400, shoulder: 200, peak: 150, hold: false },
    ])('returns $hold for night $night / shoulder $shoulder / peak $peak', ({ night, shoulder, peak, hold }) => {
        expect(shouldHoldForEveningPeak({ 'off-peak': night, 'mid-peak': shoulder, peak })).toBe(hold);
    });
});
