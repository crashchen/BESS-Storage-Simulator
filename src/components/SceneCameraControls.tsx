import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Fog, PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SCENE_3D } from '../config';
import { getSceneOverview } from '../utils/sceneOverview';

export const SceneCameraControls = memo(function SceneCameraControls({ resetVersion }: { resetVersion: number }) {
    const controlsRef = useRef<OrbitControlsImpl>(null);
    const manuallyChanged = useRef(false);
    const appliedResetVersion = useRef<number | null>(null);
    const get = useThree(state => state.get);
    const { width, height } = useThree(state => state.size);

    const handleChange = useCallback(() => {
        // OrbitControls emits change only when the pose changes. A click alone
        // keeps automatic framing, while drag, zoom, pan and future key input
        // mark the view immediately. Synchronous fitting clears this flag below.
        manuallyChanged.current = true;
    }, []);

    useLayoutEffect(() => {
        const { camera, scene } = get();
        const controls = controlsRef.current;
        const overview = getSceneOverview(width, height);
        if (!controls || !overview || !(camera instanceof PerspectiveCamera)) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        // Resize changes the projection, but must not replace an inspected pose
        // or clamp a portrait view back to a shorter landscape distance limit.
        if (manuallyChanged.current && appliedResetVersion.current === resetVersion) return;

        // Flush pending damping before placing the camera so an earlier drag
        // cannot move it away again after Restore full site view.
        const damping = controls.enableDamping;
        try {
            controls.enableDamping = false;
            controls.update();
            controls.maxDistance = Math.max(SCENE_3D.orbit.maxDistance, overview.distance * 1.5);
            controls.target.copy(overview.target);
            camera.position.copy(overview.position);
            camera.zoom = 1;
            camera.updateProjectionMatrix();
            controls.update();
            // Portrait framing moves farther away; keep the actual site out of fog.
            if (scene.fog instanceof Fog) {
                scene.fog.near = Math.max(SCENE_3D.fog.near, overview.distance + overview.radius);
                scene.fog.far = scene.fog.near + SCENE_3D.fog.far - SCENE_3D.fog.near;
            }
            manuallyChanged.current = false;
            appliedResetVersion.current = resetVersion;
        } finally {
            controls.enableDamping = damping;
        }
    }, [get, width, height, resetVersion]);

    return <OrbitControls ref={controlsRef} enablePan enableZoom enableRotate
        onChange={handleChange}
        minDistance={SCENE_3D.orbit.minDistance}
        maxPolarAngle={Math.PI / SCENE_3D.orbit.maxPolarAngleDivisor} />;
});
