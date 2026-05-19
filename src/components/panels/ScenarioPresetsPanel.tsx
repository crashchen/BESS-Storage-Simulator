import { SCENARIO_PRESETS } from '../../scenarios';
import type { BESSCommand } from '../../types';
import { getElectricityPriceEurMwh } from '../../utils/simulationModel';
import { PanelCard } from '../ui/PanelPrimitives';

interface ScenarioPresetsPanelProps {
    onCommand: (cmd: BESSCommand) => void;
}

function formatScenarioTime(timeOfDay: number): string {
    const hour = Math.floor(timeOfDay);
    const minute = Math.round((timeOfDay - hour) * 60);
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function formatScenarioMode(powerMw: number): string {
    if (powerMw > 0) return `Charge ${powerMw.toFixed(0)} MW`;
    if (powerMw < 0) return `Discharge ${Math.abs(powerMw).toFixed(0)} MW`;
    return 'Idle';
}

export function ScenarioPresetsPanel({ onCommand }: ScenarioPresetsPanelProps) {
    return (
        <PanelCard title="🎬 Demo Scenarios">
            <div className="grid gap-2">
                {SCENARIO_PRESETS.map((preset) => {
                    const price = getElectricityPriceEurMwh(preset.state.timeOfDay, preset.state.tariffRatesEurMwh);

                    return (
                        <button
                            key={preset.id}
                            type="button"
                            data-testid={`scenario-preset-${preset.id}`}
                            onClick={() => onCommand({ type: 'APPLY_SCENARIO_PRESET', payload: preset.id })}
                            className={`
                            rounded-xl border p-3 text-left transition
                            focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400
                            ${preset.accentClass}
                        `}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-100">
                                        {preset.shortLabel}
                                    </p>
                                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                                        {preset.description}
                                    </p>
                                </div>
                                <span className={`
                                    rounded-full border px-2 py-1 text-[10px] font-mono
                                    border-white/10 bg-slate-950/50 text-slate-300
                                `}
                                >
                                    Load
                                </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-300">
                                <span className="rounded-md bg-slate-950/45 px-2 py-1">Time {formatScenarioTime(preset.state.timeOfDay)}</span>
                                <span className="rounded-md bg-slate-950/45 px-2 py-1">{formatScenarioMode(preset.state.batteryPowerMw)}</span>
                                <span className="rounded-md bg-slate-950/45 px-2 py-1">Demand {preset.state.dispatchScalePercent}%</span>
                                <span className="rounded-md bg-slate-950/45 px-2 py-1">€{price.toFixed(0)}/MWh</span>
                            </div>
                            <p className="mt-2 rounded-lg border border-white/10 bg-slate-950/30 px-2 py-1.5 text-[10px] font-semibold leading-relaxed text-cyan-100/90">
                                Expected flow: {preset.expectedFlow}
                            </p>
                            <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-slate-400">
                                {preset.operatorCue}
                            </p>
                        </button>
                    );
                })}
            </div>
        </PanelCard>
    );
}
