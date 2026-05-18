/**
 * share-payload — Compone `SharePayload` a partir de un `ShareTarget`.
 */
import type { ShareTarget, SharePayload } from '../types';
import { buildPoiUrl, buildCollectionUrl, buildRouteUrl } from './share-url';
import { partitionForShare, isPoiShareable } from './share-eligibility';

const MAX_DESC = 160;

function truncate(s: string | undefined | null, max = MAX_DESC): string {
  const v = (s ?? '').trim();
  if (v.length <= max) return v;
  return v.slice(0, max - 1).trimEnd() + '…';
}

function firstImage(locs: ReadonlyArray<{ enrichedData?: { imagen?: string } }>): string | undefined {
  for (const l of locs) {
    const img = l.enrichedData?.imagen;
    if (typeof img === 'string' && img.trim()) return img.trim();
  }
  return undefined;
}

export function buildSharePayload(target: ShareTarget): SharePayload {
  if (target.kind === 'poi') {
    const poi = target.poi;
    const url = buildPoiUrl(target.id);
    const title = target.name || poi?.name || 'Punto en Vandits';
    const desc = truncate(poi?.enrichedData?.descripcion);
    const eligible = poi ? (isPoiShareable(poi) ? 1 : 0) : 0;
    return {
      url,
      title,
      text: desc || `${title} · ver en Vandits`,
      ogImage: poi?.enrichedData?.imagen,
      eligibleCount: eligible,
      totalCount: poi ? 1 : 0,
      excludedCount: poi && eligible === 0 ? 1 : 0,
    };
  }

  const locs = target.locations ?? [];
  const partition = partitionForShare(locs);
  const url =
    target.kind === 'collection'
      ? buildCollectionUrl(target.id)
      : buildRouteUrl(target.id);
  const kindLabel = target.kind === 'collection' ? 'Colección' : 'Ruta';
  const title = target.name || `${kindLabel} en Vandits`;
  const text =
    partition.eligible.length > 0
      ? `${title} · ${partition.eligible.length} puntos compartibles`
      : `${title} · ver en Vandits`;
  return {
    url,
    title,
    text,
    ogImage: firstImage(partition.eligible),
    eligibleCount: partition.eligible.length,
    totalCount: locs.length,
    excludedCount: partition.excluded.length,
  };
}
