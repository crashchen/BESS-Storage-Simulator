import { GRID } from '../config';
import type { GridState, SceneAssetId } from '../types';
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

function gridFrequencyScore(frequencyHz: number): number {
    // Map [minFrequencyHz, maxFrequencyHz] into a 0-100 display band.
    const span = GRID.maxFrequencyHz - GRID.minFrequencyHz;
    return clampPercent(((frequencyHz - GRID.minFrequencyHz) / span) * 100);
}

function isFrequencyStressed(frequencyHz: number): boolean {
    return frequencyHz < GRID.warningFrequencyLowHz || frequencyHz > GRID.warningFrequencyHighHz;
}

export function getSceneAssetInfo(assetId: SceneAssetId, state: GridState): SceneAssetInfo {
    const bessNetPower = state.batteryDischargeToGridMw - state.batteryChargeFromSolarMw - state.batteryChargeFromGridMw;
    const stationThroughput =
        state.solarExportMw +
        state.batteryChargeFromSolarMw +
        state.batteryChargeFromGridMw +
        state.batteryDischargeToGridMw;
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
                { label: 'Grid output', value: formatMw(state.batteryDischargeToGridMw) },
            ],
            rows: [
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
                { label: 'PV path', value: formatMw(state.solarExportMw) },
                { label: 'BESS charge path', value: formatMw(bessChargeMw) },
                { label: 'BESS discharge path', value: formatMw(state.batteryDischargeToGridMw) },
            ],
            rows: [
                { label: 'PV export path', value: formatMw(state.solarExportMw) },
                { label: 'BESS charge path', value: formatMw(bessChargeMw) },
                { label: 'BESS discharge path', value: formatMw(state.batteryDischargeToGridMw) },
                { label: 'BESS interconnect cap', value: formatMw(state.gridBessConnectionMw) },
                { label: 'PV evacuation cap', value: formatMw(state.gridPvEvacuationMw) },
            ],
        };
    }

    const stressed = isFrequencyStressed(state.gridFrequencyHz);
    return {
        title: 'Grid Node',
        eyebrow: 'Utility Interconnection / Load Sink',
        status: stressed ? 'Frequency stress' : 'Stable',
        accent: stressed
            ? 'from-red-400 to-orange-300'
            : 'from-blue-300 to-emerald-300',
        description: 'Represents the grid-side connection receiving PV export and BESS discharge while setting demand pressure.',
        primary: {
            label: 'Grid frequency',
            value: `${state.gridFrequencyHz.toFixed(2)} Hz`,
        },
        meter: {
            label: 'Frequency band',
            value: stressed ? 'Outside preferred band' : 'Inside preferred band',
            percent: gridFrequencyScore(state.gridFrequencyHz),
            tone: stressed ? 'red' : 'blue',
        },
        flowRows: [
            { label: 'Demand', value: formatMw(state.gridDemandMw) },
            { label: 'Net export', value: formatMw(state.projectNetExportMw) },
            { label: 'Tariff', value: formatEurMwh(state.currentPriceEurMwh) },
        ],
        rows: [
            { label: 'Grid demand', value: formatMw(state.gridDemandMw) },
            { label: 'Project net export', value: formatMw(state.projectNetExportMw) },
            { label: 'Current tariff', value: formatEurMwh(state.currentPriceEurMwh) },
            { label: 'Tariff period', value: state.tariffPeriod },
            { label: 'Total grid connection', value: formatMw(gridConnectionMw) },
        ],
    };
}
