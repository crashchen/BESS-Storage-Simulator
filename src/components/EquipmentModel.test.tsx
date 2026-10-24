import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, type Mesh, type Object3D, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SCENE_3D } from '../config';
import { equipmentModelUrl } from '../utils/equipmentModels';
import { EquipmentModel } from './EquipmentModel';

const probes = vi.hoisted(() => ({
    clone: vi.fn<(props: { object: Object3D; scale: number }) => null>(() => null),
    load: vi.fn(),
}));
vi.mock('@react-three/drei', () => ({ Clone: probes.clone, useGLTF: probes.load }));

const models = Object.entries(SCENE_3D.models);
const scenes = new Map<string, Object3D>();
const framing = new Box3(new Vector3(...SCENE_3D.framing.min), new Vector3(...SCENE_3D.framing.max));

beforeAll(async () => {
    for (const [, model] of models) {
        const raw = readFileSync(resolve('public', model.file));
        const { scene } = await new GLTFLoader().parseAsync(new Uint8Array(raw).buffer, '');
        scenes.set(equipmentModelUrl(model.file), scene);
    }
    probes.load.mockImplementation((url: string) => {
        const scene = scenes.get(url);
        if (!scene) throw new Error(`Unexpected model URL: ${url}`);
        return { scene };
    });
});

beforeEach(() => {
    probes.clone.mockClear();
    probes.load.mockClear();
});

function displayedObject(model: (typeof models)[number][1]) {
    const view = render(<EquipmentModel model={model} />);
    const { object, scale } = probes.clone.mock.calls.at(-1)![0];
    // Apply what the real component passed to Clone, not a second copy of the
    // intended scale. The GLB and its internal node transforms are real.
    const copy = object.clone(true);
    copy.scale.setScalar(scale);
    view.unmount();
    return copy;
}

describe('equipment scale and configured site footprint', () => {
    it.each(models)('%s renders a metre-scale asset at the shared equipment scale', (_, model) => {
        const source = scenes.get(equipmentModelUrl(model.file))!;
        // Clone overrides the root scale; non-unit source transforms require
        // an explicit normalization decision rather than silently losing it.
        expect(source.scale.toArray()).toEqual([1, 1, 1]);
        expect(source.position.toArray()).toEqual([0, 0, 0]);
        expect(source.quaternion.toArray()).toEqual([0, 0, 0, 1]);
        const nativeSize = new Box3().setFromObject(source, true).getSize(new Vector3());
        const displayedSize = new Box3().setFromObject(displayedObject(model), true).getSize(new Vector3());
        for (const axis of ['x', 'y', 'z'] as const) {
            expect(displayedSize[axis] / nativeSize[axis]).toBeCloseTo(SCENE_3D.equipmentScale, 8);
        }
        expect(probes.load).toHaveBeenCalledWith(equipmentModelUrl(model.file));
        expect(source.scale.toArray()).toEqual([1, 1, 1]);
    });

    it('fits actual equipment on its configured pads, without overlap or leaving the framing', () => {
        const boxes: Box3[] = [];
        for (const [name, model] of models) {
            const pad = name === 'bessContainer' ? SCENE_3D.pads.bess
                : name === 'pcsMvSkid' ? SCENE_3D.pads.substation : null;
            const object = displayedObject(model);
            if (pad) object.position.set(pad.position[0], pad.position[1] + pad.size[1] / 2, pad.position[2]);
            else object.position.set(...SCENE_3D.gridNode.position);
            const box = new Box3().setFromObject(object, true);
            expect(framing.containsBox(box), `${name} outside framing`).toBe(true);
            if (pad) {
                for (const axis of [0, 2]) {
                    expect(box.min.getComponent(axis)).toBeGreaterThanOrEqual(pad.position[axis] - pad.size[axis] / 2);
                    expect(box.max.getComponent(axis)).toBeLessThanOrEqual(pad.position[axis] + pad.size[axis] / 2);
                }
            }
            boxes.push(box);
        }
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            expect(boxes[i].intersectsBox(boxes[j])).toBe(false);
        }
        for (const pad of [SCENE_3D.pads.bess, SCENE_3D.pads.solar, SCENE_3D.pads.substation]) {
            const box = new Box3().setFromCenterAndSize(new Vector3(...pad.position), new Vector3(...pad.size));
            expect(framing.containsBox(box)).toBe(true);
        }
    });
});

