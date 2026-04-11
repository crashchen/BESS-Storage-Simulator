import { AUTO_ARB, BESS, FREQUENCY_MODEL, GRID, PROJECT, SIMULATION, SOLAR, TARIFF } from '../config';
import type { GridState } from '../types';
import {
    clamp,
    computeGridDemandMw,
    computeSolarOutputMw,
    getAutoArbPlan,
    getBatteryTransferLimitMw,
    getElectricityPriceEurMwh,
    getTariffPeriod,
    settleHybridProjectTick,
} from './simulationModel';
import { selectGridConnectionTotalMw } from './gridSelectors';

export function gaussianNoise(sigma: number, random: () => number = Math.random): number {
    const u1 = random() || 1e-10;
    const u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

export function createInitialGridState(timestamp = 0): GridState {
    const gridConnectionTotalMw = GRID.pvEvacuationMw + GRID.bessConnectionMw;
    const solarOutputMw = computeSolarOutputMw(
        SIMULATION.initialTimeOfDay,
        SOLAR.acCapacityMw,
        SOLAR.dcCapacityMwp,
    );

    return {
        projectName: PROJECT.name,
        projectLocation: PROJECT.location,
        solarDcCapacityMwp: SOLAR.dcCapacityMwp,
        solarAcCapacityMw: SOLAR.acCapacityMw,
        batteryPowerRatingMw: BESS.defaultPowerRatingMw,
        batteryEnergyCapacityMwh: BESS.defaultEnergyCapacityMwh,
        gridPvEvacuationMw: GRID.pvEvacuationMw,
        gridBessConnectionMw: GRID.bessConnectionMw,
        siteYieldKwhPerKwYear: SOLAR.yieldKwhPerKwYear,
        simulationStatus: 'stopped',
        gridFrequencyHz: GRID.nominalFrequencyHz,
        solarOutputMw,
        gridDemandMw: computeGridDemandMw(SIMULATION.initialTimeOfDay, 1.0, gridConnectionTotalMw),
        dispatchScalePercent: 100,
        batterySocPercent: BESS.initialSocPercent,
        batteryPowerMw: 0,
        batteryChargeFromSolarMw: 0,
        batteryChargeFromGridMw: 0,
        batteryDischargeToGridMw: 0,
        solarExportMw: solarOutputMw,
        solarCurtailedMw: 0,
        projectNetExportMw: solarOutputMw,
        batteryMode: 'idle',
        timeOfDay: SIMULATION.initialTimeOfDay,
        timeSpeed: SIMULATION.defaultTimeSpeed,
        timestamp,
        tariffPeriod: getTariffPeriod(SIMULATION.initialTimeOfDay),
        tariffRatesEurMwh: TARIFF.defaultRatesEurMwh,
        currentPriceEurMwh: getElectricityPriceEurMwh(SIMULATION.initialTimeOfDay, TARIFF.defaultRatesEurMwh),
        cumulativeRevenueEur: 0,
        cumulativeBessMarginEur: 0,
        autoArbEnabled: false,
    };
}

function normalizeTimeOfDay(timeOfDay: number): number {
    let normalized = timeOfDay % 24;
    if (normalized < 0) normalized += 24;
    return normalized;
}

function getTickBoundaryHours(): number[] {
    return [...new Set([
        TARIFF.periods.offPeakEnd,
        TARIFF.periods.midPeakEnd,
        TARIFF.periods.peakEnd,
        AUTO_ARB.peakStartHour,
        AUTO_ARB.peakEndHour,
    ])].sort((left, right) => left - right);
}

function getNextBoundaryDeltaHours(timeOfDay: number, remainingHours: number, boundaryHours: number[]): number | null {
    const epsilon = 1e-9;
    let nextBoundaryDeltaHours: number | null = null;

    for (const boundaryHour of boundaryHours) {
        const boundaryDeltaHours = boundaryHour > timeOfDay
            ? boundaryHour - timeOfDay
            : boundaryHour + 24 - timeOfDay;

        if (boundaryDeltaHours <= epsilon || boundaryDeltaHours >= remainingHours - epsilon) {
            continue;
        }

        if (nextBoundaryDeltaHours === null || boundaryDeltaHours < nextBoundaryDeltaHours) {
            nextBoundaryDeltaHours = boundaryDeltaHours;
        }
    }

    return nextBoundaryDeltaHours;
}

function simulateTickStep(
    prev: GridState,
    dtHours: number,
    now: number,
    random: () => number,
    operationalTimeOfDay: number,
    nextTimeOfDay: number,
): GridState {
    let timeOfDay = normalizeTimeOfDay(nextTimeOfDay);
    if (timeOfDay < 0) timeOfDay += 24;

    const solarOutputMw = computeSolarOutputMw(
        operationalTimeOfDay,
        prev.solarAcCapacityMw,
        prev.solarDcCapacityMwp,
    );
    const gridDemandMw = computeGridDemandMw(
        operationalTimeOfDay,
        prev.dispatchScalePercent / 100,
        selectGridConnectionTotalMw(prev),
    );
    const tariffPeriod = getTariffPeriod(operationalTimeOfDay);
    const currentPriceEurMwh = getElectricityPriceEurMwh(operationalTimeOfDay, prev.tariffRatesEurMwh);

    let requestedMode = prev.batteryMode;
    let autoArbPowerMw = 0;

    if (prev.autoArbEnabled) {
        const autoArbPlan = getAutoArbPlan(
            prev,
            operationalTimeOfDay,
            solarOutputMw,
            gridDemandMw,
            tariffPeriod,
            prev.tariffRatesEurMwh,
        );
        requestedMode = autoArbPlan.mode;
        autoArbPowerMw = autoArbPlan.targetPowerMw;
    }

    if (prev.batterySocPercent >= 100 && requestedMode === 'charging') {
        requestedMode = 'idle';
    }
    if (prev.batterySocPercent <= 0 && requestedMode === 'discharging') {
        requestedMode = 'idle';
    }

    const transferLimitMw = getBatteryTransferLimitMw(prev);
    const powerMismatchMw = solarOutputMw - gridDemandMw;
    if (prev.autoArbEnabled && requestedMode === 'charging') {
        const remainingEnergyMwh = ((100 - prev.batterySocPercent) / 100) * prev.batteryEnergyCapacityMwh;
        const maxChargeMw = remainingEnergyMwh / Math.max(dtHours * BESS.chargeEfficiency, 1e-9);
        const clampedChargeMw = Math.min(clamp(autoArbPowerMw, 0, transferLimitMw), maxChargeMw);
        const projectedUncompensatedMw = powerMismatchMw - clampedChargeMw;
        const projectedFrequencyHz = GRID.nominalFrequencyHz + FREQUENCY_MODEL.droopK * projectedUncompensatedMw;
        if (projectedFrequencyHz < FREQUENCY_MODEL.chargeLockoutHz) {
            requestedMode = 'idle';
        }
    }

    let batteryPowerMw = 0;

    if (requestedMode === 'charging') {
        if (prev.autoArbEnabled) {
            batteryPowerMw = clamp(autoArbPowerMw, 0, transferLimitMw);
        } else {
            batteryPowerMw = transferLimitMw;
        }
    } else if (requestedMode === 'discharging') {
        if (prev.autoArbEnabled) {
            batteryPowerMw = clamp(autoArbPowerMw, -transferLimitMw, 0);
        } else {
            batteryPowerMw = -transferLimitMw;
        }
    }

    if (batteryPowerMw > 0) {
        const remainingEnergyMwh = ((100 - prev.batterySocPercent) / 100) * prev.batteryEnergyCapacityMwh;
        const maxChargeMw = remainingEnergyMwh / Math.max(dtHours * BESS.chargeEfficiency, 1e-9);
        batteryPowerMw = Math.min(batteryPowerMw, maxChargeMw);
    } else if (batteryPowerMw < 0) {
        const availableEnergyMwh = (prev.batterySocPercent / 100) * prev.batteryEnergyCapacityMwh;
        const maxDischargeMw = (availableEnergyMwh * BESS.dischargeEfficiency) / Math.max(dtHours, 1e-9);
        batteryPowerMw = Math.max(batteryPowerMw, -maxDischargeMw);
    }

    const storedEnergyDeltaMwh = batteryPowerMw >= 0
        ? batteryPowerMw * dtHours * BESS.chargeEfficiency
        : (batteryPowerMw * dtHours) / BESS.dischargeEfficiency;
    let batterySocPercent = prev.batterySocPercent + (storedEnergyDeltaMwh / prev.batteryEnergyCapacityMwh) * 100;
    batterySocPercent = clamp(batterySocPercent, 0, 100);
    if (batterySocPercent <= 1e-9) batterySocPercent = 0;
    if (batterySocPercent >= 100 - 1e-9) batterySocPercent = 100;

    const settledBatteryPowerMw = batteryPowerMw;
    let batteryMode = requestedMode;
    if (batterySocPercent >= 100 && batteryMode === 'charging') {
        batteryMode = 'idle';
    }
    if (batterySocPercent <= 0 && batteryMode === 'discharging') {
        batteryMode = 'idle';
    }

    const settlement = settleHybridProjectTick({
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw: settledBatteryPowerMw,
        gridPvEvacuationMw: prev.gridPvEvacuationMw,
        currentPriceEurMwh,
        dtHours,
    });

    const uncompensatedMw = powerMismatchMw - settledBatteryPowerMw;
    const gridFrequencyHz = clamp(
        GRID.nominalFrequencyHz + FREQUENCY_MODEL.droopK * uncompensatedMw + gaussianNoise(FREQUENCY_MODEL.noiseSigma, random),
        GRID.minFrequencyHz,
        GRID.maxFrequencyHz,
    );

    const cumulativeRevenueEur = prev.cumulativeRevenueEur + settlement.projectPnlDeltaEur;
    const cumulativeBessMarginEur = prev.cumulativeBessMarginEur + settlement.bessMarginDeltaEur;

    return {
        ...prev,
        gridFrequencyHz,
        solarOutputMw,
        gridDemandMw,
        batterySocPercent,
        batteryPowerMw: settledBatteryPowerMw,
        batteryChargeFromSolarMw: settlement.batteryChargeFromSolarMw,
        batteryChargeFromGridMw: settlement.batteryChargeFromGridMw,
        batteryDischargeToGridMw: settlement.batteryDischargeToGridMw,
        solarExportMw: settlement.solarExportMw,
        solarCurtailedMw: settlement.solarCurtailedMw,
        projectNetExportMw: settlement.projectNetExportMw,
        batteryMode,
        timeOfDay,
        timestamp: now,
        tariffPeriod,
        currentPriceEurMwh,
        cumulativeRevenueEur,
        cumulativeBessMarginEur,
    };
}

export function simulateTick(
    prev: GridState,
    dtReal: number,
    now: number,
    random: () => number = Math.random,
): GridState {
    const dtSim = dtReal * prev.timeSpeed;
    const dtHours = dtSim / 3600;
    const endTimeOfDay = normalizeTimeOfDay(prev.timeOfDay + dtHours);
    const boundaryHours = getTickBoundaryHours();

    if (getNextBoundaryDeltaHours(prev.timeOfDay, dtHours, boundaryHours) === null) {
        return simulateTickStep(prev, dtHours, now, random, endTimeOfDay, endTimeOfDay);
    }

    let state = prev;
    let remainingHours = dtHours;
    let currentTimeOfDay = prev.timeOfDay;

    while (remainingHours > 1e-9) {
        const nextBoundaryDeltaHours = getNextBoundaryDeltaHours(currentTimeOfDay, remainingHours, boundaryHours);
        const stepHours = nextBoundaryDeltaHours ?? remainingHours;
        const stepEndTimeOfDay = normalizeTimeOfDay(currentTimeOfDay + stepHours);

        state = simulateTickStep(state, stepHours, now, random, currentTimeOfDay, stepEndTimeOfDay);
        remainingHours -= stepHours;
        currentTimeOfDay = stepEndTimeOfDay;
    }

    return state;
}
