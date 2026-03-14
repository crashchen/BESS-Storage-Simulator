// ============================================================
// @Agent-Engine — Core Simulation Hook (Physics + Economics)
//
// Physics:
//   1. Strict active power balance (P_solar = P_load + P_bess)
//   2. Primary frequency control via droop characteristic
//   3. Hard SoC constraints with forced IDLE at bounds
//
// Economics (ToU Arbitrage):
//   4. Time-of-Use electricity pricing (European market)
//   5. Cumulative revenue tracking (sell high, buy low)
//   6. Smart AUTO_ARB with priority-based state machine
//
// NEW — Phase 7:
//   7. Dynamic "double hump" load curve (realistic human behavior)
//   8. Priority-based AUTO_ARB: solar self-consumption → peak sell
//      → off-peak buy → idle
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BESSCommand, GridSnapshot, GridState, BatteryMode, TariffPeriod } from '../types';

// ── Physical constants ────────────────────────────────────────
const F_NOMINAL_HZ = 50.0;
const DROOP_K = 0.012;
const FREQ_NOISE_SIGMA = 0.015;
const F_MIN_HZ = 47.5;
const F_MAX_HZ = 52.0;

const SOLAR_PEAK_KW = 85;
const BATTERY_CAPACITY_KWH = 200;
const BATTERY_MAX_POWER_KW = 50;
const SOC_MIN = 0.0;
const SOC_MAX = 100.0;

// ── Grid Protection & Headroom Management ─────────────────────
const FREQ_CHARGE_LOCKOUT_HZ = 49.90; // suspend grid charging below this
const NIGHT_TARGET_SOC = 40.0;        // off-peak only charges to 40% (keep 60% for solar)

const HISTORY_MAX = 200;
const SNAPSHOT_INTERVAL_MS = 400;

// ── Dynamic Load Curve Constants ──────────────────────────────
// "Double Hump" residential/commercial load profile
const LOAD_BASE_KW = 30;         // overnight base load
const LOAD_MORNING_PEAK_KW = 60; // morning peak at ~08:00
const LOAD_EVENING_PEAK_KW = 90; // evening peak at ~19:00

// ── ToU Pricing (European market simulation) ──────────────────
const TOU_RATES: Record<TariffPeriod, number> = {
    'off-peak': 0.08,
    'mid-peak': 0.15,
    'peak': 0.35,
};

function getTariffPeriod(tod: number): TariffPeriod {
    if (tod < 6) return 'off-peak';
    if (tod < 18) return 'mid-peak';
    if (tod < 23) return 'peak';
    return 'off-peak';
}

function getElectricityPrice(tod: number): number {
    return TOU_RATES[getTariffPeriod(tod)];
}

// ── Helpers ───────────────────────────────────────────────────

/** Sine-based solar output: 0 at night, peaks at noon. */
function computeSolarOutput(timeOfDay: number): number {
    if (timeOfDay < 5.5 || timeOfDay > 19.5) return 0;
    const noon = 12.5;
    const halfSpan = 7;
    const t = (timeOfDay - noon) / halfSpan;
    return Math.max(0, SOLAR_PEAK_KW * Math.cos(t * Math.PI * 0.5));
}

/**
 * Dynamic "Double Hump" load curve.
 *
 * Models realistic daily consumption:
 *   - Night base:    ~30 kW  (23:00 – 05:00)
 *   - Morning peak:  ~60 kW  (centered at 08:00, σ ≈ 1.5h)
 *   - Daytime trough: ~35 kW (12:00 – 15:00)
 *   - Evening peak:  ~90 kW  (centered at 19:00, σ ≈ 2h)
 *
 * Uses superposition of two Gaussian humps on a base load.
 * `scaleFactor` is a user-adjustable multiplier (default 1.0).
 */
