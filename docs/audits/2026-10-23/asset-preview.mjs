// Controlled geometry previews, not native-GPU or full-app acceptance.
// PLAYWRIGHT_MODULE=/path/to/playwright node asset-preview.mjs [base-url] [output]
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173';
const output = process.argv[3] || '/tmp/bess-pcs-20261023';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
    const baseline = execFileSync('git', ['show', 'c10efb0:public/models/generic-pcs-mv-skid-5mw-v1.glb'], { maxBuffer: 4 * 1024 * 1024 });
    await page.route('**/baseline-skid.glb', route => route.fulfill({ body: baseline, contentType: 'model/gltf-binary' }));
    await page.route('**/__asset_preview', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' }));
    await page.goto(`${base}/__asset_preview`);
    const results = [];
    for (const file of ['baseline-skid.glb', 'models/generic-pcs-mv-skid-5mw-v2.glb']) {
        for (const [view, camera, night] of [
            ['front', [7.5, 5.3, 9], false], ['rear', [-7.5, 4.6, -9], false],
            ['front-night', [7.5, 4.4, 9], true],
        ]) {
            const stats = await page.evaluate(async ({ file, camera, night }) => {
                const T = await import('/node_modules/three/build/three.module.js');
                const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
                document.body.replaceChildren();
                const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
                renderer.setSize(innerWidth, innerHeight);
                renderer.setPixelRatio(1);
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = T.PCFSoftShadowMap;
                renderer.toneMapping = T.ACESFilmicToneMapping;
                renderer.toneMappingExposure = 1.1;
                document.body.append(renderer.domElement);
                const scene = new T.Scene();
                scene.background = new T.Color(night ? '#101923' : '#e0e5e7');
                const model = (await new GLTFLoader().loadAsync(`/${file}`)).scene;
                model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                scene.add(model);
                scene.add(new T.HemisphereLight('#dcecff', '#5c6673', night ? .75 : 2));
                const sun = new T.DirectionalLight('#fff4e4', night ? .35 : 3);
                sun.position.set(-4, 8, 5);
                sun.castShadow = true;
                sun.shadow.mapSize.set(2048, 2048);
                sun.shadow.camera.left = -6;
                sun.shadow.camera.right = 6;
                sun.shadow.camera.top = 6;
                sun.shadow.camera.bottom = -6;
                sun.shadow.normalBias = .025;
                scene.add(sun);
                const fill = new T.DirectionalLight('#b2d7ff', night ? .65 : .4);
                fill.position.set(5, 3, -5);
                scene.add(fill);
                const floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial({ color: night ? '#151e2b' : '#c9d0d3', roughness: .9 }));
                floor.rotation.x = -Math.PI / 2;
                floor.position.y = -.015;
                floor.receiveShadow = true;
                scene.add(floor);
                const cam = new T.PerspectiveCamera(36, innerWidth / innerHeight, .1, 100);
                cam.position.set(...camera);
                cam.lookAt(0, 1.3, 0);
                renderer.render(scene, cam);
                const box = new T.Box3().setFromObject(model);
                const ext = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
                const stats = { file, night, bounds: box.getSize(new T.Vector3()).toArray(),
                    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
                    renderer: ext ? renderer.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
                // Save the rendered frame, then dispose GPU resources before the next preview.
                const image = renderer.domElement.toDataURL();
                scene.traverse(o => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
                renderer.dispose();
                const img = new Image(); img.src = image;
                document.body.replaceChildren(img);
                await img.decode();
                return stats;
            }, { file, camera, night });
            const name = `${file.startsWith('baseline') ? 'before' : 'after'}-${view}.png`;
            await page.screenshot({ path: path.join(output, name) });
            results.push({ view, ...stats });
        }
    }
    if (errors.length) throw new Error(errors.join('\n'));
    await writeFile(path.join(output, 'asset-preview-results.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
    await browser.close();
}
