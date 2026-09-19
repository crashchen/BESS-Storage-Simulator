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
- Annual yield reference: `1,380 kWh/kW/year` (not used to scale the illustrative daily solar curve)

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
- **Collapsible UI**: Desktop slide-out drawers can be opened together; entering a narrow viewport keeps only the most recently opened drawer. Metrics, and either drawer on narrow screens, take priority over equipment cards; clicking equipment closes the drawers and opens its pinned card.
- **Viewport Recovery**: Retry rebuilds the 3D viewport while preserving simulation configuration, SoC, accumulated results, and history
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

Latest local verification on 2026-09-19: lint and build passed; Vitest passed **192 tests across 17 files**. The second batch clarifies the annual yield reference and cumulative discharge valuation, and separates BESS sampled action, run state, and selected dispatch. The third batch splits SoC/night-target events before settlement and integrates the peak-horizon floor. Both batches on `codex/audit-batch-2-model-clarity` passed the user-arranged CC review; the two minor presentation findings and loop-progress documentation are addressed. See the [review outcome](docs/audits/2026-09-19/cc-review.md); see the [combined review entry](docs/audits/2026-09-19/batch-3.md). The 724.90 kB Three vendor chunk warning remains.

The first batch's visual, drawer, tariff, Reset, and viewport-retry fixes are deployed through [PR #4](https://github.com/crashchen/BESS-Storage-Simulator/pull/4), merged as `053c82c`. Its [CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35449398794) and [Pages run](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35449398727) succeeded. Those runs cover the first batch only; the second and third batches are not deployed.

Real-browser checks cover desktop/phone layout and tariff input, including the first batch's 350 → invalid 2000 → Reset → 350 with cleared validation and retained Reset focus. Second-batch checks cover yield/valuation copy, stopped/manual intent, running power, paused snapshots, and idle readouts after paused edits at desktop and phone widths. Hover restoration is covered by App integration events. Retry uses the real App/hook/reducer with a simulated canvas context-loss event, rather than an actual GPU failure. Numerical, loading, and release-process follow-ups remain in the [audit and optimization plan](docs/audits/2026-09-08/README.md).

## Project Structure

```text
public/
  models/                        Supplier-neutral equipment GLBs (BESS, PCS-MV, transformer) — see its README
scripts/
  make_generic_bess_glb.py       Downstream Blender pass that removes BESS branding without editing Switchyard
src/
  App.tsx                        App shell and overlay composition
  config.ts                      Centralized configuration constants
  types.ts                       Shared simulation, drawer-layout, and component-prop contracts
  scenarios.ts                   Demo scenario definitions (currently hidden from the main controls)
  hooks/
    useGridSimulation.ts         RAF tick loop, throttled React updates, history snapshots
    useDrawerLayout.ts           Shared responsive drawer state and equipment-overlay coordination
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
    tickEngine.ts                Deterministic tick: clock/energy events + AUTO pacing integration
    simulationModel.ts           Active-power settlement, solar/demand models, P&L math
    energyFlowTelemetry.ts       Display-only: GridState → 7 visible energy flows
    bessDisplay.ts               Display-only: sampled BESS action, run state, dispatch intent, known limits
    sceneAssetInfo.ts            Structured asset info for the 3D info cards
    gridSelectors.ts             Derived state (battery duration, total grid connection)
  test/                          Vitest setup and shared GridState fixture
```

## Notes

- The baseline numbers intentionally follow the provided project screenshot, including the displayed `188 MW / 744 MWh` BESS configuration.
- `Project P&L` and `BESS Margin` are intentionally separated:
  - `Project P&L` = direct PV sales + BESS discharge value − grid-paid charging cost.
  - `BESS Margin` = BESS discharge value − grid-paid charging cost − `Solar → BESS` opportunity cost (delayed sale value).
  - `BESS discharge value` prices exports and all local supply at the tariff when settled. Local supply can reduce actual grid imports or serve demand that would otherwise remain unserved at the PCC limit. The latter is an assumed value at that tariff, not avoided imports or export revenue; it can be negative at negative prices. The cumulative totals do not separate these contributions, so this limitation stays visible even after an overload ends.
- The current dispatch model intentionally focuses on **Energy Arbitrage + Self-consumption** using active power only. It does not model FCR, frequency response, voltage control, protection trips, or AC transient dynamics.
- Local supply/demand gaps are represented as grid import/export at the PCC. Actual imports are capped at the configured PCC limit; `PCC Overload` is the remaining unserved demand, not actual imports above that limit.
- The annual yield reference is a baseline project input for context. The current daily solar curve is illustrative, has no annual calibration, and does not provide an annual forecast.
- The built-in `AUTO` dispatch is a simplified rule tree: peak discharge (paced as `usableEnergy × η_d / remainingPeakHours`), off-peak reserve charging to 40% SoC, PV-surplus charging, deficit discharge outside off-peak, and PV-priority export curtailment handling. The rule tree deliberately omits the symmetric round-trip price gate from the earlier forecast planner — peak windows discharge whenever SoC > reserve.
- Every simulation edit goes through a `BESSCommand` and the reducer. `dispatchMode` is the single source of truth for dispatch intent: `SET_DISPATCH_MODE` and its equivalence-tested `CHARGE` / `DISCHARGE` / `IDLE` shortcuts select that intent. Capacity, tariff, speed, and run-state commands have their own effects; they do not all change dispatch mode.
- `Pause` freezes the clock and retains the current run. `Stop` starts a fresh stopped run: time and SoC return to their initial values, and accumulated results/history are cleared, while configured capacities, tariffs, demand scale, time speed, and dispatch intent are preserved. `Reset` also restores those settings to the baseline. Neither `Stop` nor `Reset` is equivalent to `Pause`.
- The tick engine settles up to SoC and night-target boundaries, then recomputes dispatch for the remaining time. The peak pacing horizon floor uses the integrated capped/exponential rule. Instantaneous telemetry is the last settled segment; cumulative values include every segment. Time-varying PV/demand still use midpoint approximation, so finite-step differences remain.
- BESS displays separate the selected dispatch policy from sampled power and run state. Paused nonzero values describe the frozen snapshot; a paused configuration edit can reconcile power to zero without changing dispatch intent. Full/empty/reserve and other known limits are explained only when supported by the current state.
- `Reset` clears tariff drafts and validation errors even when the applied tariff already equals the baseline. `Pause` and `Stop` do not trigger this explicit draft reset. Equipment hover continues to track pointer entry and exit while a drawer hides the card, so closing the drawer restores the current preview without reviving a departed hover.
- The BESS container and its pad are fixed-scale representative equipment. Changing station capacity updates the telemetry and the info card's approximate unit count; it does not stretch the model.
- Demo scenario definitions remain in code for later restoration, but the scenario panel is currently hidden while the base model is being hardened.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
