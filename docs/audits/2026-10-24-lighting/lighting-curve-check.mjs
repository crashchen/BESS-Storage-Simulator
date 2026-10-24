// Run from the repository root with Node 24.21.0:
// node docs/audits/2026-10-24-lighting/lighting-curve-check.mjs
// The candidate is bundled from the actual helper in memory, not reimplemented.
// The independent legacy comparator below freezes the pre-2026-10-24 CC rig.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, version as esbuildVersion } from 'esbuild';
import { Color, REVISION } from 'three';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const baselineDirectory = '/private/tmp/bess-lighting-repo-before';
const baselineHashes = {
    'src/utils/sceneLighting.ts': '1a58ab4cbed009cdd66a8c905b3d25df5933badab5d36646464e2bb278959887',
    'src/config.ts': 'a52ec686d882647307d870033efb4803d2dcae7f73eaa24cc6b750b5e34114cc',
    'src/components/MicrogridScene.tsx': '3e877e194c0b39afbe5973da7ea834f15e4f00321a65620903f7f0bb0ee5709e',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256 = async file => hash(await readFile(file));
const baselineVerified = {};
for (const [file, expected] of Object.entries(baselineHashes)) {
    try {
        const actual = await sha256(path.join(baselineDirectory, file));
        assert.equal(actual, expected, `Legacy snapshot changed: ${file}`);
        baselineVerified[file] = true;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        baselineVerified[file] = 'temporary snapshot absent; embedded comparator remains reproducible';
    }
}

const compiled = await build({
    stdin: {
        contents: "export * from './src/utils/sceneLighting.ts'; export { SCENE_3D } from './src/config.ts';",
        resolveDir: root,
        sourcefile: 'lighting-audit-entry.ts',
        loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', write: false,
});
const candidateModule = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const { getSceneLighting, createSceneLighting, SCENE_3D } = candidateModule;
const target = createSceneLighting();
const rgb = hex => new Color(hex).toArray();
const lerp = (a, b, factor) => a.map((value, index) => value + (b[index] - value) * factor);
const scale = (vector, factor) => vector.map(value => value * factor);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const normalise = vector => scale(vector, 1 / Math.hypot(...vector));
const luminance = vector => dot(vector, [0.2126, 0.7152, 0.0722]);
const smoothstep = value => {
    const x = Math.max(0, Math.min(1, value));
    return x * x * (3 - 2 * x);
};
const maximumDelta = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
const faces = { front: [0, 0, 1], top: [0, 1, 0], rear: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], bottom: [0, -1, 0] };
const ground = rgb('#1a1a2e');
const sun = rgb('#fff4e0');
const moon = rgb(SCENE_3D.nightLighting.moonColor);
const moonDirection = normalise(SCENE_3D.nightLighting.moonPosition);

function candidate(hour) {
    const value = getSceneLighting(hour, target);
    return {
        sky: value.skyColor.toArray(),
        ambient: scale(value.ambientColor.toArray(), value.ambientIntensity),
        hemisphereSky: scale(value.hemisphereSkyColor.toArray(), value.hemisphereIntensity),
        hemisphereGround: scale(ground, value.hemisphereIntensity),
        sun: scale(sun, value.sunIntensity),
        sunPosition: [...value.sunPosition],
        sunDirection: normalise(value.sunPosition),
        moon: scale(moon, value.moonIntensity),
        moonDirection,
    };
}

// These branches and constants are transcribed from the hashed pre-turn files.
// Keep them independent of the new helper and new configuration.
const legacyPalette = {
    night: rgb('#0a0a1a'), dawnA: rgb('#1a1a3e'), dawnB: rgb('#4a6fa5'),
    dayA: rgb('#87CEEB'), dayB: rgb('#4a9edb'), hemisphere: rgb('#5b6f9e'), moon: rgb('#a9bcff'),
};
function legacy(hour) {
    const p = legacyPalette;
    const sky = hour < 5 || hour > 20 ? p.night
        : hour < 7 ? lerp(p.dawnA, p.dawnB, (hour - 5) / 2)
            : hour > 18 ? lerp(p.dawnB, p.dawnA, (hour - 18) / 2)
                : lerp(p.dayA, p.dayB, Math.abs(hour - 12) / 6);
    const ambientIntensity = hour > 6 && hour < 19
        ? 0.4 + 0.5 * Math.sin((hour - 6) / 12 * Math.PI) : 0.15;
    const sunIntensity = hour > 5.5 && hour < 19.5
        ? 2 * Math.sin((hour - 5.5) / 14 * Math.PI) : 0.1;
    const nightFactor = hour < 12
        ? 1 - smoothstep((hour - 5) / 2) : smoothstep((hour - 17) / 2);
    const hemisphereIntensity = 0.35 + 0.35 * nightFactor;
    const angle = (hour - 6) / 12 * Math.PI;
    const sunPosition = [Math.cos(angle) * 80, Math.max(Math.sin(angle) * 80, -10), 30];
    return {
        sky, ambient: scale(sky, ambientIntensity),
        hemisphereSky: scale(lerp(sky, p.hemisphere, nightFactor), hemisphereIntensity),
        hemisphereGround: scale(ground, hemisphereIntensity),
        sun: scale(sun, sunIntensity), sunPosition, sunDirection: normalise(sunPosition),
        moon: scale(p.moon, 0.5 * nightFactor), moonDirection: normalise([-20, 45, 35]),
    };
}

// Relative linear-luminance illumination proxy; deliberately not measured lux.
// No material BRDF, shadowing, occlusion, fog or tone/output transform is applied.
function proxy(light, normal) {
    const skyWeight = 0.5 * normal[1] + 0.5;
    return luminance(light.ambient)
        + luminance(light.hemisphereSky) * skyWeight
        + luminance(light.hemisphereGround) * (1 - skyWeight)
        + luminance(light.sun) * Math.max(0, dot(normal, light.sunDirection))
        + luminance(light.moon) * Math.max(0, dot(normal, light.moonDirection));
}
function signature(light) {
    // An inactive sun may change pose at midnight without changing the image.
    return [light.sky, light.ambient, light.hemisphereSky, light.hemisphereGround, light.sun, light.moon,
        Object.values(faces).map(normal => proxy(light, normal))].flat();
}
const stepSeconds = 3;
const samplesPerHour = 3600 / stepSeconds;
const totalSamples = 24 * samplesPerHour + 1;
let nonFiniteOrNegative = 0;
let maximumDaytimeDifference = 0;
const nightReference = candidate(0);
let maximumNightDrift = 0;
for (let index = 0; index < totalSamples; index++) {
    const hour = index / samplesPerHour;
    const light = candidate(hour);
    if (signature(light).some(value => !Number.isFinite(value) || value < -1e-12)) nonFiniteOrNegative++;
    if (hour >= 7 && hour <= 17) {
        const previous = legacy(hour);
        maximumDaytimeDifference = Math.max(maximumDaytimeDifference,
            maximumDelta(signature(light), signature(previous)), maximumDelta(light.sunPosition, previous.sunPosition));
    }
    if (hour <= 5 || hour >= 19) maximumNightDrift = Math.max(maximumNightDrift, maximumDelta(signature(light), signature(nightReference)));
}

const boundaryEpsilonHours = 1e-6;
const boundaries = [0, 5, 5.5, 6, 7, 12, 17, 18, 19, 19.5, 20, 24].map(hour => {
    const sides = sample => [sample(hour - boundaryEpsilonHours), sample(hour + boundaryEpsilonHours)];
    const [before, after] = sides(candidate);
    const [oldBefore, oldAfter] = sides(legacy);
    return {
        hour,
        candidateMaximumActiveRadianceOrProxyDelta: maximumDelta(signature(before), signature(after)),
        candidateSkyRGBDelta: maximumDelta(before.sky, after.sky),
        legacyMaximumActiveRadianceOrProxyDelta: maximumDelta(signature(oldBefore), signature(oldAfter)),
        legacySkyRGBDelta: maximumDelta(oldBefore.sky, oldAfter.sky),
    };
});

const tiltedNormals = [];
for (let polar = 15; polar < 180; polar += 15) {
    for (let azimuth = 0; azimuth < 360; azimuth += 15) {
        const theta = polar * Math.PI / 180;
        const phi = azimuth * Math.PI / 180;
        tiltedNormals.push([Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)]);
    }
}
const transitions = [];
for (const [name, start, end, direction] of [['dawn', 5, 7, 1], ['dusk', 17, 19, -1]]) {
    const first = candidate(start);
    const last = candidate(end);
    const cardinal = Object.fromEntries(Object.entries(faces).map(([face, normal]) => [face, {
        start: proxy(first, normal), end: proxy(last, normal), minimum: Infinity,
        reverseSteps: 0, maximumReverseStep: 0, maximumEndpointResidual: 0,
    }]));
    const tilted = { normalCount: tiltedNormals.length, maximumEndpointResidual: 0, maximumEndpointBoundViolation: 0 };
    let previous = first;
    for (let index = 0; index <= (end - start) * samplesPerHour; index++) {
        const hour = start + index / samplesPerHour;
        const current = candidate(hour);
        const weight = smoothstep((hour - start) / (end - start));
        for (const [face, normal] of Object.entries(faces)) {
            const entry = cardinal[face];
            const value = proxy(current, normal);
            const reverseStep = -(value - proxy(previous, normal)) * direction;
            entry.minimum = Math.min(entry.minimum, value);
            if (reverseStep > 1e-12) entry.reverseSteps++;
            entry.maximumReverseStep = Math.max(entry.maximumReverseStep, reverseStep);
            entry.maximumEndpointResidual = Math.max(entry.maximumEndpointResidual,
                Math.abs(value - (entry.start + (entry.end - entry.start) * weight)));
        }
        for (const normal of tiltedNormals) {
            const a = proxy(first, normal), b = proxy(last, normal), value = proxy(current, normal);
            tilted.maximumEndpointResidual = Math.max(tilted.maximumEndpointResidual, Math.abs(value - (a + (b - a) * weight)));
            tilted.maximumEndpointBoundViolation = Math.max(tilted.maximumEndpointBoundViolation,
                Math.min(a, b) - value, value - Math.max(a, b));
        }
        previous = current;
    }
    transitions.push({ name, startHour: start, endHour: end, samples: (end - start) * samplesPerHour + 1, cardinal, tilted });
}

