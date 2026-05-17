import { BESS, GRID, SIMULATION, SOLAR, TARIFF } from './config';
import type { BatteryMode, ScenarioPresetId, SimulationStatus, TariffPeriod } from './types';

export interface ScenarioPreset {
    id: ScenarioPresetId;
    title: string;
    shortLabel: string;
    accentClass: string;
    description: string;
    operatorCue: string;
    state: {
        simulationStatus: SimulationStatus;
        timeOfDay: number;
        timeSpeed: number;
        batterySocPercent: number;
        batteryMode: BatteryMode;
        batteryPowerMw: number;
        autoArbEnabled: boolean;
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
        operatorCue: 'Use this to explain solar-to-storage flow and curtailment avoidance.',
        state: {
            simulationStatus: 'paused',
            timeOfDay: 12.5,
            timeSpeed: SIMULATION.defaultTimeSpeed,
            batterySocPercent: 38,
            batteryMode: 'charging',
            batteryPowerMw: 60,
            autoArbEnabled: false,
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
        operatorCue: 'Use this to show BESS discharge pacing and high-price project revenue.',
        state: {
            simulationStatus: 'paused',
            timeOfDay: 19.15,
            timeSpeed: SIMULATION.defaultTimeSpeed,
            batterySocPercent: 88,
            batteryMode: 'discharging',
            batteryPowerMw: -145,
            autoArbEnabled: false,
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
        operatorCue: 'Use this to explain why charging can create value when market prices go below zero.',
        state: {
            simulationStatus: 'paused',
            timeOfDay: 2,
            timeSpeed: SIMULATION.defaultTimeSpeed,
            batterySocPercent: 24,
            batteryMode: 'charging',
            batteryPowerMw: 70,
            autoArbEnabled: false,
            dispatchScalePercent: 75,
            tariffRatesEurMwh: {
                ...TARIFF.defaultRatesEurMwh,
                'off-peak': -45,
            },
        },
    },
    {
        id: 'grid-stress-lockout',
        title: 'Grid Stress Lockout',
        shortLabel: 'Grid Stress',
        accentClass: 'border-orange-400/40 bg-orange-950/20 hover:bg-orange-900/25',
        description: 'A heavy evening deficit pushes frequency below the warning band, so charging should stay locked out.',
        operatorCue: 'Use this to demonstrate the frequency vignette and why manual charging is unsafe under stress.',
        state: {
            simulationStatus: 'paused',
            timeOfDay: 19.4,
            timeSpeed: SIMULATION.defaultTimeSpeed,
            batterySocPercent: 34,
            batteryMode: 'idle',
            batteryPowerMw: 0,
            autoArbEnabled: false,
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
