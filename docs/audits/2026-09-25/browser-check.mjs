// 2026-09-25 real-browser check: flow-legend placement and scene-label input.
//
// Not part of `npm test` or CI. It drives Chromium through Playwright, which is
// not a project dependency. Serve a build first, e.g. a Pages-path build:
//
//   BASE_URL=/BESS-Storage-Simulator/ npm run build
//   (serve dist/ at http://127.0.0.1:4302/BESS-Storage-Simulator/)
//   node docs/audits/2026-09-25/browser-check.mjs \
//     http://127.0.0.1:4302/BESS-Storage-Simulator/ out/branch branch [640x360,667x375]
//
// Environment:
//   PLAYWRIGHT_MODULE   path passed to require() for Playwright (default: 'playwright')
//   CHROMIUM_ARGS       extra Chromium flags, space-separated. The 2026-09-25 cloud run
//                       used SwiftShader (--use-angle=swiftshader
//                       --enable-unsafe-swiftshader --ignore-gpu-blocklist) and pinned
//                       the session's TLS-intercepting egress proxy CA keys with
//                       --ignore-certificate-errors-spki-list so Google Fonts loaded.
//   TROIKA_FONT_FILE    answer troika's default-font requests to cdn.jsdelivr.net with
//                       this local TTF. The cloud egress policy blocked that host; the
//                       font only draws the in-scene BESS SoC text.
//
// For each viewport it records the legend rectangle against the SOLAR ARRAY label,
// projected PV panels, other labels, HUD, drawer handles and scene toolbar, then:
// toggles the legend by keyboard; taps and mouse-clicks the Grid label centre and
// inset edges; checks BESS/PCS labels and all three equipment bodies by tap, mouse
// hover and click; checks empty-space deselection, orbit-drag from the Grid label,
// and legend visibility/state around both drawers. Selection is read from the scene
// toolbar's aria-pressed state. The Three scene is observed through the official
// __THREE_DEVTOOLS__ hook; application code is not modified.

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [,, url, outDir, tag, only] = process.argv;
if (!url || !outDir || !tag) {
    console.error('usage: node browser-check.mjs <app-url> <out-dir> <tag> [WxH,WxH...]');
    process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const ALL = [
    [320, 640], [390, 844], [640, 360], [667, 375], [1280, 720], [1440, 900],
    [568, 320], [740, 360], [812, 375], [844, 390], [932, 430], [320, 568], [390, 568], [768, 1024], [1024, 768],
];
const VIEWPORTS = (only ? ALL.filter(([w, h]) => only.split(',').includes(`${w}x${h}`)) : ALL)
    .map(([width, height]) => ({ width, height }));
const LEGEND = 'aside[aria-label="Energy flow legend"]';
const TOGGLE = `${LEGEND} button[aria-expanded]`;

const FONT_DATA = 'https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data';
const stubbed = new Set();
async function stubTroikaFont(context) {
    const file = process.env.TROIKA_FONT_FILE;
    if (!file) return;
    await context.route('https://cdn.jsdelivr.net/**', async (route) => {
        const requestUrl = route.request().url();
        stubbed.add(requestUrl.replace(FONT_DATA, '<font-data>'));
        if (requestUrl.startsWith(`${FONT_DATA}/codepoint-index/`)) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify([1, { '.*': { latin: 'o'.repeat(43) } }]) });
        }
        if (requestUrl === `${FONT_DATA}/font-meta/latin.json`) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify([1, { id: 'latin', typeforms: { 'sans-serif': { normal: [400] } }, ranges: '0-FF' }]) });
        }
        if (requestUrl.startsWith(`${FONT_DATA}/font-files/latin/`)) {
            return route.fulfill({ contentType: 'font/ttf', body: fs.readFileSync(file) });
        }
        return route.abort('blockedbyclient');
    });
}

function observeThree() {
    const hook = new EventTarget();
    window.__THREE_DEVTOOLS__ = hook;
    window.__probe = { scene: null, camera: null, frames: 0 };
    hook.addEventListener('observe', (event) => {
        const renderer = event.detail;
        if (!renderer?.isWebGLRenderer) return;
        const render = renderer.render.bind(renderer);
        renderer.render = (scene, camera) => {
            Object.assign(window.__probe, { scene, camera, frames: window.__probe.frames + 1 });
            return render(scene, camera);
        };
    });
}

