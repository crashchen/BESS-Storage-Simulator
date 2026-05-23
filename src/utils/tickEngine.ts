import { AUTO_ARB, BESS, GRID, PROJECT, SIMULATION, SOLAR, TARIFF } from '../config';
import type { BatteryMode, GridState } from '../types';
import {
    clamp,
    computeGridDemandMw,
    computeSolarOutputMw,
    getBatteryTransferLimitMw,
    getElectricityPriceEurMwh,
    getTariffPeriod,
    settleHybridProjectTick,
} from './simulationModel';
import { selectGridConnectionTotalMw } from './gridSelectors';

export function createInitialGridState(timestamp = 0): GridState {
    const gridConnectionTotalMw = GRID.pvEvacuationMw + GRID.bessConnectionMw;
    const solarOutputMw = computeSolarOutputMw(
        SIMULATION.initialTimeOfDay,
        SOLAR.acCapacityMw,
        SOLAR.dcCapacityMwp,
    );
    const gridDemandMw = computeGridDemandMw(SIMULATION.initialTimeOfDay, 1.0, gridConnectionTotalMw);
    const initialSettlement = settleHybridProjectTick({
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw: 0,
        gridPvEvacuationMw: GRID.pvEvacuationMw,
        gridConnectionLimitMw: gridConnectionTotalMw,
        currentPriceEurMwh: getElectricityPriceEurMwh(SIMULATION.initialTimeOfDay, TARIFF.defaultRatesEurMwh),
        dtHours: 0,
    });

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
        solarOutputMw,
        gridDemandMw,
        dispatchScalePercent: 100,
        batterySocPercent: BESS.initialSocPercent,
        batteryPowerMw: 0,
        batteryChargeFromSolarMw: initialSettlement.batteryChargeFromSolarMw,
        batteryChargeFromGridMw: initialSettlement.batteryChargeFromGridMw,
        batteryDischargeToLoadMw: initialSettlement.batteryDischargeToLoadMw,
        batteryDischargeToExportMw: initialSettlement.batteryDischargeToExportMw,
        solarExportMw: initialSettlement.solarExportMw,
        solarCurtailedMw: initialSettlement.solarCurtailedMw,
        gridImportMw: initialSettlement.gridImportMw,
        gridExportMw: initialSettlement.gridExportMw,
        gridOverloadMw: initialSettlement.gridOverloadMw,
        gridOverloadWarning: initialSettlement.gridOverloadWarning,
        projectNetExportMw: initialSettlement.projectNetExportMw,
        batteryMode: 'idle',
        dispatchMode: 'auto',
        timeOfDay: SIMULATION.initialTimeOfDay,
        timeSpeed: SIMULATION.defaultTimeSpeed,
        timestamp,
        tariffPeriod: getTariffPeriod(SIMULATION.initialTimeOfDay),
        tariffRatesEurMwh: TARIFF.defaultRatesEurMwh,
        currentPriceEurMwh: getElectricityPriceEurMwh(SIMULATION.initialTimeOfDay, TARIFF.defaultRatesEurMwh),
        cumulativeRevenueEur: 0,
        cumulativeBessMarginEur: 0,
        cumulativeSolarExportRevenueEur: 0,
        cumulativeBessDischargeRevenueEur: 0,
        cumulativeBessGridChargeCostEur: 0,
        cumulativeSolarOpportunityCostEur: 0,
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

function getBatteryModeFromPower(powerMw: number): BatteryMode {
    if (powerMw > 0.01) return 'charging';
    if (powerMw < -0.01) return 'discharging';
    return 'idle';
}

function clampBatteryPowerToEnergy(state: GridState, desiredPowerMw: number, dtHours: number): number {
    const transferLimitMw = getBatteryTransferLimitMw(state);
    let batteryPowerMw = clamp(desiredPowerMw, -transferLimitMw, transferLimitMw);

    if (batteryPowerMw > 0) {
        const remainingEnergyMwh = ((100 - state.batterySocPercent) / 100) * state.batteryEnergyCapacityMwh;
        const maxChargeMw = remainingEnergyMwh / Math.max(dtHours * BESS.chargeEfficiency, 1e-9);
        batteryPowerMw = Math.min(batteryPowerMw, maxChargeMw);
    } else if (batteryPowerMw < 0) {
        const availableEnergyMwh = (state.batterySocPercent / 100) * state.batteryEnergyCapacityMwh;
        const maxDischargeMw = (availableEnergyMwh * BESS.dischargeEfficiency) / Math.max(dtHours, 1e-9);
        batteryPowerMw = Math.max(batteryPowerMw, -maxDischargeMw);
    }

    return batteryPowerMw;
}

function getAutoDesiredBatteryPowerMw(
    state: GridState,
    solarOutputMw: number,
    gridDemandMw: number,
    tariffPeriod: GridState['tariffPeriod'],
    dtHours: number,
    timeOfDay: number,
): number {
    const transferLimitMw = getBatteryTransferLimitMw(state);
    const solarSurplusMw = Math.max(0, solarOutputMw - gridDemandMw);
    const loadDeficitMw = Math.max(0, gridDemandMw - solarOutputMw);
    const currentEnergyMwh = (state.batterySocPercent / 100) * state.batteryEnergyCapacityMwh;
    const nightTargetEnergyMwh = (AUTO_ARB.nightTargetSocPercent / 100) * state.batteryEnergyCapacityMwh;

    if (tariffPeriod === 'peak') {
        // Pace discharge across the remaining peak window instead of dumping
        // the full transfer limit on entry. Reserve `peakReserveSocPercent`
        // so the BESS doesn't run flat at the start. Convert internal energy
        // headroom into PCC power via the discharge efficiency.
        //
        // NOTE: this rule tree is window-driven only — it does NOT compare
        // peakRate vs offRate / round-trip efficiency. The earlier
        // `getAutoArbPlan` helper applied a symmetric price gate, but the
        // active-power scope retired it; the contract is locked in by the
        // "AUTO discharges through peak regardless of …" tests in
        // tickEngine.test.ts. Reintroduce a gate here only after a deliberate
        // product decision.
        const reserveEnergyMwh = (AUTO_ARB.peakReserveSocPercent / 100) * state.batteryEnergyCapacityMwh;
        const usableEnergyMwh = Math.max(0, currentEnergyMwh - reserveEnergyMwh);
        if (usableEnergyMwh <= 0) return 0;
        const peakRemainingHours = Math.max(
            AUTO_ARB.peakPacingMinRemainingHours,
            AUTO_ARB.peakEndHour - timeOfDay,
        );
        const pacedMw = (usableEnergyMwh * BESS.dischargeEfficiency) / peakRemainingHours;
        return -Math.min(transferLimitMw, pacedMw);
    }

    if (tariffPeriod === 'off-peak') {
        if (state.batterySocPercent >= 100) return 0;
        if (currentEnergyMwh < nightTargetEnergyMwh) {
            const reserveGapMwh = nightTargetEnergyMwh - currentEnergyMwh;
            const reserveChargeMw = reserveGapMwh / Math.max(dtHours * BESS.chargeEfficiency, 1e-9);
            return Math.min(transferLimitMw, Math.max(solarSurplusMw, reserveChargeMw));
        }
        return solarSurplusMw > 0 ? Math.min(solarSurplusMw, transferLimitMw) : 0;
    }

    if (solarSurplusMw > 0) {
        return Math.min(solarSurplusMw, transferLimitMw);
    }

    if (loadDeficitMw > 0 && currentEnergyMwh > 0) {
        return -Math.min(loadDeficitMw, transferLimitMw);
    }

    return 0;
}

function getDesiredBatteryPowerMw(
    state: GridState,
    solarOutputMw: number,
    gridDemandMw: number,
    tariffPeriod: GridState['tariffPeriod'],
    dtHours: number,
    timeOfDay: number,
): number {
    const transferLimitMw = getBatteryTransferLimitMw(state);

    switch (state.dispatchMode) {
        case 'auto':
            return getAutoDesiredBatteryPowerMw(state, solarOutputMw, gridDemandMw, tariffPeriod, dtHours, timeOfDay);
        case 'manual-charge':
            return transferLimitMw;
        case 'manual-discharge':
            return -transferLimitMw;
        case 'manual-idle':
            return 0;
        default: {
            const _exhaustive: never = state.dispatchMode;
            return _exhaustive;
        }
    }
}

function simulateTickStep(
    prev: GridState,
    dtHours: number,
    now: number,
    operationalTimeOfDay: number,
    nextTimeOfDay: number,
): GridState {
    const timeOfDay = normalizeTimeOfDay(nextTimeOfDay);

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
    // Reference time for the pacing law is `prev.timeOfDay` because the energy
    // state we're spreading (`prev.batterySocPercent`) is also at that snapshot.
    // Other quantities (solar/demand/tariff) use `operationalTimeOfDay` because
    // they're step-averaged continuous integrals; pacing is a control intent
    // evaluated against the start-of-step state, so the two references
    // diverge intentionally.
    const desiredBatteryPowerMw = getDesiredBatteryPowerMw(prev, solarOutputMw, gridDemandMw, tariffPeriod, dtHours, prev.timeOfDay);
    const requestedBatteryPowerMw = clampBatteryPowerToEnergy(prev, desiredBatteryPowerMw, dtHours);

    const settlement = settleHybridProjectTick({
        solarOutputMw,
        gridDemandMw,
        batteryPowerMw: requestedBatteryPowerMw,
        gridPvEvacuationMw: prev.gridPvEvacuationMw,
        gridConnectionLimitMw: selectGridConnectionTotalMw(prev),
        currentPriceEurMwh,
        dtHours,
    });
    const settledBatteryPowerMw = settlement.batteryPowerMw;

    const storedEnergyDeltaMwh = settledBatteryPowerMw >= 0
        ? settledBatteryPowerMw * dtHours * BESS.chargeEfficiency
        : (settledBatteryPowerMw * dtHours) / BESS.dischargeEfficiency;
    let batterySocPercent = prev.batterySocPercent + (storedEnergyDeltaMwh / prev.batteryEnergyCapacityMwh) * 100;
    batterySocPercent = clamp(batterySocPercent, 0, 100);
    if (batterySocPercent <= 1e-9) batterySocPercent = 0;
    if (batterySocPercent >= 100 - 1e-9) batterySocPercent = 100;

    const batteryMode = getBatteryModeFromPower(settledBatteryPowerMw);

    const cumulativeRevenueEur = prev.cumulativeRevenueEur + settlement.projectPnlDeltaEur;
    const cumulativeBessMarginEur = prev.cumulativeBessMarginEur + settlement.bessMarginDeltaEur;
    const cumulativeSolarExportRevenueEur =
        prev.cumulativeSolarExportRevenueEur + settlement.solarExportRevenueDeltaEur;
    const cumulativeBessDischargeRevenueEur =
        prev.cumulativeBessDischargeRevenueEur + settlement.bessDischargeRevenueDeltaEur;
    const cumulativeBessGridChargeCostEur =
        prev.cumulativeBessGridChargeCostEur + settlement.bessGridChargeCostDeltaEur;
    const cumulativeSolarOpportunityCostEur =
        prev.cumulativeSolarOpportunityCostEur + settlement.solarOpportunityCostDeltaEur;

    // Settlement uses the sub-step midpoint (correct for the integral over [t, t+dt]),
    // but the displayed period/price should reflect the clock the user actually sees
    // (the end of the sub-step). Otherwise a tick that lands exactly on a tariff
    // boundary (e.g. 18:00) shows "mid-peak" until the next tick fires past it.
    const displayTariffPeriod = getTariffPeriod(timeOfDay);
    const displayPriceEurMwh = getElectricityPriceEurMwh(timeOfDay, prev.tariffRatesEurMwh);

    return {
        ...prev,
        solarOutputMw,
        gridDemandMw,
        batterySocPercent,
        batteryPowerMw: settledBatteryPowerMw,
        batteryChargeFromSolarMw: settlement.batteryChargeFromSolarMw,
        batteryChargeFromGridMw: settlement.batteryChargeFromGridMw,
        batteryDischargeToLoadMw: settlement.batteryDischargeToLoadMw,
        batteryDischargeToExportMw: settlement.batteryDischargeToExportMw,
        solarExportMw: settlement.solarExportMw,
        solarCurtailedMw: settlement.solarCurtailedMw,
        gridImportMw: settlement.gridImportMw,
        gridExportMw: settlement.gridExportMw,
        gridOverloadMw: settlement.gridOverloadMw,
        gridOverloadWarning: settlement.gridOverloadWarning,
        projectNetExportMw: settlement.projectNetExportMw,
        batteryMode,
        timeOfDay,
        timestamp: now,
        tariffPeriod: displayTariffPeriod,
        currentPriceEurMwh: displayPriceEurMwh,
        cumulativeRevenueEur,
        cumulativeBessMarginEur,
        cumulativeSolarExportRevenueEur,
        cumulativeBessDischargeRevenueEur,
        cumulativeBessGridChargeCostEur,
        cumulativeSolarOpportunityCostEur,
    };
}

export function simulateTick(
    prev: GridState,
    dtReal: number,
    now: number,
): GridState {
    const dtSim = dtReal * prev.timeSpeed;
    const dtHours = dtSim / 3600;
    const endTimeOfDay = normalizeTimeOfDay(prev.timeOfDay + dtHours);
    const sampleTimeOfDay = normalizeTimeOfDay(prev.timeOfDay + dtHours / 2);
    const boundaryHours = getTickBoundaryHours();

    if (getNextBoundaryDeltaHours(prev.timeOfDay, dtHours, boundaryHours) === null) {
        return simulateTickStep(prev, dtHours, now, sampleTimeOfDay, endTimeOfDay);
    }

    let state = prev;
    let remainingHours = dtHours;
    let currentTimeOfDay = prev.timeOfDay;

    while (remainingHours > 1e-9) {
        const nextBoundaryDeltaHours = getNextBoundaryDeltaHours(currentTimeOfDay, remainingHours, boundaryHours);
        const stepHours = nextBoundaryDeltaHours ?? remainingHours;
        const stepEndTimeOfDay = normalizeTimeOfDay(currentTimeOfDay + stepHours);
        const stepSampleTimeOfDay = normalizeTimeOfDay(currentTimeOfDay + stepHours / 2);

        state = simulateTickStep(state, stepHours, now, stepSampleTimeOfDay, stepEndTimeOfDay);
        remainingHours -= stepHours;
        currentTimeOfDay = stepEndTimeOfDay;
    }

    return state;
}
