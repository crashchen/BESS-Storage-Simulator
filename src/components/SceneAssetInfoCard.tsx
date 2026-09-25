import type { Ref } from 'react';
import type { GridState, SceneAssetId } from '../types';
import { getSceneAssetInfo } from '../utils/sceneAssetInfo';

interface SceneAssetInfoCardProps {
  assetId: SceneAssetId | null;
  gridState: GridState;
  pinned: boolean;
  onClose: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
}

const METER_TONE_CLASS = {
  green: 'from-emerald-400 to-lime-300',
  amber: 'from-amber-300 to-orange-400',
  cyan: 'from-cyan-300 to-sky-400',
  red: 'from-red-400 to-orange-300',
  blue: 'from-blue-300 to-emerald-300',
} as const;

export function SceneAssetInfoCard({ assetId, gridState, pinned, onClose, closeButtonRef }: SceneAssetInfoCardProps) {
  if (!assetId) return null;

  const info = getSceneAssetInfo(assetId, gridState);
  const meterClass = METER_TONE_CLASS[info.meter.tone];

  return (
    <aside
      role="region"
      id="scene-asset-info"
      aria-label={`${info.title} live information`}
      data-testid="scene-asset-info-card"
      // The card docks in empty space beside the default overview, so equipment,
      // labels and the other scene tools stay visible and clickable while it is
      // pinned: below the site in portrait (above the toolbar), and top-right in
      // landscape (below the HUD, left of the Metrics handle, above the site, and
      // right of the expanded flow legend on narrow windows). Short landscape
      // docks it over the solar array instead (index.css). Heights
      // are capped to that space; the content scrolls. A hover preview also lets
      // the pointer through; only a pinned card has controls.
      className={`scene-asset-card @container ${pinned ? 'pointer-events-auto' : 'pointer-events-none'} absolute bottom-24 left-1/2 z-30 max-h-[max(8rem,calc(50dvh-18vw-96px))] w-[min(390px,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto overflow-x-hidden overscroll-contain rounded-3xl border border-slate-500/30 bg-slate-950/88 text-slate-100 shadow-2xl shadow-black/45 backdrop-blur-xl landscape:bottom-auto landscape:left-auto landscape:right-[70px] landscape:top-[62px] landscape:max-h-[max(8rem,calc(50dvh-2vw-72px))] landscape:w-[min(390px,calc(100vw-320px))] landscape:translate-x-0`}
    >
      <div className={`h-1.5 bg-gradient-to-r ${info.accent}`} />
      <div className="p-3 @3xs:p-4">
      {/* Below 16rem (the short-landscape dock) the kicker is hidden and the
          eyebrow spans the full width, so the header does not wrap word by word
          beside the Close button. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
        <p className="col-start-1 hidden text-[10px] font-bold uppercase tracking-[0.26em] text-slate-400 @3xs:block">
          {pinned ? 'Pinned equipment' : 'Hover preview'}
        </p>
        <h2 className="col-start-1 text-lg font-black tracking-wide text-white @3xs:mt-1">{info.title}</h2>
        <p className="col-span-2 text-xs font-semibold uppercase text-slate-400 @3xs:col-span-1 @3xs:col-start-1 @3xs:tracking-[0.16em]">{info.eyebrow}</p>
        {pinned && (
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close equipment info card"
            onClick={onClose}
            className="col-start-2 row-span-2 row-start-1 rounded-full border border-slate-600/70 px-2 py-1 text-xs font-bold text-slate-300 transition hover:border-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <span aria-hidden="true" className="@3xs:hidden">×</span>
            <span className="hidden @3xs:inline">Close</span>
          </button>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900/85 to-slate-950/70 p-3 @3xs:mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{info.primary.label}</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-white @3xs:text-3xl">{info.primary.value}</p>
          </div>
          <div className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
            {info.status}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <span>{info.meter.label}</span>
            <span className="text-slate-300">{info.meter.value}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${meterClass}`}
              style={{ width: `${info.meter.percent}%` }}
            />
          </div>
        </div>
      </div>

      {info.readingNote && <p className="mt-3 text-xs leading-5 text-slate-300">{info.readingNote}</p>}

      <dl className="mt-3 grid grid-cols-1 gap-2 @3xs:grid-cols-3">
        {info.flowRows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-700/40 bg-slate-900/50 p-2">
            <dt className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{row.label}</dt>
            <dd className="mt-1 text-sm font-black text-cyan-50">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 rounded-2xl border border-slate-700/40 bg-slate-950/45 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Key readings</p>
        <dl className="mt-2 grid grid-cols-1 gap-2 @3xs:grid-cols-2">
        {info.rows.map((row) => (
          <div key={row.label} className="rounded-xl bg-slate-900/55 p-2">
            <dt className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{row.label}</dt>
            <dd className="mt-1 text-sm font-black text-slate-100">{row.value}</dd>
          </div>
        ))}
        </dl>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-400">{info.description}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
        {pinned ? 'Press Esc or click empty space to close' : 'Click object to pin this card'}
      </p>
      </div>
    </aside>
  );
}