function measure(page) {
    return page.evaluate(({ legendSelector, toggleSelector }) => {
        const box = (el) => {
            if (!el) return null;
            const b = el.getBoundingClientRect();
            const round = (v) => +v.toFixed(1);
            return { x: round(b.left), y: round(b.top), w: round(b.width), h: round(b.height), r: round(b.right), b: round(b.bottom) };
        };
        const labels = {};
        for (const el of document.querySelectorAll('[data-scene-label]')) {
            labels[el.dataset.sceneLabel] = { ...box(el), hidden: getComputedStyle(el).display === 'none' };
        }
        const toggle = document.querySelector(toggleSelector);
        const details = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
        const { scene, camera } = window.__probe;
        const V = camera.position.constructor;
        const canvas = document.querySelector('canvas');
        const cr = canvas.getBoundingClientRect();
        scene.updateMatrixWorld(true);
        const panels = [];
        scene.traverse((o) => {
            const p = o.isMesh && o.geometry?.parameters;
            const isPanelFrame = p && Math.abs(p.width - 1.65) < 1e-6 && Math.abs(p.height - 0.06) < 1e-6 && Math.abs(p.depth - 1.08) < 1e-6;
            if (!isPanelFrame) return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const bb = o.geometry.boundingBox;
            let x = Infinity, y = Infinity, r = -Infinity, b = -Infinity;
            for (const px of [bb.min.x, bb.max.x]) for (const py of [bb.min.y, bb.max.y]) for (const pz of [bb.min.z, bb.max.z]) {
                const s = new V(px, py, pz).applyMatrix4(o.matrixWorld).project(camera);
                const sx = cr.left + (s.x + 1) / 2 * cr.width;
                const sy = cr.top + (1 - s.y) / 2 * cr.height;
                x = Math.min(x, sx); y = Math.min(y, sy); r = Math.max(r, sx); b = Math.max(b, sy);
            }
            panels.push({ x, y, r, b });
        });
        return {
            canvas: box(canvas),
            legend: box(document.querySelector(legendSelector)),
            expanded: toggle ? toggle.getAttribute('aria-expanded') : 'no toggle',
            details: details && !details.hidden ? { ...box(details), clientHeight: details.clientHeight, scrollHeight: details.scrollHeight, pointerEvents: getComputedStyle(details).pointerEvents } : null,
            hud: box(document.querySelector('div.absolute.top-0.z-10')?.firstElementChild),
            controls: box(document.querySelector('button[aria-controls="drawer-controls"]')),
            metrics: box(document.querySelector('button[aria-controls="drawer-metrics"]')),
            tools: box(document.querySelector('nav[aria-label="Scene tools"]')),
            labels,
            panels,
        };
    }, { legendSelector: LEGEND, toggleSelector: TOGGLE });
}

const area = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
    const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? +(w * h).toFixed(1) : 0;
};
const dims = (a, b) => {
    const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
    const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? `${w.toFixed(1)}×${h.toFixed(1)}` : null;
};
function coverage(rect, m) {
    if (!rect) return null;
    return {
        solarLabel: dims(rect, m.labels['SOLAR ARRAY']),
        panels: `${m.panels.filter((p) => area(rect, p) > 0).length}/${m.panels.length}`,
        otherLabels: Object.fromEntries(Object.entries(m.labels)
            .filter(([name, v]) => name !== 'SOLAR ARRAY' && !v.hidden && area(rect, v) > 0)
            .map(([name, v]) => [name, area(rect, v)])),
        hud: area(rect, m.hud), controls: area(rect, m.controls), metrics: area(rect, m.metrics), tools: area(rect, m.tools),
    };
}

