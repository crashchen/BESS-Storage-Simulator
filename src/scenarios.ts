import { BESS, GRID, SIMULATION, SOLAR, TARIFF } from './config';
import type { DispatchMode, ScenarioPresetId, SimulationStatus, TariffPeriod } from './types';

export interface ScenarioPreset {
    id: ScenarioPresetId;
    title: string;
    shortLabel: string;
    accentClass: string;
    description: string;
    expectedFlow: string;
    operatorCue: string;
    /** A preset declares dispatch intent + the scene state needed to load the
     * narrative; the reducer derives `batteryMode` / `autoArbEnabled` from
     * `dispatchMode` + `sign(batteryPowerMw)` so presets can't drift out of
     * the dispatch contract. */
    state: {
        simulationStatus: SimulationStatus;
        timeOfDay: number;
        timeSpeed: number;
        batterySocPercent: number;
        batteryPowerMw: number;
        dispatchMode: DispatchMode;
        dispatchScalePercent: number;
        tariffRatesEurMwh: Record<TariffPeriod, number>;
        solarAcCapacityMw?: number;
        solarDcCapacityMwp?: number;
        gridPvEvacuationMw?: number;
        gridBessConnectionMw?: number;
        batteryPowerRatingMw?: number;
        batteryEnergyCapacityMwh?: number;
    };
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
    {
        id: 'summer-midday-surplus',
        title: 'Summer Midday Surplus',
        shortLabel: 'Solar Surplus',
        accentClass: 'border-yellow-400/40 bg-yellow-950/20 hover:bg-yellow-900/25',
        description: 'Bright midday PV exceeds local demand, so BESS absorbs solar surplus instead of curtailing it.',
        expectedFlow: 'PV surplus → BESS, residual PV → Grid, no curtailment.',
        operatorCue: 'Use this to explain solar-to-storage flow and curtailment avoidance.',
        state: {
            simulationStatus: 'paused',
            timeOfDay: 12.5,
            timeSpeed: SIMULATION.defaultTimeSpeed,
            batterySocPercent: 38,
            batteryPowerMw: 60,
            dispatchMode: 'manual-charge',
            dispatchScalePercent: 65,
            tariffRatesEurMwh: TARIFF.defaultRatesEurMwh,
            solarAcCapacityMw: 140,
            solarDcCapacityMwp: 185,
            gridPvEvacuationMw: GRID.pvEvacuationMw,
            gridBessConnectionMw: GRID.bessConnectionMw,
        },
    },
    {
        id: 'evening-peak-discharge',
        title: 'Evening Peak Discharge',
        shortLabel: 'Peak Export',
        accentClass: 'border-red-400/40 bg-red-950/20 hover:bg-red-900/25',
        description: 'Demand and tariff both peak after sunset, so the charged battery supports the grid.',
        expectedFlow: 'BESS → Grid during the €350/MWh peak window.',
        operatorCue: 'Use this to show BESS discharge pacing and high-price project revenue.',
        state: {
            simulationStatus: 'paused',
            timeOfDay: 19.15,
            timeSpeed: SIMULATION.defaultTimeSpeed,
            batterySocPercent: 88,
            batteryPowerMw: -145,
            dispatchMode: 'manual-discharge',
            dispatchScalePercent: 115,
            tariffRatesEurMwh: TARIFF.defaultRatesEurMwh,
            solarAcCapacityMw: SOLAR.acCapacityMw,
            solarDcCapacityMwp: SOLAR.dcCapacityMwp,
        },
    },
    {
        id: 'negative-price-charge',
        title: 'Negative Price Charge',
        shortLabel: 'Negative Price',
        accentClass: 'border-emerald-400/40 bg-emerald-950/20 hover:bg-emerald-900/25',
        description: 'Overnight prices turn negative, making grid charging economically attractive.',
        expectedFlow: 'Grid → BESS while the off-peak tariff is negative.',
        operatorCue: 'Use this to explain why charging can create value when market prices go below zero.',
        state: {
            simulationStatus: 'paused',
            timeOfDay: 2,
            timeSpeed: SIMULATION.defaultTimeSpeed,
            batterySocPercent: 24,
            batteryPowerMw: 70,
            dispatchMode: 'manual-charge',
            dispatchScalePercent: 75,
            tariffRatesEurMwh: {
                ...TARIFF.defaultRatesEurMwh,
                'off-peak': -45,
            },
        },
    },
    {
        id: 'grid-stress-lockout',
        title: 'PCC Import Overload',
        shortLabel: 'Import Limit',
        accentClass: 'border-orange-400/40 bg-orange-950/20 hover:bg-orange-900/25',
        description: 'A heavy evening deficit exceeds the shared PCC import limit in the active-power-only model.',
        expectedFlow: 'Grid import clamps at the PCC limit and the Grid Node surfaces an overload warning.',
        operatorCue: 'Use this to explain that local deficits become grid import, not simulated frequency collapse.',
        state: {
            simulationStatus: 'paused',
            timeOfDay: 19.4,
            timeSpeed: SIMULATION.defaultTimeSpeed,
            batterySocPercent: 34,
            batteryPowerMw: 0,
            dispatchMode: 'manual-idle',
            dispatchScalePercent: 150,
            tariffRatesEurMwh: TARIFF.defaultRatesEurMwh,
            solarAcCapacityMw: SOLAR.acCapacityMw,
            solarDcCapacityMwp: SOLAR.dcCapacityMwp,
            batteryPowerRatingMw: BESS.defaultPowerRatingMw,
            batteryEnergyCapacityMwh: BESS.defaultEnergyCapacityMwh,
        },
    },
];

export const SCENARIO_PRESETS_BY_ID = Object.fromEntries(
    SCENARIO_PRESETS.map((preset) => [preset.id, preset]),
) as Record<ScenarioPresetId, ScenarioPreset>;
