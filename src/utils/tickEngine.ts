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

const TIME_EPSILON_HOURS = 1e-12;
const SOC_EPSILON = 1e-9;

function getTickBoundaryHours(): number[] {
    return [...new Set([
        0, // The demand curve wraps at midnight, independently of tariff changes.
        AUTO_ARB.peakEndHour - AUTO_ARB.peakPacingMinRemainingHours,
        TARIFF.periods.offPeakEnd,
        TARIFF.periods.midPeakEnd,
        TARIFF.periods.peakEnd,
        AUTO_ARB.peakStartHour,
        AUTO_ARB.peakEndHour,
    ])].sort((left, right) => left - right);
}

function getNextBoundaryDeltaHours(timeOfDay: number, remainingHours: number, boundaryHours: number[]): number | null {
    const epsilon = TIME_EPSILON_HOURS;
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

function getAutoDesiredBatteryPowerMw(
    state: GridState,
    solarOutputMw: number,
    gridDemandMw: number,
    tariffPeriod: GridState['tariffPeriod'],
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
            // Request physical power until the target event. Averaging the
            // remaining reserve energy over dt changes PV/grid attribution.
            return transferLimitMw;
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
    timeOfDay: number,
): number {
    const transferLimitMw = getBatteryTransferLimitMw(state);

    switch (state.dispatchMode) {
        case 'auto':
            return getAutoDesiredBatteryPowerMw(state, solarOutputMw, gridDemandMw, tariffPeriod, timeOfDay);
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

// Once the remaining peak horizon reaches its floor H, the existing pacing
// rule is dU/dt = -min(cap / eta, U / H). Integrate its constant-cap part and
// exponential tail, rather than holding the start rate for the whole frame.
function peakFloorDischargeMw(usableEnergyMwh: number, capMw: number, dtHours: number): number {
    if (usableEnergyMwh <= 0 || capMw <= 0) return 0;
    const horizon = AUTO_ARB.peakPacingMinRemainingHours;
    const usableOutputMwh = usableEnergyMwh * BESS.dischargeEfficiency;
    if (dtHours === 0) return Math.min(capMw, usableOutputMwh / horizon);
    const cappedHours = Math.min(dtHours, Math.max(0, usableOutputMwh / capMw - horizon));
    const tailEnergyMwh = usableOutputMwh - capMw * cappedHours;
    const outputMwh = capMw * cappedHours
        + tailEnergyMwh * -Math.expm1(-(dtHours - cappedHours) / horizon);
    return outputMwh / dtHours;
}

// Trial settlement uses dt=0: locate events from actual PCC-limited power,
// without booking energy or money for rejected candidate durations.
function sampleStep(prev: GridState, dtHours: number) {
    const operationalTimeOfDay = normalizeTimeOfDay(prev.timeOfDay + dtHours / 2);
    const solarOutputMw = computeSolarOutputMw(
        operationalTimeOfDay, prev.solarAcCapacityMw, prev.solarDcCapacityMwp,
    );
    const gridDemandMw = computeGridDemandMw(
        operationalTimeOfDay, prev.dispatchScalePercent / 100, selectGridConnectionTotalMw(prev),
    );
    const tariffPeriod = getTariffPeriod(operationalTimeOfDay);
    const currentPriceEurMwh = getElectricityPriceEurMwh(operationalTimeOfDay, prev.tariffRatesEurMwh);
    // Midpoint quadrature approximates solar/demand, not their exact integral.
    // Pacing intent uses the energy and remaining horizon at the segment start.
    const desiredPowerMw = getDesiredBatteryPowerMw(
        prev, solarOutputMw, gridDemandMw, tariffPeriod, prev.timeOfDay,
    );
    const transferLimitMw = getBatteryTransferLimitMw(prev);
    let batteryPowerMw = clamp(desiredPowerMw, -transferLimitMw, transferLimitMw);
    if (batteryPowerMw > 0 && prev.batterySocPercent >= 100) batteryPowerMw = 0;
    if (batteryPowerMw < 0 && prev.batterySocPercent <= 0) batteryPowerMw = 0;
    const input = {
        solarOutputMw, gridDemandMw, batteryPowerMw,
        gridPvEvacuationMw: prev.gridPvEvacuationMw,
        gridConnectionLimitMw: selectGridConnectionTotalMw(prev),
        currentPriceEurMwh,
    };
    if (prev.dispatchMode === 'auto' && tariffPeriod === 'peak'
        && prev.timeOfDay >= AUTO_ARB.peakEndHour - AUTO_ARB.peakPacingMinRemainingHours) {
        const capMw = -settleHybridProjectTick({ ...input, batteryPowerMw: -transferLimitMw, dtHours: 0 }).batteryPowerMw;
        const usableEnergyMwh = Math.max(0, prev.batterySocPercent - AUTO_ARB.peakReserveSocPercent)
            / 100 * prev.batteryEnergyCapacityMwh;
        input.batteryPowerMw = -peakFloorDischargeMw(usableEnergyMwh, capMw, dtHours);
    }
    const powerMw = settleHybridProjectTick({ ...input, dtHours: 0 }).batteryPowerMw;
    return { input, powerMw, tariffPeriod };
}

function storedEnergyRateMw(powerMw: number): number {
    return powerMw >= 0 ? powerMw * BESS.chargeEfficiency : powerMw / BESS.dischargeEfficiency;
}

function getEnergyBoundarySoc(prev: GridState, sample: ReturnType<typeof sampleStep>): number {
    if (sample.powerMw > 0) {
        if (prev.dispatchMode === 'auto' && sample.tariffPeriod === 'off-peak'
            && prev.batterySocPercent < AUTO_ARB.nightTargetSocPercent) {
            return AUTO_ARB.nightTargetSocPercent;
        }
        return 100;
    }
    return prev.dispatchMode === 'auto' && sample.tariffPeriod === 'peak'
        ? AUTO_ARB.peakReserveSocPercent : 0;
}

function findEnergyStep(prev: GridState, maxHours: number) {
    let sample = sampleStep(prev, maxHours);
    const boundarySoc = getEnergyBoundarySoc(prev, sample);
    const direction = Math.sign(sample.powerMw);
    const headroomMwh = Math.abs(boundarySoc - prev.batterySocPercent) / 100 * prev.batteryEnergyCapacityMwh;
    if (direction === 0 || Math.abs(storedEnergyRateMw(sample.powerMw)) * maxHours < headroomMwh) {
        return { hours: maxHours, sample, boundarySoc: null };
    }

    // Re-sample the midpoint as the event time changes. A single headroom / MW
    // estimate using the original midpoint is wrong when PCC headroom varies.
    let low = 0;
    let high = maxHours;
    for (let i = 0; i < 48 && high - low > TIME_EPSILON_HOURS; i++) {
        const middle = (low + high) / 2;
        const trial = sampleStep(prev, middle);
        if (storedEnergyRateMw(trial.powerMw) * direction * middle >= headroomMwh) high = middle;
        else low = middle;
    }
    sample = sampleStep(prev, high);
    // Remove only the root solver's roundoff overshoot at this event. Do not
    // average boundary-limited power over the remaining outer tick.
    const boundaryPowerMw = (boundarySoc - prev.batterySocPercent) / 100 * prev.batteryEnergyCapacityMwh
        / high * (direction > 0 ? 1 / BESS.chargeEfficiency : BESS.dischargeEfficiency);
    sample.input.batteryPowerMw = direction > 0
        ? Math.min(sample.input.batteryPowerMw, boundaryPowerMw)
        : Math.max(sample.input.batteryPowerMw, boundaryPowerMw);
    return { hours: high, sample, boundarySoc };
}

function simulateTickStep(
    prev: GridState,
    dtHours: number,
    now: number,
    sample: ReturnType<typeof sampleStep>,
    boundarySoc: number | null,
): GridState {
    const timeOfDay = normalizeTimeOfDay(prev.timeOfDay + dtHours);
    const { solarOutputMw, gridDemandMw } = sample.input;
    const settlement = settleHybridProjectTick({ ...sample.input, dtHours });
    const settledBatteryPowerMw = settlement.batteryPowerMw;

    const storedEnergyDeltaMwh = settledBatteryPowerMw >= 0
        ? settledBatteryPowerMw * dtHours * BESS.chargeEfficiency
        : (settledBatteryPowerMw * dtHours) / BESS.dischargeEfficiency;
    let batterySocPercent = prev.batterySocPercent + (storedEnergyDeltaMwh / prev.batteryEnergyCapacityMwh) * 100;
    batterySocPercent = clamp(batterySocPercent, 0, 100);
    if (boundarySoc !== null && Math.abs(batterySocPercent - boundarySoc) <= SOC_EPSILON) {
        batterySocPercent = boundarySoc;
    }
    if (batterySocPercent <= SOC_EPSILON) batterySocPercent = 0;
    if (batterySocPercent >= 100 - SOC_EPSILON) batterySocPercent = 100;

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

    // Settlement approximates continuous inputs at the sub-step midpoint,
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
    const dtHours = dtReal * prev.timeSpeed / 3600;
    if (dtHours <= 0) {
        return simulateTickStep(prev, 0, now, sampleStep(prev, 0), null);
    }
    const boundaryHours = getTickBoundaryHours();
    let state = prev;
    let remainingHours = dtHours;

    // Each accepted segment consumes positive time. Landing on an energy event
    // disables that transfer or changes its target before the next iteration;
    // keep this progress invariant when adding strategies. Do not silently cap
    // iterations: dropping the remainder would lose simulated time and bookings.
    while (remainingHours > TIME_EPSILON_HOURS) {
        const clockBoundary = getNextBoundaryDeltaHours(state.timeOfDay, remainingHours, boundaryHours);
        const step = findEnergyStep(state, clockBoundary ?? remainingHours);
        state = simulateTickStep(state, step.hours, now, step.sample, step.boundarySoc);
        remainingHours = Math.max(0, remainingHours - step.hours);
    }

    // Instantaneous telemetry remains the last settled segment (as it already
    // did for tariff splits). Cumulative values include every segment. A tick
    // crossing full/empty can therefore end idle after booking its transfer.
    return state;
}
