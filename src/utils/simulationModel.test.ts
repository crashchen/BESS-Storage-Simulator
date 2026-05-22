import { describe, expect, it } from 'vitest';
import { SOLAR } from '../config';
import { computeGridDemandMw, computeSolarOutputMw, settleHybridProjectTick } from './simulationModel';

function expectActivePowerConservation(
    input: Parameters<typeof settleHybridProjectTick>[0],
    settlement: ReturnType<typeof settleHybridProjectTick>,
) {
    const batteryChargeMw = settlement.batteryChargeFromSolarMw + settlement.batteryChargeFromGridMw;
    const batteryDischargeTotalMw = settlement.batteryDischargeToLoadMw + settlement.batteryDischargeToExportMw;
    const supplyMw =
        input.solarOutputMw + settlement.gridImportMw + settlement.gridOverloadMw + batteryDischargeTotalMw;
    const demandMw =
        input.gridDemandMw + settlement.gridExportMw + batteryChargeMw + settlement.solarCurtailedMw;

    expect(supplyMw).toBeCloseTo(demandMw, 6);
}

describe('simulationModel demand curve', () => {
    it('produces the same demand curve at the Romania baseline (288 MW total)', () => {
        const baselineFormula = (timeOfDay: number) => {
            const base = 92;
            const morningPeak = 155;
            const eveningPeak = 234;
            const middayTrough = 32;
            const morningHump = (morningPeak - base) *
                Math.exp(-Math.pow(timeOfDay - 8, 2) / (2 * 1.6 * 1.6));
            const eveningHump = (eveningPeak - base) *
                Math.exp(-Math.pow(timeOfDay - 19, 2) / (2 * 2.1 * 2.1));
            const middayDip = middayTrough *
                Math.exp(-Math.pow(timeOfDay - 13, 2) / (2 * 2.3 * 2.3));

            return Math.max(0, Math.min(288, base + morningHump + eveningHump - middayDip));
        };

        for (const timeOfDay of [0, 6, 8, 13, 19, 22]) {
            expect(computeGridDemandMw(timeOfDay, 1.0, 288)).toBeCloseTo(baselineFormula(timeOfDay), 6);
        }
    });

    it('scales the demand curve linearly with gridConnectionTotalMw', () => {
        for (const timeOfDay of [6, 12, 19]) {
            const at288 = computeGridDemandMw(timeOfDay, 1.0, 288);
            const at144 = computeGridDemandMw(timeOfDay, 1.0, 144);
            expect(at144).toBeCloseTo(at288 / 2, 6);
        }
    });
});

describe('simulationModel solar output', () => {
    const computeExpectedIrradiance = (timeOfDay: number) => {
        if (timeOfDay < SOLAR.sunriseHour || timeOfDay > SOLAR.sunsetHour) return 0;

        const halfSpan = (SOLAR.sunsetHour - SOLAR.sunriseHour) / 2;
        const normalizedTime = (timeOfDay - SOLAR.solarNoon) / halfSpan;
        return Math.max(0, Math.cos(normalizedTime * Math.PI * 0.5));
    };
    const halfSpan = (SOLAR.sunsetHour - SOLAR.sunriseHour) / 2;
    const halfIrradianceTime = SOLAR.solarNoon - (halfSpan * 2) / 3;

    it('matches irradiance-scaled AC output when DC and AC capacities are equal', () => {
        for (const timeOfDay of [SOLAR.solarNoon, halfIrradianceTime]) {
            const expectedIrradiance = computeExpectedIrradiance(timeOfDay);
            expect(computeSolarOutputMw(timeOfDay, 100, 100)).toBeCloseTo(expectedIrradiance * 100, 6);
        }
    });

    it('clips midday DC output at the inverter AC capacity', () => {
        expect(computeSolarOutputMw(SOLAR.solarNoon, 100, 150)).toBe(100);
    });

    it('uses DC capacity on the shoulder before clipping', () => {
        expect(computeSolarOutputMw(halfIrradianceTime, 100, 150)).toBeCloseTo(75, 6);
        expect(computeSolarOutputMw(halfIrradianceTime, 100, 150)).toBeGreaterThan(50);
    });

    it('returns zero outside daylight regardless of DC capacity', () => {
        for (const timeOfDay of [SOLAR.sunriseHour - 0.25, SOLAR.sunsetHour + 0.25]) {
            expect(computeSolarOutputMw(timeOfDay, 100, 150)).toBe(0);
        }
    });
});

