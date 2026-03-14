# BESS Storage Simulator

A browser-based battery energy storage system (BESS) and microgrid simulator built with React, TypeScript, and `react-three-fiber`.

## What It Does

- Simulates solar generation, load demand, battery SoC, grid frequency, and time-of-use pricing.
- Visualizes the system in a 3D scene with a live HUD and control panel.
- Supports manual battery control plus an auto-arbitrage mode.
- Tracks revenue from charging and discharging behavior under dynamic tariffs.

## Tech Stack

- Vite
- React 19
- TypeScript
- Tailwind CSS 4
- Three.js with `@react-three/fiber` and `@react-three/drei`
- Recharts

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
```

## Project Structure

```text
src/
  App.tsx                     App shell and layer composition
  hooks/useGridSimulation.ts  Core simulation engine
  components/
    MicrogridScene.tsx        3D visualization
    ControlPanel.tsx          Controls and telemetry charts
    StatusHud.tsx             Compact top status bar
  types.ts                    Shared contracts
```

## Notes

- The simulator currently focuses on interactive visualization rather than backend integration.
- The project now includes a Vitest + Testing Library skeleton for UI checks.
