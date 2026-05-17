import { SCENARIO_PRESETS } from '../../scenarios';
import type { BESSCommand } from '../../types';
import { PanelCard } from '../ui/PanelPrimitives';

interface ScenarioPresetsPanelProps {
    onCommand: (cmd: BESSCommand) => void;
}

export function ScenarioPresetsPanel({ onCommand }: ScenarioPresetsPanelProps) {
    return (
        <PanelCard title="🎬 Demo Scenarios">
            <div className="grid gap-2">
                {SCENARIO_PRESETS.map((preset) => (
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
                            <span className="rounded-full border border-white/10 bg-slate-950/50 px-2 py-1 text-[10px] font-mono text-slate-300">
                                Load
                            </span>
                        </div>
                        <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-slate-400">
                            {preset.operatorCue}
                        </p>
                    </button>
                ))}
            </div>
        </PanelCard>
    );
}
