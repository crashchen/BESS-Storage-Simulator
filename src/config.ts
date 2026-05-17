// ============================================================
// Project Configuration Constants
// Centralized configuration for the Romania PV+BESS simulator
// ============================================================

import type { TariffPeriod } from './types';

// ── Project Baseline ─────────────────────────────────────────
export const PROJECT = {
    name: 'Romania Hybrid Solar + BESS',
    location: 'Romania',
} as const;

// ── Solar PV Configuration ───────────────────────────────────
export const SOLAR = {
    /** DC capacity at STC (MWp) */
    dcCapacityMwp: 117,
    /** Minimum configurable DC capacity (MWp) */
    minDcCapacityMwp: 5,
    /** Maximum configurable DC capacity (MWp) */
    maxDcCapacityMwp: 750,
    /** AC inverter capacity (MW) */
    acCapacityMw: 102,
    /** Minimum configurable AC capacity (MW) */
    minAcCapacityMw: 5,
    /** Maximum configurable AC capacity (MW) */
    maxAcCapacityMw: 500,
    /** Annual yield assumption (kWh/kWp/year) */
    yieldKwhPerKwYear: 1380,
    /** Sunrise hour (solar output starts) */
    sunriseHour: 5.5,
    /** Sunset hour (solar output ends) */
    sunsetHour: 19.5,
    /** Solar noon (peak output hour) */
    solarNoon: 12.5,
} as const;

// ── BESS Configuration ───────────────────────────────────────
export const BESS = {
    /** Default power rating (MW) */
    defaultPowerRatingMw: 188,
    /** Default energy capacity (MWh) */
    defaultEnergyCapacityMwh: 744,
    /** Minimum configurable power (MW) */
    minPowerMw: 5,
    /** Maximum configurable power (MW) */
    maxPowerMw: 500,
    /** Minimum configurable energy (MWh) */
    minEnergyMwh: 10,
    /** Maximum configurable energy (MWh) */
    maxEnergyMwh: 2400,
    /** Round-trip efficiency split: charging efficiency (0-1) */
    chargeEfficiency: 0.96,
    /** Round-trip efficiency split: discharging efficiency (0-1) */
    dischargeEfficiency: 0.96,
    /** Initial SoC at simulation start (%) */
    initialSocPercent: 65,
} as const;

// ── Grid Connection ──────────────────────────────────────────
export const GRID = {
    /** PV evacuation limit (MW) */
    pvEvacuationMw: 102,
    /** Minimum configurable PV evacuation limit (MW) */
    minPvEvacuationMw: 5,
    /** Maximum configurable PV evacuation limit (MW) */
    maxPvEvacuationMw: 500,
    /** BESS injection/withdrawal limit (MW) */
    bessConnectionMw: 186,
    /** Minimum configurable BESS grid connection (MW) */
    minBessConnectionMw: 5,
    /** Maximum configurable BESS grid connection (MW) */
    maxBessConnectionMw: 500,
    /** Nominal grid frequency (Hz) */
    nominalFrequencyHz: 50.0,
    /** Minimum allowed frequency (Hz) */
    minFrequencyHz: 47.5,
    /** Maximum allowed frequency (Hz) */
    maxFrequencyHz: 52.0,
    /** Frequency warning threshold - low (Hz) */
    warningFrequencyLowHz: 49.5,
    /** Frequency warning threshold - high (Hz) */
    warningFrequencyHighHz: 50.5,
} as const;

// ── Grid Demand Model ────────────────────────────────────────
export const DEMAND_MODEL = {
    /** Base load as a fraction of total grid connection */
    baseFraction: 92 / 288, // ≈ 0.319
    /** Morning peak as a fraction of total grid connection */
    morningPeakFraction: 155 / 288, // ≈ 0.538
    /** Evening peak as a fraction of total grid connection */
    eveningPeakFraction: 234 / 288, // ≈ 0.813
    /** Midday trough depth as a fraction of total grid connection */
    middayTroughFraction: 32 / 288, // ≈ 0.111
    /** Morning peak center hour */
    morningPeakHour: 8.0,
    /** Evening peak center hour */
    eveningPeakHour: 19.0,
    /** Midday trough center hour */
    middayTroughHour: 13.0,
} as const;

// ── Frequency Response Model ─────────────────────────────────
export const FREQUENCY_MODEL = {
    /** Droop coefficient (Hz per MW imbalance) */
    droopK: 0.0035,
    /** Gaussian noise standard deviation (Hz) */
    noiseSigma: 0.012,
    /** Frequency threshold to lock out grid charging (Hz) */
    chargeLockoutHz: 49.9,
} as const;

