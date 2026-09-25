// 2026-09-25 real-browser regression: pinned equipment card placement and
// equipment-label selection.
//
// Not part of `npm test` or CI. It drives Chromium through Playwright, which is
// not a project dependency. Serve a build first, e.g. a Pages-path build:
//
//   BASE_URL=/BESS-Storage-Simulator/ npm run build
//   (serve dist/ at http://127.0.0.1:4312/BESS-Storage-Simulator/)
//   node docs/audits/2026-09-25/card-label-check.mjs \
//     http://127.0.0.1:4312/BESS-Storage-Simulator/ out/branch branch [640x360,667x375]
//
// Environment (same as browser-check.mjs):
//   PLAYWRIGHT_MODULE   path passed to require() for Playwright (default: 'playwright')
//   CHROMIUM_ARGS       extra Chromium flags, space-separated (the cloud run used
//                       SwiftShader and pinned the egress proxy CA keys)
//   TROIKA_FONT_FILE    answer troika's default-font requests to cdn.jsdelivr.net with
//                       this local TTF (the cloud egress policy blocked that host)
//
// For each viewport it records the default overview (equipment labels, projected
// equipment bounds, solar array, HUD, drawer handles, legend, scene toolbar), then:
// - pins each asset from the scene toolbar and records the card rectangle, what it
//   covers, its scroll size, and whether its Close button is the top element;
// - with each asset pinned, mouse-clicks and taps every equipment label centre and
//   equipment body, and records the selection that results;
// - with nothing pinned, taps and mouse-clicks nine points on each equipment label
//   (centre, edge midpoints and corners, each inset 3px);
// - hovers each equipment body and records where the preview card opens.
// Selection is read from the scene toolbar's aria-pressed state. Equipment points
// are taken before any hover or selection mounts highlight shells. The Three scene
// is observed through the official __THREE_DEVTOOLS__ hook; application code is not
// modified.

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [,, url, outDir, tag, only] = process.argv;
if (!url || !outDir || !tag) {
    console.error('usage: node card-label-check.mjs <app-url> <out-dir> <tag> [WxH,WxH...]');
    process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const ALL = [
    [1280, 720], [1440, 900], [1024, 768], [1366, 657], [1920, 1080],
    [390, 844], [320, 640], [768, 1024],
    [640, 360], [667, 375], [568, 320], [740, 360], [812, 375], [844, 390], [932, 430],
];
const VIEWPORTS = (only ? only.split(',').map((v) => v.split('x').map(Number)) : ALL)
    .map(([width, height]) => ({ width, height }));
const SCREENSHOTS = new Set(['1280x720', '390x844', '640x360', '667x375']);

const ASSETS = {
    bess: { tool: 'Inspect BESS equipment', label: 'BESS UNIT', group: [-0.8, 0.2] },
    'pcs-mv': { tool: 'Inspect PCS / MV equipment', label: 'PCS / MV', group: [5.65, -1.65] },
    'grid-node': { tool: 'Inspect grid equipment', label: 'GRID NODE', group: [12.4, 0.25] },
};

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

// DOM rectangles of the scene labels, HUD, drawer handles, legend and toolbar.
const chrome = (page) => page.evaluate(() => {
    const box = (el) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const round = (v) => +v.toFixed(1);
        return { x: round(b.left), y: round(b.top), r: round(b.right), b: round(b.bottom) };
    };
    const labels = {};
    for (const el of document.querySelectorAll('[data-scene-label]')) {
        labels[el.dataset.sceneLabel] = getComputedStyle(el).display === 'none' ? null : box(el);
    }
    return {
        labels,
        hud: box(document.querySelector('div.absolute.top-0.z-10')?.firstElementChild),
        controls: box(document.querySelector('button[aria-controls="drawer-controls"]')),
        metrics: box(document.querySelector('button[aria-controls="drawer-metrics"]')),
        tools: box(document.querySelector('nav[aria-label="Scene tools"]')),
        legend: box(document.querySelector('aside[aria-label="Energy flow legend"]')),
    };
});

