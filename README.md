# BESS Storage Simulator

[![CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/ci.yml)
[![Deploy](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/deploy.yml/badge.svg)](https://crashchen.github.io/BESS-Storage-Simulator/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An interactive utility-scale solar PV + BESS simulator for a Romania project baseline. The app combines an active-power-only dispatch model, a Three.js 3D scene with energy flow animations, and a collapsible dashboard for testing storage dispatch, market-price response, PCC import/export limits, and project cashflow behavior.

**[🚀 Live Demo](https://crashchen.github.io/BESS-Storage-Simulator/)**

## Project Baseline

- Solar PV: `117 MWp DC / 102 MW AC`
- BESS: `188 MW` rated power with `744 MWh` storage
- Grid connection: `288 MW total`
- PV evacuation: `102 MW`
- BESS simultaneous injection / evacuation: `186 MW`
- Yield assumption: `1,380 kWh/kW/year`

## Features

- **Real-time Simulation**: Start, pause, and stop the simulation clock with adjustable time speeds
- **Dispatch Modes**: `AUTO` active-power dispatch plus manual `CHARGE`, `IDLE`, and `DISCHARGE` overrides
- **Active-Power Settlement**: Grid import/export, PV curtailment, BESS charge/discharge, and PCC overload are settled from one power-balance node
- **Configurable BESS**: Edit rated power and storage capacity from the UI
- **Project Capacity Setup**: Edit solar AC/DC capacity, PV evacuation, and BESS interconnection live to model any project, not just the Romania baseline
- **Price Scenarios**: Edit wholesale price windows, including negative-price scenarios
- **Live Metrics**: Track SoC, solar output, grid demand, BESS power, grid import/export, and PCC overload
- **P&L Tracking**: Project P&L, BESS margin, curtailment, import/export, and energy flow analysis
- **3D Visualization**: Interactive Three.js scene with animated energy flow particles through PV, BESS, PCS/MV, and Grid Node assets; the BESS container, PCS-MV skid, and grid transformer render from supplier-neutral GLB equipment models
- **Overload Warnings**: PCC overload is surfaced in the economics panel and highlighted in the 3D grid/load area
- **Collapsible UI**: Desktop slide-out drawers can be opened together; narrow screens fall back to mutually exclusive drawers
- **Error Resilience**: 3D viewport gracefully handles WebGL rendering errors with retry option
- **Accessibility**: ARIA support for screen readers (aria-pressed, aria-valuetext), keyboard navigation, and input validation feedback
- **Efficiency Modeling**: BESS charge/discharge efficiency losses

## Tech Stack

- Vite
- React 19
- TypeScript
- Tailwind CSS 4
- Three.js with `@react-three/fiber` and `@react-three/drei`
- Recharts
- Vitest + Testing Library

## Local Development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite after the dev server starts.

## Quality Checks

```bash
npm run lint
npm run test
npm run build
```

## Project Structure

```text
public/
  models/                        Supplier-neutral equipment GLBs (BESS, PCS-MV, transformer) — see its README
scripts/
  make_generic_bess_glb.py       Downstream Blender pass that removes BESS branding without editing Switchyard
src/
  App.tsx                        App shell and overlay composition
  config.ts                      Centralized configuration constants
  types.ts                       Shared GridState and BESSCommand contracts
  scenarios.ts                   Demo scenario definitions (currently hidden from the main controls)
  hooks/
    useGridSimulation.ts         RAF tick loop, throttled React updates, history snapshots
  components/
    SimulationViewport.tsx       Canvas wrapper with WebGL error boundary and asset hover/click
    MicrogridScene.tsx           3D scene: 7 energy-flow particle paths, BESS SoC, LOCAL LOAD node
    SceneAssetInfoCard.tsx       Hover/click info card for BESS / PCS-MV / Grid Node
    StatusHud.tsx                Compact live status bar
    ControlPanel.tsx             Collapsible drawer layout
    TelemetryChart.tsx           Lazy-loaded chart module
    panels/                      Modular control panel components
      index.ts                   Barrel re-exporting the panel components below
      SimulationControl.tsx      Play/pause/stop/reset + time speed
      BessControl.tsx            Houses four components: BessDispatchControl (mode + SoC/output gauges),
                                 BessCapacitySetup (power/energy), ProjectCapacitySetup (solar/grid/PV
                                 evacuation), and DispatchParameters (grid dispatch scale)
      ScenarioPresetsPanel.tsx   Demo preset launcher (currently disabled in ControlPanel)
      MetricsPanel.tsx           Project specifications
      EconomicsPanel.tsx         Tariff editor + P&L / settlement breakdown
    ui/
      PanelPrimitives.tsx        Reusable UI (Gauge, ActionButton, NumericField, PanelCard)
  utils/
    gridReducer.ts               Pure BESSCommand reducer; emits ReducerResult with side-effects
    tickEngine.ts                Deterministic tick: tariff-boundary sub-stepping + AUTO rule tree
    simulationModel.ts           Active-power settlement, solar/demand models, P&L math
    energyFlowTelemetry.ts       Display-only: GridState → 7 visible energy flows
    sceneAssetInfo.ts            Structured asset info for the 3D info cards
    gridSelectors.ts             Derived state (battery duration, total grid connection)
  test/                          Vitest setup and shared GridState fixture
```

## Notes

- The baseline numbers intentionally follow the provided project screenshot, including the displayed `188 MW / 744 MWh` BESS configuration.
- `Project P&L` and `BESS Margin` are intentionally separated:
  - `Project P&L` = direct PV sales + BESS discharge value − grid-paid charging cost.
  - `BESS Margin` = BESS discharge value − grid-paid charging cost − `Solar → BESS` opportunity cost (delayed sale value).
  - `BESS discharge value` lumps real export revenue (`batteryDischargeToExportMw`) and avoided-import value (`batteryDischargeToLoadMw` × current tariff). Both are valued at the same price because a BESS-served local MW directly displaces a grid-imported MW at the PCC, one-for-one.
- The current dispatch model intentionally focuses on **Energy Arbitrage + Self-consumption** using active power only. It does not model FCR, frequency response, voltage control, protection trips, or AC transient dynamics.
- Local supply/demand gaps are represented as grid import/export at the PCC. If import demand exceeds the configured PCC limit, the app surfaces `PCC Overload` instead of simulating grid-frequency collapse.
- The built-in `AUTO` dispatch is a simplified rule tree: peak discharge (paced as `usableEnergy × η_d / remainingPeakHours`), off-peak reserve charging to 40% SoC, PV-surplus charging, deficit discharge outside off-peak, and PV-priority export curtailment handling. The rule tree deliberately omits the symmetric round-trip price gate from the earlier forecast planner — peak windows discharge whenever SoC > reserve.
- Dispatch mode is the single source of truth. Every UI command lands as a `BESSCommand` and ultimately flips `dispatchMode` via `SET_DISPATCH_MODE` (or its `CHARGE` / `DISCHARGE` / `IDLE` shortcuts, which are equivalence-tested).
- Demo scenario definitions remain in code for later restoration, but the scenario panel is currently hidden while the base model is being hardened.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
