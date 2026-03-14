import { Canvas } from '@react-three/fiber';
import { MicrogridScene } from './MicrogridScene';
import type { GridState } from '../types';

interface SimulationViewportProps {
  gridState: GridState;
}

export default function SimulationViewport({ gridState }: SimulationViewportProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [15, 12, 18], fov: 50, near: 0.1, far: 500 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <MicrogridScene gridState={gridState} />
    </Canvas>
  );
}
