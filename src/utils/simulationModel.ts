import type { BatteryMode, GridState, TariffPeriod } from '../types';
import { AUTO_ARB, BESS, DEMAND_MODEL, SOLAR, TARIFF } from '../config';

type DispatchModelState = Pick<
    GridState,
    | 'batterySocPercent'
    | 'batteryEnergyCapacityMwh'
    | 'batteryPowerRatingMw'
    | 'gridBessConnectionMw'
    | 'solarAcCapacityMw'
    | 'solarDcCapacityMwp'
    | 'dispatchScalePercent'
    | 'gridConnectionTotalMw'
>;

export interface AutoArbOutlook {
    targetSocPercent: number;
    targetEnergyMwh: number;
    forecastSolarChargeMwh: number;
    forecastPeakDemandMwh: number;
    shouldGridTopUp: boolean;
}

export interface AutoArbPlan extends AutoArbOutlook {
    mode: BatteryMode;
    targetPowerMw: number;
}

export interface HybridProjectSettlement {
    batteryChargeFromSolarMw: number;
    batteryChargeFromGridMw: number;
    batteryDischargeToGridMw: number;
    solarExportMw: number;
    solarCurtailedMw: number;
    projectNetExportMw: number;
    projectPnlDeltaEur: number;
    bessMarginDeltaEur: number;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
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

export function getBatteryDurationHours(powerRatingMw: number, energyCapacityMwh: number): number {
    return energyCapacityMwh / Math.max(powerRatingMw, 1e-9);
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
    return clamp(rawDemand, 0, gridConnectionTotalMw);
}

function integrateWindowEnergy(fromHour: number, toHour: number, samplePowerMw: (timeOfDay: number) => number): number {
    if (fromHour >= toHour) return 0;

    let energyMwh = 0;

    for (let cursor = fromHour; cursor < toHour; cursor += AUTO_ARB.forecastStepHours) {
        const windowHours = Math.min(AUTO_ARB.forecastStepHours, toHour - cursor);
        const sampleHour = cursor + windowHours / 2;
        energyMwh += samplePowerMw(sampleHour) * windowHours;
    }

    return energyMwh;
}

export function getAutoArbOutlook(state: DispatchModelState, timeOfDay: number): AutoArbOutlook {
    const transferLimitMw = getBatteryTransferLimitMw(state);
    const currentEnergyMwh = (state.batterySocPercent / 100) * state.batteryEnergyCapacityMwh;
    const reserveEnergyMwh = (AUTO_ARB.peakReserveSocPercent / 100) * state.batteryEnergyCapacityMwh;

    const forecastPeakDemandMwh = integrateWindowEnergy(
        Math.max(timeOfDay, AUTO_ARB.peakStartHour),
        AUTO_ARB.peakEndHour,
        (forecastTod) => {
            const solarMw = computeSolarOutputMw(
                forecastTod,
                state.solarAcCapacityMw,
                state.solarDcCapacityMwp,
            );
            const demandMw = computeGridDemandMw(
                forecastTod,
                state.dispatchScalePercent / 100,
                state.gridConnectionTotalMw,
            );
            const acDeficitMw = Math.min(Math.max(demandMw - solarMw, 0), transferLimitMw);
            return acDeficitMw / Math.max(BESS.dischargeEfficiency, 1e-9);
        },
    );

    const targetEnergyMwh = clamp(
        Math.max(
            (AUTO_ARB.minPeakEntrySocPercent / 100) * state.batteryEnergyCapacityMwh,
            forecastPeakDemandMwh + reserveEnergyMwh + AUTO_ARB.targetBufferMwh,
        ),
        reserveEnergyMwh,
        state.batteryEnergyCapacityMwh,
    );

    const forecastSolarChargeMwh = timeOfDay < AUTO_ARB.peakStartHour
        ? integrateWindowEnergy(timeOfDay, AUTO_ARB.peakStartHour, (forecastTod) => {
            const solarMw = computeSolarOutputMw(
                forecastTod,
                state.solarAcCapacityMw,
                state.solarDcCapacityMwp,
            );
            const demandMw = computeGridDemandMw(
                forecastTod,
                state.dispatchScalePercent / 100,
                state.gridConnectionTotalMw,
            );
            const acSurplusMw = Math.min(Math.max(solarMw - demandMw, 0), transferLimitMw);
            return acSurplusMw * BESS.chargeEfficiency;
        })
        : 0;

    const forecastSolarUsableMwh = Math.max(0, forecastSolarChargeMwh - AUTO_ARB.solarConfidenceBufferMwh);

    return {
        targetSocPercent: (targetEnergyMwh / Math.max(state.batteryEnergyCapacityMwh, 1e-9)) * 100,
        targetEnergyMwh,
        forecastSolarChargeMwh,
        forecastPeakDemandMwh,
        shouldGridTopUp:
            timeOfDay < AUTO_ARB.peakStartHour &&
            currentEnergyMwh + forecastSolarUsableMwh < targetEnergyMwh,
    };
}

export function getAutoArbPlan(
    state: DispatchModelState,
    timeOfDay: number,
    solarOutputMw: number,
    gridDemandMw: number,
    tariffPeriod: TariffPeriod,
    tariffRatesEurMwh: Record<TariffPeriod, number>,
): AutoArbPlan {
    const transferLimitMw = getBatteryTransferLimitMw(state);
    const capacityMwh = state.batteryEnergyCapacityMwh;
    const currentEnergyMwh = (state.batterySocPercent / 100) * capacityMwh;
    const reserveEnergyMwh = (AUTO_ARB.peakReserveSocPercent / 100) * capacityMwh;
    const outlook = getAutoArbOutlook(state, timeOfDay);
    const solarSurplusMw = Math.max(0, solarOutputMw - gridDemandMw);
    const demandDeficitMw = Math.max(0, gridDemandMw - solarOutputMw);
    const peakRate = tariffRatesEurMwh.peak;
    const offRate = tariffRatesEurMwh['off-peak'];
    const roundTripEff = BESS.chargeEfficiency * BESS.dischargeEfficiency;
    const currentRate = tariffRatesEurMwh[tariffPeriod];

    if (tariffPeriod === 'peak') {
        const peakIsProfitable = peakRate > 0 && peakRate >= offRate;
        if (peakIsProfitable) {
            const remainingPeakHours = Math.max(0.25, AUTO_ARB.peakEndHour - timeOfDay);
            const availableDischargeMwh = Math.max(0, currentEnergyMwh - reserveEnergyMwh);
            const sustainableDischargeMw = Math.min(
                transferLimitMw,
                (availableDischargeMwh * BESS.dischargeEfficiency) / remainingPeakHours,
            );
            const targetDischargeMw = Math.min(demandDeficitMw, sustainableDischargeMw);

            if (targetDischargeMw > 0.5) {
                return {
                    ...outlook,
                    mode: 'discharging',
                    targetPowerMw: -targetDischargeMw,
                };
            }
        }
    } else if (timeOfDay < AUTO_ARB.peakStartHour && state.batterySocPercent < 100) {
        const timeUntilPeakHours = Math.max(0.5, AUTO_ARB.peakStartHour - timeOfDay);
        const energyGapMwh = Math.max(0, outlook.targetEnergyMwh - currentEnergyMwh);
        const forecastSolarUsableMwh = Math.max(0, outlook.forecastSolarChargeMwh - AUTO_ARB.solarConfidenceBufferMwh);
        const residualGridGapMwh = Math.max(0, energyGapMwh - forecastSolarUsableMwh);
        const requiredGridChargeMw = residualGridGapMwh / Math.max(timeUntilPeakHours * BESS.chargeEfficiency, 1e-9);
        const topUpFloorMw = tariffPeriod === 'off-peak'
            ? transferLimitMw * AUTO_ARB.offPeakTopUpFraction
            : transferLimitMw * AUTO_ARB.midPeakTopUpFraction;
        const wantsNightReserve = tariffPeriod === 'off-peak' && state.batterySocPercent < AUTO_ARB.nightTargetSocPercent;
        const peakProfitableVsCurrent = peakRate > currentRate / Math.max(roundTripEff, 1e-9);
        const wantsGridTopUp = wantsNightReserve || (outlook.shouldGridTopUp && peakProfitableVsCurrent);
        const forecastAwareChargeMw = clamp(solarSurplusMw + requiredGridChargeMw, 0, transferLimitMw);
        const targetChargeMw = wantsGridTopUp
            ? clamp(Math.max(forecastAwareChargeMw, topUpFloorMw), 0, transferLimitMw)
            : clamp(solarSurplusMw, 0, transferLimitMw);

        if (targetChargeMw > 0.5) {
            return {
                ...outlook,
                mode: 'charging',
                targetPowerMw: targetChargeMw,
            };
        }
    } else if (tariffPeriod === 'off-peak' && state.batterySocPercent < AUTO_ARB.nightTargetSocPercent) {
        return {
            ...outlook,
            mode: 'charging',
            targetPowerMw: transferLimitMw * AUTO_ARB.offPeakTopUpFraction,
        };
    }

    return {
        ...outlook,
        mode: 'idle',
        targetPowerMw: 0,
    };
}

export function settleHybridProjectTick({
    solarOutputMw,
    gridDemandMw,
    batteryPowerMw,
    gridPvEvacuationMw,
    currentPriceEurMwh,
    dtHours,
}: {
    solarOutputMw: number;
    gridDemandMw: number;
    batteryPowerMw: number;
    gridPvEvacuationMw: number;
    currentPriceEurMwh: number;
    dtHours: number;
}): HybridProjectSettlement {
    const solarSurplusMw = Math.max(solarOutputMw - gridDemandMw, 0);
    const batteryChargeFromSolarMw = batteryPowerMw > 0
        ? Math.min(batteryPowerMw, solarSurplusMw)
        : 0;
    const batteryChargeFromGridMw = batteryPowerMw > 0
        ? Math.max(0, batteryPowerMw - batteryChargeFromSolarMw)
        : 0;
    const batteryDischargeToGridMw = batteryPowerMw < 0 ? Math.abs(batteryPowerMw) : 0;
    const solarExportMw = clamp(
        Math.max(0, solarOutputMw - batteryChargeFromSolarMw),
        0,
        gridPvEvacuationMw,
    );
    const solarCurtailedMw = Math.max(0, solarOutputMw - batteryChargeFromSolarMw - solarExportMw);
    const projectNetExportMw = solarExportMw + batteryDischargeToGridMw - batteryChargeFromGridMw;
    const baselineSolarExportMw = Math.min(solarOutputMw, gridPvEvacuationMw);

    const solarExportMwh = solarExportMw * dtHours;
    const batteryChargeFromGridMwh = batteryChargeFromGridMw * dtHours;
    const batteryDischargeToGridMwh = batteryDischargeToGridMw * dtHours;
    const solarOpportunityCostMwh = Math.max(0, baselineSolarExportMw - solarExportMw) * dtHours;

    return {
        batteryChargeFromSolarMw,
        batteryChargeFromGridMw,
        batteryDischargeToGridMw,
        solarExportMw,
        solarCurtailedMw,
        projectNetExportMw,
        projectPnlDeltaEur:
            solarExportMwh * currentPriceEurMwh +
            batteryDischargeToGridMwh * currentPriceEurMwh -
            batteryChargeFromGridMwh * currentPriceEurMwh,
        bessMarginDeltaEur:
            batteryDischargeToGridMwh * currentPriceEurMwh -
            batteryChargeFromGridMwh * currentPriceEurMwh -
            solarOpportunityCostMwh * currentPriceEurMwh,
    };
}
