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

import { SimulationViewport } from './components/SimulationViewport';
import { useGridSimulation } from './hooks/useGridSimulation';
import { ControlPanel } from './components/ControlPanel';
import { StatusHud } from './components/StatusHud';

export default function App() {
  const { state, history, dispatch } = useGridSimulation();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0a0f]">
      {/* ── 3D Layer (@Agent-3D) ──────────────────────────── */}
      <SimulationViewport gridState={state} />

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
