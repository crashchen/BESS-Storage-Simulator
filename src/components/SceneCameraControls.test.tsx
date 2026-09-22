import { createContext } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Fog, PerspectiveCamera, Scene, Vector3 } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SceneCameraControls } from './SceneCameraControls';
import { SCENE_3D } from '../config';
import { getSceneOverview } from '../utils/sceneOverview';

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
    const { forwardRef, useImperativeHandle, useLayoutEffect } = await import('react');
    type Events = { onChange?: () => void };
    return { OrbitControls: forwardRef<OrbitControlsImpl, Events>(({ onChange }, ref) => {
        useImperativeHandle(ref, () => controls);
        useLayoutEffect(() => {
            if (onChange) controls.addEventListener('change', onChange);
            return () => {
                if (onChange) controls.removeEventListener('change', onChange);
            };
        }, [onChange]);
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

function inspectSite(endGesture = true) {
    controls.dispatchEvent({ type: 'start', target: controls });
    controls.target.add(new Vector3(2, 0, 1));
    state.camera.position.add(new Vector3(5, 2, 3));
    state.camera.zoom = 1.4;
    state.camera.updateProjectionMatrix();
    controls.update(); // Real OrbitControls emits change after the camera moves.
    if (endGesture) controls.dispatchEvent({ type: 'end', target: controls });
}

function captureView() {
    return {
        position: state.camera.position.toArray(),
        quaternion: state.camera.quaternion.toArray(),
        zoom: state.camera.zoom,
        target: controls.target.toArray(),
        maxDistance: controls.maxDistance,
        fogNear: (state.scene.fog as Fog).near,
        fogFar: (state.scene.fog as Fog).far,
    };
}

function assertCurrentOverview() {
    const overview = getSceneOverview(state.size.width, state.size.height)!;
    expect(state.camera.position.distanceTo(overview.position)).toBeLessThan(1e-8);
    expect(controls.target.distanceTo(overview.target)).toBeLessThan(1e-8);
    expect(state.camera.zoom).toBe(1);
    assertSiteVisible();
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
        inspectSite();
        const inspected = state.camera.position.clone();
        state = { ...state }; // a normal store notification, unchanged viewport
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        expect(state.camera.position.equals(inspected)).toBe(true);
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={1} /></StateContext>);
        expect(state.camera.position.distanceTo(overview)).toBeLessThan(1e-8);
        assertSiteVisible();
    });

    it.each([
        { from: { width: 1280, height: 720 }, to: { width: 1280, height: 660 } },
        { from: { width: 1280, height: 720 }, to: { width: 390, height: 844 } },
        { from: { width: 390, height: 844 }, to: { width: 844, height: 390 } },
    ])('preserves the inspected pose and limits across $from → $to', ({ from, to }) => {
        state = { ...state, size: from };
        const view = render(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        inspectSite();
        const inspected = captureView();
        state = { ...state, size: to };
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        expect(captureView()).toEqual(inspected);
        expect(state.camera.aspect).toBe(to.width / to.height);
        // Later frame updates must not snap a retained portrait pose to a new limit.
        controls.update();
        expect(state.camera.position.distanceTo(new Vector3(...inspected.position))).toBeLessThan(1e-8);
    });

    it('preserves movement during an unfinished drag across a height-only resize', () => {
        const view = render(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        inspectSite(false);
        const inspected = captureView();
        state = { ...state, size: { width: 1280, height: 660 } };
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        expect(captureView()).toEqual(inspected);
        controls.dispatchEvent({ type: 'end', target: controls });
    });

    it('keeps automatic framing after a pointer gesture without a camera change', () => {
        const view = render(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        controls.dispatchEvent({ type: 'start', target: controls });
        controls.dispatchEvent({ type: 'end', target: controls });
        state = { ...state, size: { width: 390, height: 844 } };
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        assertCurrentOverview();
    });

    it('Full site fits the current viewport and restores automatic resize framing', () => {
        const view = render(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        inspectSite(false);
        state = { ...state, size: { width: 390, height: 844 } };
        // Leave a real damping delta from the previous inspection. Full site
        // must consume it before fitting, or the next frame will drift.
        controls.setAzimuthalAngle(controls.getAzimuthalAngle() + 0.8);
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={1} /></StateContext>);
        assertCurrentOverview();
        const restored = captureView();
        controls.update();
        expect(captureView()).toEqual(restored);
        controls.dispatchEvent({ type: 'end', target: controls });
        state = { ...state, size: { width: 844, height: 390 } };
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={1} /></StateContext>);
        assertCurrentOverview();
        expect(controls.enableDamping).toBe(true);
    });

    it('defers a Full site request at zero size until the viewport is usable', () => {
        const view = render(<StateContext value={state}><SceneCameraControls resetVersion={0} /></StateContext>);
        inspectSite();
        const inspected = captureView();
        state = { ...state, size: { width: 0, height: 0 } };
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={1} /></StateContext>);
        expect(captureView()).toEqual(inspected);
        state = { ...state, size: { width: 390, height: 844 } };
        view.rerender(<StateContext value={state}><SceneCameraControls resetVersion={1} /></StateContext>);
        assertCurrentOverview();
    });
});
