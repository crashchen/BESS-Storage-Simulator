import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { clearEquipmentModelCache } from '../utils/equipmentModels';
import { MicrogridScene } from './MicrogridScene';
import { SceneAssetInfoCard } from './SceneAssetInfoCard';
import { SCENE_3D } from '../config';
import type { GridState, SceneAssetId } from '../types';

interface SimulationViewportProps {
  gridState: GridState;
  equipmentInfoEnabled?: boolean;
  onAssetInspect?: () => void;
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

export function SimulationViewport({
  gridState,
  equipmentInfoEnabled = true,
  onAssetInspect,
}: SimulationViewportProps) {
  const [failure, setFailure] = useState<ViewportFailure | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [hoveredAssetId, setHoveredAssetId] = useState<SceneAssetId | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<SceneAssetId | null>(null);
  const canvasListenerCleanup = useRef<(() => void) | null>(null);

  const clearCanvasListener = useCallback(() => {
    canvasListenerCleanup.current?.();
    canvasListenerCleanup.current = null;
  }, []);

  useEffect(() => clearCanvasListener, [clearCanvasListener]);

  const handleCanvasCreated = useCallback(({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
    clearCanvasListener();
    const handler = (event: Event) => {
      // preventDefault tells the browser we *want* to handle restoration ourselves;
      // without it the canvas will never fire `webglcontextrestored`.
      event.preventDefault();
      clearCanvasListener();
      setFailure({ kind: 'context-lost' });
      // Clear pinned/hovered card so it doesn't render over the WebGL fallback.
      setHoveredAssetId(null);
      setSelectedAssetId(null);
    };
    gl.domElement.addEventListener('webglcontextlost', handler);
    // R3F does not consume an onCreated return value. Retain the cleanup for
    // viewport failure, canvas replacement, and host unmount instead.
    canvasListenerCleanup.current = () => gl.domElement.removeEventListener('webglcontextlost', handler);
  }, [clearCanvasListener]);

  const handleError = useCallback((error: Error) => {
    clearCanvasListener();
    setFailure({ kind: 'render-error', error });
    setHoveredAssetId(null);
    setSelectedAssetId(null);
  }, [clearCanvasListener]);

  const handleRetry = useCallback(() => {
    if (failure?.kind === 'render-error') clearEquipmentModelCache();
    setFailure(null);
    setCanvasKey(k => k + 1);
    setHoveredAssetId(null);
    setSelectedAssetId(null);
  }, [failure]);

  const handleAssetSelect = useCallback((assetId: SceneAssetId) => {
    onAssetInspect?.();
    setSelectedAssetId(assetId);
  }, [onAssetInspect]);

  const handleClearSelection = useCallback(() => {
    setSelectedAssetId(null);
  }, []);

  const handleSceneMissed = useCallback(() => {
    setSelectedAssetId(null);
    setHoveredAssetId(null);
  }, []);

  useEffect(() => {
    if (!selectedAssetId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // If a Drawer is open, let it handle Escape first — its window listener
      // and ours are siblings on `window`, and `stopPropagation()` does not stop
      // listeners on the same target. Without this guard, one keypress closes
      // both the drawer and the pinned card.
      if (typeof document !== 'undefined' && document.querySelector('[role="region"][aria-hidden="false"]')) {
        return;
      }
      setSelectedAssetId(null);
      setHoveredAssetId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAssetId]);

  // Hide only the presentation; keep tracking pointer enter/leave behind drawers.
  const activeAssetId = equipmentInfoEnabled ? selectedAssetId ?? hoveredAssetId : null;

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
            onPointerMissed={handleSceneMissed}
          >
            <MicrogridScene
              gridState={gridState}
              hoveredAssetId={equipmentInfoEnabled ? hoveredAssetId : null}
              selectedAssetId={equipmentInfoEnabled ? selectedAssetId : null}
              onAssetHover={setHoveredAssetId}
              onAssetSelect={handleAssetSelect}
            />
          </Canvas>
        </CanvasErrorBoundary>
      )}
      <SceneAssetInfoCard
        assetId={activeAssetId}
        gridState={gridState}
        pinned={selectedAssetId !== null}
        onClose={handleClearSelection}
      />
    </div>
  );
}