// Screen bounds of each equipment group's solid meshes (thin Line2 risers
// excluded) and of the solar array, projected through the live camera.
const sceneBounds = (page) => page.evaluate((assets) => {
    const { scene, camera } = window.__probe;
    const V = camera.position.constructor;
    const cr = document.querySelector('canvas').getBoundingClientRect();
    const toScreen = (v) => { const p = v.clone().project(camera); return [cr.left + (p.x + 1) / 2 * cr.width, cr.top + (1 - p.y) / 2 * cr.height]; };
    const rectOf = (corners) => {
        let x = Infinity, y = Infinity, r = -Infinity, b = -Infinity;
        for (const c of corners) { const [sx, sy] = toScreen(c); x = Math.min(x, sx); y = Math.min(y, sy); r = Math.max(r, sx); b = Math.max(b, sy); }
        const round = (v) => +v.toFixed(1);
        return { x: round(x), y: round(y), r: round(r), b: round(b) };
    };
    const boxCorners = (min, max) => {
        const out = [];
        for (const px of [min.x, max.x]) for (const py of [min.y, max.y]) for (const pz of [min.z, max.z]) out.push(new V(px, py, pz));
        return out;
    };
    const meshCount = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh) n += 1; }); return n; };
    const out = {};
    for (const [id, { group: [gx, gz] }] of Object.entries(assets)) {
        // Particles can momentarily share an equipment position; take the matching
        // group with the most meshes (the equipment itself).
        let group = null;
        scene.traverse((o) => {
            if (o.isGroup && Math.abs(o.position.x - gx) < 1e-3 && Math.abs(o.position.z - gz) < 1e-3 && (!group || meshCount(o) > meshCount(group))) group = o;
        });
        if (!group) { out[id] = null; continue; }
        group.updateWorldMatrix(true, true); // a just-mounted mesh has no world matrix yet
        const min = new V(Infinity, Infinity, Infinity);
        const max = new V(-Infinity, -Infinity, -Infinity);
        group.traverse((child) => {
            if (!child.isMesh || !child.geometry || child.isLineSegments2 || child.isLine2) return;
            if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
            const bb = child.geometry.boundingBox;
            for (const corner of boxCorners(bb.min, bb.max)) {
                corner.applyMatrix4(child.matrixWorld);
                min.min(corner);
                max.max(corner);
            }
        });
        const [cx, cy] = toScreen(min.clone().add(max).multiplyScalar(0.5));
        out[id] = { rect: rectOf(boxCorners(min, max)), centre: [+cx.toFixed(1), +cy.toFixed(1)] };
    }
    const panels = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
        const p = o.isMesh && o.geometry?.parameters;
        if (!(p && Math.abs(p.width - 1.65) < 1e-6 && Math.abs(p.height - 0.06) < 1e-6 && Math.abs(p.depth - 1.08) < 1e-6)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        panels.push(...boxCorners(bb.min, bb.max).map((c) => c.applyMatrix4(o.matrixWorld)));
    });
    out.solar = panels.length ? { rect: rectOf(panels) } : null;
    return out;
}, ASSETS);

const card = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-testid="scene-asset-info-card"]');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const close = el.querySelector('button[aria-label="Close equipment info card"]');
    let closeOnTop = null;
    if (close) {
        const c = close.getBoundingClientRect();
        closeOnTop = close.contains(document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2));
    }
    const round = (v) => +v.toFixed(1);
    return {
        kind: el.querySelector('p')?.textContent?.trim(),
        title: el.querySelector('h2')?.textContent?.trim(),
        rect: { x: round(b.left), y: round(b.top), r: round(b.right), b: round(b.bottom) },
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        closeOnTop,
    };
});

