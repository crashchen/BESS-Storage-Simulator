# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # Vite dev server
npm run build       # Type-check (tsc -b) then Vite production build
npm run lint        # ESLint across the repo
npm run test        # Vitest (single run, jsdom env)
npm run test:watch  # Vitest in watch mode
npm run preview     # Preview the production build
```

Run a single test file or name:

```bash
npx vitest run src/utils/simulationModel.test.ts
npx vitest run -t "active-power"
```

CI (`.github/workflows/ci.yml`) runs `lint → test → build` on pushes to `main` and PRs to any base branch, so `npm run build` must succeed — type errors break the pipeline, not just `lint`. Deploy workflow publishes to GitHub Pages; `vite.config.ts` reads `BASE_URL` from env for that base path.

## Architecture

The app is a single-page React + Three.js simulator. There is **no backend** — simulation state lives in-memory in `useGridSimulation`, with separate drawer and viewport presentation state, rendered by a 3D layer (r3f) and a 2D HUD layer (Tailwind panels).

### The simulation loop is the spine

Everything flows from `src/hooks/useGridSimulation.ts`. Key points that aren't obvious from the file tree:

- **Ref-based tick, throttled React updates.** The `requestAnimationFrame` loop mutates `simRef.current` every frame but only calls `setState` every `SIMULATION.renderSyncIntervalMs` (~33 ms / 30 fps). Chart snapshots are pushed on a separate `SIMULATION.snapshotIntervalMs` cadence into `historyRef`. If you add state consumed by the UI, read it from `state` (throttled) — do not subscribe components to `simRef` directly.
- **`dispatch(cmd)` is the only simulation write path.** Simulation controls produce a `BESSCommand` union (`src/types.ts`) handled by `applyCommand()` in `src/utils/gridReducer.ts`. The reducer is pure — it returns a `ReducerResult` containing the next `GridState` plus a `sideEffects` manifest (reset history, reset timer refs, etc.) that the hook applies. New simulation controls should add a command variant to the union, not mutate state ad hoc. Drawer and equipment-selection state belong to the presentation layer.
- **Explicit Reset also resets tariff drafts.** The hook increments `simulationResetVersion` only for `RESET_SIMULATION`, including consecutive resets with unchanged model values. This presentation signal stays outside `GridState`; App passes it through required `ControlPanelProps` and EconomicsPanel props. Pause/Stop do not emit it. Tariff drafts are discarded when either their source price or this version changes; do not broaden this contract into an assumed reset of every numeric field.
- **Demo scenarios are temporarily hidden from the main UI.** Presets still live in `src/scenarios.ts` and can be applied through `APPLY_SCENARIO_PRESET` for tests or future restoration. Do not re-enable the scenario panel until each preset has been revalidated against the active-power settlement model.
- **`simulateTick` lives in `src/utils/tickEngine.ts`.** Given `(prev, dtReal, now)` it returns the next `GridState`. It handles clock/SoC/strategy event sub-stepping, dispatch logic (`auto` vs. manual charge/discharge/idle), SoC clamping, efficiency losses, and PCC import/export settlement. The tick is fully deterministic — there is no injected random source. The settlement and P&L math is delegated to `src/utils/simulationModel.ts` so it can be unit-tested without the RAF loop — add new simulation math there, not inline in the hook.
- **Selectors** in `src/utils/gridSelectors.ts` compute derived values (`selectBatteryDurationHours`, `selectGridConnectionTotalMw`). The physical `getBatteryTransferLimitMw` helper lives in `src/utils/simulationModel.ts` and is shared by the reducer, tick engine, and UI.
- **Display-only flow decomposition** in `src/utils/energyFlowTelemetry.ts` turns `GridState` into the 7 visible energy-flow legs (`solarToBess` / `solarToLoad` / `solarToExport` / `bessToLoad` / `bessToExport` / `gridToBess` / `gridToSite`). The 3D scene and any flow UI consume from here, not directly from raw state. `src/utils/sceneAssetInfo.ts` supplies the structured payload for the hover/click info card on BESS / PCS-MV / Grid Node.
- **BESS presentation** in `src/utils/bessDisplay.ts` separates sampled power, simulation run state, selected dispatch policy, and provable limits. Do not infer actual action from `batteryMode`: manual commands preseed it and paused edits may leave it stale. Pause and scenario presets can retain a nonzero frozen power sample; do not change the reducer or zero that sample to simplify display wording.

### Config is the single source of truth

`src/config.ts` centralises every tunable number (solar shape, BESS limits, tariff windows, active dispatch targets, 3D scene params). `useGridSimulation` and `simulationModel` both import from it — never hard-code magic numbers in components or hooks; add them to the appropriate `as const` block in `config.ts`.

### Two P&L accumulators, intentionally different

`cumulativeRevenueEur` (Project P&L) and `cumulativeBessMarginEur` (BESS Margin) are computed separately by `settleHybridProjectTick` in `simulationModel.ts`:

- **Project P&L** = direct PV exports + BESS discharge value − grid-paid BESS charging. It treats `Solar → BESS` as zero-cost.
- **BESS Margin** = discharge value − grid charge cost − *opportunity cost of `Solar → BESS`* (solar that could have been sold now but was stored instead).

This split is a product decision, not a bug. Don't "simplify" them into one number. The explanation is surfaced to users in `EconomicsPanel.tsx` and noted in the README — keep wording consistent if you touch it.

All BESS discharge is valued at the settlement tariff, including local supply that restores otherwise unserved demand at the PCC limit. That portion is an assumed value, not an actual import saving; negative prices can make it negative. `gridOverloadMw` is unserved demand after capped actual imports. The existing cumulative fields do not distinguish exports, import savings, and restored-load value, so the caveat must remain visible outside the collapsed breakdown and after current overload returns to zero. Preserve the two existing formulas; an actual cumulative split is separate scope.

`SOLAR.yieldKwhPerKwYear` is an annual reference only. It does not calibrate the current daily cosine curve or create an annual forecast. Do not describe the curve as modelled from this reference or measured site data.

### Active-power dispatch model

The live simulator is currently scoped to **Energy Arbitrage + Self-consumption**. It does not model FCR, frequency response, voltage control, protection trips, or AC transients. The frequency surface (state field + config constants) has been removed; do not reintroduce it without first deciding what behaviour the new fields should drive.

`tickEngine.ts` uses a fixed pipeline:

1. **Intent** — `dispatchMode` selects `auto`, `manual-charge`, `manual-discharge`, or `manual-idle`.
2. **Hardware clamp** — BESS power is limited by PCS rating, BESS grid connection, SoC, energy capacity, and efficiency.
3. **PCC settlement** — `settleHybridProjectTick` balances demand, PV, BESS, grid import/export, curtailment, and overload.

`AUTO` uses a simple rule tree: discharge during peak (paced as `usableEnergy × η_d / remainingPeakHours`); lock out automatic off-peak discharge; charge toward a 40% night reserve during off-peak; charge from PV surplus; discharge against local deficit outside off-peak. The rule tree deliberately drops the old forecast planner's symmetric round-trip price gate — peak windows discharge whenever SoC > reserve, regardless of the off-peak / peak rate ratio. That contract is locked in by `tickEngine.test.ts`'s "AUTO discharges through peak regardless of unfavorable tariff ratios" case; revive the price gate only after a deliberate product decision. If PV plus BESS export would exceed the PCC limit, PV export keeps priority and BESS discharge is reduced before curtailment. Manual modes bypass economic rules but still respect physical/PCC constraints.

`tickEngine.ts` now settles to energy events before recomputing the remaining interval: 0/100% SoC, off-peak 40% target, and the applicable peak reserve. Trial PCC settlements use dt=0; only accepted segments book energy/money. Root search must use settled power and re-sample its midpoint, not divide headroom by the unconstrained PCS request. Clock splits include midnight (demand wrap) and the peak horizon-floor start. Within the floor, integrate the existing capped/exponential pacing law; do not hold the initial rate throughout the interval. Solar/demand remain midpoint approximations, not exact integrals.

Instantaneous telemetry remains the final settled segment, while cumulative fields sum all segments. A tick ending exactly at full/empty can retain a nonzero final sample; a tick crossing it can finish idle after booking transfer in earlier segments. Do not reconstruct whole-tick energy by multiplying final power by outer dt. `tickConvergence.test.ts` observes accepted settlements to check source/destination energy and all cost components, with fixed-horizon convergence and analytic pacing cases. See `docs/audits/2026-09-19/batch-3.md` and its before/after evidence script.

The dispatch API is converged on `SET_DISPATCH_MODE` (`payload: DispatchMode`). The `CHARGE` / `DISCHARGE` / `IDLE` shortcuts are kept as UI-friendly sugar; `gridReducer.test.ts` has an `it.each` test pinning that `SET_DISPATCH_MODE` and the shortcuts produce identical state for every manual mode.

All simulation writes use `BESSCommand`; only the appropriate dispatch/reset/preset operations change dispatch intent. `PAUSE_SIMULATION` preserves the current run. `STOP_SIMULATION` creates a fresh stopped run, restores time and SoC to their initial values, and clears accumulated results/history while preserving capacities, tariffs, demand scale, time speed, and dispatch intent. `RESET_SIMULATION` also restores those settings to the baseline. Keep these distinct semantics in the UI and documentation.

### Rendering layers

`App.tsx` composes three overlays over a fullscreen container:

1. `SimulationViewport` — r3f `Canvas` wrapped in a `CanvasErrorBoundary`, hosting `MicrogridScene` (generic BESS / PCS-MV / Grid Node GLB equipment with a dynamic BESS SoC overlay, solar array, energy-flow particles, curtailment particles, overload highlighting, and time-of-day lighting). Simulation data comes from `GridState` props; hover, selection, and viewport failure are local presentation state. Retry remounts the canvas without resetting the simulation. Render-error retries clear each equipment URL cache key through `equipmentModels.ts` before remount; context-loss retries retain successfully loaded models.
2. `StatusHud` — compact top-of-screen live metrics bar.
3. `ControlPanel` — left/right slide-out drawers controlled by `App` through `useDrawerLayout`. Entering the compact breakpoint retains the most recently opened drawer. Equipment cards are hidden while Metrics is open, or either drawer is open on compact screens; the pinned selection is retained while hidden. Explicit equipment inspection closes the drawers. Inside, individual panels live under `src/components/panels/` and share primitives (`Gauge`, `ActionButton`, `NumericField`, `PanelCard`) from `src/components/ui/PanelPrimitives.tsx`. `RecoverableTelemetryChart` lazily loads the chart with a local error boundary and fresh URL retry. The root `AppErrorBoundary` is only a last-resort render fallback; its explicit reload loses the run.

`DrawerSide`, `DrawerState`, `DrawerLayout`, and `ControlPanelProps` live in `src/types.ts`; hooks and components consume these contracts, without a reverse dependency from types to hooks. `layout` and `simulationResetVersion` are required ControlPanel props. `close-all` returns the same state when both drawers are already closed. Viewport hover always records pointer enter/leave; only card/highlight display is gated by drawer visibility, so closing a drawer restores the current hover and cannot revive one that left while hidden.

### Bundle splitting

`vite.config.ts` defines manual `rollupOptions.output.manualChunks` that split `react`, `three`, `@react-three/fiber`, `@react-three/drei` (+ three-stdlib/camera-controls/meshline), `recharts`/`d3`, and `three/examples` into separate vendor chunks. Troika, bidi-js, and webgl-sdf-generator have their own `troika-vendor` chunk. `build/telemetryChunk.ts` emits the chart entry URL. Chart-only code shares that single module so a new retry query avoids failed browser module-map entries; shared formatTime stays in app-shared. The plugin rejects builds if the chart becomes eager or gains an unloaded static dependency. Successful chart imports are reused across drawer remounts. Keep Recharts in `optimizeDeps.include`: the opaque URL bypasses Vite scanning, and late dependency discovery would reload the dev page and lose the run. Splitting other vendor chunks does not itself make them lazy-loaded. If you add a heavy dependency, consider whether it needs its own chunk here — otherwise it lands in the app bundle.

### R3F scene patterns

`MicrogridScene.tsx` (~1,200 lines) contains many sub-components (BESSContainer, SolarPanel, EnergyParticle, CurtailmentParticle, etc.). Key patterns to follow when editing:

- **Avoid mixing declarative JSX material props with imperative `useFrame` updates on the same property.** R3F's reconciler may overwrite your `useFrame` changes on re-render. If you animate a property in `useFrame`, don't also set it via JSX.
- **Reuse Vector3 and Color objects** — pass a target ref to `curve.getPoint(t, targetVec)` instead of allocating each frame.
- **`useMemo` dependencies on floating-point values** like `soc` should be discretized (e.g., `Math.round(soc / 100 * 8)`) since the raw float changes every frame, making the memo pointless.
- **Solar supports stay upright.** Only the panel frame and active surface share the tilted group. The pole is a sibling outside that rotation, with its height derived from the panel position and ground height.
- **Equipment GLBs** live in `public/models` (metre-scale, centre-ground anchor, texture-free; provenance in `public/models/README.md`), are configured in `SCENE_3D.models`, and load via drei `useGLTF` at `import.meta.env.BASE_URL + file` so the GitHub Pages sub-path keeps resolving. Never mutate GLB materials for highlight/overload feedback — use separate overlay meshes (the cached GLTF must stay pristine across canvas remounts). `modelAssets.test.ts` pins the files as valid glTF 2.0 binaries free of the banned brand tokens. Each model is a representative single unit for station-scale equipment — keep info-card wording aggregate-framed (`sceneAssetInfo.ts` derives the "≈N × unit" equivalence from `unitRatingMw` / `unitEnergyMwh`), and don't present single-unit ratings as station capacity. The generic BESS is derived without touching Switchyard by `scripts/make_generic_bess_glb.py`; retain the dynamic SoC and interaction overlays in scene code rather than modifying its cached GLB materials.

### Tests

Vitest runs in `jsdom` (`vitest.config.ts`) with `src/test/setup.ts` and a `makeGridState` fixture in `src/test/fixtures.ts` for building partial `GridState` objects. The pure settlement math in `src/utils/simulationModel.ts`, command handling in `gridReducer.ts`, and tick behavior in `tickEngine.ts` all have dedicated tests; UI tests (`*.test.tsx`) use React Testing Library. `PanelPrimitives.test.tsx` covers `ActionButton` (aria-pressed) and `NumericField` (input validation, error states). When adding simulation behavior, prefer extending `simulationModel.ts` / `tickEngine.ts` with unit tests over testing through the RAF loop.

The 2026-09-19 combined second/third batches on `codex/audit-batch-2-model-clarity` pass lint/build and 192 tests in 17 files; the user supplied a passing CC review, and its two presentation nits plus loop-progress documentation are addressed. See `docs/audits/2026-09-19/cc-review.md`. Second-batch-only checks were 175/16. The first batch (146/15) was merged through PR #4 as `053c82c`; CI run 35449398794 and Pages run 35449398727 succeeded. `EconomicsPanel.test.tsx` includes a real ControlPanel/simulation-hook integration case for consecutive same-value Resets, preserved input identity, and Reset focus. Removing the hook's reset signal makes that regression fail with expected 350, actual 2000. The existing `ControlPanel.test.tsx` wrapper intentionally owns drawer state and supplies reset version 0, using `Omit` of the central props contract. It remains useful for focused component tests.

`bessDisplay.test.ts` and its consuming UI tests cover paused presets, actual reducer edits and tick samples, stale legacy modes, final nonzero SoC-boundary samples, display rounding, and provable zero-power conditions. Economics tests preserve the cumulative caveat after overload clears with details closed; settlement regressions pin the restored-supply assumption at positive and negative tariffs. The one-decimal display deadband is 0.05 MW; it does not change the engine's 0.01 MW mode threshold or power precision. See `docs/audits/2026-09-19/batch-2.md` for the current review scope and browser evidence.

`App.test.tsx` covers hidden hover entry, immediate restoration on drawer close, and hidden pointer leave, plus retry state preservation under StrictMode with the real hook/reducer and a simulated canvas context-loss event. These event tests are not browser injection of a stationary pointer or an actual GPU failure. First-batch real-browser checks at 1280×720 verified upright solar supports and 350 → invalid 2000 → Reset → 350 with cleared validation and focus on Reset; desktop/phone layout and tariff-timeline checks remain valid. The Three vendor chunk warning remains at 724.90 kB. Remaining product/experience follow-ups are tracked in `docs/audits/2026-09-08/README.md`.


### Fourth-batch verification (updated 2026-09-20)

Batches 2–3 are committed as `33ed745`, PR #5 open, CI run 35467702457 passed; production is still PR #4 / `053c82c`. Batch 4 on `codex/audit-batch-4-recovery` passed the user-arranged CC review, with the loader regression gap and non-nvm setup instructions addressed afterward. It is based on PR #5 and is not merged/deployed. Node 24.21.0 is pinned in `.nvmrc`; activate it with an available version manager or a local official distribution on PATH, then run `npm ci` (see README; nvm is optional). CI reads the same file. The deploy workflow calls reusable CI quality and publishes that run's verified dist artifact, never an independent unchecked build.

September 20 Node 24 lint, 197 tests / 18 files, Pages-path build and actionlint passed. September 19 clean install and both npm audit scopes passed with zero advisory entries (not a security proof); Three 724.90 kB warning remains. Browser HTTP 503 tests cover chart retry and repeated GLB failure/recovery without simulation reset. Keep these separate from the mocked GPU context-loss tests. This session could not obtain a 390px CSS viewport, so batch 4 does not claim new phone verification. See `docs/audits/2026-09-19/batch-4.md` for evidence, limitations and the reproducible fault server. Do not invoke CC automatically.

The inactive PerformanceMonitor/AdaptiveDpr pair was removed; DPR remains capped at 1–2 with no FPS adaptation. Multi-day AUTO reserve policy is an independent product decision: default 744 MWh can run out before later-day peak windows; no strategy change belongs to this loading/release batch.

`Recovery.test.tsx` now renders the default production chart loader without a `load` prop, replacing only `importTelemetryChart.ts` (native import transport) and the virtual asset URL. It pins Pages-path/query preservation, attempts 0/1/2 after repeated failure, latest history, and success reuse across component remounts. Removing the attempt query was verified to fail this test. These tests do not emulate browser module-map caching; the separate real HTTP 503 evidence remains necessary. PR CI accepts any target branch so stacked batch reviews receive checks. See `docs/audits/2026-09-19/batch-4-review.md`.