function computeLoadDemand(timeOfDay: number, scaleFactor: number): number {
    // Gaussian hump: A * exp(-(t - μ)² / (2σ²))
    const morningHump = (LOAD_MORNING_PEAK_KW - LOAD_BASE_KW) *
        Math.exp(-Math.pow(timeOfDay - 8.0, 2) / (2 * 1.5 * 1.5));

    const eveningHump = (LOAD_EVENING_PEAK_KW - LOAD_BASE_KW) *
        Math.exp(-Math.pow(timeOfDay - 19.0, 2) / (2 * 2.0 * 2.0));

    const rawLoad = LOAD_BASE_KW + morningHump + eveningHump;
    return Math.max(0, rawLoad * scaleFactor);
}

/** Small Gaussian measurement noise (Box-Muller). */
function gaussianNoise(sigma: number): number {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

// ── Smart AUTO_ARB State Machine ──────────────────────────────
//
// Priority-based decision tree (strict ordering):
//
//   P1. ABSORB FREE SOLAR  — If solar > load AND SoC < 100% → CHARGE
//       (Never waste free energy, regardless of tariff period)
//
//   P2. PEAK SHAVING       — If Peak tariff AND SoC > 0% → DISCHARGE
//       (Sell stored energy at €0.35/kWh to cover expensive load)
//
//   P3. BUY LOW / GRID CHG — If Off-Peak AND SoC < NIGHT_TARGET_SOC → CHARGE
//       (Buy cheap grid energy, but ONLY to 40% — reserve 60% for free solar)
//
//   P4. IDLE               — Otherwise do nothing.
//
function autoArbDecision(
    pSolar: number,
    pLoad: number,
    soc: number,
    tariff: TariffPeriod,
): BatteryMode {
    const hasSurplus = pSolar > pLoad;
    const hasDeficit = pLoad > pSolar;

    // Priority 1: Absorb free solar surplus
    if (hasSurplus && soc < SOC_MAX) {
        return 'charging';
    }

    // Priority 2: Peak shaving / sell high
    if (tariff === 'peak' && hasDeficit && soc > SOC_MIN) {
        return 'discharging';
    }

    // Priority 3: Grid charge at off-peak — ONLY to NIGHT_TARGET_SOC (40%)
    // Reserves 60% capacity for noon solar absorption
    if (tariff === 'off-peak' && soc < NIGHT_TARGET_SOC) {
        return 'charging';
    }

    // Priority 4: Idle
    return 'idle';
}

// ── Pure physics + economics tick ─────────────────────────────

const INITIAL_TIME_OF_DAY = 8.0;
const INITIAL_GRID_STATE: GridState = {
    gridFrequencyHz: F_NOMINAL_HZ,
    solarOutputKw: computeSolarOutput(INITIAL_TIME_OF_DAY),
    loadDemandKw: computeLoadDemand(INITIAL_TIME_OF_DAY, 1.0),
    loadScalePercent: 100,
    batterySocPercent: 65,
    batteryPowerKw: 0,
    batteryMode: 'idle',
    timeOfDay: INITIAL_TIME_OF_DAY,
    timeSpeed: 500,
    timestamp: 0,
    tariffPeriod: getTariffPeriod(INITIAL_TIME_OF_DAY),
    currentPriceEurKwh: getElectricityPrice(INITIAL_TIME_OF_DAY),
    cumulativeRevenueEur: 0,
    autoArbEnabled: false,
};

function simulateTick(prev: GridState, dtReal: number, now: number): GridState {
    const dtSim = dtReal * prev.timeSpeed;
    const dtHours = dtSim / 3600;

    // 1. ADVANCE TIME-OF-DAY
    let tod = (prev.timeOfDay + dtHours) % 24;
    if (tod < 0) tod += 24;

    // 2. COMPUTE SOLAR OUTPUT
    const pSolar = computeSolarOutput(tod);

    // 3. COMPUTE DYNAMIC LOAD (double hump × user scale)
    const pLoad = computeLoadDemand(tod, prev.loadScalePercent / 100);

    // 4. ToU PRICING
    const tariff = getTariffPeriod(tod);
    const price = getElectricityPrice(tod);

    // 5. DETERMINE BESS MODE
    let requestedMode: BatteryMode = prev.batteryMode;

    if (prev.autoArbEnabled) {
        // Smart priority-based AUTO_ARB
        requestedMode = autoArbDecision(pSolar, pLoad, prev.batterySocPercent, tariff);
    }

    // Hard SoC constraints
    if (prev.batterySocPercent >= SOC_MAX && requestedMode === 'charging') {
        requestedMode = 'idle';
    }
    if (prev.batterySocPercent <= SOC_MIN && requestedMode === 'discharging') {
        requestedMode = 'idle';
    }

    // ── FREQUENCY-CONSTRAINED CHARGING (Grid Protection) ──────
    // If we're about to grid-charge (i.e. charge with no solar surplus),
    // check if the grid frequency is below the safety threshold.
    // Solar charging (P_solar > P_load) is always allowed — it relieves
    // the grid by absorbing excess power.
    const hasSolarSurplus = pSolar > pLoad;
    if (requestedMode === 'charging' && !hasSolarSurplus) {
        if (prev.gridFrequencyHz < FREQ_CHARGE_LOCKOUT_HZ) {
            requestedMode = 'idle'; // suspend grid charge to protect frequency
        }
    }

    // 6. STRICT ACTIVE POWER BALANCE
    const pMismatch = pSolar - pLoad;
    let battPower = 0;

    if (requestedMode === 'charging') {
        if (pMismatch > 0) {
            // Surplus available — charge from free solar
            battPower = Math.min(pMismatch, BATTERY_MAX_POWER_KW);
        } else if (!prev.autoArbEnabled || getTariffPeriod(tod) === 'off-peak') {
            // Off-peak grid charge: we're in deficit but deliberately buying
            // In pure islanded mode this would violate balance, but off-peak
            // grid charging implies grid-connected behavior at cheap rates.
            // Cap at max power.
            battPower = Math.min(BATTERY_MAX_POWER_KW, BATTERY_MAX_POWER_KW);
        }
        // If AUTO_ARB + not off-peak + deficit → battPower stays 0
    } else if (requestedMode === 'discharging') {
        if (pMismatch < 0) {
            // Deficit — discharge to cover it
            battPower = Math.max(pMismatch, -BATTERY_MAX_POWER_KW);
        }
    }

    // Clamp by remaining SoC capacity
    if (battPower > 0) {
        const remainingKwh = ((SOC_MAX - prev.batterySocPercent) / 100) * BATTERY_CAPACITY_KWH;
        const maxPower = remainingKwh / Math.max(dtHours, 1e-9);
        battPower = Math.min(battPower, maxPower);
    } else if (battPower < 0) {
        const availableKwh = ((prev.batterySocPercent - SOC_MIN) / 100) * BATTERY_CAPACITY_KWH;
        const maxPower = availableKwh / Math.max(dtHours, 1e-9);
        battPower = Math.max(battPower, -maxPower);
    }

    // 7. UPDATE SoC
    const energyDeltaKwh = battPower * dtHours;
    let newSoc = prev.batterySocPercent + (energyDeltaKwh / BATTERY_CAPACITY_KWH) * 100;
    newSoc = Math.max(SOC_MIN, Math.min(SOC_MAX, newSoc));

    let finalMode = requestedMode;
    if (newSoc >= SOC_MAX && finalMode === 'charging') {
        finalMode = 'idle';
        battPower = 0;
    }
    if (newSoc <= SOC_MIN && finalMode === 'discharging') {
        finalMode = 'idle';
        battPower = 0;
    }

    // 8. PRIMARY FREQUENCY CONTROL (droop)
    const pUncompensated = pMismatch - battPower;
    const fDroop = F_NOMINAL_HZ + DROOP_K * pUncompensated;
    const fWithNoise = fDroop + gaussianNoise(FREQ_NOISE_SIGMA);
    const freq = Math.max(F_MIN_HZ, Math.min(F_MAX_HZ, fWithNoise));

    // 9. ECONOMICS
    const revenueDelta = -battPower * price * dtHours;
    const newRevenue = prev.cumulativeRevenueEur + revenueDelta;

    return {
        ...prev,
        timeOfDay: tod,
        solarOutputKw: pSolar,
        loadDemandKw: pLoad,
        batteryPowerKw: battPower,
        batterySocPercent: newSoc,
        batteryMode: finalMode,
        gridFrequencyHz: freq,
        timestamp: now,
        tariffPeriod: tariff,
        currentPriceEurKwh: price,
        cumulativeRevenueEur: newRevenue,
    };
}

// ── Hook ──────────────────────────────────────────────────────

export function useGridSimulation() {
    const simRef = useRef<GridState>(INITIAL_GRID_STATE);

    const historyRef = useRef<GridSnapshot[]>([]);
    const [state, setState] = useState<GridState>(INITIAL_GRID_STATE);
    const [history, setHistory] = useState<GridSnapshot[]>([]);

    const lastFrameRef = useRef(0);
    const lastSnapshotRef = useRef(0);
    const lastRenderSyncRef = useRef(0);
    const startTimeRef = useRef(0);

    const dispatch = useCallback((cmd: BESSCommand) => {
        const prev = simRef.current;
        switch (cmd.type) {
            case 'CHARGE':
                simRef.current = { ...prev, batteryMode: 'charging' as const, autoArbEnabled: false };
                break;
            case 'DISCHARGE':
                simRef.current = { ...prev, batteryMode: 'discharging' as const, autoArbEnabled: false };
                break;
            case 'IDLE':
                simRef.current = { ...prev, batteryMode: 'idle' as const, autoArbEnabled: false };
                break;
            case 'SET_LOAD':
                // payload = loadScalePercent (50 – 150)
                simRef.current = { ...prev, loadScalePercent: Math.max(50, Math.min(150, cmd.payload)) };
                break;
            case 'SET_TIME_SPEED':
                simRef.current = { ...prev, timeSpeed: Math.max(1, cmd.payload) };
                break;
            case 'TOGGLE_AUTO_ARB':
                simRef.current = { ...prev, autoArbEnabled: !prev.autoArbEnabled };
                break;
        }
    }, []);

    useEffect(() => {
        let rafId: number;
        const bootTime = Date.now();

        lastFrameRef.current = bootTime;
        startTimeRef.current = bootTime;
        simRef.current = { ...simRef.current, timestamp: bootTime };
        setState(simRef.current);

        const tick = () => {
            const now = Date.now();
            const dtReal = Math.min((now - lastFrameRef.current) / 1000, 0.1);
            lastFrameRef.current = now;

            simRef.current = simulateTick(simRef.current, dtReal, now);

            if (now - lastSnapshotRef.current >= SNAPSHOT_INTERVAL_MS) {
                lastSnapshotRef.current = now;
                const s = simRef.current;
                const snap: GridSnapshot = {
                    t: parseFloat(((now - startTimeRef.current) / 1000).toFixed(1)),
                    solarKw: parseFloat(s.solarOutputKw.toFixed(1)),
                    loadKw: parseFloat(s.loadDemandKw.toFixed(1)),
                    batteryKw: parseFloat(s.batteryPowerKw.toFixed(1)),
                    socPercent: parseFloat(s.batterySocPercent.toFixed(1)),
                    frequencyHz: parseFloat(s.gridFrequencyHz.toFixed(2)),
                    priceEur: s.currentPriceEurKwh,
                };
                historyRef.current = historyRef.current.length >= HISTORY_MAX
                    ? [...historyRef.current.slice(-HISTORY_MAX + 1), snap]
                    : [...historyRef.current, snap];
            }

            if (now - lastRenderSyncRef.current >= 33) {
                lastRenderSyncRef.current = now;
                setState(simRef.current);
                setHistory(historyRef.current);
            }

            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return { state, history, dispatch };
}