const representativeHours = [0, 5, 5.5, 6, 6.5, 7, 12, 17, 17.5, 18, 18.25, 18.5, 18.75, 19, 19.5, 20, 24];
const representativeValues = representativeHours.map(hour => ({
    hour,
    candidate: Object.fromEntries(Object.entries(faces).map(([name, normal]) => [name, proxy(candidate(hour), normal)])),
    legacy: Object.fromEntries(Object.entries(faces).map(([name, normal]) => [name, proxy(legacy(hour), normal)])),
}));
const legacyTopNight = proxy(legacy(0), faces.top);
let legacyTopMinimum = { hour: 17, value: Infinity };
for (let index = 17 * samplesPerHour; index <= 20 * samplesPerHour; index++) {
    const hour = index / samplesPerHour;
    const value = proxy(legacy(hour), faces.top);
    if (value < legacyTopMinimum.value) legacyTopMinimum = { hour, value };
}
const nightToNoonRatios = Object.fromEntries(Object.entries(faces).map(([name, normal]) => [name, proxy(candidate(0), normal) / proxy(candidate(12), normal)]));
const checks = {
    allDayFiniteAndNonnegative: nonFiniteOrNegative === 0,
    daytimeSevenToSeventeenUnchanged: maximumDaytimeDifference < 1e-12,
    stableFullNight: maximumNightDrift < 1e-12,
    activeLightingAndSkyContinuous: boundaries.every(entry => entry.candidateMaximumActiveRadianceOrProxyDelta < 1e-5),
    sixCardinalFacesMonotoneAcrossBothTransitions: transitions.every(entry => Object.values(entry.cardinal).every(face => face.reverseSteps === 0)),
    cardinalEndpointConvexity: transitions.every(entry => Object.values(entry.cardinal).every(face => face.maximumEndpointResidual < 1e-12)),
    sampledTiltedNormalsStayInsideEndpointBounds: transitions.every(entry => entry.tilted.maximumEndpointBoundViolation < 1e-12 && entry.tilted.maximumEndpointResidual < 1e-12),
    legacyTopTroughReproduced: legacyTopMinimum.value < legacyTopNight * 0.9,
};
const currentFiles = ['src/utils/sceneLighting.ts', 'src/config.ts', 'src/components/MicrogridScene.tsx',
    'src/components/SimulationViewport.tsx', 'package-lock.json', path.relative(root, fileURLToPath(import.meta.url))];
