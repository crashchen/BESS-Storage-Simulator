import { Component, memo, useCallback, useState, type ErrorInfo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { MicrogridScene } from './MicrogridScene';
import { GRID, SCENE_3D } from '../config';
import type { BESSCommand, GridState } from '../types';

interface SimulationViewportProps {
  gridState: GridState;
  /** Optional hook for the host to perform a clean reset (e.g. dispatch RESET_SIMULATION)
   *  when the user clicks Retry. Without this, Retry only remounts the canvas — which is
   *  enough for transient WebGL faults but not for state-poisoning bugs. */
  onCommand?: (cmd: BESSCommand) => void;
}

type ViewportFailure =
  | { kind: 'render-error'; error: Error }
  | { kind: 'context-lost' };

interface CanvasErrorBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
}

class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('3D viewport crashed', error, errorInfo);
    }
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const FrequencyVignette = memo(function FrequencyVignette({ frequencyHz }: { frequencyHz: number }) {
  const deviation = Math.max(
    GRID.warningFrequencyLowHz - frequencyHz,
    frequencyHz - GRID.warningFrequencyHighHz,
    0,
  );
  if (deviation <= 0) return null;

  // Max deviation is ~2.5 Hz (from 49.5 to 47.5 or 50.5 to 52.0)
  const intensity = Math.min(deviation / 1.5, 1);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 animate-pulse"
      style={{
        boxShadow: `inset 0 0 ${60 + intensity * 100}px ${20 + intensity * 40}px rgba(239, 68, 68, ${0.15 + intensity * 0.35})`,
      }}
    />
  );
});

function ViewportFallback({ failure, onRetry }: { failure: ViewportFailure; onRetry: () => void }) {
  const isContextLost = failure.kind === 'context-lost';
  return (
    <div
      role="alert"
      className="absolute inset-0 flex items-center justify-center bg-slate-950/95 p-6 text-center"
    >
      <div className="max-w-md rounded-2xl border border-red-400/40 bg-red-950/30 p-6 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-300">
          3D viewport unavailable
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {isContextLost
            ? 'The browser lost the WebGL context (often due to GPU pressure or tab backgrounding). The simulation kept running — retry to rebuild the 3D scene.'
            : 'The simulation controls are still available, but the WebGL scene hit a rendering error.'}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg border border-red-300/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-100 transition hover:bg-red-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
        >
          Retry 3D View
        </button>
      </div>
    </div>
  );
}

export function SimulationViewport({ gridState, onCommand }: SimulationViewportProps) {
  const [failure, setFailure] = useState<ViewportFailure | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);

  const handleCanvasCreated = useCallback(({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
    const handler = (event: Event) => {
      // preventDefault tells the browser we *want* to handle restoration ourselves;
      // without it the canvas will never fire `webglcontextrestored`.
      event.preventDefault();
      setFailure({ kind: 'context-lost' });
    };
    gl.domElement.addEventListener('webglcontextlost', handler);
    // Returned cleanup runs on Canvas dispose (e.g. when canvasKey changes).
    return () => gl.domElement.removeEventListener('webglcontextlost', handler);
  }, []);

  const handleError = useCallback((error: Error) => {
    setFailure({ kind: 'render-error', error });
  }, []);

  const handleRetry = useCallback(() => {
    setFailure(null);
    setCanvasKey(k => k + 1);
    // If the host provided a reset hook, also dispatch RESET so any poisoned state
    // (NaN/Infinity surviving the H1 guards, accumulated drift) gets cleared.
    onCommand?.({ type: 'RESET_SIMULATION' });
  }, [onCommand]);

  return (
    <div className="relative h-full w-full">
      {failure ? (
        <ViewportFallback failure={failure} onRetry={handleRetry} />
      ) : (
        <CanvasErrorBoundary onError={handleError}>
          <Canvas
            key={canvasKey}
            shadows
            camera={{
              position: SCENE_3D.camera.position,
              fov: SCENE_3D.camera.fov,
              near: SCENE_3D.camera.near,
              far: SCENE_3D.camera.far,
            }}
            gl={{ antialias: true, alpha: false }}
            dpr={[SCENE_3D.dpr.min, SCENE_3D.dpr.max]}
            onCreated={handleCanvasCreated}
          >
            <PerformanceMonitor
              flipflops={SCENE_3D.performance.flipflops}
              bounds={(refreshrate) => refreshrate > SCENE_3D.performance.highRefreshRateHz
                ? [...SCENE_3D.performance.highRefreshBoundsFps]
                : [...SCENE_3D.performance.standardBoundsFps]}
            >
              <AdaptiveDpr pixelated />
            </PerformanceMonitor>
            <MicrogridScene gridState={gridState} />
          </Canvas>
        </CanvasErrorBoundary>
      )}
      <FrequencyVignette frequencyHz={gridState.gridFrequencyHz} />
    </div>
  );
}
