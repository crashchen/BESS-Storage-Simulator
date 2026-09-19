import { useCallback, useEffect, useReducer } from 'react';
import type { DrawerLayout, DrawerSide, DrawerState } from '../types';

type DrawerAction =
    | { type: 'open' | 'close'; side: DrawerSide }
    | { type: 'resize'; compact: boolean }
    | { type: 'close-all' };

const COMPACT_QUERY = '(max-width: 1023px)';

function reduceDrawers(state: DrawerState, action: DrawerAction): DrawerState {
    switch (action.type) {
        case 'open':
            return {
                ...state,
                leftOpen: action.side === 'left' || (!state.compact && state.leftOpen),
                rightOpen: action.side === 'right' || (!state.compact && state.rightOpen),
                escapeOwner: action.side,
            };
        case 'close': {
            const leftOpen = action.side !== 'left' && state.leftOpen;
            const rightOpen = action.side !== 'right' && state.rightOpen;
            return { ...state, leftOpen, rightOpen, escapeOwner: leftOpen ? 'left' : rightOpen ? 'right' : null };
        }
        case 'close-all':
            if (!state.leftOpen && !state.rightOpen) return state;
            return { ...state, leftOpen: false, rightOpen: false, escapeOwner: null };
        case 'resize':
            return {
                ...state,
                compact: action.compact,
                leftOpen: state.leftOpen && (!action.compact || !state.rightOpen || state.escapeOwner === 'left'),
                rightOpen: state.rightOpen && (!action.compact || !state.leftOpen || state.escapeOwner === 'right'),
            };
    }
}

/** Shared overlay state keeps equipment details and drawers from obscuring each other. */
export function useDrawerLayout(): DrawerLayout {
    const [state, dispatch] = useReducer(reduceDrawers, undefined, () => ({
        leftOpen: false,
        rightOpen: false,
        escapeOwner: null,
        compact: typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(COMPACT_QUERY).matches : false,
    }));

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const media = window.matchMedia(COMPACT_QUERY);
        const onChange = (event: MediaQueryListEvent) => dispatch({ type: 'resize', compact: event.matches });
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);

    const open = useCallback((side: DrawerSide) => dispatch({ type: 'open', side }), []);
    const close = useCallback((side: DrawerSide) => dispatch({ type: 'close', side }), []);
    const closeAll = useCallback(() => dispatch({ type: 'close-all' }), []);
    return { ...state, open, close, closeAll };
}
