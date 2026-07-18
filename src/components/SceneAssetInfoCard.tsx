import type { GridState, SceneAssetId } from '../types';
import { getSceneAssetInfo } from '../utils/sceneAssetInfo';

interface SceneAssetInfoCardProps {
  assetId: SceneAssetId | null;
  gridState: GridState;
  pinned: boolean;
  onClose: () => void;
}

const METER_TONE_CLASS = {
  green: 'from-emerald-400 to-lime-300',
  amber: 'from-amber-300 to-orange-400',
  cyan: 'from-cyan-300 to-sky-400',
  red: 'from-red-400 to-orange-300',
  blue: 'from-blue-300 to-emerald-300',
} as const;

export function SceneAssetInfoCard({ assetId, gridState, pinned, onClose }: SceneAssetInfoCardProps) {
  if (!assetId) return null;

  const info = getSceneAssetInfo(assetId, gridState);
  const meterClass = METER_TONE_CLASS[info.meter.tone];

  return (
    <aside
      role="region"
      aria-label={`${info.title} live information`}
      data-testid="scene-asset-info-card"
      className="pointer-events-auto absolute bottom-5 left-1/2 z-30 max-h-[calc(100dvh-2.5rem)] w-[min(390px,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto overflow-x-hidden overscroll-contain rounded-3xl border border-slate-500/30 bg-slate-950/88 text-slate-100 shadow-2xl shadow-black/45 backdrop-blur-xl md:left-auto md:right-5 md:top-24 md:bottom-auto md:max-h-[calc(100dvh-7rem)] md:translate-x-0"
    >
      <div className={`h-1.5 bg-gradient-to-r ${info.accent}`} />
      <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate-400">
            {pinned ? 'Pinned equipment' : 'Hover preview'}
          </p>
          <h2 className="mt-1 text-lg font-black tracking-wide text-white">{info.title}</h2>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{info.eyebrow}</p>
        </div>
        {pinned && (
          <button
            type="button"
            aria-label="Close equipment info card"
            onClick={onClose}
            className="rounded-full border border-slate-600/70 px-2 py-1 text-xs font-bold text-slate-300 transition hover:border-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            Close
          </button>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900/85 to-slate-950/70 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{info.primary.label}</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-white">{info.primary.value}</p>
          </div>
          <div className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
            {info.status}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
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

      <dl className="mt-3 grid grid-cols-3 gap-2">
        {info.flowRows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-700/40 bg-slate-900/50 p-2">
            <dt className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{row.label}</dt>
            <dd className="mt-1 text-sm font-black text-cyan-50">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 rounded-2xl border border-slate-700/40 bg-slate-950/45 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Key readings</p>
        <dl className="mt-2 grid grid-cols-2 gap-2">
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
