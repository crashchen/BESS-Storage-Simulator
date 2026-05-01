import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { MicrogridScene } from './MicrogridScene';
import { GRID } from '../config';
import type { GridState } from '../types';

interface SimulationViewportProps {
  gridState: GridState;
}

interface CanvasErrorBoundaryProps {
  children: ReactNode;
}

interface CanvasErrorBoundaryState {
  error: Error | null;
  canvasKey: number;
}

class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
  state: CanvasErrorBoundaryState = { error: null, canvasKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<CanvasErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('3D viewport crashed', error, errorInfo);
    }
  }

  private reset = () => {
    this.setState(prev => ({ error: null, canvasKey: prev.canvasKey + 1 }));
  };

  render() {
    if (this.state.error) {
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
              The simulation controls are still available, but the WebGL scene hit a rendering error.
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="mt-5 rounded-lg border border-red-300/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-100 transition hover:bg-red-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
            >
              Retry 3D View
            </button>
          </div>
        </div>
      );
    }

    return <div key={this.state.canvasKey} className="h-full w-full">{this.props.children}</div>;
  }
}

function FrequencyVignette({ frequencyHz }: { frequencyHz: number }) {
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
}

export function SimulationViewport({ gridState }: SimulationViewportProps) {
  return (
    <div className="relative h-full w-full">
      <CanvasErrorBoundary>
        <Canvas
          shadows
          camera={{ position: [15, 12, 18], fov: 50, near: 0.1, far: 500 }}
          gl={{ antialias: true, alpha: false }}
          dpr={[1, 2]}
        >
          <MicrogridScene gridState={gridState} />
        </Canvas>
      </CanvasErrorBoundary>
      <FrequencyVignette frequencyHz={gridState.gridFrequencyHz} />
    </div>
  );
}
