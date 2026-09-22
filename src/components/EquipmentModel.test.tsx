import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, type Object3D, Vector3 } from 'three';
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
