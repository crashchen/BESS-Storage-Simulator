// Reproducible before/after evidence, with identical starting states and horizons.
// Run at repo root: node docs/audits/2026-09-19/convergence.mjs
// Optional BESS_AUDIT_OUTPUT writes JSON; never overwrite the September 8 evidence.
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.argv[2] ?? process.cwd());
const baselineCommit = '053c82cd23298391f0a0e400c2324d051241988d';
const requireProject = createRequire(join(root, 'package.json'));
const { build } = requireProject('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'bess-convergence-'));
const sourceFiles = ['src/utils/tickEngine.ts', 'src/utils/simulationModel.ts', 'src/utils/gridSelectors.ts', 'src/config.ts'];
const engines = {};
const hashes = {};

try {
    for (const version of ['baseline', 'candidate']) {
        const sources = new Map();
        hashes[version] = {};
        for (const file of sourceFiles) {
            const contents = version === 'baseline'
                ? execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root, encoding: 'utf8' })
                : await readFile(join(root, file), 'utf8');
            sources.set(join(root, file), contents);
            hashes[version][file] = createHash('sha256').update(contents).digest('hex');
        }
        const outfile = join(temporary, `${version}.mjs`);
        await build({ absWorkingDir: root, entryPoints: ['src/utils/tickEngine.ts'], bundle: true,
            platform: 'node', format: 'esm', outfile, logLevel: 'silent',
            plugins: [{ name: 'source-snapshot', setup(build) {
                build.onLoad({ filter: /\.ts$/ }, args => sources.has(args.path)
                    ? { contents: sources.get(args.path), loader: 'ts' } : undefined);
            } }],
        });
        engines[version] = await import(pathToFileURL(outfile));
    }
    const base = { ...engines.baseline.createInitialGridState(), simulationStatus: 'running', timeSpeed: 1440 };
    const manual = { ...base, timeOfDay: 12, dispatchMode: 'manual-charge', batterySocPercent: 80, dispatchScalePercent: 50 };
    const fillHours = 0.2 * 744 / (186 * 0.96);
    const cases = [
        ...[0, 8].flatMap(timeOfDay => [744, 10].map(batteryEnergyCapacityMwh => ({
            name: `auto-${timeOfDay}h-${batteryEnergyCapacityMwh}mwh`, initial: { ...base, timeOfDay, batteryEnergyCapacityMwh }, horizonHours: 24,
        }))),
        ...[102, 5].flatMap(gridPvEvacuationMw => [fillHours, 1].map(horizonHours => ({
            name: `manual-744mwh-pv${gridPvEvacuationMw}-${horizonHours === 1 ? '1h' : 'fill'}`,
            initial: { ...manual, gridPvEvacuationMw }, horizonHours,
        }))),
        ...[150, -25].map(price => ({ name: `charge-stress-price${price}`, horizonHours: 0.04,
            initial: { ...manual, batteryEnergyCapacityMwh: 10, gridPvEvacuationMw: 5,
                tariffRatesEurMwh: { 'off-peak': price, 'mid-peak': price, peak: price } },
        })),
        { name: 'night-target-then-pv', horizonHours: 0.04,
            initial: { ...base, timeOfDay: 5.9, batteryEnergyCapacityMwh: 10, batterySocPercent: 39, dispatchScalePercent: 0 } },
        { name: 'peak-floor-and-tariff', horizonHours: 0.3, initial: { ...base, timeOfDay: 22.74, batterySocPercent: 13 } },
    ];
    const fields = ['batterySocPercent', 'cumulativeRevenueEur', 'cumulativeBessMarginEur', 'cumulativeSolarExportRevenueEur',
        'cumulativeBessDischargeRevenueEur', 'cumulativeBessGridChargeCostEur', 'cumulativeSolarOpportunityCostEur'];
    const steps = [0.1, 1 / 60, 0.01, 0.001, 0.0001];
    const results = cases.map(scenario => {
        const versions = {};
        for (const version of ['baseline', 'candidate']) {
            versions[version] = (version === 'baseline' ? [steps[0], steps.at(-1)] : steps).map(maxRealStep => {
                const duration = scenario.horizonHours * 3600 / scenario.initial.timeSpeed;
                let state = scenario.initial;
                const count = Math.ceil(duration / maxRealStep);
                for (let i = 0; i < count; i++) {
                    state = engines[version].simulateTick(state, Math.min(maxRealStep, duration - i * maxRealStep), i);
                }
                const error = ((state.timeOfDay - scenario.initial.timeOfDay - scenario.horizonHours + 72) % 24);
                assert.ok(Math.min(error, 24 - error) < 1e-7, `${scenario.name}: end time`);
                for (const field of fields) assert.ok(Number.isFinite(state[field]), `${scenario.name}: ${field}`);
                assert.ok(state.batterySocPercent >= 0 && state.batterySocPercent <= 100);
                return { maxRealStep, steps: count, endTimeOfDay: state.timeOfDay,
                    ...Object.fromEntries(fields.map(field => [field, state[field]])) };
            });
        }
        return { ...scenario, ...versions };
    });
    const output = JSON.stringify({ baselineCommit, hashes,
        note: 'Fixed horizons. Fine-step numerical reference, not physical validation. Per-source energy conservation is checked separately in tickConvergence.test.ts. Instantaneous telemetry is the final settled segment, not the entire outer tick average.',
        referenceRealStep: steps.at(-1), results }, null, 2) + '\n';
    for (const result of results) {
        const old = result.baseline[0].cumulativeRevenueEur - result.baseline.at(-1).cumulativeRevenueEur;
        const difference = result.candidate[0].cumulativeRevenueEur - result.candidate.at(-1).cumulativeRevenueEur;
        console.log(`${result.name}: baseline difference EUR ${old.toFixed(6)}; candidate EUR ${difference.toFixed(6)}`);
    }
    if (process.env.BESS_AUDIT_OUTPUT) await writeFile(process.env.BESS_AUDIT_OUTPUT, output);
    else console.log(output);
} finally {
    await rm(temporary, { recursive: true, force: true });
}
