import { useLayoutEffect, useRef } from 'react';

/** Publish layout-only clearance without adding RAF-frequency React state. */
export function useHudClearance() {
    const shellRef = useRef<HTMLDivElement>(null);
    const hudRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const shell = shellRef.current;
        const hud = hudRef.current;
        if (!shell || !hud) return;

        const measure = () => {
            const bottom = Math.ceil(hud.getBoundingClientRect().bottom - shell.getBoundingClientRect().top);
            shell.style.setProperty('--hud-bottom', `${Math.max(0, bottom)}px`);
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(hud);
        // Resize also catches responsive margin changes without a height change.
        window.addEventListener('resize', measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
            shell.style.removeProperty('--hud-bottom');
        };
    }, []);

    return { shellRef, hudRef };
}
