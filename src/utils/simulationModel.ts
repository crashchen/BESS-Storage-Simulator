import type { BatteryMode, GridState, TariffPeriod } from '../types';

const GRID_DEMAND_BASE_MW = 92;
const GRID_DEMAND_MORNING_PEAK_MW = 155;
const GRID_DEMAND_EVENING_PEAK_MW = 234;
const GRID_DEMAND_MIDDAY_TROUGH_MW = 32;

const AUTO_ARB_PEAK_START_HOUR = 18;
const AUTO_ARB_PEAK_END_HOUR = 23;
const AUTO_ARB_FORECAST_STEP_HOURS = 0.25;
const AUTO_ARB_MIN_PEAK_ENTRY_SOC = 92;
const AUTO_ARB_PEAK_RESERVE_SOC = 12;
const AUTO_ARB_TARGET_BUFFER_MWH = 12;
const AUTO_ARB_SOLAR_CONFIDENCE_BUFFER_MWH = 10;
const AUTO_ARB_OFF_PEAK_TOP_UP_FRACTION = 0.35;
const AUTO_ARB_MID_PEAK_TOP_UP_FRACTION = 0.2;
const NIGHT_TARGET_SOC = 40.0;

type DispatchModelState = Pick<
    GridState,
    | 'batterySocPercent'
    | 'batteryEnergyCapacityMwh'
    | 'batteryPowerRatingMw'
    | 'gridBessConnectionMw'
    | 'solarAcCapacityMw'
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
    if (tod < 6) return 'off-peak';
    if (tod < 18) return 'mid-peak';
    if (tod < 23) return 'peak';
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

export function computeSolarOutputMw(timeOfDay: number, solarAcCapacityMw: number): number {
    if (timeOfDay < 5.5 || timeOfDay > 19.5) return 0;

    const noon = 12.5;
    const halfSpan = 7;
    const normalizedTime = (timeOfDay - noon) / halfSpan;
    return Math.max(0, solarAcCapacityMw * Math.cos(normalizedTime * Math.PI * 0.5));
}

export function computeGridDemandMw(timeOfDay: number, scaleFactor: number, gridConnectionTotalMw: number): number {
    const morningHump = (GRID_DEMAND_MORNING_PEAK_MW - GRID_DEMAND_BASE_MW) *
        Math.exp(-Math.pow(timeOfDay - 8.0, 2) / (2 * 1.6 * 1.6));

    const eveningHump = (GRID_DEMAND_EVENING_PEAK_MW - GRID_DEMAND_BASE_MW) *
        Math.exp(-Math.pow(timeOfDay - 19.0, 2) / (2 * 2.1 * 2.1));

    const middayTrough = GRID_DEMAND_MIDDAY_TROUGH_MW *
        Math.exp(-Math.pow(timeOfDay - 13.0, 2) / (2 * 2.3 * 2.3));

    const rawDemand = (GRID_DEMAND_BASE_MW + morningHump + eveningHump - middayTrough) * scaleFactor;
    return clamp(rawDemand, 0, gridConnectionTotalMw);
}

function integrateWindowEnergy(fromHour: number, toHour: number, samplePowerMw: (timeOfDay: number) => number): number {
    if (fromHour >= toHour) return 0;

    let energyMwh = 0;

    for (let cursor = fromHour; cursor < toHour; cursor += AUTO_ARB_FORECAST_STEP_HOURS) {
        const windowHours = Math.min(AUTO_ARB_FORECAST_STEP_HOURS, toHour - cursor);
        const sampleHour = cursor + windowHours / 2;
        energyMwh += samplePowerMw(sampleHour) * windowHours;
    }

    return energyMwh;
}

