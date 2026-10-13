# BESS Storage Simulator

[![CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/ci.yml)
[![Deploy](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/deploy.yml/badge.svg)](https://crashchen.github.io/BESS-Storage-Simulator/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A single-page, interactive solar PV + battery storage demonstration. Explore active-power dispatch, self-consumption, tariff windows and grid-connection limits through a 3D site and live controls. This is **not an engineering EMS, trading optimizer or financial forecast**.

[Live demo](https://crashchen.github.io/BESS-Storage-Simulator/) · [Development guidance](CLAUDE.md) · [Verification and release history](docs/README.md)

## Run Locally

Use Node **24.21.0** from `.nvmrc` (supported: >=24.21.0, <25). Use your existing version manager, or put an unpacked official Node distribution's `bin` directory first on `PATH`; nvm is optional.

```bash
node --version
npm ci
npm run dev
```

Open the URL printed by Vite. Keep the terminal running; stopping the server makes that local URL unavailable. There is no backend or persisted run: refreshing the page starts over.

## First Walkthrough

1. Open **Controls**, leave **AUTO** selected, and press **Start**. No Demo Scenario selection is required; the preset panel is intentionally hidden.
2. Raise **Simulation Speed** to see a day/night cycle. Open **Metrics** for power history, tariff editing and illustrative value totals.
3. Use **Charge / Idle / Discharge** to override economic dispatch. Hardware, energy and grid-connection limits still apply.
4. Hover equipment for a preview; click its body, label, or the **BESS / PCS-MV / Grid** toolbar buttons to pin live information. **Full site** restores the camera without resetting the run.
5. Change PV/BESS capacities, interconnection limits or demand scale to explore congestion and curtailment. Equipment models represent station aggregates; increasing capacity does not stretch the cabinet.

| Control | Effect |
| --- | --- |
| Start / Pause | Advance or freeze the current run. Paused MW values are the last sampled snapshot, not ongoing transfer. |
| Stop | Clear time/SoC/results/history to a fresh stopped run, preserving capacities, tariffs, demand scale, speed and dispatch intent. |
| Reset | Also restore those settings to the baseline. Clears tariff drafts/errors even if the applied price was already at baseline. |
| Retry 3D View / Retry chart | Recover that view without resetting the simulation. |
| Reload / browser refresh | Start a new run; the current run is lost. |

Desktop drawers can open together. Below 1024px only the most recently opened side remains open. Metrics, or either drawer on narrow screens, hides equipment cards without clearing their pinned selection. Short-landscape cards show a summary with **Details**; switching equipment or closing/reopening folds it, but live readings and temporary drawer hiding preserve it.

## Baseline and Dispatch

| Parameter | Default |
| --- | --- |
| PV | 117 MWp DC / 102 MW AC |
| BESS | 188 MW / 744 MWh |
| Shared PCC import/export limit | 288 MW = 102 MW PV evacuation + 186 MW BESS connection |
| Annual yield reference | 1,380 kWh/kW/year; reference only, not calibration of the daily solar curve |
| Off-peak / shoulder / peak tariff | 80 / 150 / 350 EUR/MWh; editable, including negative values |

The active-power model uses **intent -> hardware clamp -> PCC settlement**:

- **Off-peak:** no automatic discharge; top up toward 40% SoC. PV surplus can continue charging above that target.
- **Shoulder:** absorb PV surplus. For deficits, hold 40% for the evening only when the edited tariffs clear the efficiency/reserve/pacing hurdle; otherwise self-consume down to empty. The default peak threshold is approximately EUR 178.78/MWh.
- **Peak:** pace usable energy over the remaining peak window above a 12% reserve. Peak discharge itself has no round-trip price gate.
- **Manual:** bypass economic rules, not SoC, PCS or connection limits.
- **Congestion:** preserve PV export first, reduce BESS discharge before curtailment. Reduce grid charging before declaring import overload. `PCC Overload` is unserved demand, never actual imports above the limit.

The tariff-only AUTO heuristic does not guarantee better value under every load, PV or PCC constraint. The simulator does not model frequency/FCR, voltage, protection trips, AC transients, degradation, weather forecasts or real market settlement.

## Read the Scene and Metrics

Seven simultaneous routes distinguish **PV -> BESS / local load / grid**, **BESS -> local load / grid**, and **grid -> BESS / local load**. They pass through the schematic PCS/MV collection node. Particle motion indicates direction; red particles show curtailment. A blue import route ending at **LOCAL LOAD** is not battery charging.

The three GLBs are supplier-neutral representative units, not a detailed electrical installation. Info cards show station-level totals and approximate equipment equivalence. [Asset provenance and regeneration](public/models/README.md) describe the downstream conversion; Switchyard sources remain unchanged.

Power history uses a **numeric, unwrapped simulated-time axis**. `D1 08:00` means day 1 at 08:00, `D2 00:00` the next midnight. Windows shorter than ten minutes and all tooltips include seconds. Changing speed changes the simulated interval, not its geometric meaning. Pause adds no time; Stop/Reset/preset loading clear and re-anchor history. Only the latest 200 samples are retained, so this is not a full-run energy report.

Two totals are deliberately different:

- **Project demo value:** PV exports + BESS discharge value - grid-paid BESS charging.
- **BESS demo margin:** BESS discharge value - grid charging - opportunity cost of storing saleable PV.
- **BESS discharge value:** export revenue + actual avoided imports + an **assumed** tariff value for restoring otherwise unserved load. The last part is not revenue or an import saving; both demo totals include it, even after current overload clears. Negative tariffs can make these components negative.

These are illustrative values, not realized cash flow. CAPEX, OPEX, financing, tax and lifecycle costs are outside scope. Instantaneous power is the last settled subsegment; cumulative totals include all subsegments, so multiplying the final MW by a whole tick does not reconstruct its energy.

## Development and Verification

React 19, TypeScript, Vite, Tailwind 4, Three.js/R3F/Drei, Recharts, Vitest and Testing Library. Core entry points:

| Area | Files |
| --- | --- |
| Commands / state | `types.ts`, `utils/gridReducer.ts` |
| Tick / settlement / policy | `utils/tickEngine.ts`, `utils/simulationModel.ts`, `utils/autoPolicy.ts` |
| RAF / telemetry / HUD clearance | `hooks/useGridSimulation.ts`, `hooks/useHudClearance.ts` |
| 3D / interaction | `components/SimulationViewport.tsx`, `MicrogridScene.tsx`, `SceneAssetInfoCard.tsx` |
| Controls / metrics | `components/panels/`, `TelemetryChart.tsx` |
| Configuration / assets | `config.ts`, `public/models/` |

```bash
npm run lint
npm run test
npm run build
BASE_URL=/BESS-Storage-Simulator/ npm run build
BASE_URL=/BESS-Storage-Simulator/ npm run preview
npm audit
npm audit --omit=dev
```

CI runs lint/test/build for PRs and main pushes. Pages deploys the artifact from its own successful reusable CI run. Unit/jsdom green does not certify WebGL, responsive geometry or physical-phone behavior; dated browser evidence records those limits separately.

**Released on 2026-10-13:** [PR #25](https://github.com/crashchen/BESS-Storage-Simulator/pull/25) was squash-merged as `4ea9a58` after the user-arranged CC review. That exact merge passed [main CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/38399647078) and [Pages deployment](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/38399647051), with 302 tests in 25 files. All 14 published files matched the local Pages-path build. See the [release record](docs/audits/2026-10-11/README.md#2026-10-13-合并与发布) for evidence and the separate documentation follow-up. Physical-phone touch and native-GPU acceptance remain open.

[Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)
