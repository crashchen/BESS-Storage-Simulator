import { AUTO_ARB, BESS } from '../config';
import type { TariffPeriod } from '../types';

/** Compare a steady 0→target shoulder cycle with a peak-paced discharge.
 * The peak horizon floor leaves H / peakHours × exp(-1) of its usable energy
 * at 23:00. Account for that residual and the smaller overnight recharge.
 * This assumes an unconstrained cycle, not a load/PV/PCC forecast.
 */
export function getEveningPeakHoldThresholdEurMwh(
    rates: Pick<Record<TariffPeriod, number>, 'off-peak' | 'mid-peak'>,
): number {
    const shoulder = rates['mid-peak'];
    const targetShare = AUTO_ARB.peakEntryTargetSocPercent / 100;
    const usablePeakShare = (AUTO_ARB.peakEntryTargetSocPercent - AUTO_ARB.peakReserveSocPercent) / 100;
    const peakHours = AUTO_ARB.peakEndHour - AUTO_ARB.peakStartHour;
    if (usablePeakShare <= 0 || peakHours <= 0) return Infinity;

    const floorHours = Math.min(AUTO_ARB.peakPacingMinRemainingHours, peakHours);
    const deliveredPeakShare = usablePeakShare * (1 - floorHours / peakHours * Math.exp(-1));
    const avoidedOvernightRechargeShare = targetShare - deliveredPeakShare;
    const avoidedRechargeCost = avoidedOvernightRechargeShare * rates['off-peak'] / BESS.chargeEfficiency;
    const oldShoulderValue = targetShare * BESS.dischargeEfficiency * shoulder;
    const economicThreshold = (oldShoulderValue - avoidedRechargeCost)
        / (deliveredPeakShare * BESS.dischargeEfficiency);
    // The policy also requires peak > shoulder, even when the cycle comparison
    // alone would already favor holding at a lower peak tariff.
    return Math.max(shoulder, economicThreshold);
}

export function shouldHoldForEveningPeak(rates: Record<TariffPeriod, number>): boolean {
    return rates.peak > getEveningPeakHoldThresholdEurMwh(rates);
}
