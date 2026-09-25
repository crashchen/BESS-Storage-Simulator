import { useId } from 'react';
import { FLOW_COLORS } from '../utils/sceneFlowVisuals';

/** Short landscape screens start with the legend collapsed; index.css mirrors this query. */
export const COMPACT_LEGEND_QUERY = '(orientation: landscape) and (max-height: 430px)';

const ROUTES = [
    { label: 'Solar', destination: '→ BESS / load / grid', color: FLOW_COLORS.solar },
    { label: 'BESS', destination: '→ local load', color: FLOW_COLORS.bessToLoad },
    { label: 'BESS', destination: '→ grid export', color: FLOW_COLORS.bessToGrid },
    { label: 'Grid', destination: '→ BESS / local load', color: FLOW_COLORS.grid },
] as const;

const SWATCHES = [...ROUTES.map(route => route.color), FLOW_COLORS.curtailed];

interface EnergyFlowLegendProps {
    expanded: boolean;
    onToggle: () => void;
}

// A disclosure keeps the color and direction key one keyboard/touch action away
// where the full card would cover the site. The card itself stays pointer-
// transparent; only the toggle and the short-landscape popover take input. It
// stacks above the equipment card (z-30): in short landscape the popover opens
// over the card docked on the left; elsewhere the two do not meet.
export function EnergyFlowLegend({ expanded, onToggle }: EnergyFlowLegendProps) {
    const detailsId = useId();

    return (
        <aside aria-label="Energy flow legend" className={[
            'energy-flow-legend pointer-events-none absolute left-3 top-32 z-[35] flex flex-col rounded-xl border border-slate-600/50 bg-slate-950/85 text-[11px] leading-4 text-slate-200 shadow-xl backdrop-blur-md sm:top-36',
            expanded ? 'w-[min(230px,calc(100vw-1.5rem))]' : 'w-max max-w-[calc(100vw-1.5rem)]',
        ].join(' ')}>
            <h2>
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    onClick={onToggle}
                    className="energy-flow-legend__toggle pointer-events-auto flex w-full items-center gap-1.5 rounded-[11px] px-3 pb-0.5 pt-1.5 text-left hover:bg-slate-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-300"
                >
                    {!expanded && (
                        <span aria-hidden="true" className="energy-flow-legend__swatches flex shrink-0 -space-x-0.5">
                            {SWATCHES.map(color => (
                                <span key={color} className="inline-block size-1.5 rounded-full ring-1 ring-slate-950" style={{ backgroundColor: color }} />
                            ))}
                        </span>
                    )}
                    <span className="energy-flow-legend__title font-bold uppercase tracking-[0.15em] text-slate-100">Live power routes</span>
                    <svg aria-hidden="true" viewBox="0 0 12 12" className="energy-flow-legend__chevron ml-auto size-3 shrink-0 text-slate-400">
                        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </h2>
            <div id={detailsId} hidden={!expanded} className="energy-flow-legend__details px-3 pb-2">
                <p className="mb-1 text-[10px] leading-[13px] text-slate-400">Dots show direction; each line brightens as its flow rises.</p>
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
            </div>
        </aside>
    );
}
