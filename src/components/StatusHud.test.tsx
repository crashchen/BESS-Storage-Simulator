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
                    dispatchMode: 'auto',
                    currentPriceEurMwh: 190,
                    cumulativeRevenueEur: -2500,
                })}
            />,
        );

        expect(screen.getByText('08:30')).toBeInTheDocument();
        expect(screen.getByText('PAUSE')).toBeInTheDocument();
        expect(screen.getByText('AUTO')).toBeInTheDocument();
        // Units are in responsive-hidden spans, so text is split across elements
        expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '45 MW')).toBeInTheDocument();
        expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '€190/MWh')).toBeInTheDocument();
        expect(screen.queryByText(/Hz/)).not.toBeInTheDocument();
        expect(screen.getByText('€-2500')).toBeInTheDocument();
    });
});
