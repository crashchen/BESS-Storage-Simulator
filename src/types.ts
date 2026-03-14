// ============================================================
// @Agent-Engine — Architectural Handshake
// Shared TypeScript contracts for the Microgrid BESS Simulator
// All agents MUST import from this file. No local re-definitions.
// ============================================================

// ── ToU Tariff Periods ── (European market simulation)
export type TariffPeriod = 'off-peak' | 'mid-peak' | 'peak';

/**
 * GridState — The single source of truth for the entire simulation.
 *
 * Consumed by:
 *   @Agent-3D  → drives BESS glow color, solar brightness, sun position
 *   @Agent-UI  → drives gauges, charts, status badges, economics panel
 */
export interface GridState {
    /** Grid frequency in Hz. Nominal = 50.00 ± jitter. */
    gridFrequencyHz: number;

    /** Solar PV output in kW (0 – 100). Follows time-of-day sine curve. */
    solarOutputKw: number;

    /** Consumer load demand in kW (computed from dynamic curve × scale). */
    loadDemandKw: number;

    /** User-adjustable scale factor for the dynamic load curve (50–150%). */
    loadScalePercent: number;

    /** Battery State of Charge as 0 – 100 %. */
    batterySocPercent: number;

    /** Battery power flow in kW. Positive = charging, negative = discharging. */
    batteryPowerKw: number;

    /** Current operational mode of the BESS. */
    batteryMode: BatteryMode;

    /** Fractional hour of day (0.0 – 24.0). Drives sun position & solar output. */
    timeOfDay: number;

    /** Simulation speed multiplier (1 = real-time, 60 = 1 min/sec, etc.) */
    timeSpeed: number;

    /** High-resolution timestamp (ms) of last simulation tick. */
    timestamp: number;

    // ── Economics (ToU Arbitrage) ─────────────────────────
    /** Current electricity tariff period. */
    tariffPeriod: TariffPeriod;

    /** Current electricity price in €/kWh. */
    currentPriceEurKwh: number;

    /** Cumulative revenue from BESS arbitrage (€). Positive = profit. */
    cumulativeRevenueEur: number;

    /** Whether AUTO_ARB mode is enabled. */
    autoArbEnabled: boolean;
}

/**
 * BatteryMode — Mutually exclusive operating states for the BESS.
 */
export type BatteryMode = 'idle' | 'charging' | 'discharging';

/**
 * BESSCommand — Dispatched by @Agent-UI to @Agent-Engine.
 *
 * The `dispatch(cmd)` function in `useGridSimulation` accepts these commands
 * and mutates `GridState` accordingly on the next simulation tick.
 */
export type BESSCommand =
    | { type: 'CHARGE' }
    | { type: 'DISCHARGE' }
    | { type: 'IDLE' }
    | { type: 'SET_LOAD'; payload: number }
    | { type: 'SET_TIME_SPEED'; payload: number }
    | { type: 'TOGGLE_AUTO_ARB' };

/**
 * A single snapshot for the history ring-buffer used by charts.
 */
export interface GridSnapshot {
    t: number;              // seconds since start
    solarKw: number;
    loadKw: number;
    batteryKw: number;
    socPercent: number;
    frequencyHz: number;
    priceEur: number;       // €/kWh at this tick
}

/**
 * Props contract for @Agent-3D's MicrogridScene component.
 */
export interface MicrogridSceneProps {
    gridState: GridState;
}

/**
 * Props contract for @Agent-UI's ControlPanel component.
 */
export interface ControlPanelProps {
    gridState: GridState;
    history: GridSnapshot[];
    onCommand: (cmd: BESSCommand) => void;
}

/**
 * Props contract for @Agent-UI's StatusHud component.
 */
export interface StatusHudProps {
    gridState: GridState;
}
