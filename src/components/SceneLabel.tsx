import { Html } from '@react-three/drei';

interface SceneLabelProps {
    position: [number, number, number];
    children: string;
    highlighted?: boolean;
    alert?: boolean;
    secondary?: boolean;
    mobileLift?: boolean;
}

// World-space text shrinks with the full-site camera fit. Keep equipment names
// anchored to their 3D positions while rendering them at a readable CSS size.
export function SceneLabel({ position, children, highlighted = false, alert = false, secondary = false, mobileLift = false }: SceneLabelProps) {
    return (
        <Html position={position} center style={{ pointerEvents: 'none' }} zIndexRange={[1, 1]}>
            <span aria-hidden="true" data-scene-label={children} className={[
                'block whitespace-nowrap rounded border bg-slate-950/90 px-1.5 py-1 text-[11px] font-bold leading-none tracking-wide shadow-lg sm:text-xs',
                alert ? 'border-rose-400/80 text-rose-300' : highlighted ? 'border-cyan-300/80 text-cyan-100' : 'border-slate-500/60 text-slate-100',
                secondary ? 'max-[420px]:hidden' : '',
                mobileLift ? 'scene-label-mobile-lift' : '',
            ].join(' ')}>
                {children}
            </span>
        </Html>
    );
}
