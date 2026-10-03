// 2026-10-03 real-browser check: short-landscape card summary, its folded
// details, and the SOLAR ARRAY label while a card is docked over the array.
//
// Not part of `npm test` or CI. It drives Chromium through Playwright, which is
// not a project dependency. Serve a Pages-path build first:
//
//   BASE_URL=/BESS-Storage-Simulator/ npm run build
//   (serve dist/ at http://127.0.0.1:4312/BESS-Storage-Simulator/)
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
//   node docs/audits/2026-10-03/compact-card-check.mjs \
//     http://127.0.0.1:4312/BESS-Storage-Simulator/ out/branch branch [640x360,667x375]
//
// For each viewport it records, with each asset pinned from the scene toolbar:
// - the card's visible height and content height, before and after opening
//   Details (where the card offers it);
// - the keyboard path: focus lands on Close, Tab reaches Details, Enter opens it;
// - whether open details survive a few seconds of simulation updates, and fold
//   again after switching equipment (toolbar and equipment label), Close/Escape
//   and reopening, and after a drawer hides and returns the card;
// - scrolling the pinned BESS card: mouse wheel over it (and whether the camera
//   moved), then PageDown and End with Close focused;
// - the hover preview: its height and any focusable control inside it;
// - the SOLAR ARRAY label: visibility and rectangle with no card, with a pinned
//   card, with a hover preview and after closing.
// The Three scene is observed through the official __THREE_DEVTOOLS__ hook to
// find equipment for hovering; application code is not modified.

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [,, url, outDir, tag, only] = process.argv;
if (!url || !outDir || !tag) {
    console.error('usage: node compact-card-check.mjs <app-url> <out-dir> <tag> [WxH,WxH...]');
    process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const ALL = [
    [640, 360], [667, 375], [844, 390], [932, 430],
    [568, 320], [740, 360], [812, 375],
    [1280, 720], [1440, 900], [390, 844], [768, 1024], [640, 480],
];
const VIEWPORTS = (only ? only.split(',').map((v) => v.split('x').map(Number)) : ALL)
    .map(([width, height]) => ({ width, height }));
const SCREENSHOTS = new Set(['640x360', '667x375', '844x390', '932x430', '1280x720', '390x844']);

const ASSETS = {
    bess: { tool: 'Inspect BESS equipment', label: 'BESS UNIT', group: [-0.8, 0.2] },
    'pcs-mv': { tool: 'Inspect PCS / MV equipment', label: 'PCS / MV', group: [5.65, -1.65] },
    'grid-node': { tool: 'Inspect grid equipment', label: 'GRID NODE', group: [12.4, 0.25] },
};
const CARD = '[data-testid="scene-asset-info-card"]';

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

// Screen centre of each equipment group's solid meshes, through the live camera.
const equipmentCentres = (page) => page.evaluate((assets) => {
    const { scene, camera } = window.__probe;
    const V = camera.position.constructor;
    const cr = document.querySelector('canvas').getBoundingClientRect();
    const meshCount = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh) n += 1; }); return n; };
    const out = {};
    for (const [id, { group: [gx, gz] }] of Object.entries(assets)) {
        let group = null;
        scene.traverse((o) => {
            if (o.isGroup && Math.abs(o.position.x - gx) < 1e-3 && Math.abs(o.position.z - gz) < 1e-3 && (!group || meshCount(o) > meshCount(group))) group = o;
        });
        if (!group) { out[id] = null; continue; }
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
        const p = min.clone().add(max).multiplyScalar(0.5).project(camera);
        out[id] = [+(cr.left + (p.x + 1) / 2 * cr.width).toFixed(1), +(cr.top + (1 - p.y) / 2 * cr.height).toFixed(1)];
    }
    return out;
}, ASSETS);

const round = (v) => +v.toFixed(1);
const rectOf = (b) => ({ x: round(b.left), y: round(b.top), r: round(b.right), b: round(b.bottom) });

const card = (page) => page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const details = el.querySelector('button[aria-controls]');
    const focusable = [...el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
        .filter((node) => !node.closest('[hidden]') && node.tabIndex >= 0)
        .map((node) => node.getAttribute('aria-label') || node.textContent.trim());
    const b = el.getBoundingClientRect();
    return {
        title: el.querySelector('h2')?.textContent?.trim(),
        rect: { x: +b.left.toFixed(1), y: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1) },
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        details: details ? details.getAttribute('aria-expanded') : null,
        focusable,
    };
}, CARD);