const selected = (page) => page.evaluate(() => {
    const ids = { 'Inspect BESS equipment': 'bess', 'Inspect PCS / MV equipment': 'pcs-mv', 'Inspect grid equipment': 'grid-node' };
    for (const [label, id] of Object.entries(ids)) {
        if (document.querySelector(`button[aria-label="${label}"]`)?.getAttribute('aria-pressed') === 'true') return id;
    }
    return null;
});
const card = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-testid="scene-asset-info-card"]');
    return el ? `${el.querySelector('p')?.textContent?.trim()}: ${el.querySelector('h2')?.textContent?.trim()}` : null;
});
const clear = async (page) => {
    await page.keyboard.press('Escape');
    await page.mouse.move(1, 1);
    await page.waitForTimeout(250);
};
const groupCentre = (page, [x, z]) => page.evaluate(([gx, gz]) => {
    const { scene, camera } = window.__probe;
    const V = camera.position.constructor;
    const cr = document.querySelector('canvas').getBoundingClientRect();
    // Particles can momentarily share an equipment position; take the matching
    // group with the most meshes (the equipment itself).
    const meshCount = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh) n += 1; }); return n; };
    let group = null;
    scene.traverse((o) => {
        if (o.isGroup && Math.abs(o.position.x - gx) < 1e-3 && Math.abs(o.position.z - gz) < 1e-3 && (!group || meshCount(o) > meshCount(group))) group = o;
    });
    if (!group) return null;
    group.updateWorldMatrix(true, true); // a just-mounted mesh has no world matrix yet
    // Centre of the world bounds of the equipment's solid meshes; thin Line2 risers
    // would otherwise pull the point onto a 2-4 px line above the body.
    const min = new V(Infinity, Infinity, Infinity);
    const max = new V(-Infinity, -Infinity, -Infinity);
    group.traverse((child) => {
        if (!child.isMesh || !child.geometry || child.isLineSegments2 || child.isLine2) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        const bb = child.geometry.boundingBox;
        for (const px of [bb.min.x, bb.max.x]) for (const py of [bb.min.y, bb.max.y]) for (const pz of [bb.min.z, bb.max.z]) {
            const corner = new V(px, py, pz).applyMatrix4(child.matrixWorld);
            min.min(corner);
            max.max(corner);
        }
    });
    const p = min.add(max).multiplyScalar(0.5).project(camera);
    return [+(cr.left + (p.x + 1) / 2 * cr.width).toFixed(1), +(cr.top + (1 - p.y) / 2 * cr.height).toFixed(1)];
}, [x, z]);
const centre = (r) => [+(r.x + r.w / 2).toFixed(1), +(r.y + r.h / 2).toFixed(1)];

