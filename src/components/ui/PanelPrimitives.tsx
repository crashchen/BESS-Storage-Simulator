// ============================================================
// Shared UI primitives for control panels
// ============================================================

import { useState, type ReactNode } from 'react';

export function Gauge({
    label,
    value,
    unit,
    min,
    max,
    color,
    warn,
}: {
    label: string;
    value: number;
    unit: string;
    min: number;
    max: number;
    color: string;
    warn?: boolean;
}) {
    const pct = Math.max(0, Math.min(100, ((value - min) / Math.max(max - min, 1e-9)) * 100));

    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400">
                <span>{label}</span>
                <span className={`font-mono font-bold ${warn ? 'animate-pulse text-red-400' : ''}`} style={{ color: warn ? undefined : color }}>
                    {value.toFixed(1)} {unit}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
}

export function ActionButton({
    label,
    active,
    color,
    onClick,
    testId,
}: {
    label: string;
    active: boolean;
    color: string;
    onClick: () => void;
    testId?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            aria-pressed={active}
            className={`
                relative rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400
                ${active
                    ? 'scale-[1.02] text-white shadow-lg'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-700/60 hover:text-slate-100'}
            `}
            style={active ? { backgroundColor: color, borderColor: color, boxShadow: `0 0 18px ${color}55` } : undefined}
        >
            {label}
        </button>
    );
}

export function NumericField({
    label,
    value,
    unit,
    min,
    max,
    step,
    accentClass,
    onChange,
    testId,
}: {
    label: string;
    value: number;
    unit: string;
    min: number;
    max: number;
    step: number;
    accentClass: string;
    onChange: (value: number) => void;
    testId: string;
}) {
    const [draftState, setDraftState] = useState({
        sourceValue: value,
        draft: String(value),
        invalid: false,
    });
    const isCurrentDraft = Object.is(draftState.sourceValue, value);
    const draft = isCurrentDraft ? draftState.draft : String(value);
    const invalid = isCurrentDraft ? draftState.invalid : false;

    const commit = () => {
        const trimmedDraft = draft.trim();
        const n = Number(trimmedDraft);
        if (trimmedDraft !== '' && Number.isFinite(n) && n >= min && n <= max) {
            setDraftState({ sourceValue: value, draft, invalid: false });
            onChange(n);
        } else {
            setDraftState({ sourceValue: value, draft, invalid: true });
        }
    };
    const precision = step < 1 ? 1 : 0;
    const errorId = `${testId}-error`;
    const formatLimit = (limit: number) => limit.toFixed(precision);

    return (
        <label className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{label}</span>
                <span className={`font-mono font-bold ${accentClass}`}>
                    {value.toFixed(step < 1 ? 1 : 0)} {unit}
                </span>
            </div>
            <input
                type="number"
                aria-label={label}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                data-testid={testId}
                min={min}
                max={max}
                step={step}
                value={draft}
                onChange={(event) => {
                    setDraftState({
                        sourceValue: value,
                        draft: event.target.value,
                        invalid: false,
                    });
                }}
                onBlur={commit}
                onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
                className={`
                    rounded-lg border bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition
                    ${invalid
                        ? 'border-red-400 shadow-[0_0_0_1px_rgba(248,113,113,0.4)] focus:border-red-300'
                        : 'border-slate-700 focus:border-slate-500'}
                `}
            />
            {invalid ? (
                <span id={errorId} role="alert" className="text-[11px] font-medium text-red-300">
                    Enter {formatLimit(min)}-{formatLimit(max)} {unit}.
                </span>
            ) : null}
        </label>
    );
}

export function PanelCard({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-slate-700/40 bg-slate-900/60 p-4 shadow-2xl backdrop-blur-md">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                {title}
            </h2>
            {children}
        </section>
    );
}
