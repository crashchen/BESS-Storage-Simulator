// ============================================================
// Control Panel - Collapsible drawer layout
// ============================================================

import { lazy, Suspense, useState } from 'react';
import type { ControlPanelProps } from '../types';
import { PanelCard } from './ui/PanelPrimitives';
import {
    SimulationControl,
    BessDispatchControl,
    BessCapacitySetup,
    DispatchParameters,
    MetricsPanel,
    EconomicsPanel,
} from './panels';

const TelemetryChart = lazy(async () => {
    const module = await import('./TelemetryChart');
    return { default: module.TelemetryChart };
});

// Collapsed sidebar tab button
function DrawerTab({
    icon,
    label,
    isOpen,
    onClick,
    position,
}: {
    icon: string;
    label: string;
    isOpen: boolean;
    onClick: () => void;
    position: 'left' | 'right';
}) {
    return (
        <button
            onClick={onClick}
            className={`
                pointer-events-auto flex items-center gap-2 rounded-lg 
                border border-slate-700/60 bg-slate-900/70 px-3 py-2.5
                text-xs font-semibold text-slate-300 backdrop-blur-md
                transition-all duration-300 hover:bg-slate-800/80 hover:text-white
                ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
                ${position === 'left' ? 'rounded-l-none border-l-0' : 'rounded-r-none border-r-0'}
            `}
            title={label}
        >
            <span className="text-base">{icon}</span>
            <span className="hidden sm:inline">{isOpen ? '◀' : position === 'left' ? '▶' : '◀'}</span>
        </button>
    );
}

// Drawer container with slide animation
function Drawer({
    isOpen,
    onClose,
    position,
    children,
}: {
    isOpen: boolean;
    onClose: () => void;
    position: 'left' | 'right';
    children: React.ReactNode;
}) {
    const translateClass = position === 'left'
        ? isOpen ? 'translate-x-0' : '-translate-x-full'
        : isOpen ? 'translate-x-0' : 'translate-x-full';

    return (
        <div
            className={`
                pointer-events-auto absolute top-0 bottom-0 w-[380px] max-w-[90vw]
                flex flex-col gap-3 overflow-y-auto p-3
                bg-slate-950/60 backdrop-blur-xl
                border-slate-700/40 shadow-2xl
                transition-transform duration-300 ease-out
                ${translateClass}
                ${position === 'left' ? 'left-0 border-r pr-4' : 'right-0 border-l pl-4'}
            `}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className={`
                    absolute top-3 z-20 flex h-8 w-8 items-center justify-center
                    rounded-full bg-slate-800/80 text-slate-400 
                    transition-colors hover:bg-slate-700 hover:text-white
                    ${position === 'left' ? 'right-2' : 'left-2'}
                `}
                title="Close panel"
            >
                {position === 'left' ? '◀' : '▶'}
            </button>
            
            <div className="mt-8 flex flex-col gap-3">
                {children}
            </div>
        </div>
    );
}

export function ControlPanel({ gridState, history, onCommand }: ControlPanelProps) {
    const [leftOpen, setLeftOpen] = useState(false);
    const [rightOpen, setRightOpen] = useState(false);

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[4.75rem] z-10 select-none">
            {/* Left drawer - Controls */}
            <Drawer isOpen={leftOpen} onClose={() => setLeftOpen(false)} position="left">
                <SimulationControl
                    simulationStatus={gridState.simulationStatus}
                    timeSpeed={gridState.timeSpeed}
                    onCommand={onCommand}
                />
                <BessDispatchControl gridState={gridState} onCommand={onCommand} />
                <BessCapacitySetup gridState={gridState} onCommand={onCommand} />
                <DispatchParameters gridState={gridState} onCommand={onCommand} />
            </Drawer>

            {/* Right drawer - Metrics & Economics */}
            <Drawer isOpen={rightOpen} onClose={() => setRightOpen(false)} position="right">
                <MetricsPanel gridState={gridState} />
                <EconomicsPanel gridState={gridState} onCommand={onCommand} />

                {history.length > 2 && (
                    <PanelCard title="📊 Real-Time Telemetry">
                        <Suspense fallback={<div className="h-[170px] animate-pulse rounded-lg bg-slate-800/60" />}>
                            <TelemetryChart history={history} />
                        </Suspense>
                    </PanelCard>
                )}
            </Drawer>

            {/* Collapsed tabs - visible when drawers are closed */}
            <div className="absolute left-0 top-4 flex flex-col gap-2">
                <DrawerTab
                    icon="⚡"
                    label="Controls"
                    isOpen={leftOpen}
                    onClick={() => setLeftOpen(true)}
                    position="left"
                />
            </div>

            <div className="absolute right-0 top-4 flex flex-col gap-2">
                <DrawerTab
                    icon="📊"
                    label="Metrics"
                    isOpen={rightOpen}
                    onClick={() => setRightOpen(true)}
                    position="right"
                />
            </div>
        </div>
    );
}
