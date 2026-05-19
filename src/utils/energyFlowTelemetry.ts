import type { GridState } from '../types';

type FlowSource = Pick<
    GridState,
    | 'solarOutputMw'
    | 'solarCurtailedMw'
    | 'batteryChargeFromSolarMw'
    | 'batteryChargeFromGridMw'
    | 'batteryDischargeToGridMw'
    | 'gridImportMw'
>;

export interface VisibleEnergyFlows {
    solarToBessMw: number;
    solarToSiteMw: number;
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

    // `solarExportMw` is only the post-demand export. For 3D storytelling we
    // also need PV that is serving local demand, otherwise PV appears inactive
    // whenever it is generated and consumed immediately at the site node.
    const solarToSiteMw = positive(
        state.solarOutputMw - state.batteryChargeFromSolarMw - state.solarCurtailedMw,
    );

    // Grid import can either charge the battery or serve residual local demand.
    // Render both routes separately so grid support remains visible even when
    // the BESS is not charging.
    const gridToSiteMw = positive(state.gridImportMw - state.batteryChargeFromGridMw);

    return {
        solarToBessMw,
        solarToSiteMw,
        bessToSiteMw,
        gridToBessMw,
        gridToSiteMw,
        grossRoutedMw: solarToBessMw + solarToSiteMw + bessToSiteMw + gridToBessMw + gridToSiteMw,
    };
}
