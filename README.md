# BESS Storage Simulator

[![CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/ci.yml)
[![Deploy](https://github.com/crashchen/BESS-Storage-Simulator/actions/workflows/deploy.yml/badge.svg)](https://crashchen.github.io/BESS-Storage-Simulator/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An interactive utility-scale solar PV + BESS simulator for a Romania project baseline. The app combines a real-time dispatch model, a Three.js 3D scene with energy flow animations, and a collapsible dashboard for testing storage dispatch, market-price response, and project cashflow behavior.

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
- **Dispatch Modes**: Manual control or automatic peak-ready dispatch optimization
- **Configurable BESS**: Edit rated power and storage capacity from the UI
- **Project Capacity Setup**: Edit solar AC/DC capacity, PV evacuation, and BESS interconnection live to model any project, not just the Romania baseline
- **Price Scenarios**: Edit wholesale price windows, including negative-price scenarios
- **Live Metrics**: Track SoC, grid frequency, solar output, grid demand, and BESS power
- **P&L Tracking**: Project P&L, BESS margin, curtailment, and energy flow analysis
- **3D Visualization**: Interactive Three.js scene with animated energy flow particles
- **Collapsible UI**: Slide-out panels with glassmorphism design for maximum scene visibility
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
  hooks/
    useGridSimulation.ts         Utility-scale dispatch and simulation loop
  components/
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
  utils/                         Shared helpers
  test/                          Test setup and fixtures
```

## Notes

- The baseline numbers intentionally follow the provided project screenshot, including the displayed `188 MW / 744 MWh` BESS configuration.
- `Project P&L` and `BESS Margin` are intentionally separated:
  - `Project P&L` includes direct PV exports, grid-paid charging, and BESS discharge revenue.
  - `BESS Margin` isolates storage uplift and treats `Solar -> BESS` as delayed sale value rather than as purchased grid power.
- The simulation is front-end only for now; there is no backend persistence, SCADA integration, or optimizer yet.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
