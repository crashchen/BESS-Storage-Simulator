import { Vector3 } from 'three';
import { SCENE_3D } from '../config';

export function getSceneOverview(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const { framing, camera, orbit } = SCENE_3D;
    const min = new Vector3(...framing.min);
    const max = new Vector3(...framing.max);
    const target = min.clone().add(max).multiplyScalar(0.5);
    const back = new Vector3(...camera.position).sub(new Vector3(...orbit.target)).normalize();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), back).normalize();
    const up = new Vector3().crossVectors(back, right);
    const tanY = Math.tan(camera.fov * Math.PI / 360);
    const usableX = Math.max(0.5, 1 - 2 * framing.horizontalPaddingPx / width);
    const usableY = Math.max(0.5, 1 - 2 * framing.verticalPaddingPx / height);

    let distance = orbit.minDistance as number;
    // Fit all eight corners using their own depth, rather than treating a
    // perspective box as a flat rectangle at the target plane.
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        const corner = new Vector3(x, y, z).sub(target);
        const depth = corner.dot(back);
        distance = Math.max(distance,
            depth + Math.abs(corner.dot(right)) / (tanY * width / height * usableX),
            depth + Math.abs(corner.dot(up)) / (tanY * usableY),
            depth + camera.near,
        );
    }
    return { target, position: target.clone().addScaledVector(back, distance), distance,
        radius: min.distanceTo(max) / 2 };
}
