import { Vector3, type Intersection, type Object3D, type Raycaster } from 'three';

interface RectSource {
    getBoundingClientRect(): Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;
}

const pointer = new Vector3();

/**
 * Raycast for an HTML scene label, evaluated in screen space.
 *
 * The label element itself must stay pointer-transparent: Drei `Html` mounts it
 * inside R3F's event source, where a hit on the label would give R3F offsets
 * relative to the label rather than the canvas. Instead, the invisible proxy that
 * owns this function reports a hit whenever the pointer ray passes through the
 * label's rendered rectangle, so R3F bubbles it to the owning equipment group.
 * The label is drawn above the scene, so its hit uses distance 0 and sorts ahead
 * of geometry behind it. Hidden (zero-size) labels never hit.
 */
export function createLabelRaycast(
    getLabel: () => RectSource | null | undefined,
    getViewport: () => RectSource | null | undefined,
) {
    return function raycastLabel(this: Object3D, raycaster: Raycaster, intersects: Intersection[]) {
        const camera = raycaster.camera;
        const label = getLabel()?.getBoundingClientRect();
        const viewport = getViewport()?.getBoundingClientRect();
        if (!camera || !label || !viewport) return;
        if (label.width <= 0 || label.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return;

        // R3F builds the ray with setFromCamera; any point on it projects back to
        // the pointer's normalized device coordinates.
        pointer.copy(raycaster.ray.origin).add(raycaster.ray.direction).project(camera);
        const x = viewport.left + ((pointer.x + 1) / 2) * viewport.width;
        const y = viewport.top + ((1 - pointer.y) / 2) * viewport.height;
        if (x < label.left || x > label.right || y < label.top || y > label.bottom) return;

        intersects.push({ distance: 0, point: this.getWorldPosition(new Vector3()), object: this });
    };
}
