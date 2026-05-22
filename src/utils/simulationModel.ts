import type { GridState, TariffPeriod } from '../types';
import { DEMAND_MODEL, SOLAR, TARIFF } from '../config';

export interface HybridProjectSettlement {
    batteryPowerMw: number;
    batteryChargeFromSolarMw: number;
    batteryChargeFromGridMw: number;
    /** BESS energy serving local site demand (offsets grid import). */
    batteryDischargeToLoadMw: number;
    /** BESS energy flowing through the PCC out to the grid (counts as revenue). */
    batteryDischargeToExportMw: number;
    solarExportMw: number;
    solarCurtailedMw: number;
    gridImportMw: number;
    gridExportMw: number;
    gridOverloadMw: number;
    gridOverloadWarning: boolean;
    projectNetExportMw: number;
    projectPnlDeltaEur: number;
    bessMarginDeltaEur: number;
    // Auditable components — Project P&L and BESS Margin are derived from these
    // so the EconomicsPanel can show "totals reconcile to the sum of parts".
    solarExportRevenueDeltaEur: number;
    bessDischargeRevenueDeltaEur: number;
    bessGridChargeCostDeltaEur: number;
    solarOpportunityCostDeltaEur: number;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function normalizeZero(value: number): number {
    return Math.abs(value) < 1e-9 ? 0 : value;
}

/**
 * Clamp with a finite-number guard: NaN/Infinity payloads fall back to a safe value
 * rather than poisoning the state tree through subsequent arithmetic.
 */
export function clampFinite(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return clamp(value, min, max);
}

export function getTariffPeriod(tod: number): TariffPeriod {
    if (tod < TARIFF.periods.offPeakEnd) return 'off-peak';
    if (tod < TARIFF.periods.midPeakEnd) return 'mid-peak';
    if (tod < TARIFF.periods.peakEnd) return 'peak';
    return 'off-peak';
}

export function getElectricityPriceEurMwh(tod: number, tariffRatesEurMwh: Record<TariffPeriod, number>): number {
    return tariffRatesEurMwh[getTariffPeriod(tod)];
}

export function getBatteryTransferLimitMw(
    state: Pick<GridState, 'batteryPowerRatingMw' | 'gridBessConnectionMw'>,
): number {
    return Math.min(state.batteryPowerRatingMw, state.gridBessConnectionMw);
}

function computeSolarIrradiance(timeOfDay: number): number {
    if (timeOfDay < SOLAR.sunriseHour || timeOfDay > SOLAR.sunsetHour) return 0;

    const halfSpan = (SOLAR.sunsetHour - SOLAR.sunriseHour) / 2;
    const normalizedTime = (timeOfDay - SOLAR.solarNoon) / halfSpan;
    return Math.max(0, Math.cos(normalizedTime * Math.PI * 0.5));
}

export function computeSolarOutputMw(
    timeOfDay: number,
    solarAcCapacityMw: number,
    solarDcCapacityMwp: number,
): number {
    const irradiance = computeSolarIrradiance(timeOfDay);
    const dcOutputMw = irradiance * solarDcCapacityMwp;
    return Math.min(dcOutputMw, solarAcCapacityMw);
}

export function computeGridDemandMw(timeOfDay: number, scaleFactor: number, gridConnectionTotalMw: number): number {
    const baseMw = DEMAND_MODEL.baseFraction * gridConnectionTotalMw;
    const morningPeakMw = DEMAND_MODEL.morningPeakFraction * gridConnectionTotalMw;
    const eveningPeakMw = DEMAND_MODEL.eveningPeakFraction * gridConnectionTotalMw;
    const middayTroughMw = DEMAND_MODEL.middayTroughFraction * gridConnectionTotalMw;

    const morningHump = (morningPeakMw - baseMw) *
        Math.exp(-Math.pow(timeOfDay - DEMAND_MODEL.morningPeakHour, 2) / (2 * 1.6 * 1.6));

    const eveningHump = (eveningPeakMw - baseMw) *
        Math.exp(-Math.pow(timeOfDay - DEMAND_MODEL.eveningPeakHour, 2) / (2 * 2.1 * 2.1));

    const middayTrough = middayTroughMw *
        Math.exp(-Math.pow(timeOfDay - DEMAND_MODEL.middayTroughHour, 2) / (2 * 2.3 * 2.3));

    const rawDemand = (baseMw + morningHump + eveningHump - middayTrough) * scaleFactor;
    return Math.max(0, rawDemand);
}

export function settleHybridProjectTick({
    solarOutputMw,
    gridDemandMw,
    batteryPowerMw,
    gridPvEvacuationMw,
    gridConnectionLimitMw = gridPvEvacuationMw,
    currentPriceEurMwh,
    dtHours,
}: {
    solarOutputMw: number;
    gridDemandMw: number;
    batteryPowerMw: number;
    gridPvEvacuationMw: number;
    gridConnectionLimitMw?: number;
    currentPriceEurMwh: number;
    dtHours: number;
}): HybridProjectSettlement {
    const pccLimitMw = Math.max(0, gridConnectionLimitMw);
    const pvExportLimitMw = Math.max(0, Math.min(gridPvEvacuationMw, pccLimitMw));
    const pvToDemandMw = Math.min(solarOutputMw, gridDemandMw);
    const unmetDemandAfterPvMw = Math.max(0, gridDemandMw - pvToDemandMw);
    const pvSurplusAfterDemandMw = Math.max(0, solarOutputMw - pvToDemandMw);

    let effectiveBatteryPowerMw = batteryPowerMw;
    let batteryChargeFromSolarMw = 0;
    let batteryChargeFromGridMw = 0;
    let batteryDischargeToLoadMw = 0;
    let batteryDischargeToExportMw = 0;
    let solarExportMw = 0;
    let solarCurtailedMw = 0;
    let gridImportMw = 0;
    let gridExportMw = 0;
    let gridOverloadMw = 0;

    if (batteryPowerMw > 0) {
        batteryChargeFromSolarMw = Math.min(batteryPowerMw, pvSurplusAfterDemandMw);
        const requestedGridChargeMw = Math.max(0, batteryPowerMw - batteryChargeFromSolarMw);
        const baseGridImportMw = unmetDemandAfterPvMw;
        const importHeadroomMw = Math.max(0, pccLimitMw - baseGridImportMw);
        batteryChargeFromGridMw = Math.min(requestedGridChargeMw, importHeadroomMw);
        effectiveBatteryPowerMw = batteryChargeFromSolarMw + batteryChargeFromGridMw;
        // Base site demand can already exceed PCC import capacity; clamp served
        // import and report the remainder as overload below.
        gridImportMw = Math.min(pccLimitMw, baseGridImportMw + batteryChargeFromGridMw);
        gridOverloadMw = Math.max(0, baseGridImportMw - pccLimitMw);

        const solarExportCandidateMw = Math.max(0, pvSurplusAfterDemandMw - batteryChargeFromSolarMw);
        solarExportMw = Math.min(solarExportCandidateMw, pvExportLimitMw);
        solarCurtailedMw = Math.max(0, solarExportCandidateMw - solarExportMw);
        gridExportMw = solarExportMw;
    } else if (batteryPowerMw < 0) {
        const requestedDischargeMw = Math.abs(batteryPowerMw);
        batteryDischargeToLoadMw = Math.min(requestedDischargeMw, unmetDemandAfterPvMw);
        const remainingDischargeMw = requestedDischargeMw - batteryDischargeToLoadMw;

        // PV keeps priority on export because its marginal cost is effectively zero.
        solarExportMw = Math.min(pvSurplusAfterDemandMw, pvExportLimitMw);
        solarCurtailedMw = Math.max(0, pvSurplusAfterDemandMw - solarExportMw);
        const bessExportHeadroomMw = Math.max(0, pccLimitMw - solarExportMw);
        batteryDischargeToExportMw = Math.min(remainingDischargeMw, bessExportHeadroomMw);

        effectiveBatteryPowerMw = -(batteryDischargeToLoadMw + batteryDischargeToExportMw);
        gridImportMw = Math.min(pccLimitMw, Math.max(0, unmetDemandAfterPvMw - batteryDischargeToLoadMw));
        gridExportMw = solarExportMw + batteryDischargeToExportMw;
        gridOverloadMw = Math.max(0, unmetDemandAfterPvMw - batteryDischargeToLoadMw - pccLimitMw);
    } else {
        solarExportMw = Math.min(pvSurplusAfterDemandMw, pvExportLimitMw);
        solarCurtailedMw = Math.max(0, pvSurplusAfterDemandMw - solarExportMw);
        gridImportMw = Math.min(pccLimitMw, unmetDemandAfterPvMw);
        gridExportMw = solarExportMw;
        gridOverloadMw = Math.max(0, unmetDemandAfterPvMw - pccLimitMw);
    }

    const gridOverloadWarning = gridOverloadMw > 1e-9;
    const projectNetExportMw = gridExportMw - gridImportMw;
    const baselineSolarExportMw = Math.min(pvSurplusAfterDemandMw, pvExportLimitMw);

    // BESS revenue continues to value ALL discharge at the current tariff —
    // serving local load is valued the same as exporting, since it offsets
    // an avoided import cost at the same price. The two new fields are for
    // visualization + audit; the economic formula sums them.
    const batteryDischargeTotalMw = batteryDischargeToLoadMw + batteryDischargeToExportMw;
    const solarExportMwh = solarExportMw * dtHours;
    const batteryChargeFromGridMwh = batteryChargeFromGridMw * dtHours;
    const batteryDischargeTotalMwh = batteryDischargeTotalMw * dtHours;
    const solarOpportunityCostMwh = Math.max(0, baselineSolarExportMw - solarExportMw) * dtHours;

    const solarExportRevenueDeltaEur = solarExportMwh * currentPriceEurMwh;
    const bessDischargeRevenueDeltaEur = batteryDischargeTotalMwh * currentPriceEurMwh;
    const bessGridChargeCostDeltaEur = batteryChargeFromGridMwh * currentPriceEurMwh;
    const solarOpportunityCostDeltaEur = solarOpportunityCostMwh * currentPriceEurMwh;

    return {
        batteryPowerMw: normalizeZero(effectiveBatteryPowerMw),
        batteryChargeFromSolarMw: normalizeZero(batteryChargeFromSolarMw),
        batteryChargeFromGridMw: normalizeZero(batteryChargeFromGridMw),
        batteryDischargeToLoadMw: normalizeZero(batteryDischargeToLoadMw),
        batteryDischargeToExportMw: normalizeZero(batteryDischargeToExportMw),
        solarExportMw: normalizeZero(solarExportMw),
        solarCurtailedMw: normalizeZero(solarCurtailedMw),
        gridImportMw: normalizeZero(gridImportMw),
        gridExportMw: normalizeZero(gridExportMw),
        gridOverloadMw: normalizeZero(gridOverloadMw),
        gridOverloadWarning,
        projectNetExportMw: normalizeZero(projectNetExportMw),
        projectPnlDeltaEur:
            solarExportRevenueDeltaEur + bessDischargeRevenueDeltaEur - bessGridChargeCostDeltaEur,
        bessMarginDeltaEur:
            bessDischargeRevenueDeltaEur - bessGridChargeCostDeltaEur - solarOpportunityCostDeltaEur,
        solarExportRevenueDeltaEur,
        bessDischargeRevenueDeltaEur,
        bessGridChargeCostDeltaEur,
        solarOpportunityCostDeltaEur,
    };
}
