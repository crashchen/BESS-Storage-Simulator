// Supplementary Codex review: live readings with Details open at 640x360.
// Not in CI. Serve a Pages-path build, set PLAYWRIGHT_MODULE if needed, then:
// node docs/audits/2026-10-03/compact-card-live-check.mjs <local-app-url>
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:640,height:360}});
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.argv[2] || 'http://127.0.0.1:4313/BESS-Storage-Simulator/',{waitUntil:'load'});
 await page.waitForSelector('[data-scene-label="SOLAR ARRAY"]');
 await page.waitForFunction(()=>!document.querySelector('[role="status"][aria-label="Loading 3D equipment"]'));
 const controls=page.locator('button[aria-controls="drawer-controls"]');
 await controls.click();
 await page.getByTestId('simulation-start').click();
 await page.getByRole('button',{name:'Close Controls panel',exact:true}).click();
 await page.getByRole('button',{name:'Inspect BESS equipment'}).click();
 const card=page.getByTestId('scene-asset-info-card');
 const details=card.getByRole('button',{name:'Details',exact:true});
 await details.click();
 assert.equal(await details.getAttribute('aria-expanded'),'true');
 const soc=()=>card.locator('p').filter({hasText:/^\d+(?:\.\d+)?%$/}).innerText();
 const before=await soc();
 await page.waitForFunction(value=>[...document.querySelectorAll('[data-testid="scene-asset-info-card"] p')].some(el=>/^\d+(?:\.\d+)?%$/.test(el.textContent)&&el.textContent!==value),before,{timeout:15000});
 const after=await soc();
 assert.notEqual(before,after); assert.equal(await details.getAttribute('aria-expanded'),'true');
 const solar=()=>page.locator('[data-scene-label="SOLAR ARRAY"]').evaluate(el=>getComputedStyle(el).visibility);
 assert.equal(await solar(),'hidden');
 await page.locator('button[aria-controls="drawer-metrics"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-testid="scene-asset-info-card"]'));
 assert.equal(await solar(),'visible');
 await page.keyboard.press('Escape');
 await details.waitFor(); assert.equal(await details.getAttribute('aria-expanded'),'true');
 await page.getByRole('button',{name:'Inspect PCS / MV equipment'}).click();
 assert.equal(await details.getAttribute('aria-expanded'),'false');
 assert.deepEqual(errors,[]);
 const renderer=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';});
 console.log(JSON.stringify({viewport:'640x360',before,after,detailsDuringLiveUpdates:'preserved',drawer:'preserved',switch:'folded',solar:'hidden/restored',pageErrors:errors,renderer}));
} finally {await browser.close();}