// ── Tariff Configuration ─────────────────────────────────────
export const TARIFF = {
    /** Default wholesale price windows (€/MWh) */
    defaultRatesEurMwh: {
        'off-peak': 80,
        'mid-peak': 150,
        'peak': 350,
    } as Record<TariffPeriod, number>,
    /** Minimum allowed tariff rate (€/MWh) - can be negative */
    minRateEurMwh: -500,
    /** Maximum allowed tariff rate (€/MWh) */
    maxRateEurMwh: 1000,
    /** Tariff period boundaries (hours) */
    periods: {
        offPeakEnd: 6,      // 00:00 - 06:00
        midPeakEnd: 18,     // 06:00 - 18:00
        peakEnd: 23,        // 18:00 - 23:00
        // 23:00 - 00:00 returns to off-peak
    },
} as const;

// ── Auto-Arbitrage Strategy ──────────────────────────────────
export const AUTO_ARB = {
    /** Peak window start hour */
    peakStartHour: 18,
    /** Peak window end hour */
    peakEndHour: 23,
    /** Forecast integration step (hours) */
    forecastStepHours: 0.25,
    /** Minimum SoC target before peak (%) */
    minPeakEntrySocPercent: 92,
    /** Reserve SoC to keep during peak discharge (%) */
    peakReserveSocPercent: 12,
    /** Energy buffer above forecast (MWh) */
    targetBufferMwh: 12,
    /** Confidence buffer for solar forecast (MWh) */
    solarConfidenceBufferMwh: 10,
    /** Off-peak grid top-up fraction of transfer limit */
    offPeakTopUpFraction: 0.35,
    /** Mid-peak grid top-up fraction of transfer limit */
    midPeakTopUpFraction: 0.2,
    /** Night reserve target SoC (%) */
    nightTargetSocPercent: 40.0,
} as const;

// ── Simulation Engine ────────────────────────────────────────
export const SIMULATION = {
    /** Initial time of day (hours, 0-24) */
    initialTimeOfDay: 8.0,
    /** Default time acceleration factor */
    defaultTimeSpeed: 240,
    /** Minimum time speed */
    minTimeSpeed: 1,
    /** Maximum time speed */
    maxTimeSpeed: 1440,
    /** Dispatch scale range (%) */
    dispatchScaleMin: 50,
    dispatchScaleMax: 150,
    /** History buffer size (data points) */
    historyMaxPoints: 200,
    /** Snapshot interval for chart data (ms) */
    snapshotIntervalMs: 400,
    /** UI state sync interval (ms, ~30fps) */
    renderSyncIntervalMs: 33,
    /** Maximum real-time delta per frame (seconds) */
    maxDeltaTimeSeconds: 0.1,
} as const;

// ── 3D Scene Configuration ─────────────────────────────────────
export const SCENE_3D = {
    camera: {
        position: [15, 12, 18] as const,
        fov: 50,
        near: 0.1,
        far: 500,
    },
    dpr: {
        min: 1,
        max: 2,
    },
    performance: {
        flipflops: 3,
        highRefreshRateHz: 90,
        standardBoundsFps: [30, 55] as const,
        highRefreshBoundsFps: [45, 75] as const,
    },
    shadows: {
        mapSize: 2048,
        cameraFar: 200,
        cameraBounds: 30,
    },
    fog: {
        color: '#0a0a1a',
        near: 50,
        far: 150,
    },
    orbit: {
        minDistance: 8,
        maxDistance: 50,
        maxPolarAngleDivisor: 2.1,
        target: [0, 1.5, 0] as const,
    },
    ground: {
        size: 200,
        color: '#111827',
    },
    grid: {
        args: [100, 100] as const,
        cellSize: 2,
        cellThickness: 0.5,
        cellColor: '#1e293b',
        sectionSize: 10,
        sectionThickness: 1,
        sectionColor: '#334155',
        fadeDistance: 60,
        fadeStrength: 1,
    },
    capacityScale: {
        minBessWidthScale: 0.6,
        maxBessWidthScale: 2.0,
    },
    solarArray: {
        baselineCols: 4,
        baselineRows: 3,
        minCols: 3,
        maxCols: 6,
        minRows: 2,
        maxRows: 5,
        spacingX: 2.2,
        spacingZ: 1.8,
        baseStartX: -10,
        baseStartZ: -4,
    },
    particles: {
        maxEnergy: 12,
        maxCurtailment: 20,
        curtailmentBounds: { x: -6.5, z: -2, spread: 4 },
    },
    pads: {
        bess: {
            position: [0, 0.01, 0] as const,
            size: [6.5, 0.04, 3.6] as const,
            color: '#1f2937',
        },
        solar: {
            position: [-6.5, 0, -2] as const,
            size: [12.5, 0.02, 8.5] as const,
            color: '#172033',
        },
        substation: {
            position: [4.7, 0.08, 1.9] as const,
            size: [2.2, 0.16, 1.4] as const,
            color: '#4b5f7a',
            equipmentColor: '#7c8da8',
            equipmentAccentColor: '#38bdf8',
            labelColor: '#e0f2fe',
            emissiveColor: '#38bdf8',
            emissiveIntensity: 0.18,
            flowWaypointHeight: 2.65,
        },
    },
} as const;