describe('simulationModel settlement', () => {
    it('tracks project P&L and BESS margin separately when solar charges the battery', () => {
        const settlement = settleHybridProjectTick({
            solarOutputMw: 80,
            gridDemandMw: 40,
            batteryPowerMw: 20,
            gridPvEvacuationMw: 102,
            currentPriceEurMwh: 100,
            dtHours: 1,
        });

        expect(settlement.batteryChargeFromSolarMw).toBe(20);
        expect(settlement.batteryChargeFromGridMw).toBe(0);
        expect(settlement.solarExportMw).toBe(20);
        expect(settlement.projectPnlDeltaEur).toBe(2000);
        expect(settlement.bessMarginDeltaEur).toBe(-2000);
    });

    it.each([
        {
            name: 'charging from PV surplus',
            input: {
                solarOutputMw: 80,
                gridDemandMw: 40,
                batteryPowerMw: 20,
                gridPvEvacuationMw: 102,
                gridConnectionLimitMw: 288,
                currentPriceEurMwh: 100,
                dtHours: 1,
            },
        },
        {
            name: 'discharging into local deficit',
            input: {
                solarOutputMw: 20,
                gridDemandMw: 70,
                batteryPowerMw: -30,
                gridPvEvacuationMw: 102,
                gridConnectionLimitMw: 288,
                currentPriceEurMwh: 100,
                dtHours: 1,
            },
        },
        {
            name: 'idle with grid import and export clamp',
            input: {
                solarOutputMw: 150,
                gridDemandMw: 30,
                batteryPowerMw: 0,
                gridPvEvacuationMw: 90,
                gridConnectionLimitMw: 100,
                currentPriceEurMwh: 100,
                dtHours: 1,
            },
        },
        {
            // Demand exceeds the PCC limit and BESS cannot fully cover it:
            // settlement reports the residual as `gridOverloadMw`, and the
            // invariant must still hold with overload on the supply side.
            name: 'overload with battery partially covering deficit',
            input: {
                solarOutputMw: 30,
                gridDemandMw: 300,
                batteryPowerMw: -80,
                gridPvEvacuationMw: 102,
                gridConnectionLimitMw: 150,
                currentPriceEurMwh: 100,
                dtHours: 1,
            },
        },
    ])('preserves active-power conservation while $name', ({ name, input }) => {
        const settlement = settleHybridProjectTick(input);

        expectActivePowerConservation(input, settlement);

        // Sanity: the overload row must actually exercise the overload branch
        // so future tweaks to the input don't silently retire the case.
        if (name === 'overload with battery partially covering deficit') {
            expect(settlement.gridOverloadMw).toBeGreaterThan(0);
            expect(settlement.gridOverloadWarning).toBe(true);
        }
    });

    it('does not charge BESS margin opportunity cost for solar that would have been clipped', () => {
        const settlement = settleHybridProjectTick({
            solarOutputMw: 130,
            gridDemandMw: 0,
            batteryPowerMw: 20,
            gridPvEvacuationMw: 102,
            currentPriceEurMwh: 100,
            dtHours: 1,
        });

        expect(settlement.solarExportMw).toBe(102);
        expect(settlement.bessMarginDeltaEur).toBe(0);
        expect(settlement.projectPnlDeltaEur).toBe(10200);
    });

    it('turns negative-price grid charging into positive project cashflow', () => {
        const settlement = settleHybridProjectTick({
            solarOutputMw: 0,
            gridDemandMw: 120,
            batteryPowerMw: 30,
            gridPvEvacuationMw: 102,
            gridConnectionLimitMw: 288,
            currentPriceEurMwh: -25,
            dtHours: 1,
        });

        expect(settlement.batteryChargeFromGridMw).toBe(30);
        expect(settlement.projectPnlDeltaEur).toBe(750);
        expect(settlement.bessMarginDeltaEur).toBe(750);
    });

    it('keeps PV export ahead of BESS export when the PCC export limit is congested', () => {
        const settlement = settleHybridProjectTick({
            solarOutputMw: 150,
            gridDemandMw: 20,
            batteryPowerMw: -80,
            gridPvEvacuationMw: 140,
            gridConnectionLimitMw: 130,
            currentPriceEurMwh: 300,
            dtHours: 1,
        });

        expect(settlement.solarExportMw).toBe(130);
        expect(settlement.batteryDischargeToLoadMw).toBe(0);
        expect(settlement.batteryDischargeToExportMw).toBe(0);
        expect(settlement.batteryPowerMw).toBe(0);
        expect(settlement.solarCurtailedMw).toBe(0);
        expect(settlement.gridExportMw).toBe(130);
    });

    it('cuts grid charging before surfacing a PCC import overload warning', () => {
        const settlement = settleHybridProjectTick({
            solarOutputMw: 0,
            gridDemandMw: 120,
            batteryPowerMw: 50,
            gridPvEvacuationMw: 200,
            gridConnectionLimitMw: 140,
            currentPriceEurMwh: 80,
            dtHours: 1,
        });

        expect(settlement.batteryChargeFromGridMw).toBe(20);
        expect(settlement.gridImportMw).toBe(140);
        expect(settlement.gridOverloadWarning).toBe(false);

        const overloaded = settleHybridProjectTick({
            solarOutputMw: 0,
            gridDemandMw: 160,
            batteryPowerMw: 50,
            gridPvEvacuationMw: 200,
            gridConnectionLimitMw: 140,
            currentPriceEurMwh: 80,
            dtHours: 1,
        });

        expect(overloaded.batteryChargeFromGridMw).toBe(0);
        expect(overloaded.gridImportMw).toBe(140);
        expect(overloaded.gridOverloadWarning).toBe(true);
        expect(overloaded.gridOverloadMw).toBe(20);
    });

});