const area = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
    const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? +(w * h).toFixed(0) : 0;
};
// Share of each label/body rectangle under the card, and overlap area in px²
// with the HUD, drawer handles, legend and toolbar.
function covers(rect, base, bounds) {
    const share = (target) => {
        if (!target) return 0;
        const whole = (target.r - target.x) * (target.b - target.y);
        return whole > 0 ? +(area(rect, target) / whole).toFixed(2) : 0;
    };
    const out = {};
    for (const [name, r] of Object.entries(base.labels)) if (share(r)) out[`label ${name}`] = share(r);
    for (const [name, v] of Object.entries(bounds)) if (v && share(v.rect)) out[`body ${name}`] = share(v.rect);
    for (const k of ['hud', 'controls', 'metrics', 'tools', 'legend']) if (area(rect, base[k])) out[k] = area(rect, base[k]);
    return out;
}

const selected = (page) => page.evaluate((assets) => {
    for (const [id, { tool }] of Object.entries(assets)) {
        if (document.querySelector(`button[aria-label="${tool}"]`)?.getAttribute('aria-pressed') === 'true') return id;
    }
    return null;
}, ASSETS);
const topElement = (page, [x, y]) => page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return null;
    if (el.closest('[data-testid="scene-asset-info-card"]')) return 'card';
    return el.tagName.toLowerCase();
}, [x, y]);
const clear = async (page) => {
    await page.keyboard.press('Escape');
    await page.mouse.move(1, 1);
    await page.waitForTimeout(250);
};
const pin = async (page, id) => {
    await clear(page);
    await page.getByRole('button', { name: ASSETS[id].tool }).click();
    await page.waitForTimeout(300);
};
const centre = (r) => [+((r.x + r.r) / 2).toFixed(1), +((r.y + r.b) / 2).toFixed(1)];
function labelPoints(r, inset = 3) {
    const [cx, cy] = centre(r);
    return {
        centre: [cx, cy], left: [r.x + inset, cy], right: [r.r - inset, cy], top: [cx, r.y + inset], bottom: [cx, r.b - inset],
        topLeft: [r.x + inset, r.y + inset], topRight: [r.r - inset, r.y + inset], bottomLeft: [r.x + inset, r.b - inset], bottomRight: [r.r - inset, r.b - inset],
    };
}