const solarLabel = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-scene-label="SOLAR ARRAY"]');
    if (!el) return null;
    const style = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const cardEl = document.querySelector('[data-testid="scene-asset-info-card"]');
    let visiblePx = 0;
    if (style.visibility === 'visible' && style.display !== 'none') {
        // Label area not under the card (the card is opaque enough to hide it).
        const total = b.width * b.height;
        let covered = 0;
        if (cardEl) {
            const c = cardEl.getBoundingClientRect();
            covered = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left)) * Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top));
        }
        visiblePx = Math.round(total - covered);
    }
    return {
        visibility: style.visibility,
        rect: { x: +b.left.toFixed(1), y: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1) },
        visiblePx,
    };
});

const selected = (page) => page.evaluate((assets) => {
    for (const [id, { tool }] of Object.entries(assets)) {
        if (document.querySelector(`button[aria-label="${tool}"]`)?.getAttribute('aria-pressed') === 'true') return id;
    }
    return null;
}, ASSETS);
const activeName = (page) => page.evaluate(() => {
    const el = document.activeElement;
    return el ? el.getAttribute('aria-label') || el.textContent.trim() : null;
});
const settle = (page, ms = 300) => page.waitForTimeout(ms);
const clear = async (page) => {
    await page.keyboard.press('Escape');
    await page.mouse.move(1, 1);
    await settle(page, 250);
};
const pin = async (page, id) => {
    await page.getByRole('button', { name: ASSETS[id].tool }).click();
    await settle(page);
};
const openDetails = async (page) => {
    const toggle = page.locator(`${CARD} button[aria-controls]`);
    if (!(await toggle.count())) return false;
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    await settle(page);
    return true;
};
const detailsState = async (page) => (await card(page))?.details ?? null;
const scrollTop = (page) => page.evaluate((selector) => Math.round(document.querySelector(selector)?.scrollTop ?? -1), CARD);
const cameraPose = (page) => page.evaluate(() => {
    const { camera } = window.__probe;
    return [...camera.position.toArray(), camera.zoom].map((v) => +v.toFixed(4)).join(',');
});

