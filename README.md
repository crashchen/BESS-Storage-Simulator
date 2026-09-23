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
- **Demo Value Tracking**: Project and BESS demo totals, cumulative export revenue, avoided import cost, assumed restored-load value, curtailment, and energy flow analysis
- **3D Visualization**: Interactive Three.js scene with animated energy flow particles through PV, BESS, PCS/MV, and Grid Node assets; the BESS container, PCS-MV skid, and grid transformer render from supplier-neutral GLB equipment models
- **Overload Warnings**: PCC overload is surfaced in the economics panel and highlighted in the 3D grid/load area
- **Collapsible UI**: Desktop slide-out drawers can be opened together; entering a narrow viewport keeps only the most recently opened drawer. Metrics, and either drawer on narrow screens, take priority over equipment cards; clicking equipment closes the drawers and opens its pinned card.
- **Viewport Recovery**: Retry rebuilds the 3D viewport while preserving simulation configuration, SoC, accumulated results, and history
- **Scene Navigation (batches 5–6)**: Automatic full-site framing until the camera is manually moved, inspected views preserved on resize, a Full site restore button, and BESS / PCS-MV / Grid buttons for keyboard equipment inspection; all three equipment models share a common scale, with room for the full-size PCS-MV skid
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

Use Node **24.21.0**, pinned in `.nvmrc` and used by CI. Activate it with your existing version manager (`nvm use` if nvm is installed), or install/unpack the official Node 24.21.0 distribution and put its `bin` directory first on `PATH`. nvm is optional; the project supports Node 24 from 24.21.0 onward, below Node 25.

```bash
node --version    # v24.21.0 for the exact CI runtime
npm ci
npm run dev
```

For an unpacked distribution, run `export PATH="/absolute/path/to/node-v24.21.0-<platform>-<arch>/bin:$PATH"` first, replacing the example path with your actual directory. This changes only the current shell; it does not replace your global Node installation.

Open the local URL printed by Vite after the dev server starts.

## Quality Checks

```bash
npm run lint
npm run test
npm run build
```

