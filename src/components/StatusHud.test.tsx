import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusHud } from './StatusHud';
import { makeGridState } from '../test/fixtures';

describe('StatusHud', () => {
    it('renders formatted time and auto-arbitrage state', () => {
        render(
            <StatusHud
                gridState={makeGridState({
                    timeOfDay: 8.5,
                    autoArbEnabled: true,
                    gridFrequencyHz: 49.4,
                    cumulativeRevenueEur: -2.5,
                })}
            />,
        );

        expect(screen.getByText('08:30')).toBeInTheDocument();
        expect(screen.getByText('AUTO ARB')).toBeInTheDocument();
        expect(screen.getByText('49.40 Hz')).toBeInTheDocument();
        expect(screen.getByText('€-2.50')).toBeInTheDocument();
    });
});
