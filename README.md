# BESS Storage Simulator

An interactive utility-scale solar PV + BESS simulator for a Romania project baseline. The app combines a real-time dispatch model, a Three.js scene, and a dashboard for testing storage dispatch, market-price response, and project cashflow behavior.

## Project Baseline

- Solar PV: `117 MWp DC / 102 MW AC`
- BESS: `188 MW` rated power with `744 MWh` storage
- Grid connection: `288 MW total`
- PV evacuation: `102 MW`
- BESS simultaneous injection / evacuation: `186 MW`
- Yield assumption: `1,380 kWh/kW/year`

## Current Capabilities

- Start, pause, and stop the simulation clock
- Switch between manual dispatch and a peak-ready dispatch mode
- Edit BESS rated power and storage energy capacity from the UI
- Edit coarse wholesale price windows, including negative-price scenarios
- Track SoC, grid frequency, solar output, grid demand, and BESS power in real time
- Visualize project P&L, BESS margin, curtailment, and energy flow splits between `Solar -> Grid`, `Solar -> BESS`, `Grid -> BESS`, and `BESS -> Grid`
- Model simple BESS charge/discharge efficiency losses
- Visualize project status in both dashboard and 3D scene

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
src/
  App.tsx                     App shell and overlay composition
  hooks/useGridSimulation.ts  Utility-scale dispatch and storage simulation
  components/
    MicrogridScene.tsx        3D project visualization
    ControlPanel.tsx          Controls, metrics, and telemetry
    StatusHud.tsx             Compact live status bar
    TelemetryChart.tsx        Lazy-loaded chart module
  test/                       Shared test setup and fixtures
  utils/                      Small shared helpers
  types.ts                    Shared state and command contracts
```

## Notes

- The baseline numbers intentionally follow the provided project screenshot, including the displayed `188 MW / 744 MWh` BESS configuration.
- `Project P&L` and `BESS Margin` are intentionally separated:
  - `Project P&L` includes direct PV exports, grid-paid charging, and BESS discharge revenue.
  - `BESS Margin` isolates storage uplift and treats `Solar -> BESS` as delayed sale value rather than as purchased grid power.
- The simulation is front-end only for now; there is no backend persistence, SCADA integration, or optimizer yet.
