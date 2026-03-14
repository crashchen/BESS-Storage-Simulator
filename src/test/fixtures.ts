import type { GridState } from '../types';

export function makeGridState(overrides: Partial<GridState> = {}): GridState {
    return {
        gridFrequencyHz: 50,
        solarOutputKw: 42,
        loadDemandKw: 55,
        loadScalePercent: 100,
        batterySocPercent: 65,
        batteryPowerKw: 0,
        batteryMode: 'idle',
        timeOfDay: 8.5,
        timeSpeed: 500,
        timestamp: 0,
        tariffPeriod: 'mid-peak',
        currentPriceEurKwh: 0.15,
        cumulativeRevenueEur: 12.34,
        autoArbEnabled: false,
        ...overrides,
    };
}
