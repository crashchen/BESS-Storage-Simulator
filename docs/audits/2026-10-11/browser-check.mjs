// Local production-build regression, not a physical-phone/GPU acceptance test.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright node .../browser-check.mjs <url> <output-dir>
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.argv[3] || '/tmp/bess-20261011-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = { renderer: '', axis: [], layouts: [], pageErrors: [] };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
    page.on('pageerror', error => evidence.pageErrors.push(String(error)));
    await page.goto(process.argv[2] || 'http://127.0.0.1:4313/BESS-Storage-Simulator/');
    await page.locator('[data-scene-label="BESS UNIT"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Loading 3D equipment"]'));
    evidence.renderer = await page.evaluate(() => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    });
    const controls = page.locator('button[aria-controls="drawer-controls"]');
    const metrics = page.locator('button[aria-controls="drawer-metrics"]');
    await controls.click();
    const speed = page.getByRole('slider', { name: 'Simulation Speed' });
    await speed.focus();
    await page.keyboard.press('Home');
    await page.getByTestId('simulation-start').click();
    await metrics.click();
    await page.locator('.recharts-xAxis').waitFor();
    await page.locator('.recharts-xAxis').scrollIntoViewIfNeeded();
    // Keep a real 1x run beyond one minute. Waiting on simulated labels, not
    // wall time, also accounts for the engine's capped delta on a slow renderer.
    await page.waitForFunction(() => {
        const ticks = [...document.querySelectorAll('.recharts-wrapper text')]
            .map(el => el.textContent).filter(text => /^D\d+ /.test(text));
        if (ticks.length < 2 || ticks.some(text => !/^D\d+ \d\d:\d\d:\d\d$/.test(text))) return false;
        const seconds = ticks.map(text => {
            const [, d, h, m, s] = text.match(/^D(\d+) (\d+):(\d+):(\d+)$/);
            return Number(d) * 86400 + Number(h) * 3600 + Number(m) * 60 + Number(s);
        });
        return Math.max(...seconds) - Math.min(...seconds) > 60;
    }, undefined, { timeout: 180000 });
    await page.getByTestId('simulation-pause').click();
    evidence.slowAxis = (await page.locator('.recharts-wrapper text').allTextContents()).filter(text => /^D\d+ /.test(text));
    assert.equal(new Set(evidence.slowAxis).size, evidence.slowAxis.length, '1x labels must stay distinct after one minute');
    await page.screenshot({ path: path.join(output, 'slow-axis.png') });
    await page.getByTestId('simulation-start').click();
    await speed.focus();
    await page.keyboard.press('End');
    assert.equal(await speed.inputValue(), '1440');
    await page.waitForTimeout(3500);
    await page.getByTestId('simulation-pause').click();
    await page.locator('.recharts-xAxis').waitFor();
    await page.locator('.recharts-xAxis').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
        const ticks = [...document.querySelectorAll('.recharts-wrapper text')];
        return ticks.filter(tick => /^D\d+ /.test(tick.textContent)).length > 1;
    });
    evidence.axis = await page.locator('.recharts-wrapper text').evaluateAll(ticks =>
        ticks.filter(tick => /^D\d+ /.test(tick.textContent)).map(tick => ({ label: tick.textContent, x: tick.getBoundingClientRect().x })));
    // Recharts shifts edge labels inward to fit. Tick marks, not label boxes,
    // are the geometry corresponding to numeric coordinates.
    const tickX = await page.locator('.recharts-xAxis .recharts-cartesian-axis-tick line').evaluateAll(lines => lines.map(line => line.getBoundingClientRect().x));
    assert.equal(tickX.length, evidence.axis.length);
    evidence.axis = evidence.axis.map((tick, i) => ({ ...tick, x: tickX[i] }));
    assert.ok(evidence.axis.length >= 2);
    assert.equal(new Set(evidence.axis.map(tick => tick.label)).size, evidence.axis.length);
    assert.ok(evidence.axis.every(tick => /^D1 /.test(tick.label)));
    const toMinute = label => { const [, hh, mm] = label.match(/D\d+ (\d+):(\d+)/); return Number(hh) * 60 + Number(mm); };
    const points = evidence.axis;
    const scale = (points.at(-1).x - points[0].x) / (toMinute(points.at(-1).label) - toMinute(points[0].label));
    for (const point of points.slice(1)) {
        const expected = points[0].x + (toMinute(point.label) - toMinute(points[0].label)) * scale;
        assert.ok(Math.abs(point.x - expected) < 5, 'SVG ticks must use simulated-time proportions');
    }
    await page.screenshot({ path: path.join(output, 'speed-axis.png') });

    // Accumulate beyond midnight with the real RAF/tick path, not injected state.
    await page.getByTestId('simulation-start').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.recharts-wrapper text')].some(el => el.textContent.startsWith('D2 ')), undefined, { timeout: 120000 });
    await page.getByTestId('simulation-pause').click();
    const dayTwo = (await page.locator('.recharts-wrapper text').allTextContents()).filter(text => /^D\d+ /.test(text)).join(' / ');
    assert.match(dayTwo, /D2/);
    evidence.midnightAxis = dayTwo;
    await page.screenshot({ path: path.join(output, 'midnight-axis.png') });
    await page.getByRole('button', { name: 'Close Metrics & Economics panel', exact: true }).click();
    await page.getByTestId('simulation-stop').click();
    await page.getByRole('button', { name: 'Charge', exact: true }).click();
    await page.getByTestId('simulation-start').click();
    await page.waitForTimeout(700);
    await page.getByTestId('simulation-pause').click();
    await page.getByRole('button', { name: 'Close Controls panel', exact: true }).click();
    const value = page.locator('[title="Project demo value, including assumed restored-load value"]');
    const realValue = await value.textContent();
    assert.match(realValue, /-/, 'charge then pause must produce a real negative demo value');

    for (const [width, height, synthetic] of [[640, 480, false], [700, 500, false], [768, 480, false], [800, 600, true], [640, 360, true], [667, 375, true], [932, 430, true], [568, 320, true], [1280, 720, true], [390, 844, true]]) {
        await page.setViewportSize({ width, height });
        await page.getByRole('button', { name: 'Restore full site view', exact: true }).click();
        await page.getByRole('button', { name: 'Inspect BESS equipment', exact: true }).click();
        const card = page.getByTestId('scene-asset-info-card');
        await card.waitFor();
        // Stress layout only: large/negative totals are synthetic text, not a
        // claim that the short simulation generated this amount.
        await value.evaluate((el, text) => { el.textContent = text; }, synthetic ? '€-123456789' : realValue);
        await page.waitForTimeout(300);
        const geometry = await page.evaluate(() => {
            const hud = document.querySelector('[data-testid="status-hud"]').getBoundingClientRect();
            const card = document.querySelector('[data-testid="scene-asset-info-card"]').getBoundingClientRect();
            return { hudBottom: hud.bottom, cardTop: card.top, cardBottom: card.bottom, scrollHeight: document.querySelector('[data-testid="scene-asset-info-card"]').scrollHeight };
        });
        assert.ok(geometry.cardTop >= geometry.hudBottom + 7, `HUD overlaps at ${width}x${height}`);
        assert.ok(geometry.cardBottom <= height - 90, 'card must leave room for scene toolbar');
        evidence.layouts.push({ width, height, synthetic, ...geometry });
        if (width === 640 && height === 360) await page.screenshot({ path: path.join(output, 'paused-summary-640x360.png') });
        if (height <= 430) {
            const details = card.getByRole('button', { name: 'Details', exact: true });
            await details.click();
            assert.equal(await details.getAttribute('aria-expanded'), 'true');
            await card.getByRole('button', { name: 'Close equipment info card' }).focus();
            await page.keyboard.press('End');
            await page.waitForFunction(() => document.querySelector('[data-testid="scene-asset-info-card"]').scrollTop > 0);
            await page.waitForTimeout(300);
        }
        await page.screenshot({ path: path.join(output, `paused-hud-${width}x${height}.png`) });
    }
    assert.deepEqual(evidence.pageErrors, []);
    await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') });
    console.error(JSON.stringify(evidence, null, 2));
    throw error;
} finally {
    await browser.close();
}
