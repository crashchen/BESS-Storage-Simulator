// Audit evidence: compare identical simulation horizons at several timesteps.
// Run from the project root: node docs/audits/2026-09-08/representative-scenarios.mjs
// No product files are changed; compiled modules go into an OS temp directory.
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const projectRoot = resolve(process.argv[2] ?? process.cwd());
const requireProject = createRequire(join(projectRoot, 'package.json'));
const { build } = requireProject('esbuild');
const compiled = await mkdtemp(join(tmpdir(), 'bess-representative-audit-'));
await build({
  absWorkingDir: projectRoot,
  entryPoints: ['src/utils/tickEngine.ts', 'src/config.ts'],
  bundle: true, platform: 'node', format: 'esm',
  outdir: compiled, outExtension: { '.js': '.mjs' }, logLevel: 'silent',
});
const { createInitialGridState, simulateTick } = await import(pathToFileURL(join(compiled, 'utils/tickEngine.mjs')));
const { BESS } = await import(pathToFileURL(join(compiled, 'config.mjs')));

const baseline = { ...createInitialGridState(), simulationStatus: 'running', timeSpeed: 1440 };
const manualInitial = { ...baseline, timeOfDay: 12, dispatchMode: 'manual-charge', batterySocPercent: 80, dispatchScalePercent: 50 };
// At these settings the requested 186 MW is available throughout charging.
// Fix the horizon to the analytical fill duration, including a shortened last
// step; do not stop at a timestep-dependent first observation of 100% SoC.
const chargeHorizonHours = (1 - manualInitial.batterySocPercent / 100) * manualInitial.batteryEnergyCapacityMwh
  / (Math.min(manualInitial.batteryPowerRatingMw, manualInitial.gridBessConnectionMw) * BESS.chargeEfficiency);
const scenarios = [
  { name: 'default-auto-24h', initial: baseline, horizonHours: 24 },
  { name: 'default-auto-midnight-24h', initial: { ...baseline, timeOfDay: 0 }, horizonHours: 24 },
  { name: 'small-battery-auto-24h', initial: { ...baseline, batteryEnergyCapacityMwh: 10 }, horizonHours: 24 },
  { name: 'small-battery-auto-midnight-24h', initial: { ...baseline, timeOfDay: 0, batteryEnergyCapacityMwh: 10 }, horizonHours: 24 },
  { name: '744mwh-manual-charge-pv102', initial: manualInitial, horizonHours: chargeHorizonHours },
  { name: '744mwh-manual-charge-pv5', initial: { ...manualInitial, gridPvEvacuationMw: 5 }, horizonHours: chargeHorizonHours },
  { name: '744mwh-manual-charge-pv102-full-hour', initial: manualInitial, horizonHours: 1 },
  { name: '744mwh-manual-charge-pv5-full-hour', initial: { ...manualInitial, gridPvEvacuationMw: 5 }, horizonHours: 1 },
];
const stepSizes = [0.1, 1 / 60, 0.01, 0.001, 0.0001];
const results = scenarios.map(({ name, initial, horizonHours }) => {
  const durationRealSeconds = horizonHours * 3600 / initial.timeSpeed;
  const runs = stepSizes.map(maxStepRealSeconds => {
    let state = initial;
    const count = Math.ceil(durationRealSeconds / maxStepRealSeconds);
    for (let i = 0; i < count; i++) {
      const dt = Math.min(maxStepRealSeconds, durationRealSeconds - i * maxStepRealSeconds);
      state = simulateTick(state, dt, i);
    }
    assert.ok(Number.isFinite(state.cumulativeRevenueEur));
    const expectedTime = (initial.timeOfDay + horizonHours) % 24;
    const cyclicError = Math.abs(((state.timeOfDay - expectedTime + 36) % 24) - 12);
    assert.ok(cyclicError < 1e-7);
    return {
      maxStepRealSeconds, steps: count, endTimeOfDay: state.timeOfDay,
      finalSocPercent: state.batterySocPercent,
      projectPnlEur: state.cumulativeRevenueEur,
      bessMarginEur: state.cumulativeBessMarginEur,
      gridChargeCostEur: state.cumulativeBessGridChargeCostEur,
    };
  });
  const reference = runs.at(-1).projectPnlEur;
  return {
    name, horizonHours, initial, referenceMaxStepRealSeconds: stepSizes.at(-1),
    runs: runs.map(run => ({
      ...run,
      projectPnlDifferenceEur: run.projectPnlEur - reference,
      projectPnlRelativeDifferencePercent: Math.abs(reference) > 1e-9
        ? Math.abs((run.projectPnlEur - reference) / reference) * 100 : null,
    })),
  };
});
const output = JSON.stringify({
  note: 'Fixed horizons and explicit initial states; finest timestep is a numerical reference, not real-world validation.',
  results,
}, null, 2) + '\n';
console.log(output);
if (process.env.BESS_AUDIT_OUTPUT) await writeFile(process.env.BESS_AUDIT_OUTPUT, output);
