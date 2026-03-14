// ============================================================
// Orchestrator — Integrated App.tsx
// Wires @Agent-Engine, @Agent-3D, and @Agent-UI together.
//
// Integration checks performed:
//   ✅ MicrogridScene accepts { gridState: GridState }
//   ✅ ControlPanel accepts { gridState, history, onCommand }
//   ✅ StatusHud accepts { gridState: GridState }
//   ✅ useGridSimulation returns { state, history, dispatch }
//   ✅ dispatch signature: (cmd: BESSCommand) => void
//   ✅ No circular dependencies between agents
// ============================================================

import { lazy, Suspense } from 'react';
import { useGridSimulation } from './hooks/useGridSimulation';
import { ControlPanel } from './components/ControlPanel';
import { StatusHud } from './components/StatusHud';

const SimulationViewport = lazy(() => import('./components/SimulationViewport'));

export default function App() {
  const { state, history, dispatch } = useGridSimulation();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0a0f]">
      {/* ── 3D Layer (@Agent-3D) ──────────────────────────── */}
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(74,111,165,0.18),_transparent_45%),linear-gradient(180deg,_#0f172a,_#020617)]">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-950/70 px-5 py-3 text-center shadow-2xl backdrop-blur">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Booting</p>
              <p className="mt-2 font-mono text-sm text-slate-200">Loading 3D microgrid scene...</p>
            </div>
          </div>
        }
      >
        <SimulationViewport gridState={state} />
      </Suspense>

      {/* ── 2D HUD Layer (@Agent-UI) ─────────────────────── */}
      <StatusHud gridState={state} />
      <ControlPanel gridState={state} history={history} onCommand={dispatch} />

      {/* ── Attribution ───────────────────────────────────── */}
      <div className="absolute bottom-2 right-4 text-[10px] text-slate-600 font-mono pointer-events-none select-none">
        MICROGRID BESS SIMULATOR v1.0
      </div>
    </div>
  );
}
