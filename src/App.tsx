// ============================================================
// Orchestrator — Integrated App.tsx
// Wires @Agent-Engine, @Agent-3D, and @Agent-UI together.
//
// Integration checks performed:
//   ✅ MicrogridScene accepts { gridState: GridState }
//   ✅ ControlPanel accepts { gridState, history, onCommand, layout, simulationResetVersion }
//   ✅ StatusHud accepts { gridState: GridState }
//   ✅ useGridSimulation returns { state, history, dispatch, simulationResetVersion }
//   ✅ dispatch signature: (cmd: BESSCommand) => void
//   ✅ No circular dependencies between agents
// ============================================================

import { SimulationViewport } from './components/SimulationViewport';
import { useGridSimulation } from './hooks/useGridSimulation';
import { ControlPanel } from './components/ControlPanel';
import { StatusHud } from './components/StatusHud';
import { useDrawerLayout } from './hooks/useDrawerLayout';

export default function App() {
  const { state, history, dispatch, simulationResetVersion } = useGridSimulation();
  const drawerLayout = useDrawerLayout();
  const equipmentInfoEnabled = !drawerLayout.rightOpen && !(drawerLayout.compact && drawerLayout.leftOpen);

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-[#0a0a0f]">
      {/* ── 3D Layer (@Agent-3D) ──────────────────────────── */}
      <SimulationViewport
        gridState={state}
        equipmentInfoEnabled={equipmentInfoEnabled}
        sceneToolsVisible={!drawerLayout.leftOpen && !drawerLayout.rightOpen}
        onAssetInspect={drawerLayout.closeAll}
      />

      {/* ── 2D HUD Layer (@Agent-UI) ─────────────────────── */}
      <StatusHud gridState={state} />
      <ControlPanel gridState={state} history={history} onCommand={dispatch} layout={drawerLayout} simulationResetVersion={simulationResetVersion} />

      {/* ── Attribution ───────────────────────────────────── */}
      <div className="absolute bottom-2 right-4 text-[10px] text-slate-500 font-mono pointer-events-none select-none">
        ROMANIA HYBRID BESS SIMULATOR v0.1
      </div>
    </div>
  );
}