const currentHashes = Object.fromEntries(await Promise.all(currentFiles.map(async file => [file, await sha256(path.join(root, file))])));
const packageVersion = async name => JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
const results = {
    auditDate: '2026-10-24', generatedAt: new Date().toISOString(), passed: Object.values(checks).every(Boolean),
    reproduction: 'From repository root with installed locked dependencies: node docs/audits/2026-10-24-lighting/lighting-curve-check.mjs (Node 24.21.0)',
    versions: { node: process.version, esbuild: esbuildVersion, threeRevision: REVISION, three: await packageVersion('three'), r3f: await packageVersion('@react-three/fiber') },
    method: {
        candidate: 'Installed esbuild bundles actual src/utils/sceneLighting.ts and config in memory with write:false; imported by data URL. Candidate formula is not duplicated.',
        comparator: 'Independent pre-turn CC formulas/constants embedded above, transcribed from the hashed snapshot. Regeneration does not require the temporary snapshot; any still-present files are hash-checked.',
        metric: 'Relative linear-luminance illumination proxy in arbitrary units, not lux or measured screenshot brightness. Linear RGB converted with installed Three; Rec.709 luminance weights 0.2126/0.7152/0.0722.',
        model: 'Ambient plus hemisphere(normal.y/2+1/2) plus Lambert cosine-clamped sun and moon. Directions point from scene origin to each directional light.',
        allDaySampleStepSeconds: stepSeconds, allDaySamples: totalSamples, csvStepMinutes: 5,
        continuityEpsilonHours: boundaryEpsilonHours, continuityTolerance: 1e-5, numericTolerance: 1e-12,
        limitations: [
            'No material BRDF, metalness, shadows, occlusion, fog, exposure/tone mapping or output colour transform. Ratios are model values, not pixel photometry or native-GPU acceptance.',
            'Monotone dawn brightening/dusk dimming is asserted only for six cardinal normals. Tilted normals are tested for endpoint convexity/bounds; moon-facing tilted surfaces can be brighter at night than at the dawn endpoint.',
            'Continuity covers values, not C1 derivative continuity at 7h/17h. Inactive sun pose is excluded at midnight because its intensity is zero.',
            'Frozen daylight sun direction during each crossfade prevents a geometric top-face dip. Night sunlight is removed; front/noon ratio changes from the earlier CC claim to about 17%, while top/rear remain about 13%/10%.',
            'Dense sampled checks supplement the linear endpoint-mix identity; discrete mathematical samples do not establish continuous-camera motion or screen flicker acceptance.',
        ],
    },
    sourceSnapshots: { currentSHA256: currentHashes, legacyDirectory: baselineDirectory, legacySHA256: baselineHashes, legacyTemporaryFilesVerified: baselineVerified },
    checks,
    allDay: { nonFiniteOrNegative, maximumDaytimeDifference, maximumNightDrift },
    boundaries, transitions, nightToNoonRatios,
    legacyTrough: { face: 'top', searchHours: [17, 20], minimum: legacyTopMinimum, fullNightReference: legacyTopNight,
        deficitFractionOfNight: 1 - legacyTopMinimum.value / legacyTopNight,
        at1815: proxy(legacy(18.25), faces.top), at1845: proxy(legacy(18.75), faces.top) },
    representativeValues,
};
const headers = ['hour', ...['candidate', 'legacy'].flatMap(kind => Object.keys(faces).map(face => `${kind}_${face}_proxy`)), 'candidate_sky_luminance', 'legacy_sky_luminance'];
const csv = [headers.join(',')];
for (let minute = 0; minute <= 1440; minute += 5) {
    const hour = minute / 60, current = candidate(hour), previous = legacy(hour);
    csv.push([hour, ...[current, previous].flatMap(light => Object.values(faces).map(normal => proxy(light, normal))),
        luminance(current.sky), luminance(previous.sky)].map(value => value.toFixed(9)).join(','));
}
await writeFile(path.join(directory, 'curve-results.json'), `${JSON.stringify(results, null, 2)}\n`);
await writeFile(path.join(directory, 'curve.csv'), `${csv.join('\n')}\n`);
console.log(JSON.stringify({ passed: results.passed, checks, allDay: results.allDay, legacyTrough: results.legacyTrough, nightToNoonRatios }, null, 2));
assert.ok(results.passed, 'Lighting curve audit failed; inspect curve-results.json');
