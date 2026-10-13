import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TelemetryChart } from './TelemetryChart';
import type { GridSnapshot } from '../types';

// jsdom has no chart layout. Pin the numeric-axis contract here; real SVG
// spacing and responsive layout are checked in the browser evidence script.
vi.mock('recharts', () => {
    const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
    const Empty = () => null;
    return {
        ResponsiveContainer: Container, LineChart: Container,
        Line: Empty, YAxis: Empty, CartesianGrid: Empty, Legend: Empty, ReferenceLine: Empty,
        XAxis: (props: { type: string; domain: string[]; tickFormatter: (v: number) => string }) => (
            <div data-testid="axis" data-type={props.type} data-domain={props.domain.join(',')}>
                {props.tickFormatter(24 + 25 / 3600)}
            </div>
        ),
        Tooltip: ({ labelFormatter }: { labelFormatter: (v: number) => string }) => (
            <div data-testid="tooltip">{labelFormatter(24 + 25 / 3600)}</div>
        ),
    };
});

const snapshot = (t: number): GridSnapshot => ({
    t, solarMw: 0, demandMw: 0, batteryMw: 0, socPercent: 40,
    gridImportMw: 0, gridExportMw: 0, priceEurMwh: 80,
});

describe('TelemetryChart', () => {
    it('uses a numeric data extent instead of equally-spaced categories', () => {
        render(<TelemetryChart history={[snapshot(23.9), snapshot(24), snapshot(25.5)]} />);
        expect(screen.getByTestId('axis')).toHaveAttribute('data-type', 'number');
        expect(screen.getByTestId('axis')).toHaveAttribute('data-domain', 'dataMin,dataMax');
        expect(screen.getByTestId('axis')).toHaveTextContent('D2 00:00');
        expect(screen.getByTestId('tooltip')).toHaveTextContent('D2 00:00:25');
    });

    it.each([30, 75, 240, 599])('displays seconds for a %is slow-speed window', (seconds) => {
        render(<TelemetryChart history={[snapshot(0), snapshot(seconds / 3600)]} />);
        expect(screen.getByTestId('axis').textContent).toBe('D2 00:00:25');
    });

    it('switches to minute labels at a ten-minute window', () => {
        render(<TelemetryChart history={[snapshot(0), snapshot(10 / 60)]} />);
        expect(screen.getByTestId('axis').textContent).toBe('D2 00:00');
    });
});
