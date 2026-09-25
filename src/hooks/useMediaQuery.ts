import { useCallback, useSyncExternalStore } from 'react';

function queryList(query: string): MediaQueryList | null {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query) : null;
}

/** Tracks a CSS media query; false where matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        const media = queryList(query);
        media?.addEventListener('change', onChange);
        return () => media?.removeEventListener('change', onChange);
    }, [query]);
    return useSyncExternalStore(subscribe, () => queryList(query)?.matches ?? false, () => false);
}
