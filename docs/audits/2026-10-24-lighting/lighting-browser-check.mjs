// Deterministic lighting fixtures in the unchanged production application.
// Build first: BASE_URL=/BESS-Storage-Simulator/ npm run build
// Serve dist with vite preview, then:
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright node lighting-browser-check.mjs \
//   http://127.0.0.1:4173/BESS-Storage-Simulator/ /tmp/bess-lighting-browser
//
// Test-only React DevTools/Fiber introspection dispatches the paused App state
// timeOfDay and obtains the real R3F scene/camera. All other simulation fields
// stay fixed: these are controlled lighting fixtures, not elapsed simulation or
// dispatch validation. No application source, bundle or network response is
// transformed. Private React internals make this deliberately an audit script,
// not a maintained production API. The default renderer is software SwiftShader;
// discrete frames do not establish native-GPU motion/flicker acceptance.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(playwrightModule);
const playwrightVersion = require(`${playwrightModule}/package.json`).version;
const url = process.argv[2] || 'http://127.0.0.1:4173/BESS-Storage-Simulator/';
const output = process.argv[3] || '/tmp/bess-lighting-browser';
const software = process.env.LIGHTING_NATIVE_GPU !== '1';
assert.ok(new URL(url).pathname.endsWith('/BESS-Storage-Simulator/'), 'Use the production Pages base path');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    headless: process.env.HEADLESS !== '0',
    args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const evidence = {
    url, method: 'unchanged production app; paused React state time fixtures; fixed non-time simulation state',
    toolchain: { node: process.version, playwright: playwrightVersion, browser: browser.version() },
    rendererRequested: software ? 'SwiftShader (software WebGL)' : 'native requested; inspect rendererReported',
    limitations: 'Discrete frames do not establish native-GPU continuous-orbit/flicker acceptance. PV output and flow telemetry retain their initial daytime values at every fixture time, so yellow active PV panels at night do not represent real night simulation output. Use the separate real-RAF smoke evidence for natural night PV appearance.',
    console: [], pageErrors: [], failedRequests: [], models: [], frames: [], boundaries: [],
};
page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) evidence.console.push({ type: message.type(), text: message.text() });
});
page.on('pageerror', error => evidence.pageErrors.push(String(error)));
page.on('requestfailed', request => evidence.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
page.on('response', response => {
    if (response.url().includes('.glb')) evidence.models.push({ url: response.url(), status: response.status() });
});
await page.addInitScript(() => {
    let rendererId = 0;
    const roots = new Set();
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        renderers: new Map(),
        inject(renderer) { this.renderers.set(++rendererId, renderer); return rendererId; },
        onCommitFiberRoot(_id, root) { roots.add(root); },
        onCommitFiberUnmount() {},
    };
    function findFiber(predicate) {
        for (const root of roots) {
            const pending = [root.current];
            while (pending.length) {
                const fiber = pending.pop();
                if (predicate(fiber)) return fiber;
                if (fiber.child) pending.push(fiber.child);
                if (fiber.sibling) pending.push(fiber.sibling);
            }
        }
        throw new Error('Audit fixture could not find the expected React/R3F object');
    }
    function stateHook() {
        let match;
        findFiber(fiber => {
            for (let hook = fiber.memoizedState; hook; hook = hook.next) {
                if (hook.queue?.dispatch && typeof hook.memoizedState?.timeOfDay === 'number'
                    && 'simulationStatus' in hook.memoizedState) { match = hook; return true; }
            }
            return false;
        });
        return match;
    }
    function store() {
        const fiber = findFiber(fiber => fiber.stateNode?.object?.isObject3D && fiber.stateNode.object.__r3f?.root?.getState);
        return fiber.stateNode.object.__r3f.root.getState();
    }
    function controls() {
        return findFiber(fiber => fiber.stateNode?.object?.target?.isVector3
            && fiber.stateNode.object.object?.isCamera && typeof fiber.stateNode.object.update === 'function').stateNode.object;
    }
    window.__lightingAudit = {
        state: () => stateHook().memoizedState,
        setTime(hour) {
            const hook = stateHook();
            if (hook.memoizedState.simulationStatus === 'running') throw new Error('Time fixtures require a paused/stopped simulation');
            hook.queue.dispatch(previous => ({ ...previous, timeOfDay: hour }));
        },
        pose(position, target) {
            const { camera } = store();
            const orbit = controls();
            const damping = orbit.enableDamping;
            orbit.enableDamping = false;
            orbit.update();
            orbit.target.fromArray(target);
            camera.position.fromArray(position);
            camera.lookAt(orbit.target);
            orbit.update();
            orbit.enableDamping = damping;
        },
        snapshot() {
            const { gl, camera, scene } = store();
            const lights = [];
            scene.traverse(object => {
                if (object.isLight) lights.push({
                    type: object.type, intensity: object.intensity, color: object.color.toArray(),
                    groundColor: object.groundColor?.toArray(), position: object.position.toArray(),
                    direction: object.isDirectionalLight
                        ? object.position.clone().sub(object.target.position).normalize().toArray() : undefined,
                    castShadow: object.castShadow,
                });
            });
            const context = gl.getContext();
            const extension = context.getExtension('WEBGL_debug_renderer_info');
            return {
                hour: stateHook().memoizedState.timeOfDay,
                camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls().target.toArray() },
                fog: scene.fog?.color.toArray(), background: scene.background?.isColor ? scene.background.toArray() : null,
                lights, shadowMapType: gl.shadowMap.type,
                renderer: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
                programs: gl.info.programs.map(program => ({
                    name: program.name, runnable: program.diagnostics?.runnable ?? null,
                    programLog: program.diagnostics?.programLog ?? '',
                })),
                contextLost: context.isContextLost(),
            };
        },
    };
});

