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
- **3D Visualization**: Interactive Three.js scene with animated energy flow particles through PV, BESS, PCS/MV, and Grid Node assets
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
src/
  App.tsx                        App shell and overlay composition
  config.ts                      Centralized configuration constants
  types.ts                       Shared state and command contracts
  scenarios.ts                   Demo scenario definitions (currently hidden from the main controls)
  hooks/
    useGridSimulation.ts         Utility-scale dispatch and simulation loop
  components/
    SimulationViewport.tsx       Canvas wrapper with error boundary
    MicrogridScene.tsx           3D scene with energy flow particle animations
    ControlPanel.tsx             Collapsible drawer layout
    StatusHud.tsx                Compact live status bar
    TelemetryChart.tsx           Lazy-loaded chart module
    panels/                      Modular control panel components
      SimulationControl.tsx      Play/pause/stop controls
      BessControl.tsx            BESS dispatch and capacity settings
      MetricsPanel.tsx           Project specifications
      EconomicsPanel.tsx         Tariffs and P&L display
    ui/
      PanelPrimitives.tsx        Reusable UI components (Gauge, ActionButton, etc.)
  utils/
    gridReducer.ts               Pure reducer for BESSCommand handling
    tickEngine.ts                Simulation tick with tariff-boundary sub-stepping
    simulationModel.ts           Active-power settlement, solar/demand models, P&L math
    gridSelectors.ts             Derived state selectors
  test/                          Test setup and fixtures
```

## Notes

- The baseline numbers intentionally follow the provided project screenshot, including the displayed `188 MW / 744 MWh` BESS configuration.
- `Project P&L` and `BESS Margin` are intentionally separated:
  - `Project P&L` = direct PV sales + BESS discharge value − grid-paid charging cost.
  - `BESS Margin` = BESS discharge value − grid-paid charging cost − `Solar → BESS` opportunity cost (delayed sale value).
  - `BESS discharge value` lumps real export revenue (`batteryDischargeToExportMw`) and avoided-import value (`batteryDischargeToLoadMw` × current tariff). Both are valued at the same price because a BESS-served local MW directly displaces a grid-imported MW at the PCC, one-for-one.
- The current dispatch model intentionally focuses on **Energy Arbitrage + Self-consumption** using active power only. It does not model FCR, frequency response, voltage control, protection trips, or AC transient dynamics.
- Local supply/demand gaps are represented as grid import/export at the PCC. If import demand exceeds the configured PCC limit, the app surfaces `PCC Overload` instead of simulating grid-frequency collapse.
- The built-in `AUTO` dispatch is a simplified rule tree: peak discharge, off-peak reserve charging to 40% SoC, PV-surplus charging, deficit discharge outside off-peak, and PV-priority export curtailment handling.
- Demo scenario definitions remain in code for later restoration, but the scenario panel is currently hidden while the base model is being hardened.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
