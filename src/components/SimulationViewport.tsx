import { Canvas } from '@react-three/fiber';
import { MicrogridScene } from './MicrogridScene';
import { GRID } from '../config';
import type { GridState } from '../types';

interface SimulationViewportProps {
  gridState: GridState;
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
      <Canvas
        shadows
        camera={{ position: [15, 12, 18], fov: 50, near: 0.1, far: 500 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <MicrogridScene gridState={gridState} />
      </Canvas>
      <FrequencyVignette frequencyHz={gridState.gridFrequencyHz} />
    </div>
  );
}