async function settle() {
    // Let React commit and the useFrame lighting updates run in the real scene.
    await page.evaluate(() => new Promise(resolve => {
        let count = 0;
        function frame() { if (++count >= 4) resolve(); else requestAnimationFrame(frame); }
        requestAnimationFrame(frame);
    }));
}
async function at(hour) {
    await page.evaluate(hour => window.__lightingAudit.setTime(hour), hour);
    await page.waitForFunction(hour => window.__lightingAudit.state().timeOfDay === hour, hour);
    await settle();
    return page.evaluate(() => window.__lightingAudit.snapshot());
}
async function capture(name, hour, expectedPose) {
    const snapshot = await at(hour);
    const actualPose = Object.values(snapshot.camera).flat();
    const fixedPose = Object.values(expectedPose).flat();
    const maxCameraDelta = Math.max(...actualPose.map((value, index) => Math.abs(value - fixedPose[index])));
    assert.ok(maxCameraDelta < 1e-10, `camera must remain identical for ${name}`);
    assert.equal(snapshot.contextLost, false);
    assert.ok(snapshot.programs.every(program => program.runnable !== false), 'compiled shaders must be runnable');
    assert.equal(snapshot.shadowMapType, 1, 'three r183 PCFShadowMap enum');
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    evidence.frames.push({ name, maxCameraDelta, ...snapshot });
}
function lightingChannels(snapshot) {
    return [...snapshot.fog, ...(snapshot.background || []), ...snapshot.lights.flatMap(light => [
        light.intensity, ...light.color.map(value => value * light.intensity),
        ...(light.groundColor || []).map(value => value * light.intensity),
        ...(light.direction || []).map(value => value * light.intensity),
    ])];
}

