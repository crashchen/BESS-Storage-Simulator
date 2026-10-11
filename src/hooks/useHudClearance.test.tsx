import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHudClearance } from './useHudClearance';
import { StatusHud } from '../components/StatusHud';
import { makeGridState } from '../test/fixtures';
import layoutCss from '../index.css?raw';

function Harness() {
    const { shellRef, hudRef } = useHudClearance();
    return <div ref={shellRef} data-testid="shell"><StatusHud ref={hudRef} gridState={makeGridState({
        simulationStatus: 'paused', dispatchMode: 'manual-discharge',
        batteryPowerMw: -186, cumulativeRevenueEur: -12345678,
    })} /></div>;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useHudClearance', () => {
    it('uses measured clearance in all landscape sizes and subtracts the extra offset', () => {
        const landscapeRule = layoutCss.split('@media (orientation: landscape) {')[1]?.split('}')[0];
        expect(landscapeRule).toContain('top: var(--scene-card-top)');
        expect(landscapeRule).toContain('max-height: max(0px, calc(var(--scene-card-height) - var(--scene-card-top) + 62px))');
    });

    it('retains the short-landscape height budget and narrower-screen minimum offset', () => {
        expect(layoutCss).toContain('--scene-card-top: max(62px, calc(var(--hud-bottom, 0px) + 8px))');
        expect(layoutCss).toContain('--scene-card-top: max(48px, calc(var(--hud-bottom, 0px) + 8px))');
        expect(layoutCss).toContain('top: var(--scene-card-top)');
        expect(layoutCss).toContain('max-height: calc(100dvh - var(--scene-card-top) - 94px)');
    });
    it('tracks wrapped HUD geometry, shrinks again, and cleans up in StrictMode', () => {
        let bottom = 58;
        let resize = () => {};
        const observe = vi.fn();
        const disconnect = vi.fn();
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: () => void) { resize = callback; }
            observe = observe;
            disconnect = disconnect;
        });
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            return { top: 0, bottom: this.dataset.testid === 'status-hud' ? bottom : 360 } as DOMRect;
        });
        const { unmount } = render(<StrictMode><Harness /></StrictMode>);
        const shell = screen.getByTestId('shell');
        expect(observe).toHaveBeenLastCalledWith(screen.getByTestId('status-hud'));
        expect(screen.getByText('DISCHARGING SNAPSHOT')).toBeInTheDocument();
        expect(shell.style.getPropertyValue('--hud-bottom')).toBe('58px');

        bottom = 78;
        act(() => resize());
        expect(shell.style.getPropertyValue('--hud-bottom')).toBe('78px');
        bottom = 56.5;
        act(() => window.dispatchEvent(new Event('resize')));
        expect(shell.style.getPropertyValue('--hud-bottom')).toBe('57px');
        unmount();
        expect(disconnect).toHaveBeenCalledTimes(2);
        expect(shell.style.getPropertyValue('--hud-bottom')).toBe('');
    });

    it('still measures and responds to window resize without ResizeObserver', () => {
        vi.stubGlobal('ResizeObserver', undefined);
        let bottom = 78;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: 0, bottom } as DOMRect));
        render(<Harness />);
        expect(screen.getByTestId('shell').style.getPropertyValue('--hud-bottom')).toBe('78px');
        bottom = 50;
        act(() => window.dispatchEvent(new Event('resize')));
        expect(screen.getByTestId('shell').style.getPropertyValue('--hud-bottom')).toBe('50px');
    });
});
