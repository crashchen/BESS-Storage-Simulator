import { describe, expect, it } from 'vitest';
import { makeGridState } from '../test/fixtures';
import { getVisibleEnergyFlows } from './energyFlowTelemetry';

describe('energyFlowTelemetry', () => {
    it('routes PV local consumption to the load marker, not the grid path', () => {
        const flows = getVisibleEnergyFlows(makeGridState({
            solarOutputMw: 90,
            gridDemandMw: 70,
            batteryChargeFromSolarMw: 20,
            solarCurtailedMw: 0,
            gridImportMw: 0,
            batteryChargeFromGridMw: 0,
            batteryDischargeToGridMw: 0,
            solarExportMw: 0,
        }));

        expect(flows.solarToBessMw).toBe(20);
        expect(flows.solarToLoadMw).toBe(70);
        expect(flows.solarToExportMw).toBe(0);
    });

    it('separates PV export from PV serving local load', () => {
        const flows = getVisibleEnergyFlows(makeGridState({
            solarOutputMw: 130,
            gridDemandMw: 40,
            batteryChargeFromSolarMw: 20,
            solarExportMw: 70,
            solarCurtailedMw: 0,
            gridImportMw: 0,
            batteryChargeFromGridMw: 0,
            batteryDischargeToGridMw: 0,
        }));

        expect(flows.solarToLoadMw).toBe(40);
        expect(flows.solarToBessMw).toBe(20);
        expect(flows.solarToExportMw).toBe(70);
        expect(flows.grossRoutedMw).toBe(130);
    });

    it('splits grid import into battery charging and site support flows', () => {
        const flows = getVisibleEnergyFlows(makeGridState({
            solarOutputMw: 0,
            batteryChargeFromSolarMw: 0,
            solarCurtailedMw: 0,
            gridImportMw: 140,
            batteryChargeFromGridMw: 35,
            batteryDischargeToGridMw: 0,
        }));

        expect(flows.gridToBessMw).toBe(35);
        expect(flows.gridToSiteMw).toBe(105);
    });

    it('can show PV and BESS flowing to the site at the same time', () => {
        const flows = getVisibleEnergyFlows(makeGridState({
            solarOutputMw: 45,
            gridDemandMw: 125,
            batteryChargeFromSolarMw: 0,
            solarCurtailedMw: 0,
            solarExportMw: 0,
            batteryDischargeToGridMw: 80,
            gridImportMw: 0,
            batteryChargeFromGridMw: 0,
        }));

        expect(flows.solarToLoadMw).toBe(45);
        expect(flows.solarToExportMw).toBe(0);
        expect(flows.bessToSiteMw).toBe(80);
        expect(flows.grossRoutedMw).toBe(125);
    });
});