try {
    await page.goto(url);
    await page.locator('[data-scene-label="PCS / MV"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Loading 3D equipment"]'));
    await page.waitForTimeout(1000);
    // Close the initial desktop Controls drawer without starting simulation.
    const closeControls = page.getByRole('button', { name: 'Close Controls panel', exact: true });
    if (await closeControls.isVisible()) await closeControls.click();
    await page.mouse.move(1420, 980);
    await settle();
    const initial = await page.evaluate(() => window.__lightingAudit.snapshot());
    evidence.rendererReported = initial.renderer;
    evidence.fixedState = await page.evaluate(() => window.__lightingAudit.state());
    const front = initial.camera;
    for (const hour of [0, 5, 6, 7, 12, 17, 18, 18.25, 18.75, 19, 20, 23]) {
        await capture(`front-${String(Math.floor(hour)).padStart(2, '0')}-${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`, hour, front);
    }

    // At every former branch/transition edge, compare actual rendered light and
    // fog and light radiance channels one second either side. Direction vectors
    // are intensity weighted: the position of a zero-power sun is invisible.
    // This catches wiring/color jumps that
    // a helper-only test cannot detect; it does not assert monotonic brightness.
    for (const hour of [0, 5, 5.5, 6, 7, 12, 17, 18, 19, 19.5, 20]) {
        const before = await at((hour - 1 / 3600 + 24) % 24);
        const savePair = [5, 6, 7, 17, 18, 19, 20].includes(hour);
        if (savePair) await page.screenshot({ path: path.join(output, `boundary-${hour}-before.png`) });
        const after = await at((hour + 1 / 3600) % 24);
        if (savePair) await page.screenshot({ path: path.join(output, `boundary-${hour}-after.png`) });
        const left = lightingChannels(before), right = lightingChannels(after);
        assert.equal(left.length, right.length);
        const maxChannelDelta = Math.max(...left.map((value, index) => Math.abs(value - right[index])));
        evidence.boundaries.push({ hour, secondsEitherSide: 1, maxChannelDelta, beforeChannels: left, afterChannels: right, savedScreenshotPair: savePair });
        assert.ok(maxChannelDelta < 0.002, `rendered lighting discontinuity at ${hour}h: ${maxChannelDelta}`);
    }

    const rearPosition = [2 * front.target[0] - front.position[0], front.position[1], 2 * front.target[2] - front.position[2]];
    await page.evaluate(({ position, target }) => window.__lightingAudit.pose(position, target), { position: rearPosition, target: front.target });
    await settle();
    const rear = (await page.evaluate(() => window.__lightingAudit.snapshot())).camera;
    await capture('rear-12-00', 12, rear);
    await capture('rear-23-00', 23, rear);

    // Closer equipment view with a fixed front/rear camera for cabinet detail.
    for (const [name, position] of [['pcs-front', [13.15, 5.38, 7.35]], ['pcs-rear', [-1.85, 5.38, -10.65]]]) {
        await page.evaluate(position => window.__lightingAudit.pose(position, [5.65, 1.38, -1.65]), position);
        await settle();
        const pose = (await page.evaluate(() => window.__lightingAudit.snapshot())).camera;
        await capture(`${name}-12-00`, 12, pose);
        await capture(`${name}-23-00`, 23, pose);
    }
    const finalState = await page.evaluate(() => window.__lightingAudit.state());
    assert.deepEqual({ ...finalState, timeOfDay: evidence.fixedState.timeOfDay }, evidence.fixedState, 'only timeOfDay changes in fixture state');
    evidence.shaderErrors = evidence.console.filter(entry => /shader error|validate_status|link_status|compile_status|error compiling/i.test(entry.text));
    evidence.deprecations = evidence.console.filter(entry => /deprecat/i.test(entry.text));
    evidence.shadowWarnings = evidence.console.filter(entry => /PCFSoftShadowMap|shadow.*deprecat/i.test(entry.text));
    assert.deepEqual(evidence.pageErrors, []);
    assert.deepEqual(evidence.shaderErrors, []);
    assert.deepEqual(evidence.shadowWarnings, []);
    assert.deepEqual(evidence.failedRequests, []);
    assert.ok(evidence.models.length >= 3 && evidence.models.every(model => model.status === 200 && new URL(model.url).pathname.startsWith('/BESS-Storage-Simulator/')));
    evidence.passed = true;
} catch (error) {
    evidence.passed = false;
    evidence.failure = String(error);
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    await writeFile(path.join(output, 'results.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ passed: evidence.passed, renderer: evidence.rendererReported, frames: evidence.frames.length, boundaries: evidence.boundaries.length, failure: evidence.failure, output }, null, 2));
    await browser.close();
}
