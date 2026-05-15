import { describe, expect, it } from 'vitest';
import { formatTime } from './formatTime';

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
