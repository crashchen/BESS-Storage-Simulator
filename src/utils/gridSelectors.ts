// ============================================================
// Selectors for values derived from GridState fields.
// Kept side-effect free so they can be called from components,
// the reducer, and the tick engine without import cycles.
// ============================================================

import type { GridState } from '../types';

export function selectBatteryDurationHours(
    state: Pick<GridState, 'batteryEnergyCapacityMwh' | 'batteryPowerRatingMw'>,
): number {
    return state.batteryEnergyCapacityMwh / Math.max(state.batteryPowerRatingMw, 1e-9);
}

export function selectGridConnectionTotalMw(
    state: Pick<GridState, 'gridPvEvacuationMw' | 'gridBessConnectionMw'>,
): number {
    return state.gridPvEvacuationMw + state.gridBessConnectionMw;
}
