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
// AUTO 走窗口驱动的 rule tree，不再用 forecast-based planner（详见
// `tickEngine.ts` 的 `getAutoDesiredBatteryPowerMw` 注释）。Forecast 时代的
// minPeakEntrySocPercent / targetBufferMwh / solarConfidenceBufferMwh /
// off/midPeakTopUpFraction 已随旧 planner 一起删除。
export const AUTO_ARB = {
    /** Peak window start hour */
    peakStartHour: 18,
    /** Peak window end hour */
    peakEndHour: 23,
    /** Minimum remaining peak horizon for pacing discharge (hours). Acts as a floor on
     * `peakEndHour - timeOfDay` so the pacing formula doesn't divide by
     * something arbitrarily small near the end of the peak window. */
    peakPacingMinRemainingHours: 0.25,
    /** Reserve SoC to keep during peak discharge (%) */
    peakReserveSocPercent: 12,
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
        target: [0.3, 1.4, -1.2] as const,
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
        baseStartX: -12.5,
        baseStartZ: -6.1,
    },
    particles: {
        maxEnergy: 12,
        maxCurtailment: 20,
        curtailmentBounds: { x: -6.5, z: -2, spread: 4 },
    },
    /** Equipment GLBs under public/models — metre-scale, centre-ground anchor,
     * no textures/decoders; see public/models/README.md for provenance and the
     * de-brand contract. `file` is joined with import.meta.env.BASE_URL in the
     * scene layer so the GitHub Pages sub-path base keeps resolving.
     * `size` is the real-world envelope [width, height, depth] in metres.
     * Each model is a REPRESENTATIVE single unit standing in for station-scale
     * equipment — never a 1:1 capacity claim. Info cards must frame telemetry
     * as station-level aggregates; `unitRatingMw` feeds the "≈N × unit"
     * equivalence note where a real per-unit rating exists. */
    models: {
        pcsMvSkid: {
            file: 'models/generic-pcs-mv-skid-5mw-v1.glb',
            scale: 0.3,
            size: [6, 3, 3] as const,
            unitRatingMw: 5,
        },
        mainTransformer: {
            file: 'models/generic-main-transformer-50mva-33-220kv-v1.glb',
            scale: 0.64,
            size: [6, 5, 5] as const,
        },
    },
    pads: {
        bess: {
            position: [-0.8, 0.01, 0.2] as const,
            size: [6.5, 0.04, 3.6] as const,
            color: '#1f2937',
        },
        solar: {
            position: [-9.2, 0, -4.3] as const,
            size: [10.2, 0.02, 6.8] as const,
            color: '#172033',
        },
        substation: {
            position: [4.8, 0.08, -1.65] as const,
            size: [2.2, 0.16, 1.4] as const,
            color: '#4b5f7a',
            labelColor: '#e0f2fe',
            emissiveColor: '#38bdf8',
            flowWaypointHeight: 1.65,
        },
        siteLoad: {
            position: [6.05, 0.1, 1.35] as const,
        },
    },
} as const;
