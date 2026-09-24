import { AUTO_ARB, BESS } from '../config';
import type { TariffPeriod } from '../types';

/** Compare a steady 0→target shoulder cycle with a peak-paced discharge.
 * The peak horizon floor leaves H / peakHours × exp(-1) of its usable energy
 * at 23:00. Account for that residual and the smaller overnight recharge.
 * This assumes an unconstrained cycle, not a load/PV/PCC forecast.
 */
export function shouldHoldForEveningPeak(rates: Record<TariffPeriod, number>): boolean {
    const shoulder = rates['mid-peak'];
    if (rates.peak <= shoulder) return false;

    const targetShare = AUTO_ARB.peakEntryTargetSocPercent / 100;
    const usablePeakShare = (AUTO_ARB.peakEntryTargetSocPercent - AUTO_ARB.peakReserveSocPercent) / 100;
    const peakHours = AUTO_ARB.peakEndHour - AUTO_ARB.peakStartHour;
    if (usablePeakShare <= 0 || peakHours <= 0) return false;

    const floorHours = Math.min(AUTO_ARB.peakPacingMinRemainingHours, peakHours);
    const deliveredPeakShare = usablePeakShare * (1 - floorHours / peakHours * Math.exp(-1));
    const avoidedOvernightRechargeShare = targetShare - deliveredPeakShare;
    const peakValue = deliveredPeakShare * BESS.dischargeEfficiency * rates.peak;
    const avoidedRechargeCost = avoidedOvernightRechargeShare * rates['off-peak'] / BESS.chargeEfficiency;
    const oldShoulderValue = targetShare * BESS.dischargeEfficiency * shoulder;
    return peakValue + avoidedRechargeCost > oldShoulderValue;
}