export function getAutoArbOutlook(state: DispatchModelState, timeOfDay: number): AutoArbOutlook {
    const transferLimitMw = getBatteryTransferLimitMw(state);
    const currentEnergyMwh = (state.batterySocPercent / 100) * state.batteryEnergyCapacityMwh;
    const reserveEnergyMwh = (AUTO_ARB_PEAK_RESERVE_SOC / 100) * state.batteryEnergyCapacityMwh;

    const forecastPeakDemandMwh = integrateWindowEnergy(
        Math.max(timeOfDay, AUTO_ARB_PEAK_START_HOUR),
        AUTO_ARB_PEAK_END_HOUR,
        (forecastTod) => {
            const solarMw = computeSolarOutputMw(forecastTod, state.solarAcCapacityMw);
            const demandMw = computeGridDemandMw(
                forecastTod,
                state.dispatchScalePercent / 100,
                state.gridConnectionTotalMw,
            );
            return Math.min(Math.max(demandMw - solarMw, 0), transferLimitMw);
        },
    );

    const targetEnergyMwh = clamp(
        Math.max(
            (AUTO_ARB_MIN_PEAK_ENTRY_SOC / 100) * state.batteryEnergyCapacityMwh,
            forecastPeakDemandMwh + reserveEnergyMwh + AUTO_ARB_TARGET_BUFFER_MWH,
        ),
        reserveEnergyMwh,
        state.batteryEnergyCapacityMwh,
    );

    const forecastSolarChargeMwh = timeOfDay < AUTO_ARB_PEAK_START_HOUR
        ? integrateWindowEnergy(timeOfDay, AUTO_ARB_PEAK_START_HOUR, (forecastTod) => {
            const solarMw = computeSolarOutputMw(forecastTod, state.solarAcCapacityMw);
            const demandMw = computeGridDemandMw(
                forecastTod,
                state.dispatchScalePercent / 100,
                state.gridConnectionTotalMw,
            );
            return Math.min(Math.max(solarMw - demandMw, 0), transferLimitMw);
        })
        : 0;

    return {
        targetSocPercent: (targetEnergyMwh / Math.max(state.batteryEnergyCapacityMwh, 1e-9)) * 100,
        targetEnergyMwh,
        forecastSolarChargeMwh,
        forecastPeakDemandMwh,
        shouldGridTopUp:
            timeOfDay < AUTO_ARB_PEAK_START_HOUR &&
            currentEnergyMwh + forecastSolarChargeMwh + AUTO_ARB_SOLAR_CONFIDENCE_BUFFER_MWH < targetEnergyMwh,
    };
}

export function getAutoArbPlan(
    state: DispatchModelState,
    timeOfDay: number,
    solarOutputMw: number,
    gridDemandMw: number,
    tariffPeriod: TariffPeriod,
): AutoArbPlan {
    const transferLimitMw = getBatteryTransferLimitMw(state);
    const capacityMwh = state.batteryEnergyCapacityMwh;
    const currentEnergyMwh = (state.batterySocPercent / 100) * capacityMwh;
    const reserveEnergyMwh = (AUTO_ARB_PEAK_RESERVE_SOC / 100) * capacityMwh;
    const outlook = getAutoArbOutlook(state, timeOfDay);
    const solarSurplusMw = Math.max(0, solarOutputMw - gridDemandMw);
    const demandDeficitMw = Math.max(0, gridDemandMw - solarOutputMw);

    if (tariffPeriod === 'peak') {
        const remainingPeakHours = Math.max(0.25, AUTO_ARB_PEAK_END_HOUR - timeOfDay);
        const availableDischargeMwh = Math.max(0, currentEnergyMwh - reserveEnergyMwh);
        const sustainableDischargeMw = Math.min(transferLimitMw, availableDischargeMwh / remainingPeakHours);
        const targetDischargeMw = Math.min(demandDeficitMw, sustainableDischargeMw);

        if (targetDischargeMw > 0.5) {
            return {
                ...outlook,
                mode: 'discharging',
                targetPowerMw: -targetDischargeMw,
            };
        }
    } else if (timeOfDay < AUTO_ARB_PEAK_START_HOUR && state.batterySocPercent < 100) {
        const timeUntilPeakHours = Math.max(0.5, AUTO_ARB_PEAK_START_HOUR - timeOfDay);
        const energyGapMwh = Math.max(0, outlook.targetEnergyMwh - currentEnergyMwh);
        const requiredAverageChargeMw = energyGapMwh / timeUntilPeakHours;
        const topUpFloorMw = tariffPeriod === 'off-peak'
            ? transferLimitMw * AUTO_ARB_OFF_PEAK_TOP_UP_FRACTION
            : transferLimitMw * AUTO_ARB_MID_PEAK_TOP_UP_FRACTION;
        const wantsNightReserve = tariffPeriod === 'off-peak' && state.batterySocPercent < NIGHT_TARGET_SOC;
        const wantsGridTopUp = outlook.shouldGridTopUp || wantsNightReserve;
        const targetChargeMw = wantsGridTopUp
            ? clamp(Math.max(solarSurplusMw, requiredAverageChargeMw, topUpFloorMw), 0, transferLimitMw)
            : clamp(solarSurplusMw, 0, transferLimitMw);

        if (targetChargeMw > 0.5) {
            return {
                ...outlook,
                mode: 'charging',
                targetPowerMw: targetChargeMw,
            };
        }
    } else if (tariffPeriod === 'off-peak' && state.batterySocPercent < NIGHT_TARGET_SOC) {
        return {
            ...outlook,
            mode: 'charging',
            targetPowerMw: transferLimitMw * AUTO_ARB_OFF_PEAK_TOP_UP_FRACTION,
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

    const solarExportMwh = solarExportMw * dtHours;
    const batteryChargeFromSolarMwh = batteryChargeFromSolarMw * dtHours;
    const batteryChargeFromGridMwh = batteryChargeFromGridMw * dtHours;
    const batteryDischargeToGridMwh = batteryDischargeToGridMw * dtHours;

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
            batteryChargeFromSolarMwh * currentPriceEurMwh,
    };
}
