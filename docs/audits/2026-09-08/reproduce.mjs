// Read-only audit reproducer. Run from the project root:
// node docs/audits/2026-09-08/reproduce.mjs
// Source modules are bundled into a fresh OS temporary directory only.
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const projectRoot = resolve(process.argv[2] ?? process.cwd());
const requireProject = createRequire(join(projectRoot, 'package.json'));
const { build } = requireProject('esbuild');
const compiled = await mkdtemp(join(tmpdir(), 'bess-audit-'));
await build({
  absWorkingDir: projectRoot,
  entryPoints: ['src/utils/tickEngine.ts', 'src/utils/simulationModel.ts', 'src/utils/gridReducer.ts'],
  bundle: true, platform: 'node', format: 'esm',
  outdir: compiled, outExtension: { '.js': '.mjs' }, logLevel: 'silent',
});
const { createInitialGridState, simulateTick } = await import(pathToFileURL(join(compiled, 'tickEngine.mjs')));
const { computeSolarOutputMw, settleHybridProjectTick } = await import(pathToFileURL(join(compiled, 'simulationModel.mjs')));
const { applyCommand } = await import(pathToFileURL(join(compiled, 'gridReducer.mjs')));

// All configurable values are within the reducer/UI's permitted ranges.
// SoC 80% is a reachable operating state, not an editable UI parameter.
const initial = {
  ...createInitialGridState(), simulationStatus: 'running', dispatchMode: 'manual-charge',
  timeOfDay: 12, timeSpeed: 1440, gridPvEvacuationMw: 5,
  batteryEnergyCapacityMwh: 10, batterySocPercent: 80, dispatchScalePercent: 50,
};
const timestepResults = [1, 6, 60, 600, 6000].map(steps => {
  let state = initial;
  for (let i = 0; i < steps; i++) state = simulateTick(state, 0.1 / steps, i);
  assert.equal(state.batterySocPercent, 100);
  assert.ok(Math.abs(state.timeOfDay - 12.04) < 1e-8);
  return {
    steps, realSecondsPerStep: 0.1 / steps, soc: state.batterySocPercent,
    projectPnlEur: state.cumulativeRevenueEur,
    bessMarginEur: state.cumulativeBessMarginEur,
    gridChargeCostEur: state.cumulativeBessGridChargeCostEur,
    solarExportRevenueEur: state.cumulativeSolarExportRevenueEur,
  };
});
assert.ok(timestepResults[0].projectPnlEur > 0);
assert.ok(timestepResults.at(-1).projectPnlEur < 0);

// Overload / avoided-import valuation: the first battery energy restores
// unserved load; it does not reduce the already-clamped PCC import.
const baseSettlement = {
  solarOutputMw: 0, gridDemandMw: 350, batteryPowerMw: 0,
  gridPvEvacuationMw: 102, gridConnectionLimitMw: 288,
  currentPriceEurMwh: 350, dtHours: 1,
};
const idle = settleHybridProjectTick(baseSettlement);
const discharge = settleHybridProjectTick({ ...baseSettlement, batteryPowerMw: -30 });
assert.equal(idle.gridImportMw, discharge.gridImportMw);
assert.equal(discharge.bessDischargeRevenueDeltaEur, 10500);

// An equivalent discrepancy also arises from the built-in demand curve with
// the allowed 150% demand setting; no impossible input is needed.
const live = simulateTick({
  ...createInitialGridState(), simulationStatus: 'running',
  dispatchScalePercent: 150, timeOfDay: 19, batterySocPercent: 65,
}, 0.1, 1000);
const liveBaseline = settleHybridProjectTick({
  ...baseSettlement, solarOutputMw: live.solarOutputMw,
  gridDemandMw: live.gridDemandMw, dtHours: 0.1 * 240 / 3600,
});

let dailySolarMwh = 0;
for (let i = 0; i < 86400; i++) dailySolarMwh += computeSolarOutputMw((i + 0.5) / 3600, 102, 117) / 3600;

const pausedSurplus = applyCommand(simulateTick({
  ...createInitialGridState(), simulationStatus: 'running',
  timeOfDay: 12, dispatchScalePercent: 50,
}, 0.01, 1), { type: 'PAUSE_SIMULATION' }, 2).next;
const editedPaused = applyCommand(pausedSurplus, {
  type: 'SET_TARIFF_RATE', payload: { period: 'mid-peak', value: 160 },
}, 3).next;

const results = {
  timestepResults,
  overloadValuation: {
    baselineImportMw: idle.gridImportMw, dischargeImportMw: discharge.gridImportMw,
    baselineOverloadMw: idle.gridOverloadMw, dischargeOverloadMw: discharge.gridOverloadMw,
    reportedDischargeValueEur: discharge.bessDischargeRevenueDeltaEur,
    avoidedImportCostEur: (idle.gridImportMw - discharge.gridImportMw) * 350,
  },
  uiReachableOverload: {
    demandMw: live.gridDemandMw, solarMw: live.solarOutputMw,
    baselineImportMw: liveBaseline.gridImportMw, importMw: live.gridImportMw,
    reportedDischargeValueEur: live.cumulativeBessDischargeRevenueEur,
    avoidedImportCostEur: (liveBaseline.gridImportMw - live.gridImportMw) * 350 * (0.1 * 240 / 3600),
  },
  solarYield: {
    dailyMwh: dailySolarMwh, annualMwhIfRepeated: dailySolarMwh * 365,
    annualSpecificYieldKwhPerKwp: dailySolarMwh * 365 / 117,
    displayedSpecificYieldKwhPerKwp: 1380,
    statedAnnualMwh: 117 * 1380,
  },
  pausedTariffEdit: {
    before: { powerMw: pausedSurplus.batteryPowerMw, mode: pausedSurplus.batteryMode },
    after: { powerMw: editedPaused.batteryPowerMw, mode: editedPaused.batteryMode },
    note: 'Static reconciliation intentionally zeros flows; status explanation still derives only from tariff/surplus.',
  },
};
const serialized = JSON.stringify(results, null, 2) + '\n';
console.log(serialized);
if (process.env.BESS_AUDIT_OUTPUT) await writeFile(process.env.BESS_AUDIT_OUTPUT, serialized);
