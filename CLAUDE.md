# Contributor and Agent Guidance

Current architecture and invariants, not a changelog. Read [README](README.md) for operation, [audit index](docs/README.md) for historical decisions, and the [release record](docs/audits/2026-10-11/README.md#2026-10-13-合并与发布) for [PR #25](https://github.com/crashchen/BESS-Storage-Simulator/pull/25), squash-merged and deployed as `4ea9a58` on 2026-10-13. Later status-only documentation commits do not change the released implementation.

The user supplied CC's final approval of the complete batch, including all three follow-ups, then explicitly authorized squash merge and housekeeping. The reviewed head `06abd38` and merge `4ea9a58` have identical trees. Post-merge main CI and Pages both passed at the merge SHA; PR-head CI is retained as separate historical evidence. The status-only follow-up must also pass its own CI/Pages checks. Neither software-rendered checks nor HTTP/asset verification replace native-device acceptance.

## Ownership and Workflow

- Do not invoke, retry or delegate Claude Code / CC automatically. The user arranges that review. Other external reviewers also require authorization.
- Do not commit, push, merge or publish without the user's instruction. Preserve unrelated working-tree changes, especially in the Vault.
- When a Codex commit is authorized, retain `Co-authored-by: Codex <noreply@openai.com>`.
- Distinguish local checks, independent review, exact-head CI, merge, deployment and native-device acceptance.
- No automatic memory writes. Update memory only when explicitly requested.
- Repo README/CLAUDE are current snapshots. Put dated review evidence in `docs/audits/`; keep Vault release history in its `迭代记录`, open work in `路线图`. Do not repeat complete release reports in every document or erase historical counts/hashes.

## Commands and Release Gates

Node 24.21.0 is pinned in `.nvmrc`; supported >=24.21.0 and <25. nvm is optional.

```bash
npm ci
npm run dev
npm run lint
npm run test
npm run test:watch
npx vitest run src/utils/simulationModel.test.ts
npm run build
BASE_URL=/BESS-Storage-Simulator/ npm run build
BASE_URL=/BESS-Storage-Simulator/ npm run preview
npm audit
npm audit --omit=dev
```

CI is lint -> test -> type-check/build. PRs against any branch are checked; main pushes trigger Pages. Deploy calls reusable CI and publishes that same run's verified artifact, not a second unchecked build. `BASE_URL` controls the Vite sub-path.

## State and Simulation

No backend or persistence. `useGridSimulation` owns `GridState` in a ref, ticks through RAF, publishes React state about every 33ms, and samples history every 400ms. Read the published state in UI components; do not subscribe them ad hoc to the simulation ref.

UI writes go through `BESSCommand` -> pure `gridReducer.applyCommand()` -> next state plus a side-effect manifest. `SET_DISPATCH_MODE` is the single setter; `CHARGE/DISCHARGE/IDLE` are equivalence-tested shortcuts. Capacity, tariff and run-state edits do not implicitly change intent. Presets directly declare dispatchMode but remain hidden from the UI pending narrative revalidation.

Pause preserves the run and its nonzero power snapshot. Stop clears clock/SoC/results/history while retaining configuration, speed and intent. Reset also restores settings. Only explicit Reset increments `simulationResetVersion`, a presentation signal outside GridState passed through required ControlPanel/Economics props; this clears even same-value tariff drafts. NumericField deliberately does not consume it: invalid capacity drafts can survive a same-applied-value Reset. Preserve the valid-commit -> Reset -> blur/Enter regression that prevents old capacity drafts reappearing.

Chart time is separate presentation history: `chartTimeRef` starts at the run's initial clock, accumulates the same clamped dt and speed as the tick, never wraps at midnight, and is not rounded. Every resetHistory side effect re-anchors it to the new state's clock, including presets. Pause does not advance it. `GridSnapshot.t` is unwrapped simulated hours, NOT wall time or modulo-24 time. The chart uses a numeric data-extent axis; day/clock labels live in shared `formatTime.ts`. Keep all three contracts together.

Drawer, equipment selection, camera and HUD layout are presentation state, not GridState. `useHudClearance` observes the actual HUD box, publishes a CSS custom property on the app shell and cleans up its observer/listener in StrictMode. All landscape card tops and maximum heights consume that clearance, preserving their lower docking edge; short landscape retains its separate toolbar clearance. Do not measure layout on every tick or compensate with another fixed paused-state offset.

## Physics and Demo-Value Contracts

`config.ts` is the source for simulation/scene tuning. `tickEngine.ts` orchestrates **intent -> hardware clamp -> PCC settlement**; `simulationModel.ts` owns pure solar/demand/settlement math. `gridSelectors.ts` derives duration/total PCC; `getBatteryTransferLimitMw` in simulationModel is shared with reducer/UI.

Active-power only: no frequency/FCR, voltage, protection trips or AC transients. Local imbalance becomes capped grid import/export and unserved demand, not a simulated large-grid frequency drop.

AUTO is deliberately a heuristic:
- Off-peak: no automatic discharge; charge toward 40%, with further PV-surplus charging allowed.
- Shoulder: hold 40% only if the edited tariffs clear `autoPolicy.ts`'s efficiency/reserve/peak-pacing hurdle; otherwise self-consume to empty. Above the floor, serve deficits normally.
- Peak: pace usable energy above 12% reserve over remaining peak hours. Peak discharge has **no symmetric round-trip price gate**, even with an unfavorable tariff ratio; the contract-lock test is intentional.
- The threshold helper is shared with the Controls explanation. Display an approximate two-decimal value, decide on the unrounded number, and explain when no editable peak tariff can clear it. It assumes an unconstrained steady cycle, not arbitrary load/PV/PCC profitability.
- Manual modes bypass economic rules only. Preserve SoC, PCS, BESS-connection and PCC limits.
- At export congestion, PV has priority over BESS discharge. At import congestion, reduce grid charging first; `gridOverloadMw` is remaining unserved demand, not over-limit actual import.

The deterministic tick splits at tariff/midnight and energy events: empty/full, night target, conditional shoulder floor and peak reserve. Trial settlements use dt=0 and book nothing. Find event time from settled power while resampling the midpoint, not unconstrained PCS power. The 0.25h peak-horizon floor integrates the capped/exponential control law; do not hold initial power for the entire interval. PV and demand are still midpoint approximations.

Instantaneous telemetry is the **last** accepted subsegment; cumulative values sum **all** segments. A tick ending exactly at a boundary can retain nonzero power. Do not infer whole-tick energy from the last sample. `tickConvergence.test.ts` protects energy/cost closure, events, fixed-horizon convergence and analytic pacing.

Two totals intentionally differ:
- `cumulativeRevenueEur`: PV export + BESS discharge value - grid-paid BESS charge.
- `cumulativeBessMarginEur`: discharge value - grid charge - opportunity cost of stored saleable PV.
- Legacy `cumulativeBessDischargeRevenueEur` equals export revenue + avoided imports + assumed restored-load value. Avoided imports compare capped actual import to the same-tick no-BESS baseline. Restored load is the remainder of BESS local supply and is valued at the tariff only as an assumption. It is not revenue or an import saving. Negative prices can make all components negative.
- Keep the cumulative assumption visible even when current overload disappears or the breakdown is collapsed. These are demo values, not realized cash flow or full finance.
- Annual yield is reference-only; it does not calibrate the illustrative daily solar curve.

## UI, Recovery and Accessibility

`bessDisplay.ts` distinguishes run state, sampled power and selected policy. Never use command-preseeded `batteryMode` as proof of actual action. Its 0.05 MW display deadband does not change the engine's 0.01 MW threshold. Explain full/empty/reserve/known limits only when state proves them; zero power alone does not prove PCC or price lockout.

`useDrawerLayout` belongs to App. Desktop supports two drawers; entering compact layout retains the newest. Metrics, or either compact drawer, hides cards without clearing pinned selection. Explicit equipment inspection closes drawers. Raw hover enter/leave still updates while hidden, avoiding stale preview restoration. Closing already-closed drawers returns the same state. Escape closes only the owning layer.

Cards dock beside the default site overview, except short landscape over the non-selectable PV array. Capped cards scroll; only pinned cards take pointer input. Hover previews stay pointer-transparent or they swallow selection. Scene toolbar buttons support keyboard access, focus Close on selection, and restore focus on Close/Escape; hidden/restored cards do not steal focus.

`COMPACT_LEGEND_QUERY` and its CSS mirrors must agree. Short landscape uses a summary plus Details. Readings, run notes, station-level flows and status remain visible; no full-detail fields are deleted. Details persists through same-asset ticks and drawer hiding, resets on switch/close/reopen, and does not exist in preview cards. The SOLAR ARRAY label hides only while a compact card actually exists.

Retry 3D remounts Canvas without resetting simulation/history. Render/model errors clear each GLB URL cache key; pure context loss retains successfully loaded resources. The chart has its own error boundary, fresh-query retry and success cache. Root fallback/reload is a last resort and explicitly loses the run. Preserve App integration tests with the real hook/reducer; simulated context-loss tests are not actual GPU fault injection.

## 3D and Bundle Invariants

- GLBs are metre-scale, centre-ground, self-contained and texture-free. Load through `equipmentModels.ts` using BASE_URL. Provenance and downstream de-brand script: `public/models/README.md`. Do not alter Switchyard while editing this repo.
- Equipment shares `SCENE_3D.equipmentScale`, not independent per-unit shrinkage. BESS/pad stay fixed-size as aggregate capacity changes. Info cards describe representative units and approximate equivalence, never a single unit handling the station rating.
- Never mutate cached GLB materials for hover, SoC or overload: use independent overlays. Never drive one material property both imperatively in useFrame and declaratively in JSX.
- Reuse Vector3/Color targets. Discretize dependencies when a visual only needs discrete SoC bars; raw high-frequency floats defeat memoization.
- `energyFlowTelemetry.ts` defines seven display-only routes; `sceneFlowVisuals.ts` shares colors with the legend. Distinguish local load from export. Derive ports and paths from site configuration; check real GLB bounds, pads, framing and path clearance when moving equipment.
- Solar supports are upright siblings of the tilted panel group, with derived ground-reaching height.
- Labels use Drei Html with CSS pointer-events disabled. BESS, PCS and Grid pass `hitArea`: screen-rectangle raycasts at distance zero feed existing R3F handlers. Do not forward DOM label events with wrong offsets. Solar/Local Load are not selectable.
- Camera fitting uses the curated site envelope (including max 6x5 PV), not decorative ground/particles. Actual OrbitControls pose change enters inspection mode; resize then preserves pose/target/zoom/limits/fog. Full site flushes damping, fits and resumes automatic framing. No-move clicks do not exit automatic mode. Zero-size resets defer. Manual views may overlap/crop; physical phone browser-chrome behavior remains unverified.
- GLB placeholders and loading feedback are independent of the simulation. DPR is capped at 1-2, not FPS-adaptive. Do not claim measured performance from draw-call counts or a bundle warning.
- Manual vendor chunks are not lazy loading. `build/telemetryChunk.ts` emits a single chart entry; query retries must not introduce unloaded static dependencies. Recharts stays in optimizeDeps because opaque URL loading bypasses Vite's scanner. Shared time formatting stays in app-shared.
- Tailwind scans documentation too: avoid resurrecting removed utility literals in historical prose. Check final build after doc edits.

## Testing and Evidence

Vitest uses jsdom and `makeGridState`. Pure engine/reducer/settlement tests cover math; hook tests cover RAF/history; UI tests cover commands, drafts, focus, drawers and recovery. Real Three-camera/raycaster and GLB-bound tests are still not rasterized layout or GPU tests.

For runtime changes, also test the Pages-path production build. Dated browser scripts accept an external Playwright runtime; they are not currently CI gates or package dependencies. Record viewport, renderer, input method, synthetic fixtures and limitations. Preserve dated prior evidence; do not claim a headless screenshot as physical-phone or native-GPU acceptance.
