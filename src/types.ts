// ============================================================
// Shared TypeScript contracts for the utility-scale BESS project
// ============================================================

export type TariffPeriod = 'off-peak' | 'mid-peak' | 'peak';

export type SimulationStatus = 'stopped' | 'running' | 'paused';

export type BatteryMode = 'idle' | 'charging' | 'discharging';

export type DispatchMode = 'auto' | 'manual-charge' | 'manual-discharge' | 'manual-idle';

export type SceneAssetId = 'bess' | 'pcs-mv' | 'grid-node';

export type ScenarioPresetId =
    | 'summer-midday-surplus'
    | 'evening-peak-discharge'
    | 'negative-price-charge'
    | 'grid-stress-lockout';

export interface GridState {
    projectName: string;
    projectLocation: string;
    solarDcCapacityMwp: number;
    solarAcCapacityMw: number;
    batteryPowerRatingMw: number;
    batteryEnergyCapacityMwh: number;
    gridPvEvacuationMw: number;
    gridBessConnectionMw: number;
    siteYieldKwhPerKwYear: number;

    simulationStatus: SimulationStatus;
    solarOutputMw: number;
    gridDemandMw: number;
    dispatchScalePercent: number;
    batterySocPercent: number;
    batteryPowerMw: number;
    batteryChargeFromSolarMw: number;
    batteryChargeFromGridMw: number;
    /** BESS energy serving local site demand. Combined with
     * `batteryDischargeToExportMw` it equals total discharge. */
    batteryDischargeToLoadMw: number;
    /** BESS energy flowing through the PCC out to the grid. */
    batteryDischargeToExportMw: number;
    solarExportMw: number;
    solarCurtailedMw: number;
    gridImportMw: number;
    gridExportMw: number;
    gridOverloadMw: number;
    gridOverloadWarning: boolean;
    projectNetExportMw: number;
    batteryMode: BatteryMode;
    dispatchMode: DispatchMode;
    timeOfDay: number;
    timeSpeed: number;
    timestamp: number;

    tariffPeriod: TariffPeriod;
    tariffRatesEurMwh: Record<TariffPeriod, number>;
    currentPriceEurMwh: number;
    cumulativeRevenueEur: number;
    cumulativeBessMarginEur: number;
    // Auditable breakdowns:
    //   Project P&L = solarExportRevenue + bessDischargeRevenue − bessGridChargeCost
    //   BESS Margin = bessDischargeRevenue − bessGridChargeCost − solarOpportunityCost
    cumulativeSolarExportRevenueEur: number;
    cumulativeBessDischargeRevenueEur: number;
    cumulativeBessGridChargeCostEur: number;
    cumulativeSolarOpportunityCostEur: number;
}

export type BESSCommand =
    | { type: 'START_SIMULATION' }
    | { type: 'PAUSE_SIMULATION' }
    | { type: 'STOP_SIMULATION' }
    | { type: 'RESET_SIMULATION' }
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
    | { type: 'SET_DISPATCH_MODE'; payload: DispatchMode }
    | { type: 'APPLY_SCENARIO_PRESET'; payload: ScenarioPresetId };

export interface GridSnapshot {
    t: number;
    solarMw: number;
    demandMw: number;
    batteryMw: number;
    socPercent: number;
    gridImportMw: number;
    gridExportMw: number;
    priceEurMwh: number;
}

export interface MicrogridSceneProps {
    gridState: GridState;
    selectedAssetId?: SceneAssetId | null;
    hoveredAssetId?: SceneAssetId | null;
    onAssetHover?: (assetId: SceneAssetId | null) => void;
    onAssetSelect?: (assetId: SceneAssetId) => void;
}

export interface ControlPanelProps {
    gridState: GridState;
    history: GridSnapshot[];
    onCommand: (cmd: BESSCommand) => void;
}

export interface StatusHudProps {
    gridState: GridState;
}
