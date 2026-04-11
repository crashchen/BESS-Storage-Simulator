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
npx vitest run -t "auto-arbitrage"
```

CI (`.github/workflows/ci.yml`) runs `lint → test → build` on push/PR to `main`, so `npm run build` must succeed — type errors break the pipeline, not just `lint`. Deploy workflow publishes to GitHub Pages; `vite.config.ts` reads `BASE_URL` from env for that base path.

## Architecture

The app is a single-page React + Three.js simulator. There is **no backend** — all state lives in-memory in one custom hook, rendered by a 3D layer (r3f) and a 2D HUD layer (Tailwind panels).

### The simulation loop is the spine

Everything flows from `src/hooks/useGridSimulation.ts`. Key points that aren't obvious from the file tree:

- **Ref-based tick, throttled React updates.** The `requestAnimationFrame` loop mutates `simRef.current` every frame but only calls `setState` every `SIMULATION.renderSyncIntervalMs` (~33 ms / 30 fps). Chart snapshots are pushed on a separate `SIMULATION.snapshotIntervalMs` cadence into `historyRef`. If you add state consumed by the UI, read it from `state` (throttled) — do not subscribe components to `simRef` directly.
- **`dispatch(cmd)` is the only write path.** All UI interactions produce a `BESSCommand` union (`src/types.ts`) handled by a switch in `useGridSimulation.ts`. New controls should add a command variant, not mutate state ad hoc. `STOP_SIMULATION` fully resets via `createInitialGridState()` and clears history/refs.
- **`simulateTick` is pure-ish.** Given `(prev, dtReal, now)` it returns the next `GridState`. Dispatch logic (manual mode vs. auto-arb), SoC clamping, efficiency losses, and the frequency droop model all live here. The *economic* settlement and forecast math is delegated to `src/utils/simulationModel.ts` so it can be unit-tested without the RAF loop — add new simulation math there, not inline in the hook.

### Config is the single source of truth

`src/config.ts` centralises every tunable number (solar shape, BESS limits, tariff windows, auto-arb strategy, 3D scene params). `useGridSimulation` and `simulationModel` both import from it — never hard-code magic numbers in components or hooks; add them to the appropriate `as const` block in `config.ts`.

### Two P&L accumulators, intentionally different

`cumulativeRevenueEur` (Project P&L) and `cumulativeBessMarginEur` (BESS Margin) are computed separately by `settleHybridProjectTick` in `simulationModel.ts`:

- **Project P&L** = direct PV exports + BESS discharge revenue − grid-paid BESS charging. It treats `Solar → BESS` as zero-cost.
- **BESS Margin** = discharge revenue − grid charge cost − *opportunity cost of `Solar → BESS`* (solar that could have been sold now but was stored instead).

This split is a product decision, not a bug. Don't "simplify" them into one number. The explanation is surfaced to users in `EconomicsPanel.tsx` and noted in the README — keep wording consistent if you touch it.

### Peak-Ready auto-arbitrage

`getAutoArbOutlook` / `getAutoArbPlan` in `simulationModel.ts` implement a forecast-driven dispatch strategy: integrate forward PV surplus vs. evening-peak deficit (18:00–23:00 window, configurable in `config.ts` under `AUTO_ARB`) to decide whether to pre-charge from the grid in off/mid-peak, pace discharge during peak, or idle. Manual mode (`CHARGE`/`DISCHARGE`/`IDLE`) disables auto-arb; toggling `TOGGLE_AUTO_ARB` takes over control.

### Rendering layers

`App.tsx` composes three overlays over a fullscreen container:

1. `SimulationViewport` — r3f `Canvas` hosting `MicrogridScene` (3D BESS container, solar array, energy-flow particles, time-of-day lighting). Props-only subscription to `GridState`; do not hold React state for the scene here.
2. `StatusHud` — compact top-of-screen live metrics bar.
3. `ControlPanel` — left/right slide-out drawers. Inside, individual panels live under `src/components/panels/` and share primitives (`Gauge`, `ActionButton`, `NumericField`, `PanelCard`) from `src/components/ui/PanelPrimitives.tsx`. `TelemetryChart` is `lazy()`-loaded to keep the initial bundle small.

### Bundle splitting

`vite.config.ts` defines manual `rollupOptions.output.manualChunks` that split `react`, `three`, `@react-three/fiber`, `@react-three/drei` (+ troika/three-stdlib/camera-controls/meshline), `recharts`/`d3`, and `three/examples` into separate vendor chunks. If you add a heavy dependency, consider whether it needs its own chunk here — otherwise it lands in the app bundle.

### Tests

Vitest runs in `jsdom` (`vitest.config.ts`) with `src/test/setup.ts` and a `makeGridState` fixture in `src/test/fixtures.ts` for building partial `GridState` objects. The pure simulation math in `src/utils/simulationModel.ts` has dedicated unit tests; UI tests (`*.test.tsx`) use React Testing Library. When adding simulation behavior, prefer extending `simulationModel.ts` + a unit test over testing through the RAF loop.
