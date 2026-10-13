import { describe, expect, it } from 'vitest';
import { formatSimulationTime, formatTime } from './formatTime';

describe('formatTime', () => {
    it('formats fractional hours into hh:mm', () => {
        expect(formatTime(8.5)).toBe('08:30');
        expect(formatTime(18.25)).toBe('18:15');
    });

    it('rounds values near the next hour boundary', () => {
        expect(formatTime(8.999999)).toBe('09:00');
    });

    it('wraps rounded end-of-day values to midnight', () => {
        expect(formatTime(23.9999)).toBe('00:00');
    });

    it('wraps to a 24-hour clock', () => {
        expect(formatTime(24.75)).toBe('00:45');
    });
});

describe('formatSimulationTime', () => {
    it('distinguishes days while keeping the familiar clock labels', () => {
        expect(formatSimulationTime(8.5)).toBe('D1 08:30');
        expect(formatSimulationTime(24.5)).toBe('D2 00:30');
        expect(formatSimulationTime(56.5)).toBe('D3 08:30');
    });

    it('rounds the clock and the day together at midnight', () => {
        expect(formatSimulationTime(23.9999)).toBe('D2 00:00');
        expect(formatSimulationTime(23.99999, true)).toBe('D2 00:00:00');
    });

    it('shows seconds for short windows and tooltip precision', () => {
        expect(formatSimulationTime(8 + 25 / 3600, true)).toBe('D1 08:00:25');
    });
});
