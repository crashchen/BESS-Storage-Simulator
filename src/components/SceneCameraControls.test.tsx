import { createContext } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Fog, PerspectiveCamera, Scene, Vector3 } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SceneCameraControls } from './SceneCameraControls';
import { SCENE_3D } from '../config';

interface TestState {
    camera: PerspectiveCamera;
    scene: Scene;
    size: { width: number; height: number };
    get: () => TestState;
}
const StateContext = createContext<TestState>(null!);
let state: TestState;
let controls: OrbitControlsImpl;

vi.mock('@react-three/fiber', async () => {
    const { useContext } = await import('react');
    return { useThree: (selector: (value: TestState) => unknown) => selector(useContext(StateContext)) };
});
vi.mock('@react-three/drei', async () => {
    const { forwardRef, useImperativeHandle } = await import('react');
    return { OrbitControls: forwardRef<OrbitControlsImpl>((_props, ref) => {
        useImperativeHandle(ref, () => controls);
        return null;
    }) };
});

beforeEach(() => {
    const camera = new PerspectiveCamera(SCENE_3D.camera.fov, 1280 / 720, 0.1, 500);
    camera.position.set(...SCENE_3D.camera.position);
    const scene = new Scene();
    scene.fog = new Fog('#000', SCENE_3D.fog.near, SCENE_3D.fog.far);
    state = { camera, scene, size: { width: 1280, height: 720 }, get: () => state };
    controls = new OrbitControlsImpl(camera);
    controls.enableDamping = true;
});

function assertSiteVisible() {
    state.camera.updateMatrixWorld();
    for (const x of [SCENE_3D.framing.min[0], SCENE_3D.framing.max[0]]) {
        for (const y of [SCENE_3D.framing.min[1], SCENE_3D.framing.max[1]]) {
            for (const z of [SCENE_3D.framing.min[2], SCENE_3D.framing.max[2]]) {
                const p = new Vector3(x, y, z).project(state.camera);
                expect(Math.abs(p.x)).toBeLessThan(1);
                expect(Math.abs(p.y)).toBeLessThan(1);
            }
        }
    }
}

describe('scene camera controls with real Three camera and OrbitControls', () => {
    it('fits mount/resize, allows portrait distances past 50, and keeps the site out of fog', () => {
        const view = render(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        assertSiteVisible();
        state = { ...state, size: { width: 390, height: 844 } };
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        assertSiteVisible();
        const distance = state.camera.position.distanceTo(controls.target);
        expect(distance).toBeGreaterThan(50);
        expect(controls.maxDistance).toBeGreaterThan(distance);
        expect((state.scene.fog as Fog).near).toBeGreaterThan(distance);
        expect(controls.enableDamping).toBe(true);
    });

    it('retains an inspected view across ordinary renders and restores it only on request', () => {
        const view = render(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        const overview = state.camera.position.clone();
        controls.target.add(new Vector3(2, 0, 1));
        state.camera.position.add(new Vector3(5, 2, 3));
        controls.update();
        const inspected = state.camera.position.clone();
        state = { ...state }; // a normal store notification, unchanged viewport
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        expect(state.camera.position.equals(inspected)).toBe(true);
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={1} /></StateContext>);
        expect(state.camera.position.distanceTo(overview)).toBeLessThan(1e-8);
        assertSiteVisible();
    });
});
