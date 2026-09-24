import { AUTO_ARB } from '../config';
import type { BatteryMode, DispatchMode, GridState } from '../types';
import { getBatteryTransferLimitMw } from './simulationModel';
import { shouldHoldForEveningPeak } from './autoPolicy';

// Match the existing one-decimal MW readouts and visible-flow deadband. This
// affects presentation only; the engine retains its full-precision sample.
const DISPLAY_ZERO_MW = 0.05;
const SOC_EPSILON = 1e-9;

const POWER_LABEL: Record<BatteryMode, string> = {
    charging: 'Charging',
    discharging: 'Discharging',
    idle: 'Idle',
};

const DISPATCH_LABEL: Record<DispatchMode, string> = {
    auto: 'AUTO',
    'manual-charge': 'Manual charge',
    'manual-discharge': 'Manual discharge',
    'manual-idle': 'Manual idle',
};

function getPolicyText(state: GridState): string {
    switch (state.dispatchMode) {
        case 'manual-charge':
            return 'Manual charge requests charging when the simulation runs, subject to available storage and PCS/interconnection limits.';
        case 'manual-discharge':
            return 'Manual discharge requests discharging when the simulation runs, subject to stored energy and PCS/interconnection limits.';
        case 'manual-idle':
            return 'Manual idle requests no BESS charge or discharge.';
        case 'auto':
            if (state.tariffPeriod === 'peak') {
                return `AUTO policy: pace discharge across the peak window, retaining a ${AUTO_ARB.peakReserveSocPercent}% SoC reserve. PV export has priority at the PCC.`;
            }
            if (state.tariffPeriod === 'off-peak') {
                return `AUTO policy: charge toward ${AUTO_ARB.peakEntryTargetSocPercent}% SoC from PV/grid; auto discharge is locked out. Above the target, only PV surplus requests charging.`;
            }
            if (shouldHoldForEveningPeak(state.tariffRatesEurMwh)) {
                return `AUTO policy: charge from PV surplus and hold ${AUTO_ARB.peakEntryTargetSocPercent}% SoC for the evening peak; the tariff spread clears the estimated efficiency and reserve hurdle. Only energy above the target serves local demand.`;
            }
            return 'AUTO policy: charge from PV surplus or discharge to serve local demand; no daytime peak hold because the tariff spread does not clear the estimated efficiency and reserve hurdle.';
    }
}

function getReadingNote(state: GridState, displayedPowerMw: number): string | null {
    if (state.simulationStatus === 'paused') {
        return 'Simulation time and earnings are frozen; power readings describe a paused snapshot.';
    }
    if (state.simulationStatus === 'stopped') {
        return 'Start the simulation to apply the selected dispatch.';
    }
    // A tick can finish at full/empty SoC while still recording its nonzero
    // average power. Do not overwrite that sample with an inferred idle state.
    if (displayedPowerMw !== 0) return null;
    if (state.batteryPowerMw !== 0) return 'BESS transfer rounds to 0.0 MW.';
    if (state.dispatchMode === 'manual-idle') return 'Manual idle selected; no BESS transfer requested.';
    if (getBatteryTransferLimitMw(state) <= 0) return 'BESS transfer capacity is 0 MW.';

    const solarSurplusMw = Math.max(0, state.solarOutputMw - state.gridDemandMw);
    const loadDeficitMw = Math.max(0, state.gridDemandMw - state.solarOutputMw);
    const isAuto = state.dispatchMode === 'auto';
    const requestsCharge = state.dispatchMode === 'manual-charge' || (isAuto && (
        state.tariffPeriod === 'off-peak'
            ? state.batterySocPercent < AUTO_ARB.peakEntryTargetSocPercent || solarSurplusMw > 0
            : state.tariffPeriod === 'mid-peak' && solarSurplusMw > 0
    ));
    const holdForPeak = isAuto && state.tariffPeriod === 'mid-peak'
        && shouldHoldForEveningPeak(state.tariffRatesEurMwh);
    const requestsDischarge = state.dispatchMode === 'manual-discharge' || (isAuto && (
        state.tariffPeriod === 'peak' || (state.tariffPeriod === 'mid-peak' && loadDeficitMw > 0
            && (!holdForPeak || state.batterySocPercent > AUTO_ARB.peakEntryTargetSocPercent))
    ));

    if (requestsCharge && state.batterySocPercent >= 100 - SOC_EPSILON) {
        return 'Battery full; no charging headroom remains.';
    }
    if (requestsDischarge && state.batterySocPercent <= SOC_EPSILON) {
        return 'Battery empty; no stored energy is available for discharge.';
    }
    if (isAuto && state.tariffPeriod === 'peak' && state.batterySocPercent <= AUTO_ARB.peakReserveSocPercent) {
        return `At or below the ${AUTO_ARB.peakReserveSocPercent}% peak reserve; AUTO requests no further discharge.`;
    }
    if (isAuto && state.tariffPeriod === 'off-peak' && state.batterySocPercent >= AUTO_ARB.peakEntryTargetSocPercent && solarSurplusMw === 0) {
        return 'Off-peak charge target met; AUTO discharge is locked out overnight.';
    }
    if (holdForPeak && loadDeficitMw > 0 && solarSurplusMw === 0
        && state.batterySocPercent <= AUTO_ARB.peakEntryTargetSocPercent) {
        return `At or below the ${AUTO_ARB.peakEntryTargetSocPercent}% evening target; AUTO requests no shoulder discharge.`;
    }
    if (isAuto && state.tariffPeriod === 'mid-peak' && solarSurplusMw === 0 && loadDeficitMw === 0) {
        return 'Solar output and local demand are balanced.';
    }
    // The state does not store a dispatch-limitation reason. Avoid diagnosing
    // a PCC, price, or equipment restriction from a zero-power sample alone.
    return 'No BESS transfer in the current power sample.';
}

/** Presentation of a sampled power reading, independent of dispatch intent.
 * `batteryMode` can be pre-seeded by a command before a tick has executed.
 * Paused presets and paused runs retain their power sample; never zero it here.
 */
export function selectBessPower(state: Pick<GridState, 'batteryPowerMw'>) {
    const powerMw = Math.abs(state.batteryPowerMw) < DISPLAY_ZERO_MW ? 0 : state.batteryPowerMw;
    const powerMode: BatteryMode = powerMw > 0 ? 'charging' : powerMw < 0 ? 'discharging' : 'idle';
    return { powerMw, powerMode };
}

export function selectBessDisplay(state: GridState) {
    const { powerMw, powerMode } = selectBessPower(state);
    const powerLabel = POWER_LABEL[powerMode];
    const runLabel = state.simulationStatus === 'paused'
        ? 'Paused snapshot'
        : state.simulationStatus === 'stopped' ? 'Stopped' : 'Running';

    return {
        powerMw,
        powerMode,
        powerLabel,
        runLabel,
        statusLabel: state.simulationStatus === 'running' ? powerLabel : runLabel,
        dispatchLabel: DISPATCH_LABEL[state.dispatchMode],
        policyText: getPolicyText(state),
        readingNote: getReadingNote(state, powerMw),
    };
}
