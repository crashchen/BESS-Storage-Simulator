import type { GridState, SceneAssetId } from '../types';
import { getSceneAssetInfo } from '../utils/sceneAssetInfo';

interface SceneAssetInfoCardProps {
  assetId: SceneAssetId | null;
  gridState: GridState;
  pinned: boolean;
  onClose: () => void;
}

export function SceneAssetInfoCard({ assetId, gridState, pinned, onClose }: SceneAssetInfoCardProps) {
  if (!assetId) return null;

  const info = getSceneAssetInfo(assetId, gridState);

  return (
    <aside
      role="region"
      aria-label={`${info.title} live information`}
      data-testid="scene-asset-info-card"
      className="pointer-events-auto absolute bottom-5 left-1/2 z-30 w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-slate-500/30 bg-slate-950/85 p-4 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-xl md:left-auto md:right-5 md:top-24 md:bottom-auto md:translate-x-0"
    >
      <div className={`mb-3 h-1 rounded-full bg-gradient-to-r ${info.accent}`} />
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

      <div className="mt-3 rounded-xl border border-slate-700/50 bg-slate-900/60 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Status</p>
        <p className="mt-1 text-sm font-bold text-cyan-100">{info.status}</p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        {info.rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-slate-700/40 bg-slate-900/45 p-2">
            <dt className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{row.label}</dt>
            <dd className="mt-1 text-sm font-black text-slate-100">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs leading-5 text-slate-400">{info.description}</p>
      {!pinned && (
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
          Click object to pin this card
        </p>
      )}
    </aside>
  );
}
