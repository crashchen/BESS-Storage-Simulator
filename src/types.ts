// ============================================================
// Shared TypeScript contracts for the utility-scale BESS project
// ============================================================

export type TariffPeriod = 'off-peak' | 'mid-peak' | 'peak';

export type SimulationStatus = 'stopped' | 'running' | 'paused';

export type BatteryMode = 'idle' | 'charging' | 'discharging';

export interface GridState {
    projectName: string;
    projectLocation: string;
    solarDcCapacityMwp: number;
    solarAcCapacityMw: number;
    batteryPowerRatingMw: number;
    batteryDurationHours: number;
    batteryEnergyCapacityMwh: number;
    gridConnectionTotalMw: number;
    gridPvEvacuationMw: number;
    gridBessConnectionMw: number;
    siteYieldKwhPerKwYear: number;

    simulationStatus: SimulationStatus;
    gridFrequencyHz: number;
    solarOutputMw: number;
    gridDemandMw: number;
    dispatchScalePercent: number;
    batterySocPercent: number;
    batteryPowerMw: number;
    batteryChargeFromSolarMw: number;
    batteryChargeFromGridMw: number;
    batteryDischargeToGridMw: number;
    solarExportMw: number;
    solarCurtailedMw: number;
    projectNetExportMw: number;
    batteryMode: BatteryMode;
    timeOfDay: number;
    timeSpeed: number;
    timestamp: number;

    tariffPeriod: TariffPeriod;
    tariffRatesEurMwh: Record<TariffPeriod, number>;
    currentPriceEurMwh: number;
    cumulativeRevenueEur: number;
    cumulativeBessMarginEur: number;
    autoArbEnabled: boolean;
}

export type BESSCommand =
    | { type: 'START_SIMULATION' }
    | { type: 'PAUSE_SIMULATION' }
    | { type: 'STOP_SIMULATION' }
    | { type: 'CHARGE' }
    | { type: 'DISCHARGE' }
    | { type: 'IDLE' }
    | { type: 'SET_DISPATCH_SCALE'; payload: number }
    | { type: 'SET_TIME_SPEED'; payload: number }
    | { type: 'SET_BESS_POWER_RATING'; payload: number }
    | { type: 'SET_BESS_ENERGY_CAPACITY'; payload: number }
    | { type: 'SET_SOLAR_AC_CAPACITY'; payload: number }
    | { type: 'SET_SOLAR_DC_CAPACITY'; payload: number }
    | { type: 'SET_GRID_PV_EVACUATION'; payload: number }
    | { type: 'SET_GRID_BESS_CONNECTION'; payload: number }
    | { type: 'SET_TARIFF_RATE'; payload: { period: TariffPeriod; value: number } }
    | { type: 'TOGGLE_AUTO_ARB' };

export interface GridSnapshot {
    t: number;
    solarMw: number;
    demandMw: number;
    batteryMw: number;
    socPercent: number;
    frequencyHz: number;
    priceEurMwh: number;
}

export interface MicrogridSceneProps {
    gridState: GridState;
}

export interface ControlPanelProps {
    gridState: GridState;
    history: GridSnapshot[];
    onCommand: (cmd: BESSCommand) => void;
}

export interface StatusHudProps {
    gridState: GridState;
}