Previous batch-6 verification on 2026-09-22: Node 24.21.0, lint, **221 tests across 21 files**, and the Pages-path build passed. Batch 5 (`e345c1f`) was merged through [PR #7](https://github.com/crashchen/BESS-Storage-Simulator/pull/7) as `29c81d7`; [main CI 35779667669](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35779667669) and [Pages 35779668154](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35779668154) succeeded. Its suite is 214/21. It corrects equipment proportions with a common 0.9 scale, adds responsive full-site framing and keyboard inspection, and clears the Close button from the Metrics handle. CC reviewed its 208/20 core version; subsequent local verification is documented separately in the [batch 5 review guide](docs/audits/2026-09-20/batch-5.md).

Batch 6 was merged through [PR #8](https://github.com/crashchen/BESS-Storage-Simulator/pull/8) as `b5cdf58`; [main CI 35780131524](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35780131524) and [Pages 35780131948](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35780131948) succeeded. Its functional commit credits Codex as a GitHub-recognized co-author. It preserves a manually rotated, panned or zoomed view across canvas resize, including height-only changes. Full site restores the current overview and re-enables automatic framing. A click without camera movement keeps automatic framing active. The user-arranged [CC review](docs/audits/2026-09-22/cc-review.md) approved the core change; its follow-up removed redundant event guards and added a residual-damping regression check, verified locally after review. Production-preview checks cover mouse rotation, wheel zoom, height changes and portrait/landscape transitions; these are desktop browser viewport checks, not phone hardware validation. See the [batch 6 review guide](docs/audits/2026-09-22/batch-6.md). No simulation or accounting changes. The Three chunk warning remains at 724.91 kB; the September 19 full/production audit snapshots each reported zero advisory entries.

Batch 7 is tracked in [PR #10](https://github.com/crashchen/BESS-Storage-Simulator/pull/10) from baseline `9b81a7b`. It gives scene labels a fixed readable screen size, explains the color and direction of energy flows, and shows visible 3D/chart loading states. User-arranged CC review caught a label pointer-event regression and three smaller visual issues; the follow-up lets clicks reach the Canvas, keeps labels below the HUD, separates labels at common portrait widths and short landscape heights, and restores the red Grid overload label. CC independently confirmed all four fixes. Node 24.21.0 lint, **223 tests across 21 files**, and the Pages-path build pass. Local browser checks cover mobile/desktop viewports, clicking the PCS label to select its equipment, red overload styling at the evening peak, and successful 8-second-delayed 3D/chart loading without console errors. Narrow landscape layouts still need a compact flow legend; other follow-ups are recorded in the [batch 7 review guide](docs/audits/2026-09-22/batch-7.md). No simulation or settlement changes.

PR #10 merged as `2989452` on 2026-09-22. [Main CI 35789638276](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35789638276) and [Pages 35789638697](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35789638697) passed on that commit. The live demo loads the new legend and labels; a 640×360 browser viewport shows no BESS/PCS label overlap and no console errors, while the known Solar/legend overlap remains.

Batches 2–3 ([PR #5](https://github.com/crashchen/BESS-Storage-Simulator/pull/5)) and batch 4 ([PR #6](https://github.com/crashchen/BESS-Storage-Simulator/pull/6)) passed user-arranged CC review and were merged on September 20. The preceding batch-4 production baseline was `be9eb17`, with [CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35504681930) and [Pages](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35504682035) successful. The Pages run exercised quality checks, same-run artifact download, and deployment. Live smoke checks confirmed the three models, updated yield/value wording, running telemetry and chart, with no console errors observed. That 197/18 suite is the historical batch-4 release; the next releases were batch 5 at `29c81d7` (214/21) and batch 6 at `b5cdf58` (221/21).

The first batch was released through [PR #4](https://github.com/crashchen/BESS-Storage-Simulator/pull/4) as `053c82c`; its original 146/15 checks and deployment evidence remain in the audit history.

Real-browser checks cover desktop/phone layout and tariff input, including the first batch's 350 → invalid 2000 → Reset → 350 with cleared validation and retained Reset focus. Second-batch checks cover yield/valuation copy, stopped/manual intent, running power, paused snapshots, and idle readouts after paused edits at desktop and phone widths. Hover restoration is covered by App integration events. Retry uses the real App/hook/reducer with a simulated canvas context-loss event, rather than an actual GPU failure. Remaining product and experience work is tracked in the [audit and optimization plan](docs/audits/2026-09-08/README.md).

Deploy calls the reusable CI workflow before uploading its verified artifact. The successful chain was verified in Pages run 35504682035; intentional remote failure injection has not been performed. CI checks PRs against any base branch, while pushes and automatic Pages deployment remain scoped to `main`.

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
    SceneCameraControls.tsx     Automatic framing, retained inspection on resize, view-only restore
    EquipmentModel.tsx          Shared metre-scale equipment rendering
    SceneLabel.tsx              Screen-readable equipment names at 3D anchors
    EnergyFlowLegend.tsx        Color and direction key for the animated routes
    MicrogridScene.tsx           3D scene: 7 energy-flow particle paths, BESS SoC, LOCAL LOAD node
    SceneAssetInfoCard.tsx       Hover/click info card for BESS / PCS-MV / Grid Node
    StatusHud.tsx                Compact live status bar
    ControlPanel.tsx             Collapsible drawer layout
    TelemetryChart.tsx           Single lazy chart entry with its chart-only dependencies
    RecoverableTelemetryChart.tsx  Local fallback and fresh-URL retry
    AppErrorBoundary.tsx         Last-resort render fallback with explicit reload semantics
    panels/                      Modular control panel components
      index.ts                   Barrel re-exporting the panel components below
      SimulationControl.tsx      Play/pause/stop/reset + time speed
      BessControl.tsx            Houses four components: BessDispatchControl (mode + SoC/output gauges),
                                 BessCapacitySetup (power/energy), ProjectCapacitySetup (solar/grid/PV
                                 evacuation), and DispatchParameters (grid dispatch scale)
      ScenarioPresetsPanel.tsx   Demo preset launcher (currently disabled in ControlPanel)
      MetricsPanel.tsx           Project specifications
      EconomicsPanel.tsx         Tariff editor + demo-value settlement breakdown
    ui/
      PanelPrimitives.tsx        Reusable UI (Gauge, ActionButton, NumericField, PanelCard)
  utils/
    gridReducer.ts               Pure BESSCommand reducer; emits ReducerResult with side-effects
    tickEngine.ts                Deterministic tick: clock/energy events + AUTO pacing integration
    simulationModel.ts           Active-power settlement, solar/demand models, demo-value math
    energyFlowTelemetry.ts       Display-only: GridState → 7 visible energy flows
    sceneFlowVisuals.ts          Shared scene/legend flow colors
    bessDisplay.ts               Display-only: sampled BESS action, run state, dispatch intent, known limits
    sceneOverview.ts             Perspective fit for the curated site envelope
    sceneAssetInfo.ts            Structured asset info for the 3D info cards
    gridSelectors.ts             Derived state (battery duration, total grid connection)
    importTelemetryChart.ts      Native import transport; retry/cache logic stays in the chart boundary
  test/                          Vitest setup and shared GridState fixture
```

## Notes

- The baseline numbers intentionally follow the provided project screenshot, including the displayed `188 MW / 744 MWh` BESS configuration.
- `Project demo value` and `BESS demo margin` retain the earlier arithmetic but are labelled as modelled values, not realized project cash flow:
  - `Project demo value` = direct PV sales + BESS discharge value − grid-paid charging cost.
  - `BESS demo margin` = BESS discharge value − grid-paid charging cost − `Solar → BESS` opportunity cost (delayed sale value).
  - `BESS discharge value` now has three cumulative parts: BESS export revenue, cost avoided by **actual** lower grid imports, and assumed value for restoring load that the PCC import cap would otherwise leave unserved. All three use the settlement-time tariff, including negative prices. The last part is an illustrative assumption, not export revenue or an avoided import; both totals include it. Export and avoided-cost rows are tariff-based estimates, not a complete financial forecast.
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
