import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusHud } from './StatusHud';
import { makeGridState } from '../test/fixtures';

describe('StatusHud', () => {
    it('renders formatted time, simulation state, and MW-scale metrics', () => {
        render(
            <StatusHud
                gridState={makeGridState({
                    simulationStatus: 'paused',
                    timeOfDay: 8.5,
                    autoArbEnabled: true,
                    gridFrequencyHz: 49.4,
                    currentPriceEurMwh: 190,
                    cumulativeRevenueEur: -2500,
                })}
            />,
        );

        expect(screen.getByText('08:30')).toBeInTheDocument();
        expect(screen.getByText('PAUSE')).toBeInTheDocument();
        expect(screen.getByText('PEAK READY')).toBeInTheDocument();
        expect(screen.getByText('49.40 Hz')).toBeInTheDocument();
        expect(screen.getByText('45 MW')).toBeInTheDocument();
        expect(screen.getByText('€190/MWh')).toBeInTheDocument();
        expect(screen.getByText('€-2500')).toBeInTheDocument();
    });
});
