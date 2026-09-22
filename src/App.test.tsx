import { StrictMode, type ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ControlPanelProps, GridSnapshot, GridState, MicrogridSceneProps } from './types';
import App from './App';
import { SCENE_3D } from './config';
import { useGLTF } from '@react-three/drei';

const modelCache = vi.hoisted(() => ({ failed: false }));

vi.mock('@react-three/fiber', async () => {
  const { useLayoutEffect, useRef } = await import('react');
  return {
    Canvas: function MockCanvas({ children, onCreated }: {
      children: ReactNode;
      onCreated: (state: { gl: { domElement: HTMLCanvasElement } }) => void;
    }) {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      useLayoutEffect(() => {
        onCreated({ gl: { domElement: canvasRef.current! } });
        // Match R3F: it does not register an onCreated return value as cleanup.
      }, [onCreated]);
      return <div><canvas ref={canvasRef} data-testid="webgl-canvas" />{children}</div>;
    },
  };
});

vi.mock('@react-three/drei', () => ({
  useGLTF: { clear: vi.fn(() => { modelCache.failed = false; }) },
}));

vi.mock('./components/MicrogridScene', () => ({
  MicrogridScene: ({ onAssetHover, onAssetSelect, viewResetVersion }: MicrogridSceneProps) => {
    if (modelCache.failed) throw new Error('Cached model download failure');
    return (
    <><output data-testid="view-reset-version">{viewResetVersion}</output><button
      onMouseEnter={() => onAssetHover?.('bess')}
      onMouseLeave={() => onAssetHover?.(null)}
      onClick={() => onAssetSelect?.('bess')}
    >
      Inspect BESS
    </button></>
    );
  },
}));

// Keep the real App, viewport, reducer, simulation hook and drawer state together.
// This adapter only replaces the large form/chart tree with simple test controls.
vi.mock('./components/ControlPanel', () => ({
  ControlPanel: ({ gridState, history, onCommand, layout }: ControlPanelProps) => (
    <>
      <button onClick={() => {
        onCommand({ type: 'SET_BESS_ENERGY_CAPACITY', payload: 600 });
        onCommand({ type: 'SET_BESS_POWER_RATING', payload: 64 });
        onCommand({ type: 'SET_GRID_PV_EVACUATION', payload: 80 });
        onCommand({ type: 'SET_TARIFF_RATE', payload: { period: 'mid-peak', value: 175 } });
        onCommand({ type: 'SET_TIME_SPEED', payload: 240 });
        onCommand({ type: 'START_SIMULATION' });
        onCommand({ type: 'DISCHARGE' });
      }}>Run custom simulation</button>
      <output data-testid="simulation-snapshot">{JSON.stringify({ state: gridState, history })}</output>
      <button onClick={() => layout.open('right')}>Open metrics</button>
      <button onClick={() => layout.close('right')}>Close metrics</button>
      <button onClick={() => layout.open('left')}>Open controls</button>
      <output data-testid="drawers">{JSON.stringify({
        leftOpen: layout.leftOpen,
        rightOpen: layout.rightOpen,
      })}</output>
    </>
  ),
}));

function readSimulation(): { state: GridState; history: GridSnapshot[] } {
  return JSON.parse(screen.getByTestId('simulation-snapshot').textContent!);
}

function readDrawers(): { leftOpen: boolean; rightOpen: boolean } {
  return JSON.parse(screen.getByTestId('drawers').textContent!);
}

