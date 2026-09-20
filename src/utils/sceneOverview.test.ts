import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { SCENE_3D } from '../config';
import { getSceneOverview } from './sceneOverview';

describe('full site perspective framing', () => {
    it('contains the maximum PV array using the same panel geometry as the scene', () => {
        const pv = SCENE_3D.solarArray;
        const framing = new Box3(new Vector3(...SCENE_3D.framing.min), new Vector3(...SCENE_3D.framing.max));
        const panel = new Box3().setFromCenterAndSize(new Vector3(), new Vector3(...pv.panelSize))
            .applyMatrix4(new Matrix4().makeRotationX(pv.panelTiltX));
        const startX = pv.baseStartX - (pv.maxCols - pv.baselineCols) * pv.spacingX / 2;
        for (let row = 0; row < pv.maxRows; row++) for (let col = 0; col < pv.maxCols; col++) {
            const box = panel.clone().translate(new Vector3(startX + col * pv.spacingX,
                pv.panelHeight, pv.baseStartZ + row * pv.spacingZ));
            expect(framing.containsBox(box), `PV panel ${row},${col} outside framing`).toBe(true);
        }
    });

    it.each([[320, 640], [390, 844], [768, 1024], [1280, 720], [844, 390]])(
        'projects the complete site into a padded %i × %i viewport', (width, height) => {
            const fit = getSceneOverview(width, height)!;
            const camera = new PerspectiveCamera(SCENE_3D.camera.fov, width / height,
                SCENE_3D.camera.near, SCENE_3D.camera.far);
            camera.position.copy(fit.position);
            camera.lookAt(fit.target);
            camera.updateMatrixWorld();
            const { min, max, horizontalPaddingPx, verticalPaddingPx } = SCENE_3D.framing;
            for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
                const projected = new Vector3(x, y, z).project(camera);
                const px = (projected.x + 1) * width / 2;
                const py = (1 - projected.y) * height / 2;
                expect(px).toBeGreaterThanOrEqual(horizontalPaddingPx - 1e-8);
                expect(px).toBeLessThanOrEqual(width - horizontalPaddingPx + 1e-8);
                expect(py).toBeGreaterThanOrEqual(verticalPaddingPx - 1e-8);
                expect(py).toBeLessThanOrEqual(height - verticalPaddingPx + 1e-8);
                expect(projected.z).toBeGreaterThan(-1);
                expect(projected.z).toBeLessThan(1);
            }
        },
    );

    it('does not fit an unmeasured or invalid canvas', () => {
        for (const [width, height] of [[0, 720], [320, 0], [NaN, 720], [320, Infinity]]) {
            expect(getSceneOverview(width, height)).toBeNull();
        }
    });
});
