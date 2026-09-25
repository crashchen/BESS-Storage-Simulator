import { useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { createLabelRaycast } from '../utils/sceneLabelHitArea';

interface SceneLabelProps {
    position: [number, number, number];
    children: string;
    highlighted?: boolean;
    alert?: boolean;
    secondary?: boolean;
    mobileLift?: boolean;
    /** Resolve pointer rays through the rendered label to the parent's handlers. */
    hitArea?: boolean;
}

// World-space text shrinks with the full-site camera fit. Keep equipment names
// anchored to their 3D positions while rendering them at a readable CSS size.
// Labels never receive DOM pointer events; an opt-in hit area makes a label
// selectable through R3F's own raycast instead.
export function SceneLabel({ position, children, highlighted = false, alert = false, secondary = false, mobileLift = false, hitArea = false }: SceneLabelProps) {
    const labelRef = useRef<HTMLSpanElement>(null);
    const hitAreaRef = useRef<Group>(null);
    const canvas = useThree(state => state.gl.domElement);

    useLayoutEffect(() => {
        // The label mounts in Html's own root; resolve it when a ray is cast.
        if (hitAreaRef.current) hitAreaRef.current.raycast = createLabelRaycast(() => labelRef.current, () => canvas);
    }, [canvas, hitArea]);

    return (
        <>
            <Html position={position} center style={{ pointerEvents: 'none' }} zIndexRange={[1, 1]}>
                <span ref={labelRef} aria-hidden="true" data-scene-label={children} className={[
                    'block whitespace-nowrap rounded border bg-slate-950/90 px-1.5 py-1 text-[11px] font-bold leading-none tracking-wide shadow-lg sm:text-xs',
                    alert ? 'border-rose-400/80 text-rose-300' : highlighted ? 'border-cyan-300/80 text-cyan-100' : 'border-slate-500/60 text-slate-100',
                    secondary ? 'max-[420px]:hidden' : '',
                    mobileLift ? 'scene-label-mobile-lift' : '',
                ].join(' ')}>
                    {children}
                </span>
            </Html>
            {hitArea && <group ref={hitAreaRef} position={position} />}
        </>
    );
}
