import { BESS, FREQUENCY_MODEL, GRID, PROJECT, SIMULATION, SOLAR, TARIFF } from '../config';
import type { GridState } from '../types';
import {
    clamp,
    computeGridDemandMw,
    computeSolarOutputMw,
    getAutoArbPlan,
    getBatteryDurationHours,
    getBatteryTransferLimitMw,
    getElectricityPriceEurMwh,
    getTariffPeriod,
    settleHybridProjectTick,
} from './simulationModel';

export function gaussianNoise(sigma: number, random: () => number = Math.random): number {
    const u1 = random() || 1e-10;
    const u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

export function createInitialGridState(timestamp = 0): GridState {
    const batteryDurationHours = getBatteryDurationHours(BESS.defaultPowerRatingMw, BESS.defaultEnergyCapacityMwh);
    const gridConnectionTotalMw = GRID.pvEvacuationMw + GRID.bessConnectionMw;
    const solarOutputMw = computeSolarOutputMw(SIMULATION.initialTimeOfDay, SOLAR.acCapacityMw);

    return {
        projectName: PROJECT.name,
        projectLocation: PROJECT.location,
        solarDcCapacityMwp: SOLAR.dcCapacityMwp,
        solarAcCapacityMw: SOLAR.acCapacityMw,
        batteryPowerRatingMw: BESS.defaultPowerRatingMw,
        batteryDurationHours,
        batteryEnergyCapacityMwh: BESS.defaultEnergyCapacityMwh,
        gridConnectionTotalMw,
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

export function simulateTick(
    prev: GridState,
    dtReal: number,
    now: number,
    random: () => number = Math.random,
): GridState {
    const dtSim = dtReal * prev.timeSpeed;
    const dtHours = dtSim / 3600;

    let timeOfDay = (prev.timeOfDay + dtHours) % 24;
    if (timeOfDay < 0) timeOfDay += 24;

    const solarOutputMw = computeSolarOutputMw(timeOfDay, prev.solarAcCapacityMw);
    const gridDemandMw = computeGridDemandMw(timeOfDay, prev.dispatchScalePercent / 100, prev.gridConnectionTotalMw);
    const tariffPeriod = getTariffPeriod(timeOfDay);
    const currentPriceEurMwh = getElectricityPriceEurMwh(timeOfDay, prev.tariffRatesEurMwh);

    let requestedMode = prev.batteryMode;
    let autoArbPowerMw = 0;

    if (prev.autoArbEnabled) {
        const autoArbPlan = getAutoArbPlan(
            prev,
            timeOfDay,
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
    const hasSolarSurplus = solarOutputMw > gridDemandMw;
    if (prev.autoArbEnabled && requestedMode === 'charging' && !hasSolarSurplus) {
        const projectedUncompensatedMw = powerMismatchMw - autoArbPowerMw;
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

    let batteryMode = requestedMode;
    if (batterySocPercent >= 100 && batteryMode === 'charging') {
        batteryMode = 'idle';
        batteryPowerMw = 0;
    }
    if (batterySocPercent <= 0 && batteryMode === 'discharging') {
        batteryMode = 'idle';
        batteryPowerMw = 0;
    }

    const settlement = settleHybridProjectTick({
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw,
        gridPvEvacuationMw: prev.gridPvEvacuationMw,
        currentPriceEurMwh,
        dtHours,
    });

    const uncompensatedMw = powerMismatchMw - batteryPowerMw;
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
        batteryPowerMw,
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
