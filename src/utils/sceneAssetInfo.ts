import type { GridState, SceneAssetId } from '../types';
import { getVisibleEnergyFlows } from './energyFlowTelemetry';
import { selectGridConnectionTotalMw } from './gridSelectors';

export interface InfoRow {
    label: string;
    value: string;
}

export interface SceneAssetInfo {
    title: string;
    eyebrow: string;
    status: string;
    accent: string;
    description: string;
    primary: InfoRow;
    meter: {
        label: string;
        value: string;
        percent: number;
        tone: 'green' | 'amber' | 'cyan' | 'red' | 'blue';
    };
    flowRows: InfoRow[];
    rows: InfoRow[];
}

function formatMw(value: number): string {
    const normalized = Math.abs(value) < 0.05 ? 0 : value;
    return `${normalized.toFixed(1)} MW`;
}

function formatMwh(value: number): string {
    return `${Math.round(value).toLocaleString()} MWh`;
}

function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}

function formatEurMwh(value: number): string {
    return `EUR ${Math.round(value)}/MWh`;
}

function batteryModeLabel(mode: GridState['batteryMode']): string {
    if (mode === 'charging') return 'Charging';
    if (mode === 'discharging') return 'Discharging';
    return 'Idle';
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

export function getSceneAssetInfo(assetId: SceneAssetId, state: GridState): SceneAssetInfo {
    const visibleFlows = getVisibleEnergyFlows(state);
    const bessDischargeTotalMw = state.batteryDischargeToLoadMw + state.batteryDischargeToExportMw;
    const bessNetPower = bessDischargeTotalMw - state.batteryChargeFromSolarMw - state.batteryChargeFromGridMw;
    const stationThroughput = visibleFlows.grossRoutedMw;
    const bessChargeMw = state.batteryChargeFromSolarMw + state.batteryChargeFromGridMw;
    const gridConnectionMw = selectGridConnectionTotalMw(state);
    const stationCapacityMw = Math.max(gridConnectionMw, state.solarAcCapacityMw + state.gridBessConnectionMw, 1);

    if (assetId === 'bess') {
        return {
            title: 'BESS Unit',
            eyebrow: 'Battery Energy Storage System',
            status: batteryModeLabel(state.batteryMode),
            accent: state.batteryMode === 'charging'
                ? 'from-emerald-400 to-cyan-300'
                : state.batteryMode === 'discharging'
                    ? 'from-amber-300 to-orange-400'
                    : 'from-slate-400 to-blue-300',
            description: 'Stores surplus PV or grid energy, then exports during peak-price or support events.',
            primary: {
                label: 'State of charge',
                value: formatPercent(state.batterySocPercent),
            },
            meter: {
                label: 'Usable energy fill',
                value: `${formatMwh((state.batterySocPercent / 100) * state.batteryEnergyCapacityMwh)} stored`,
                percent: clampPercent(state.batterySocPercent),
                tone: state.batterySocPercent < 20 ? 'red' : state.batterySocPercent < 50 ? 'amber' : 'green',
            },
            flowRows: [
                { label: 'Net power', value: formatMw(bessNetPower) },
                { label: 'Charging input', value: formatMw(bessChargeMw) },
                { label: 'Discharge output', value: formatMw(bessDischargeTotalMw) },
            ],
            rows: [
                { label: 'Charge from solar', value: formatMw(state.batteryChargeFromSolarMw) },
                { label: 'Charge from grid', value: formatMw(state.batteryChargeFromGridMw) },
                { label: 'Discharge to local load', value: formatMw(state.batteryDischargeToLoadMw) },
                { label: 'Discharge to grid export', value: formatMw(state.batteryDischargeToExportMw) },
                { label: 'Rated power', value: formatMw(state.batteryPowerRatingMw) },
                { label: 'Energy capacity', value: formatMwh(state.batteryEnergyCapacityMwh) },
            ],
        };
    }

    if (assetId === 'pcs-mv') {
        return {
            title: 'PCS / MV Station',
            eyebrow: 'Power Conversion + Medium Voltage Node',
            status: stationThroughput > 0.5 ? 'Routing power' : 'Standing by',
            accent: 'from-cyan-300 to-sky-500',
            description: 'Visualizes the site collection and step-up node where PV, BESS, and grid-side flows meet.',
            primary: {
                label: 'Gross routed flow',
                value: formatMw(stationThroughput),
            },
            meter: {
                label: 'Site bus loading',
                value: `${Math.round((stationThroughput / stationCapacityMw) * 100)}% of visual station capacity`,
                percent: clampPercent((stationThroughput / stationCapacityMw) * 100),
                tone: 'cyan',
            },
            flowRows: [
                { label: 'PV to local load', value: formatMw(visibleFlows.solarToLoadMw) },
                { label: 'PV export to grid', value: formatMw(visibleFlows.solarToExportMw) },
                { label: 'BESS charge path', value: formatMw(bessChargeMw) },
                { label: 'Grid import to site', value: formatMw(visibleFlows.gridToSiteMw) },
                { label: 'BESS discharge path', value: formatMw(bessDischargeTotalMw) },
            ],
            rows: [
                { label: 'PV to local load path', value: formatMw(visibleFlows.solarToLoadMw) },
                { label: 'PV export path', value: formatMw(visibleFlows.solarToExportMw) },
                { label: 'Solar to BESS path', value: formatMw(visibleFlows.solarToBessMw) },
                { label: 'Grid to BESS path', value: formatMw(visibleFlows.gridToBessMw) },
                { label: 'Grid import to site path', value: formatMw(visibleFlows.gridToSiteMw) },
                { label: 'BESS discharge path', value: formatMw(visibleFlows.bessToSiteMw) },
                { label: 'BESS interconnect cap', value: formatMw(state.gridBessConnectionMw) },
                { label: 'PV evacuation cap', value: formatMw(state.gridPvEvacuationMw) },
            ],
        };
    }

    const overloaded = state.gridOverloadWarning;
    return {
        title: 'Grid Node',
        eyebrow: 'Utility Interconnection / Load Sink',
        status: overloaded ? 'Import overload' : 'Balanced',
        accent: overloaded
            ? 'from-red-400 to-orange-300'
            : 'from-blue-300 to-emerald-300',
        description: 'Represents the PCC import/export boundary for the active-power-only site model.',
        primary: {
            label: overloaded ? 'Unserved overload' : 'Net grid exchange',
            value: overloaded ? formatMw(state.gridOverloadMw) : formatMw(state.projectNetExportMw),
        },
        meter: {
            label: 'PCC loading',
            value: `${Math.round((Math.max(state.gridImportMw, state.gridExportMw) / Math.max(gridConnectionMw, 1)) * 100)}% of limit`,
            percent: clampPercent((Math.max(state.gridImportMw, state.gridExportMw) / Math.max(gridConnectionMw, 1)) * 100),
            tone: overloaded ? 'red' : 'blue',
        },
        flowRows: [
            { label: 'Demand', value: formatMw(state.gridDemandMw) },
            { label: 'Import', value: formatMw(state.gridImportMw) },
            { label: 'Export', value: formatMw(state.gridExportMw) },
            { label: 'Net export', value: formatMw(state.projectNetExportMw) },
        ],
        rows: [
            { label: 'Grid demand', value: formatMw(state.gridDemandMw) },
            { label: 'Grid import', value: formatMw(state.gridImportMw) },
            { label: 'Grid export', value: formatMw(state.gridExportMw) },
            { label: 'Overload', value: formatMw(state.gridOverloadMw) },
            { label: 'Project net export', value: formatMw(state.projectNetExportMw) },
            { label: 'Current tariff', value: formatEurMwh(state.currentPriceEurMwh) },
            { label: 'Tariff period', value: state.tariffPeriod },
            { label: 'Total grid connection', value: formatMw(gridConnectionMw) },
        ],
    };
}
