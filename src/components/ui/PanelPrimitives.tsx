// ============================================================
// Shared UI primitives for control panels
// ============================================================

import type { ReactNode } from 'react';

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
            onClick={onClick}
            data-testid={testId}
            className={`
                relative rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200
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
                data-testid={testId}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (Number.isFinite(nextValue)) {
                        onChange(nextValue);
                    }
                }}
                className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-slate-500"
            />
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
