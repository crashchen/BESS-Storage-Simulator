import type { GridState } from '../types';

type FlowSource = Pick<
    GridState,
    | 'solarOutputMw'
    | 'gridDemandMw'
    | 'solarExportMw'
    | 'solarCurtailedMw'
    | 'batteryChargeFromSolarMw'
    | 'batteryChargeFromGridMw'
    | 'batteryDischargeToGridMw'
    | 'gridImportMw'
>;

export interface VisibleEnergyFlows {
    solarToBessMw: number;
    solarToLoadMw: number;
    solarToExportMw: number;
    bessToSiteMw: number;
    gridToBessMw: number;
    gridToSiteMw: number;
    grossRoutedMw: number;
}

function positive(value: number): number {
    return Math.max(0, Math.abs(value) < 0.05 ? 0 : value);
}

export function getVisibleEnergyFlows(state: FlowSource): VisibleEnergyFlows {
    const solarToBessMw = positive(state.batteryChargeFromSolarMw);
    const gridToBessMw = positive(state.batteryChargeFromGridMw);
    const bessToSiteMw = positive(state.batteryDischargeToGridMw);

    // Keep local PV consumption and grid export visually separate: they share
    // the PV source, but tell different stories in the 3D scene.
    const solarToLoadMw = positive(Math.min(state.solarOutputMw, state.gridDemandMw));
    const solarToExportMw = positive(state.solarExportMw);

    // Grid import can either charge the battery or serve residual local demand.
    // Render both routes separately so grid support remains visible even when
    // the BESS is not charging.
    const gridToSiteMw = positive(state.gridImportMw - state.batteryChargeFromGridMw);

    return {
        solarToBessMw,
        solarToLoadMw,
        solarToExportMw,
        bessToSiteMw,
        gridToBessMw,
        gridToSiteMw,
        grossRoutedMw:
            solarToBessMw + solarToLoadMw + solarToExportMw + bessToSiteMw + gridToBessMw + gridToSiteMw,
    };
}