async function checkViewport(browser, viewport) {
    const size = `${viewport.width}x${viewport.height}`;
    const name = `${tag}-${size}`;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    const failedRequests = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('requestfailed', (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText}`));
    await page.addInitScript(observeThree);
    // The local static server occasionally stalls a module request, leaving an
    // empty page; reload once and record it rather than abort the whole run.
    let loadAttempts = 0;
    for (;;) {
        loadAttempts += 1;
        try {
            await page.goto(url, { waitUntil: 'load' });
            await page.waitForSelector('[data-scene-label="SOLAR ARRAY"]', { timeout: 60000 });
            break;
        } catch (error) {
            if (loadAttempts >= 2) throw error;
        }
    }
    await page.waitForFunction(() => !document.querySelector('[role="status"][aria-label="Loading 3D equipment"]') && window.__probe.frames > 30, null, { timeout: 120000, polling: 250 });
    await settle(page, 2500); // camera fit and damping settle

    const out = { viewport: name, loadAttempts, failedRequests, solarLabel: { noCard: await solarLabel(page) }, pinned: {}, hoverPreview: {} };
    const centres = await equipmentCentres(page);
    const labelRects = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-scene-label]')]
        .map((el) => { const b = el.getBoundingClientRect(); return [el.dataset.sceneLabel, [b.left + b.width / 2, b.top + b.height / 2]]; })));

    for (const id of Object.keys(ASSETS)) {
        await clear(page);
        await pin(page, id);
        const collapsed = await card(page);
        const focusAfterPin = await activeName(page);
        let tabTo = null;
        let enterOpens = null;
        if (collapsed?.details !== null && collapsed?.details !== undefined) {
            await page.keyboard.press('Tab');
            tabTo = await activeName(page);
            await page.keyboard.press('Enter');
            await settle(page);
            enterOpens = await detailsState(page);
        }
        const expanded = await card(page);
        out.pinned[id] = {
            collapsed,
            expanded: collapsed?.details ? { clientHeight: expanded.clientHeight, scrollHeight: expanded.scrollHeight, details: expanded.details } : null,
            keyboard: { focusAfterPin, tabTo, enterOpens },
        };
        if (id === 'bess') out.solarLabel.pinned = await solarLabel(page);
        if (SCREENSHOTS.has(size)) {
            if (id === 'bess' || id === 'grid-node') {
                if (collapsed?.details) {
                    await page.locator(`${CARD} button[aria-controls]`).click();
                    await settle(page);
                    await page.screenshot({ path: `${outDir}/${name}-${id}-summary.png` });
                    await openDetails(page);
                    await page.locator(`${CARD} button[aria-controls]`).scrollIntoViewIfNeeded();
                    await settle(page);
                    await page.screenshot({ path: `${outDir}/${name}-${id}-details-open.png` });
                } else {
                    await page.screenshot({ path: `${outDir}/${name}-${id}-pinned.png` });
                }
            }
        }
    }

    // Details lifetime (only where the card folds details).
    await clear(page);
    await pin(page, 'bess');
    if (await openDetails(page)) {
        const life = {};
        await settle(page, 3000);
        life.sameAssetAfter3s = await detailsState(page);
        await page.locator('button[aria-controls="drawer-metrics"]').click();
        await settle(page);
        life.hiddenUnderDrawer = (await card(page)) === null;
        await page.keyboard.press('Escape');
        await settle(page);
        life.afterDrawerCloses = await detailsState(page);
        await pin(page, 'pcs-mv');
        life.afterToolbarSwitch = await detailsState(page);
        await pin(page, 'bess');
        life.backToFirst = await detailsState(page);
        await openDetails(page);
        if (labelRects['GRID NODE']) {
            await page.mouse.click(...labelRects['GRID NODE']);
            await settle(page);
            life.afterLabelSwitch = { selected: await selected(page), details: await detailsState(page) };
        }
        await openDetails(page);
        await page.keyboard.press('Escape');
        await settle(page);
        await pin(page, 'grid-node');
        life.afterEscapeReopen = await detailsState(page);
        await openDetails(page);
        await page.getByRole('button', { name: 'Close equipment info card' }).click();
        await settle(page);
        life.solarAfterClose = await solarLabel(page);
        await pin(page, 'grid-node');
        life.afterCloseReopen = await detailsState(page);
        out.detailsLifetime = life;
    }

    // Scrolling: wheel over the card must scroll it, not zoom the camera.
    await clear(page);
    await pin(page, 'bess');
    {
        const box = await page.locator(CARD).boundingBox();
        const pose = await cameraPose(page);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 120);
        await settle(page, 600);
        const afterWheel = await scrollTop(page);
        const cameraMoved = (await cameraPose(page)) !== pose;
        await page.evaluate((selector) => { document.querySelector(selector).scrollTop = 0; }, CARD);
        await page.getByRole('button', { name: 'Close equipment info card' }).focus();
        await page.keyboard.press('PageDown');
        await settle(page, 600);
        const afterPageDown = await scrollTop(page);
        await page.keyboard.press('End');
        await settle(page, 600);
        const afterEnd = await scrollTop(page);
        const max = await page.evaluate((selector) => { const el = document.querySelector(selector); return el.scrollHeight - el.clientHeight; }, CARD);
        out.scroll = { afterWheel, cameraMoved, afterPageDown, afterEnd, max };
    }

    for (const id of Object.keys(ASSETS)) {
        if (!centres[id]) continue;
        await clear(page);
        await page.mouse.move(...centres[id]);
        await settle(page, 400);
        const c = await card(page);
        out.hoverPreview[id] = c && { title: c.title, clientHeight: c.clientHeight, scrollHeight: c.scrollHeight, focusable: c.focusable };
        if (id === 'bess') out.solarLabel.hoverPreview = await solarLabel(page);
        if (id === 'bess' && SCREENSHOTS.has(size)) await page.screenshot({ path: `${outDir}/${name}-bess-hover-preview.png` });
    }
    await clear(page);
    out.solarLabel.afterClear = await solarLabel(page);
    out.errors = errors;
    await context.close();
    return out;
}

const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(/\s+/).filter(Boolean) });
const results = [];
for (const viewport of VIEWPORTS) {
    const result = await checkViewport(browser, viewport);
    results.push(result);
    const heights = Object.fromEntries(Object.entries(result.pinned).map(([k, v]) => [k, `${v.collapsed?.clientHeight}/${v.collapsed?.scrollHeight}${v.expanded ? ` → ${v.expanded.scrollHeight}` : ''}`]));
    console.log(JSON.stringify({ viewport: result.viewport, loads: result.loadAttempts, scroll: result.scroll, heights, solar: Object.fromEntries(Object.entries(result.solarLabel).map(([k, v]) => [k, v && `${v.visibility}:${v.visiblePx}`])), errors: result.errors.length }));
}
const version = browser.version();
await browser.close();
fs.writeFileSync(`${outDir}/${tag}-results.json`, `${JSON.stringify({ url, chromium: version, results }, null, 2)}\n`);
