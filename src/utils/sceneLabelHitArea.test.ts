import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from 'three';
import { SCENE_3D } from '../config';
import { createLabelRaycast } from './sceneLabelHitArea';

interface Rect { left: number; top: number; width: number; height: number }

const element = (rect: Rect) => ({
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
});

// Mirrors the Grid label: offset 1.5 m beside the transformer, drawn as an
// 83×22 px CSS box centred on its projected anchor (the size measured in Chromium).
const LABEL_OFFSET = new Vector3(1.5, SCENE_3D.models.mainTransformer.size[1] * SCENE_3D.equipmentScale + 0.1, 0);
const LABEL_SIZE = { width: 83, height: 22 };

function setup(canvas: Rect = { left: 0, top: 0, width: 1280, height: 720 }) {
    const camera = new PerspectiveCamera(SCENE_3D.camera.fov, canvas.width / canvas.height, SCENE_3D.camera.near, SCENE_3D.camera.far);
    camera.position.set(...SCENE_3D.camera.position);
    camera.lookAt(...SCENE_3D.orbit.target);
    camera.updateMatrixWorld();

    const scene = new Scene();
    const gridNode = new Group();
    gridNode.position.set(...SCENE_3D.gridNode.position);
    scene.add(gridNode);
    const proxy = new Group();
    proxy.position.copy(LABEL_OFFSET);
    gridNode.add(proxy);
    scene.updateMatrixWorld(true);

    const anchor = proxy.getWorldPosition(new Vector3()).project(camera);
    const centre = {
        x: canvas.left + ((anchor.x + 1) / 2) * canvas.width,
        y: canvas.top + ((1 - anchor.y) / 2) * canvas.height,
    };
    const label: Rect = { left: centre.x - LABEL_SIZE.width / 2, top: centre.y - LABEL_SIZE.height / 2, ...LABEL_SIZE };
    let labelRect: Rect = label;
    proxy.raycast = createLabelRaycast(() => element(labelRect), () => element(canvas));

    const raycaster = new Raycaster();
    const castAt = (x: number, y: number) => {
        raycaster.setFromCamera(new Vector2(
            ((x - canvas.left) / canvas.width) * 2 - 1,
            -((y - canvas.top) / canvas.height) * 2 + 1,
        ), camera);
        return raycaster.intersectObject(scene, true);
    };
    return { camera, scene, gridNode, proxy, label, centre, castAt, hide: () => { labelRect = { ...label, width: 0, height: 0 }; } };
}

describe('createLabelRaycast', () => {
    it('hits anywhere on the rendered label and bubbles to the owning equipment', () => {
        const { proxy, gridNode, label, centre, castAt } = setup();
        const right = label.left + label.width;
        const bottom = label.top + label.height;
        for (const [x, y] of [
            [centre.x, centre.y],
            [label.left + 1, label.top + 1],
            [right - 1, label.top + 1],
            [label.left + 1, bottom - 1],
            [right - 1, bottom - 1],
        ]) {
            const hits = castAt(x, y);
            expect(hits).toHaveLength(1);
            expect(hits[0].object).toBe(proxy);
            expect(hits[0].object.parent).toBe(gridNode);
            expect(hits[0].distance).toBe(0);
        }
    });

    it('misses just outside each edge of the label', () => {
        const { label, centre, castAt } = setup();
        for (const [x, y] of [
            [label.left - 1, centre.y],
            [label.left + label.width + 1, centre.y],
            [centre.x, label.top - 1],
            [centre.x, label.top + label.height + 1],
        ]) {
            expect(castAt(x, y)).toHaveLength(0);
        }
    });

    it('keeps the label, drawn above the canvas, ahead of geometry on the same ray', () => {
        const { camera, scene, proxy, centre, castAt } = setup();
        // A box between the camera and the label anchor would otherwise win.
        const blocker = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
        blocker.position.copy(proxy.getWorldPosition(new Vector3()).lerp(camera.position, 0.5));
        scene.add(blocker);
        scene.updateMatrixWorld(true);

        const hits = castAt(centre.x, centre.y);
        expect(hits.map(hit => hit.object)).toEqual([proxy, blocker]);
    });

    it('maps the ray through an offset canvas rectangle', () => {
        const { proxy, label, centre, castAt } = setup({ left: 120, top: 48, width: 640, height: 360 });
        expect(castAt(centre.x, centre.y)[0]?.object).toBe(proxy);
        expect(castAt(label.left - 2, centre.y)).toHaveLength(0);
    });

    it('ignores a hidden label and a raycaster without a camera', () => {
        const { proxy, centre, castAt, hide } = setup();
        const intersects: Parameters<typeof proxy.raycast>[1] = [];
        expect(() => proxy.raycast(new Raycaster(), intersects)).not.toThrow();
        expect(intersects).toHaveLength(0);

        hide();
        expect(castAt(centre.x, centre.y)).toHaveLength(0);
    });
});
