// 2026-09-25 companion check: does the unpinned hover preview stay put while the
// mouse rests on equipment that the preview itself covers?
//
// Same prerequisites and environment variables as browser-check.mjs. Usage:
//   node docs/audits/2026-09-25/hover-stability.mjs <app-url> <out-file.json> [WxH,...]
//
// For the Grid transformer body and the GRID NODE label it moves the mouse 1px at
// a time (12 moves, 120 ms apart) and records, per move, whether the preview is
// shown and whether the element under the pointer is the card. It then clicks and
// reports the toolbar selection. Finally it pins BESS from the toolbar and clicks
// the Grid label, recording whether the pinned card covers the label. Default
// viewports: 1280×720 (card at the right, over the transformer) and 390×844 /
// 640×360 (card centred over the scene).

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [,, url, outFile, only] = process.argv;
if (!url || !outFile) {
    console.error('usage: node hover-stability.mjs <app-url> <out-file.json> [WxH,...]');
    process.exit(2);
}
const VIEWPORTS = (only || '1280x720,390x844,640x360').split(',').map((v) => {
    const [width, height] = v.split('x').map(Number);
    return { width, height };
});

const FONT_DATA = 'https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data';
async function stubTroikaFont(context) {
    const file = process.env.TROIKA_FONT_FILE;
    if (!file) return;
    await context.route('https://cdn.jsdelivr.net/**', (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.startsWith(`${FONT_DATA}/codepoint-index/`)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify([1, { '.*': { latin: 'o'.repeat(43) } }]) });
        if (requestUrl === `${FONT_DATA}/font-meta/latin.json`) return route.fulfill({ contentType: 'application/json', body: JSON.stringify([1, { id: 'latin', typeforms: { 'sans-serif': { normal: [400] } }, ranges: '0-FF' }]) });
        if (requestUrl.startsWith(`${FONT_DATA}/font-files/latin/`)) return route.fulfill({ contentType: 'font/ttf', body: fs.readFileSync(file) });
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

const gridBodyCentre = (page) => page.evaluate(() => {
    const { scene, camera } = window.__probe;
    const V = camera.position.constructor;
    const cr = document.querySelector('canvas').getBoundingClientRect();
    const meshCount = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh) n += 1; }); return n; };
    let group = null;
    scene.traverse((o) => {
        if (o.isGroup && Math.abs(o.position.x - 12.4) < 1e-3 && Math.abs(o.position.z - 0.25) < 1e-3 && (!group || meshCount(o) > meshCount(group))) group = o;
    });
    group.updateWorldMatrix(true, true);
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
    return [cr.left + (p.x + 1) / 2 * cr.width, cr.top + (1 - p.y) / 2 * cr.height];
});

const snapshot = (page, [x, y]) => page.evaluate(([px, py]) => {
    const cardEl = document.querySelector('[data-testid="scene-asset-info-card"]');
    return {
        preview: cardEl ? cardEl.querySelector('p')?.textContent?.trim() === 'Hover preview' : false,
        pointerOnCard: !!document.elementFromPoint(px, py)?.closest('[data-testid="scene-asset-info-card"]'),
    };
}, [x, y]);

const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(/\s+/).filter(Boolean) });
const results = [];
for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await stubTroikaFont(context);
    const page = await context.newPage();
    await page.addInitScript(observeThree);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('[data-scene-label="GRID NODE"]', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('[role="status"][aria-label="Loading 3D equipment"]') && window.__probe.frames > 30, null, { timeout: 120000, polling: 250 });
    await page.waitForTimeout(2500);

    const label = await page.evaluate(() => {
        const r = document.querySelector('[data-scene-label="GRID NODE"]').getBoundingClientRect();
        return [r.right - 6, r.top + r.height / 2];
    });
    const targets = { 'Grid body': await gridBodyCentre(page), 'GRID NODE label (right edge)': label };
    const result = { viewport: `${viewport.width}x${viewport.height}` };
    for (const [name, [x, y]] of Object.entries(targets)) {
        await page.keyboard.press('Escape');
        await page.mouse.move(1, 1);
        await page.waitForTimeout(300);
        const samples = [];
        for (let i = 0; i < 12; i++) {
            await page.mouse.move(x + (i % 2), y);
            await page.waitForTimeout(120);
            samples.push(await snapshot(page, [x + (i % 2), y]));
        }
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(300);
        const selectedGrid = await page.evaluate(() => document.querySelector('button[aria-label="Inspect grid equipment"]').getAttribute('aria-pressed') === 'true');
        result[name] = {
            point: [+x.toFixed(1), +y.toFixed(1)],
            previewShown: `${samples.filter((s) => s.preview).length}/${samples.length}`,
            pointerOverCard: `${samples.filter((s) => s.pointerOnCard).length}/${samples.length}`,
            sequence: samples.map((s) => (s.preview ? 'P' : '-')).join(''),
            clickSelectsGrid: selectedGrid,
        };
    }
    // A pinned card (BESS here) keeps pointer input; where it covers the Grid
    // label, clicking the label leaves the pinned selection unchanged.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Inspect BESS equipment' }).click();
    await page.waitForTimeout(300);
    const pinnedCardCoversLabel = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="scene-asset-info-card"]'), label);
    await page.mouse.click(...label);
    await page.waitForTimeout(300);
    result.withBessPinned = {
        pinnedCardCoversGridLabel: pinnedCardCoversLabel,
        selectionAfterLabelClick: await page.evaluate(() => {
            const ids = { 'Inspect BESS equipment': 'bess', 'Inspect PCS / MV equipment': 'pcs-mv', 'Inspect grid equipment': 'grid-node' };
            for (const [name, id] of Object.entries(ids)) if (document.querySelector(`button[aria-label="${name}"]`)?.getAttribute('aria-pressed') === 'true') return id;
            return null;
        }),
    };
    results.push(result);
    console.log(JSON.stringify(result));
    await context.close();
}
const version = browser.version();
await browser.close();
fs.writeFileSync(outFile, `${JSON.stringify({ url, chromium: version, results }, null, 2)}\n`);