describe('App viewport integration', () => {
  let frameCallback: FrameRequestCallback | null;
  let nowMs: number;

  beforeEach(() => {
    modelCache.failed = false;
    vi.mocked(useGLTF.clear).mockClear();
    frameCallback = null;
    nowMs = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    vi.spyOn(Date, 'now').mockImplementation(() => 1_700_000_000_000 + nowMs);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      media: '(max-width: 1023px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function advanceFrames(count: number) {
    for (let index = 0; index < count; index += 1) {
      nowMs += 100;
      act(() => frameCallback?.(nowMs));
    }
  }

  it('keeps custom configuration, SoC, earnings and history across Retry 3D View', () => {
    const { unmount } = render(<StrictMode><App /></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: 'Run custom simulation' }));
    const configuredSocPercent = readSimulation().state.batterySocPercent;
    advanceFrames(10);

    const beforeFailure = readSimulation();
    expect(beforeFailure.state.batteryEnergyCapacityMwh).toBe(600);
    expect(beforeFailure.state.batteryPowerRatingMw).toBe(64);
    expect(beforeFailure.state.gridPvEvacuationMw).toBe(80);
    expect(beforeFailure.state.tariffRatesEurMwh['mid-peak']).toBe(175);
    expect(beforeFailure.state.batterySocPercent).toBeLessThan(configuredSocPercent);
    expect(beforeFailure.state.cumulativeRevenueEur).toBeGreaterThan(0);
    expect(beforeFailure.history.length).toBeGreaterThan(0);

    const lostCanvas = screen.getByTestId('webgl-canvas');
    const loss = new Event('webglcontextlost', { cancelable: true });
    fireEvent(lostCanvas, loss);
    expect(loss.defaultPrevented).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('The simulation kept running');
    for (const button of within(screen.getByRole('navigation', { name: 'Scene tools' })).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }

    advanceFrames(10);
    const beforeRetry = readSimulation();
    expect(beforeRetry.state.timeOfDay).toBeGreaterThan(beforeFailure.state.timeOfDay);
    expect(beforeRetry.state.batterySocPercent).toBeLessThan(beforeFailure.state.batterySocPercent);
    expect(beforeRetry.state.cumulativeRevenueEur).toBeGreaterThan(beforeFailure.state.cumulativeRevenueEur);
    expect(beforeRetry.history.length).toBeGreaterThan(beforeFailure.history.length);

    fireEvent.click(screen.getByRole('button', { name: 'Retry 3D View' }));
    const replacementCanvas = screen.getByTestId('webgl-canvas');
    expect(replacementCanvas).not.toBe(lostCanvas);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readSimulation()).toEqual(beforeRetry);
    for (const button of within(screen.getByRole('navigation', { name: 'Scene tools' })).getAllByRole('button')) {
      expect(button).toBeEnabled();
    }

    const staleLoss = new Event('webglcontextlost', { cancelable: true });
    fireEvent(lostCanvas, staleLoss);
    expect(staleLoss.defaultPrevented).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    advanceFrames(5);
    expect(readSimulation().state.timeOfDay).toBeGreaterThan(beforeRetry.state.timeOfDay);
    expect(readSimulation().state.simulationStatus).toBe('running');

    unmount();
    const unmountedLoss = new Event('webglcontextlost', { cancelable: true });
    fireEvent(replacementCanvas, unmountedLoss);
    expect(unmountedLoss.defaultPrevented).toBe(false);
  });

  it('clears each model cache key before retry and preserves the live simulation', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StrictMode><App /></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: 'Run custom simulation' }));
    advanceFrames(10);
    modelCache.failed = true;
    advanceFrames(1);
    expect(screen.getByRole('alert')).toHaveTextContent('3D viewport unavailable');
    const failedState = readSimulation();
    advanceFrames(10);
    const beforeRetry = readSimulation();
    expect(beforeRetry.history.length).toBeGreaterThan(failedState.history.length);
    fireEvent.click(screen.getByRole('button', { name: 'Retry 3D View' }));
    expect(useGLTF.clear).toHaveBeenCalledTimes(3);
    for (const model of Object.values(SCENE_3D.models)) {
      expect(useGLTF.clear).toHaveBeenCalledWith(import.meta.env.BASE_URL + model.file);
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readSimulation()).toEqual(beforeRetry);
    expect(screen.getByRole('button', { name: 'Inspect BESS' })).toBeInTheDocument();
  });

  it('suppresses equipment previews under Metrics and closes Metrics on explicit inspection', () => {
    render(<App />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Inspect BESS' }));
    expect(screen.getByTestId('scene-asset-info-card')).toHaveTextContent('Hover preview');
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Inspect BESS' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open metrics' }));
    expect(readDrawers().rightOpen).toBe(true);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Inspect BESS' }));
    expect(screen.queryByTestId('scene-asset-info-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close metrics' }));
    expect(readDrawers().rightOpen).toBe(false);
    expect(screen.getByTestId('scene-asset-info-card')).toHaveTextContent('Hover preview');

    fireEvent.click(screen.getByRole('button', { name: 'Open metrics' }));
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Inspect BESS' }));
    expect(screen.queryByTestId('scene-asset-info-card')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close metrics' }));
    expect(readDrawers().rightOpen).toBe(false);
    expect(screen.queryByTestId('scene-asset-info-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open metrics' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Inspect BESS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect BESS' }));
    expect(readDrawers().rightOpen).toBe(false);
    expect(screen.getByTestId('scene-asset-info-card')).toHaveTextContent('Pinned equipment');

    fireEvent.click(screen.getByRole('button', { name: 'Open metrics' }));
    expect(screen.queryByTestId('scene-asset-info-card')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect BESS' }));
    expect(readDrawers().rightOpen).toBe(false);
    expect(screen.getByTestId('scene-asset-info-card')).toHaveTextContent('Pinned equipment');
  });

  it('also gives the Controls drawer priority over equipment details on compact screens', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ ...window.matchMedia(''), matches: true });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect BESS' }));
    expect(screen.getByTestId('scene-asset-info-card')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open controls' }));
    expect(readDrawers().leftOpen).toBe(true);
    expect(screen.queryByTestId('scene-asset-info-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inspect BESS' }));
    expect(readDrawers().leftOpen).toBe(false);
    expect(screen.getByTestId('scene-asset-info-card')).toHaveTextContent('Pinned equipment');
  });

  it('offers all equipment through Tab/Enter/Space and returns focus after Escape or Close', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.tab(); // mocked canvas equipment
    await user.tab();
    for (const [name, key, title] of [
      ['Inspect BESS equipment', '{Enter}', 'BESS Unit'],
      ['Inspect PCS / MV equipment', ' ', 'PCS / MV Station'],
      ['Inspect grid equipment', '{Enter}', 'Grid Node'],
    ]) {
      const trigger = screen.getByRole('button', { name });
      expect(trigger).toHaveFocus();
      await user.keyboard(key);
      expect(screen.getByTestId('scene-asset-info-card')).toHaveTextContent(title);
      expect(screen.getByRole('button', { name: 'Close equipment info card' })).toHaveFocus();
      expect(trigger).toHaveAttribute('aria-pressed', 'true');
      await user.keyboard('{Escape}');
      expect(screen.queryByTestId('scene-asset-info-card')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      await user.tab();
    }
    await user.click(screen.getByRole('button', { name: 'Inspect BESS equipment' }));
    await user.click(screen.getByRole('button', { name: 'Close equipment info card' }));
    expect(screen.getByRole('button', { name: 'Inspect BESS equipment' })).toHaveFocus();
  });

  it('hides scene tools under drawers and does not steal focus when a pinned card returns', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Inspect grid equipment' }));
    await user.click(screen.getByRole('button', { name: 'Open metrics' }));
    expect(screen.queryByRole('navigation', { name: 'Scene tools' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close metrics' }));
    expect(screen.getByTestId('scene-asset-info-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close metrics' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Inspect grid equipment' })).toHaveFocus();
  });

  it('toggles a pinned card off when its equipment button is pressed again', async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = readSimulation();
    for (const name of ['Inspect BESS equipment', 'Inspect PCS / MV equipment', 'Inspect grid equipment']) {
      const trigger = screen.getByRole('button', { name });
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('scene-asset-info-card')).toBeInTheDocument();
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByTestId('scene-asset-info-card')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    }
    expect(readSimulation()).toEqual(before);
  });

  it('restores only the view, preserving the canvas and complete simulation state', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Run custom simulation' }));
    advanceFrames(10);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect BESS equipment' }));
    const before = readSimulation();
    const canvas = screen.getByTestId('webgl-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Restore full site view' }));
    expect(screen.getByTestId('view-reset-version')).toHaveTextContent('1');
    expect(screen.getByTestId('webgl-canvas')).toBe(canvas);
    expect(readSimulation()).toEqual(before);
    expect(screen.queryByTestId('scene-asset-info-card')).not.toBeInTheDocument();
  });
});
