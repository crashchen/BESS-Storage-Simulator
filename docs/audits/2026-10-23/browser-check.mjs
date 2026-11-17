// Real application UI checks on local/Pages-path builds, using software WebGL.
// PLAYWRIGHT_MODULE=/path/to/playwright node browser-check.mjs [url] [output]
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.argv[3] || '/tmp/bess-pcs-20261023/app';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const evidence = { renderer: '', assets: [], inspections: [], errors: [], responses: [] };
page.on('pageerror', error => evidence.errors.push(String(error)));
page.on('response', response => {
    if (response.url().includes('.glb')) evidence.responses.push({ url: response.url(), status: response.status() });
});
try {
    await page.goto(process.argv[2] || 'http://127.0.0.1:5173/');
    await page.locator('[data-scene-label="PCS / MV"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Loading 3D equipment"]'));
    await page.waitForTimeout(1200);
    evidence.renderer = await page.evaluate(() => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    });
    await page.screenshot({ path: path.join(output, 'day-overview.png') });
    for (const [name, label, title] of [
        ['BESS', 'BESS UNIT', 'BESS Unit'],
        ['PCS / MV', 'PCS / MV', 'PCS / MV Station'],
        ['Grid', 'GRID NODE', 'Grid Node'],
    ]) {
        const element = page.locator(`[data-scene-label="${label}"]`);
        const rect = await element.boundingBox();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        const card = page.getByTestId('scene-asset-info-card');
        await card.waitFor();
        await page.waitForFunction(title => document.querySelector('[data-testid="scene-asset-info-card"]')?.textContent.includes(title), title);
        const preview = await card.innerText();
        assert.ok(preview.includes(title), `hover preview for ${name}`);
        // Html label is pointer-transparent; real canvas raycast pins selection.
        await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
        assert.equal(await card.getByRole('button', { name: 'Close equipment info card' }).count(), 1);
        const text = await card.innerText();
        if (name === 'PCS / MV') {
            assert.match(text, /station-level/i);
            assert.match(text, /38.*5 MW/);
            await page.screenshot({ path: path.join(output, 'pcs-card.png') });
        }
        evidence.inspections.push({ name, preview: true, pinned: true, text });
        await page.keyboard.press('Escape');
        await page.mouse.move(1400, 900);
    }
    // Pan and dolly with OrbitControls, then verify its Full site recovery.
    const label = await page.locator('[data-scene-label="PCS / MV"]').boundingBox();
    await page.mouse.move(label.x + 30, label.y + 35);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(690, 480, { steps: 15 });
    await page.mouse.up({ button: 'right' });
    for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, -600);
        await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);
    await page.mouse.move(500, 100);
    await page.screenshot({ path: path.join(output, 'pcs-closeup.png') });
    await page.getByRole('button', { name: 'Restore full site view' }).click();
    await page.locator('button[aria-controls="drawer-controls"]').click();
    await page.locator('#drawer-controls[aria-hidden="false"]').waitFor();
    await page.locator('button[aria-controls="drawer-metrics"]').click();
    await page.locator('#drawer-metrics[aria-hidden="false"]').waitFor();
    assert.equal(await page.locator('#drawer-controls').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('#drawer-metrics').getAttribute('aria-hidden'), 'false');
    await page.getByRole('button', { name: 'Close Metrics & Economics panel', exact: true }).click();
    const speed = page.getByRole('slider', { name: 'Simulation Speed' });
    await speed.focus(); await page.keyboard.press('End');
    await page.getByTestId('simulation-start').click();
    // Use actual ticks, not injected state. Capture afternoon and night flow states.
    for (const [name, hours] of [['afternoon', '(13|14|15)'], ['night', '(21|22|23)']]) {
        await page.waitForFunction(pattern => new RegExp(`\\b${pattern}:\\d{2}`).test(document.querySelector('[data-testid="status-hud"]').textContent), hours, { timeout: 120000 });
        await page.getByTestId('simulation-pause').click();
        await page.getByRole('button', { name: 'Close Controls panel', exact: true }).click();
        await page.mouse.move(1400, 900);
        await page.waitForTimeout(400);
        evidence[name] = await page.getByTestId('status-hud').innerText();
        await page.screenshot({ path: path.join(output, `${name}-overview.png`) });
        await page.locator('button[aria-controls="drawer-controls"]').click();
        await page.getByTestId('simulation-start').click();
    }
    await page.getByTestId('simulation-pause').click();
    await page.getByRole('button', { name: 'Close Controls panel', exact: true }).click();
    await page.setViewportSize({ width: 640, height: 480 });
    await page.getByRole('button', { name: 'Restore full site view' }).click();
    await page.getByRole('button', { name: 'Inspect PCS / MV equipment' }).click();
    await page.waitForTimeout(700);
    evidence.compact = await page.evaluate(() => {
        const hud = document.querySelector('[data-testid="status-hud"]').getBoundingClientRect();
        const card = document.querySelector('[data-testid="scene-asset-info-card"]').getBoundingClientRect();
        return { hudBottom: hud.bottom, cardTop: card.top, cardBottom: card.bottom, height: innerHeight };
    });
    assert.ok(evidence.compact.cardTop >= evidence.compact.hudBottom + 7);
    assert.ok(evidence.compact.cardBottom <= evidence.compact.height - 90);
    await page.screenshot({ path: path.join(output, 'pcs-compact.png') });
    assert.ok(evidence.responses.some(r => r.url.endsWith('generic-pcs-mv-skid-5mw-v2.glb') && r.status === 200));
    assert.ok(evidence.responses.every(r => r.status === 200));
    assert.deepEqual(evidence.errors, []);
    await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') });
    throw error;
} finally {
    await browser.close();
}
