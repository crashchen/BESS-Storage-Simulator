import { describe, expect, it } from 'vitest';
import { shouldHoldForEveningPeak } from './autoPolicy';

describe('AUTO evening hold tariff hurdle', () => {
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
