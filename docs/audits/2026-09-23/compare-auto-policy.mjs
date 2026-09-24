// Run from the repository root with Node 24 after npm ci:
// node docs/audits/2026-09-23/compare-auto-policy.mjs
// Baseline dispatch/config are pinned; all other model modules are shared
// because batch 9 does not change them.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const baseline = 'b82425813910f2151495e3c2c74426ce61e89f1e';
const original = Object.fromEntries(['config', 'tickEngine'].map(name => [name,
    execFileSync('git', ['show', `${baseline}:src/${name === 'config' ? 'config' : 'utils/tickEngine'}.ts`],
        { cwd: root, encoding: 'utf8' }),
]));

async function loadEngine(useBaseline) {
    const plugins = useBaseline ? [{ name: 'pinned-baseline', setup(builder) {
        builder.onLoad({ filter: /(?:config|tickEngine)\.ts$/ }, args => ({
            contents: args.path.endsWith('/config.ts') ? original.config : original.tickEngine,
            loader: 'ts',
        }));
    } }] : [];
    const bundle = await build({ entryPoints: [resolve(root, 'src/utils/tickEngine.ts')],
        bundle: true, platform: 'node', format: 'esm', write: false, plugins });
    return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

function run(engine, demandPercent, [night, shoulder, peak]) {
    let state = { ...engine.createInitialGridState(0), simulationStatus: 'running',
        timeSpeed: 1440, timeOfDay: 6, batterySocPercent: 40,
        dispatchScalePercent: demandPercent,
        tariffRatesEurMwh: { 'off-peak': night, 'mid-peak': shoulder, peak } };
    const peakEntrySoc = [];
    for (let tick = 1; tick <= 1800; tick++) {
        state = engine.simulateTick(state, 0.1, tick);
        if ([300, 900, 1500].includes(tick)) peakEntrySoc.push(state.batterySocPercent);
    }
    if (Math.abs(state.batterySocPercent - 40) > 1e-6) {
        throw new Error(`Terminal SoC differs from the initial 40%: ${state.batterySocPercent}`);
    }
    return { peakEntrySoc, project: state.cumulativeRevenueEur,
        restored: state.cumulativeBessRestoredLoadAssumedValueEur };
}

const old = await loadEngine(true);
const revised = await loadEngine(false);
const tariffs = [[80, 150, 155], [80, 150, 175], [80, 150, 177.5],
    [80, 150, 178.5], [80, 150, 178.8], [80, 150, 180],
    [80, 150, 200], [80, 150, 350], [-40, -10, -5]];

for (const demandPercent of [100, 150]) {
    for (const rates of tariffs) {
        const baselineRun = run(old, demandPercent, rates);
        const candidateRun = run(revised, demandPercent, rates);
        console.log(JSON.stringify({
            demandPercent, rates,
            oldPeakEntrySoc: baselineRun.peakEntrySoc.map(Math.round),
            newPeakEntrySoc: candidateRun.peakEntrySoc.map(Math.round),
            demoValueDeltaEur: Math.round(candidateRun.project - baselineRun.project),
            excludingRestoredDeltaEur: Math.round(
                candidateRun.project - candidateRun.restored - baselineRun.project + baselineRun.restored,
            ),
            candidateRestoredAssumedValueEur: Math.round(candidateRun.restored),
        }));
    }
}