async function checkViewport(browser, viewport) {
    const name = `${tag}-${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true });
    await stubTroikaFont(context);
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await page.addInitScript(observeThree);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('[data-scene-label="SOLAR ARRAY"]', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('[role="status"][aria-label="Loading 3D equipment"]') && window.__probe.frames > 30, null, { timeout: 120000, polling: 250 });
    await page.waitForTimeout(2500); // camera fit and damping settle

    const out = { viewport: name };
    const m0 = await measure(page);
    out.chrome = { hud: m0.hud, controls: m0.controls, metrics: m0.metrics, tools: m0.tools };
    out.labels = Object.fromEntries(Object.entries(m0.labels).map(([k, v]) => [k, v.hidden ? 'hidden' : [v.x, v.y, v.r, v.b]]));
    out.legend = { expanded: m0.expanded, rect: m0.legend, covers: coverage(m0.legend, m0), details: m0.details };
    await page.screenshot({ path: `${outDir}/${name}-default.png` });
    // Equipment points are taken now, before hover/selection mounts highlight shells.
    const targets = {
        'BESS UNIT label': centre(m0.labels['BESS UNIT']),
        'PCS / MV label': centre(m0.labels['PCS / MV']),
        'BESS body': await groupCentre(page, [-0.8, 0.2]),
        'PCS body': await groupCentre(page, [5.65, -1.65]),
        'Grid body': await groupCentre(page, [12.4, 0.25]),
    };

    if (await page.locator(TOGGLE).count()) {
        await page.keyboard.press('Tab');
        out.firstTabStop = await page.evaluate(() => `${document.activeElement?.tagName.toLowerCase()} "${document.activeElement?.textContent?.trim()}"`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        const m1 = await measure(page);
        out.legendAfterEnter = { expanded: m1.expanded, rect: m1.legend, covers: coverage(m1.legend, m1), details: m1.details, detailsCover: coverage(m1.details, m1) };
        await page.screenshot({ path: `${outDir}/${name}-legend-toggled.png` });
        await page.keyboard.press(' ');
        await page.waitForTimeout(250);
        out.legendAfterSpace = (await measure(page)).expanded;
        await page.mouse.move(1, 1);
    }

    const grid = m0.labels['GRID NODE'];
    const inset = 3;
    const points = {
        centre: centre(grid), left: [grid.x + inset, centre(grid)[1]], right: [grid.r - inset, centre(grid)[1]],
        topRight: [grid.r - inset, grid.y + inset], bottomRight: [grid.r - inset, grid.b - inset],
    };
    out.gridLabel = {
        rect: [grid.x, grid.y, grid.r, grid.b],
        elementAtCentre: await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase(), points.centre),
        tap: {}, mouseClick: {},
    };
    for (const [key, point] of Object.entries(points)) {
        await clear(page);
        await page.touchscreen.tap(...point);
        await page.waitForTimeout(300);
        out.gridLabel.tap[key] = await selected(page);
    }
    await clear(page);
    const samples = [];
    for (let i = 0; i < 6; i++) {
        await page.mouse.move(points.right[0] - i * 2, points.right[1]);
        await page.waitForTimeout(120);
        samples.push(await card(page));
    }
    out.gridLabel.mouseHover = {
        cards: [...new Set(samples)],
        cursor: await page.evaluate(() => document.body.style.cursor || 'auto'),
        labelHighlighted: await page.evaluate(() => document.querySelector('[data-scene-label="GRID NODE"]').className.includes('text-cyan-100')),
    };
    for (const [key, point] of Object.entries(points)) {
        await clear(page);
        await page.mouse.click(...point);
        await page.waitForTimeout(300);
        out.gridLabel.mouseClick[key] = await selected(page);
        if (key === 'right') await page.screenshot({ path: `${outDir}/${name}-grid-label-click.png` });
    }

    out.otherTargets = {};
    for (const [target, point] of Object.entries(targets)) {
        await clear(page);
        await page.touchscreen.tap(...point);
        await page.waitForTimeout(300);
        const tap = await selected(page);
        await clear(page);
        await page.mouse.move(...point);
        await page.waitForTimeout(400);
        const hover = await card(page);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(300);
        out.otherTargets[target] = { point, tap, hover, click: await selected(page) };
    }
    await clear(page);

    await page.getByRole('button', { name: 'Inspect grid equipment' }).click();
    await page.waitForTimeout(200);
    // First candidate: just below the HUD. If an overlay (e.g. the top-centred legend
    // on short portrait screens) is there, fall back to the first canvas point.
    const emptyPoint = await page.evaluate(([w, h, hudBottom, toolsTop]) => {
        const candidates = [[w / 2, hudBottom + 12], [10, toolsTop - 12], [w - 10, toolsTop - 12], [10, h / 2]];
        return candidates.find(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS') ?? candidates[0];
    }, [m0.canvas.w, m0.canvas.h, m0.hud?.b ?? 0, m0.tools?.y ?? m0.canvas.h]);
    await page.touchscreen.tap(...emptyPoint);
    await page.waitForTimeout(300);
    out.emptyTapPoint = emptyPoint.map((v) => +v.toFixed(1));
    out.emptyTapClears = (await selected(page)) === null;

    const before = await page.evaluate(() => window.__probe.camera.position.toArray());
    await page.mouse.move(...points.centre);
    await page.mouse.down();
    await page.mouse.move(points.centre[0] - 60, points.centre[1] + 10, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => window.__probe.camera.position.toArray());
    out.dragFromGridLabelOrbits = before.some((v, i) => Math.abs(v - after[i]) > 1e-3);
    await page.getByRole('button', { name: 'Restore full site view' }).click();
    await page.waitForTimeout(800);

    const legendState = async () => (await page.locator(TOGGLE).count()) ? page.locator(TOGGLE).getAttribute('aria-expanded') : 'no toggle';
    const initial = await legendState();
    out.drawers = {};
    for (const drawer of ['drawer-controls', 'drawer-metrics']) {
        await page.locator(`button[aria-controls="${drawer}"]`).click();
        await page.waitForTimeout(500);
        out.drawers[drawer] = { legend: await page.locator(LEGEND).count(), toolbar: await page.locator('nav[aria-label="Scene tools"]').count() };
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
    }
    out.legendStateAfterDrawers = { before: initial, after: await legendState() };
    out.errors = errors;
    await context.close();
    return out;
}

const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(/\s+/).filter(Boolean) });
const results = [];
for (const viewport of VIEWPORTS) {
    const result = await checkViewport(browser, viewport);
    results.push(result);
    console.log(JSON.stringify(result));
}
const version = browser.version();
await browser.close();
fs.writeFileSync(`${outDir}/${tag}-results.json`, `${JSON.stringify({ url, chromium: version, stubbedRequests: [...stubbed], results }, null, 2)}\n`);
