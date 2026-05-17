import type { GridState, SceneAssetId } from '../types';

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

export function getSceneAssetInfo(assetId: SceneAssetId, state: GridState): SceneAssetInfo {
    const bessNetPower = state.batteryDischargeToGridMw - state.batteryChargeFromSolarMw - state.batteryChargeFromGridMw;
    const stationThroughput =
        state.solarExportMw +
        state.batteryChargeFromSolarMw +
        state.batteryChargeFromGridMw +
        state.batteryDischargeToGridMw;

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
            rows: [
                { label: 'State of charge', value: formatPercent(state.batterySocPercent) },
                { label: 'Net battery power', value: formatMw(bessNetPower) },
                { label: 'Charge from solar', value: formatMw(state.batteryChargeFromSolarMw) },
                { label: 'Charge from grid', value: formatMw(state.batteryChargeFromGridMw) },
                { label: 'Discharge to grid', value: formatMw(state.batteryDischargeToGridMw) },
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
            rows: [
                { label: 'Gross routed flow', value: formatMw(stationThroughput) },
                { label: 'PV export path', value: formatMw(state.solarExportMw) },
                { label: 'BESS charge path', value: formatMw(state.batteryChargeFromSolarMw + state.batteryChargeFromGridMw) },
                { label: 'BESS discharge path', value: formatMw(state.batteryDischargeToGridMw) },
                { label: 'BESS interconnect cap', value: formatMw(state.gridBessConnectionMw) },
                { label: 'PV evacuation cap', value: formatMw(state.gridPvEvacuationMw) },
            ],
        };
    }

    return {
        title: 'Grid Node',
        eyebrow: 'Utility Interconnection / Load Sink',
        status: state.gridFrequencyHz < 49.5 || state.gridFrequencyHz > 50.5 ? 'Frequency stress' : 'Stable',
        accent: state.gridFrequencyHz < 49.5 || state.gridFrequencyHz > 50.5
            ? 'from-red-400 to-orange-300'
            : 'from-blue-300 to-emerald-300',
        description: 'Represents the grid-side connection receiving PV export and BESS discharge while setting demand pressure.',
        rows: [
            { label: 'Grid demand', value: formatMw(state.gridDemandMw) },
            { label: 'Project net export', value: formatMw(state.projectNetExportMw) },
            { label: 'Grid frequency', value: `${state.gridFrequencyHz.toFixed(2)} Hz` },
            { label: 'Current tariff', value: formatEurMwh(state.currentPriceEurMwh) },
            { label: 'Tariff period', value: state.tariffPeriod },
            { label: 'Total grid connection', value: formatMw(state.gridPvEvacuationMw + state.gridBessConnectionMw) },
        ],
    };
}
