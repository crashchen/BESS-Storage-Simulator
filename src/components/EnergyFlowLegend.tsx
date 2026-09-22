import { FLOW_COLORS } from '../utils/sceneFlowVisuals';

const ROUTES = [
    { label: 'Solar', destination: '→ BESS / load / grid', color: FLOW_COLORS.solar },
    { label: 'BESS', destination: '→ local load', color: FLOW_COLORS.bessToLoad },
    { label: 'BESS', destination: '→ grid export', color: FLOW_COLORS.bessToGrid },
    { label: 'Grid', destination: '→ BESS / local load', color: FLOW_COLORS.grid },
] as const;

export function EnergyFlowLegend() {
    return (
        <aside aria-label="Energy flow legend" className="energy-flow-legend pointer-events-none absolute left-3 top-32 z-20 w-[min(230px,calc(100vw-1.5rem))] rounded-xl border border-slate-600/50 bg-slate-950/85 px-3 py-2 text-[11px] leading-4 text-slate-200 shadow-xl backdrop-blur-md">
            <h2 className="font-bold uppercase tracking-[0.15em] text-slate-100">Live power routes</h2>
            <p className="mb-1 text-[10px] text-slate-400">Dots show direction; each line brightens as its flow rises.</p>
            <dl className="space-y-0.5">
                {ROUTES.map(({ label, destination, color }) => (
                    <div key={`${label}-${destination}`} className="flex items-center gap-1.5 whitespace-nowrap">
                        <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <dt className="font-semibold">{label}</dt>
                        <dd className="text-slate-300">{destination}</dd>
                    </div>
                ))}
            </dl>
            <p className="mt-1 flex items-center gap-1.5 text-slate-300">
                <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: FLOW_COLORS.curtailed }} />
                Red sparks = curtailed solar
            </p>
        </aside>
    );
}
