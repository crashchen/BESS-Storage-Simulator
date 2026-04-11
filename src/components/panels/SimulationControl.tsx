// ============================================================
// Simulation Run Controls - Start/Pause/Stop and time speed
// ============================================================

import { SIMULATION } from '../../config';
import type { BESSCommand, SimulationStatus } from '../../types';
import { ActionButton, PanelCard } from '../ui/PanelPrimitives';

interface SimulationControlProps {
    simulationStatus: SimulationStatus;
    timeSpeed: number;
    onCommand: (cmd: BESSCommand) => void;
}

export function SimulationControl({ simulationStatus, timeSpeed, onCommand }: SimulationControlProps) {
    return (
        <PanelCard title="▶ Simulation Run State">
            <div className="grid grid-cols-3 gap-2">
                <ActionButton
                    label="Start"
                    active={simulationStatus === 'running'}
                    color="#22c55e"
                    testId="simulation-start"
                    onClick={() => onCommand({ type: 'START_SIMULATION' })}
                />
                <ActionButton
                    label="Pause"
                    active={simulationStatus === 'paused'}
                    color="#38bdf8"
                    testId="simulation-pause"
                    onClick={() => onCommand({ type: 'PAUSE_SIMULATION' })}
                />
                <ActionButton
                    label="Stop"
                    active={simulationStatus === 'stopped'}
                    color="#64748b"
                    testId="simulation-stop"
                    onClick={() => onCommand({ type: 'STOP_SIMULATION' })}
                />
            </div>

            <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>Simulation Speed</span>
                    <span className="font-mono font-bold text-cyan-400">{timeSpeed}×</span>
                </div>
                <input
                    type="range"
                    min={SIMULATION.minTimeSpeed}
                    max={SIMULATION.maxTimeSpeed}
                    value={timeSpeed}
                    aria-label="Simulation Speed"
                    onChange={(event) => onCommand({ type: 'SET_TIME_SPEED', payload: Number(event.target.value) })}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-500"
                />
            </div>
        </PanelCard>
    );
}