describe('PCS/MV detailed geometry contract', () => {
    const skid = () => {
        const scene = scenes.get(equipmentModelUrl(SCENE_3D.models.pcsMvSkid.file))!;
        scene.updateMatrixWorld(true);
        return scene;
    };
    const hit = (origin: number[], direction: number[]) => {
        const scene = skid();
        scene.updateMatrixWorld(true);
        return new Raycaster(new Vector3(...origin), new Vector3(...direction))
            .intersectObject(scene, true)[0];
    };

    it.each([1, -1])('exposes the transformer through the %s-side open guard', side => {
        // Sample between actual guard wires, not through a frame or warning plate.
        const intersection = hit([.40, 1.21, side * 4], [0, 0, -side]);
        expect(intersection?.object.name).toMatch(/^Transformer_Equipment_/);
        expect(Math.abs(intersection.point.z)).toBeLessThan(1.05);
    });

    function cabinetSideHit(scene: Object3D, x: number, depth: number) {
        scene.updateMatrixWorld(true);
        // The 80 mm inter-cabinet gap avoids the left end plate entirely.
        return new Raycaster(new Vector3(-1.89, 1.6, depth), new Vector3(x < -2 ? -1 : 1, 0, 0))
            .intersectObject(scene, true).find(item => item.object.name === 'PCS_Cabinets_porcelain-shell');
    }

    it.each([-2.36, -1.42].flatMap(x => [-.7, 0, .7].map(depth => ({ x, depth }))))(
        'hits the actual cabinet side at x=$x, depth=$depth, not the end plate', ({ x, depth }) => {
            const intersection = hit([x, 4, 0], [0, -1, 0]);
            expect(intersection?.object.name).toMatch(/^Skid_Frame_/);
            const body = cabinetSideHit(skid(), x, depth);
            expect(body).toBeDefined();
            expect(body!.point.x).toBeCloseTo(x + (x < -2 ? .43 : -.43), 4);
            expect(body!.distance).toBeCloseTo(.04, 4);
        });

    it('rejects missing left cabinet volume without rejecting the intact right cabinet', () => {
        const hollow = skid().clone(true);
        hollow.updateMatrixWorld(true);
        const mesh = hollow.getObjectByName('PCS_Cabinets_porcelain-shell') as Mesh;
        const geometry = mesh.geometry.clone();
        const positions = geometry.attributes.position;
        const retained: number[] = [];
        const bounds = new Box3(new Vector3(-2.79, .315, -1.08), new Vector3(-1.93, 2.565, 1.08)).expandByScalar(.00001);
        const index = geometry.index;
        const count = index?.count ?? positions.count;
        // Remove the cabinet volume but retain independent service panels.
        // Detection must not depend on the end plate's incidental position.
        for (let i = 0; i < count; i += 3) {
            const ids = [i, i + 1, i + 2].map(j => index ? index.getX(j) : j);
            const inside = ids.every(j => bounds.containsPoint(new Vector3().fromBufferAttribute(positions, j).applyMatrix4(mesh.matrixWorld)));
            if (!inside) retained.push(...ids);
        }
        expect(retained.length).toBeLessThan(count);
        geometry.setIndex(retained);
        mesh.geometry = geometry;
        for (const depth of [-.7, 0, .7]) {
            const body = cabinetSideHit(hollow, -2.36, depth);
            expect(body !== undefined && Math.abs(body.point.x + 1.93) < .0001).toBe(false);
        }
        expect(cabinetSideHit(hollow, -1.42, 0)!.point.x).toBeCloseTo(-1.85, 4);
        geometry.dispose();
    });

    it.each([
        { face: 'front', point: [2.08, 1.95, 1.395], outward: [0, 0, 1], mesh: 'MV_Switchgear_porcelain-shell' },
        { face: 'rear', point: [2.08, 1.95, -1.395], outward: [0, 0, -1], mesh: 'MV_Switchgear_porcelain-shell' },
        { face: 'MV end', point: [2.866, 1.6375, .59], outward: [1, 0, 0], mesh: 'MV_Switchgear_porcelain-shell' },
        { face: 'PCS end', point: [-2.897, .75, .53], outward: [-1, 0, 0], mesh: 'PCS_Cabinets_porcelain-shell' },
    ])('slopes the $face louvre downward toward its exterior', ({ point, outward, mesh }) => {
        const topAt = (offset: number) => {
            const origin = new Vector3(...point).addScaledVector(new Vector3(...outward), offset);
            origin.y += .025;
            const ray = new Raycaster(origin, new Vector3(0, -1, 0));
            return ray.intersectObject(skid(), true).find(item => item.object.name === mesh)?.point.y;
        };
        const inner = topAt(-.02);
        const outer = topAt(.02);
        expect(inner).toBeDefined();
        expect(outer).toBeDefined();
        expect(outer!).toBeLessThan(inner! - .01);
    });

    it('supports the cabinets and transformer tray on the floor without an air gap', () => {
        for (const [x, prefix] of [[-2.36, 'PCS_Cabinets_'], [-1.42, 'PCS_Cabinets_'], [2.08, 'MV_Switchgear_'], [.22, 'Transformer_Equipment_']] as const) {
            const floor = new Raycaster(new Vector3(x, .305, 0), new Vector3(0, -1, 0))
                .intersectObject(skid(), true).find(item => item.object.name === 'Skid_Frame_galvanized-steel');
            const underside = new Raycaster(new Vector3(x, .285, 0), new Vector3(0, 1, 0))
                .intersectObject(skid(), true).find(item => item.object.name.startsWith(prefix));
            expect(floor).toBeDefined();
            expect(underside).toBeDefined();
            expect(floor!.point.y).toBeCloseTo(underside!.point.y, 5);
        }
    });

    it('samples each cable lane at its expected height and checks its cabinet drop endpoint', () => {
        const mesh = skid().getObjectByName('Transformer_Equipment_graphite-trim') as Mesh;
        const positions = mesh.geometry.attributes.position;
        for (const side of [-1, 1]) for (let phase = 0; phase < 3; phase++) {
            const depth = -side * (.40 + phase * .16);
            const y = 2.56 + phase * .07;
            const overBay = new Raycaster(new Vector3(side < 0 ? -.8 : 1.2, 2.78, depth), new Vector3(0, -1, 0))
                .intersectObject(mesh, true)[0];
            expect(overBay).toBeDefined();
            expect(overBay.point.y).toBeCloseTo(y + .022, 2);
            const destination = side < 0 ? -1.12 : 1.50;
            let lowest = Infinity;
            for (let i = 0; i < positions.count; i++) {
                const vertex = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
                if (Math.abs(vertex.x - destination) < .025 && Math.abs(vertex.z - depth) < .025 && vertex.y > 2.1) {
                    lowest = Math.min(lowest, vertex.y);
                }
            }
            expect(lowest).toBeCloseTo(2.42, 4);
            expect(lowest).toBeLessThan(side < 0 ? 2.565 : 2.78);
        }
    });

    it('keeps its reusable envelope and bounded geometry/transfer cost', () => {
        const scene = skid();
        const box = new Box3().setFromObject(scene, true);
        const size = box.getSize(new Vector3());
        expect(size.x).toBeLessThanOrEqual(6.05);
        expect(size.y).toBeLessThanOrEqual(3.05);
        expect(size.z).toBeLessThanOrEqual(3.05);
        expect(box.min.y).toBeCloseTo(0, 5);
        expect(box.getCenter(new Vector3()).x).toBeCloseTo(0, 3);
        let meshes = 0;
        let triangles = 0;
        scene.traverse(object => {
            const mesh = object as Mesh;
            if (!mesh.isMesh) return;
            meshes++;
            triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) expect(material.transparent).toBe(false);
        });
        expect(meshes).toBeLessThanOrEqual(32);
        expect(triangles).toBeLessThanOrEqual(30000);
        expect(readFileSync(resolve('public', SCENE_3D.models.pcsMvSkid.file)).byteLength).toBeLessThan(1_500_000);
    });
});