async function checkViewport(browser, viewport) {
    const size = `${viewport.width}x${viewport.height}`;
    const name = `${tag}-${size}`;
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

    const base = await chrome(page);
    const bounds = await sceneBounds(page);
    const out = { viewport: name, labels: base.labels, bounds, chrome: { hud: base.hud, controls: base.controls, metrics: base.metrics, tools: base.tools, legend: base.legend } };
    const targets = {};
    for (const [id, { label }] of Object.entries(ASSETS)) {
        if (base.labels[label]) targets[`${label} label`] = { asset: id, point: centre(base.labels[label]) };
        if (bounds[id]) targets[`${id} body`] = { asset: id, point: bounds[id].centre };
    }

    out.pinned = {};
    for (const id of Object.keys(ASSETS)) {
        await pin(page, id);
        const c = await card(page);
        out.pinned[id] = {
            ...c,
            covers: c ? covers(c.rect, base, bounds) : null,
            topAtTargets: Object.fromEntries(await Promise.all(Object.entries(targets).map(async ([t, { point }]) => [t, await topElement(page, point)]))),
        };
        if (id === 'bess' && SCREENSHOTS.has(size)) await page.screenshot({ path: `${outDir}/${name}-bess-pinned.png` });
    }

    out.switchWhilePinned = { click: {}, tap: {} };
    for (const id of Object.keys(ASSETS)) {
        for (const [target, { point }] of Object.entries(targets)) {
            await pin(page, id);
            await page.mouse.click(...point);
            await page.waitForTimeout(300);
            out.switchWhilePinned.click[`${id} → ${target}`] = await selected(page);
            if (id === 'bess' && target === 'GRID NODE label' && SCREENSHOTS.has(size)) {
                await page.screenshot({ path: `${outDir}/${name}-bess-pinned-grid-label-click.png` });
            }
            await pin(page, id);
            await page.touchscreen.tap(...point);
            await page.waitForTimeout(300);
            out.switchWhilePinned.tap[`${id} → ${target}`] = await selected(page);
        }
    }

    out.labelPoints = {};
    for (const { label } of Object.values(ASSETS)) {
        const rect = base.labels[label];
        if (!rect) continue;
        const result = { rect, tap: {}, click: {} };
        for (const [key, point] of Object.entries(labelPoints(rect))) {
            await clear(page);
            await page.touchscreen.tap(...point);
            await page.waitForTimeout(300);
            result.tap[key] = await selected(page);
            await clear(page);
            await page.mouse.click(...point);
            await page.waitForTimeout(300);
            result.click[key] = await selected(page);
            if (label === 'PCS / MV' && key === 'top' && SCREENSHOTS.has(size)) {
                await page.screenshot({ path: `${outDir}/${name}-pcs-label-top-click.png` });
            }
        }
        out.labelPoints[label] = result;
    }

    out.hoverPreview = {};
    for (const id of Object.keys(ASSETS)) {
        if (!bounds[id]) continue;
        await clear(page);
        await page.mouse.move(...bounds[id].centre);
        await page.waitForTimeout(400);
        const c = await card(page);
        out.hoverPreview[id] = c ? { kind: c.kind, title: c.title, rect: c.rect, covers: covers(c.rect, base, bounds) } : null;
    }

    // Short landscape starts the legend collapsed; its popover must open above
    // a card docked on the left, and the card must stay pinned.
    const toggle = page.locator('aside[aria-label="Energy flow legend"] button[aria-expanded]');
    if (await toggle.count() && (await toggle.getAttribute('aria-expanded')) === 'false') {
        await pin(page, 'bess');
        await toggle.click();
        await page.waitForTimeout(300);
        out.legendPopoverWithCard = await page.evaluate(() => {
            const button = document.querySelector('aside[aria-label="Energy flow legend"] button[aria-expanded]');
            const details = document.getElementById(button.getAttribute('aria-controls'));
            const card = document.querySelector('[data-testid="scene-asset-info-card"]');
            const b = details.getBoundingClientRect();
            const c = card?.getBoundingClientRect();
            const overlap = c ? Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left)) * Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top)) : 0;
            const probe = [b.left + b.width / 2, b.top + b.height / 2];
            const el = document.elementFromPoint(...probe);
            return {
                expanded: !details.hidden,
                overlapPx2: Math.round(overlap),
                topAtDetailsCentre: el?.closest('aside[aria-label="Energy flow legend"]') ? 'legend' : el?.closest('[data-testid="scene-asset-info-card"]') ? 'card' : el?.tagName.toLowerCase(),
            };
        });
        out.legendPopoverWithCard.cardStillPinned = await selected(page);
        if (SCREENSHOTS.has(size)) await page.screenshot({ path: `${outDir}/${name}-legend-popover-over-card.png` });
        await toggle.click();
        await page.waitForTimeout(300);
    }
    await clear(page);
    out.errors = errors;
    await context.close();
    return out;
}

const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(/\s+/).filter(Boolean) });
const results = [];
for (const viewport of VIEWPORTS) {
    const result = await checkViewport(browser, viewport);
    results.push(result);
    console.log(JSON.stringify({ viewport: result.viewport, pinned: Object.fromEntries(Object.entries(result.pinned).map(([k, v]) => [k, v && v.covers])), errors: result.errors.length }));
}
const version = browser.version();
await browser.close();
fs.writeFileSync(`${outDir}/${tag}-results.json`, `${JSON.stringify({ url, chromium: version, stubbedRequests: [...stubbed], results }, null, 2)}\n`);
