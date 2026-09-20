import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusHud } from './StatusHud';
import { makeGridState } from '../test/fixtures';
import { applyCommand } from '../utils/gridReducer';
import { createInitialGridState } from '../utils/tickEngine';

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

    it('keeps manual intent distinct from paused and zero-power operation', () => {
        const preset = applyCommand(createInitialGridState(), {
            type: 'APPLY_SCENARIO_PRESET', payload: 'negative-price-charge',
        }, 1).next;
        const { rerender } = render(<StatusHud gridState={preset} />);
        expect(screen.getByText('PAUSE')).toBeInTheDocument();
        expect(screen.getByLabelText('Selected dispatch: Manual charge')).toBeInTheDocument();
        expect(screen.getByLabelText('BESS power: Paused snapshot, Charging, 70.0 MW')).toHaveTextContent('CHARGING SNAPSHOT');

        const edited = applyCommand(preset, { type: 'SET_BESS_POWER_RATING', payload: 120 }, 2).next;
        rerender(<StatusHud gridState={edited} />);
        expect(screen.getByLabelText('Selected dispatch: Manual charge')).toBeInTheDocument();
        expect(screen.getByLabelText('BESS power: Paused snapshot, Idle, 0.0 MW')).toHaveTextContent('IDLE SNAPSHOT');
        expect(screen.queryByText('CHARGING SNAPSHOT')).not.toBeInTheDocument();
    });

    it('shows actual AUTO transfer direction even when the legacy mode is stale', () => {
        render(<StatusHud gridState={makeGridState({ batteryMode: 'charging', batteryPowerMw: -12 })} />);
        expect(screen.getByText('AUTO')).toBeInTheDocument();
        expect(screen.getByLabelText('BESS power: Running, Discharging, 12.0 MW')).toHaveTextContent('DISCHARGING');
    });
});
