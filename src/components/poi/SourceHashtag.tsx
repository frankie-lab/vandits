/**
 * SourceHashtag — chip clicable para mostrar el origen de un POI en
 * fichas/popups/cards (PR-POI-SOURCE-3).
 *
 * Diseño:
 *   - Lee el origen via `resolvePoiSource(viewerUid, poi)` y pinta cada
 *     hashtag como un chip clicable.
 *   - Click dispara `setFilters({ filterBySource: { type, id, label } })`
 *     mediante el evento global `lovable:apply-source-filter`. Listener
 *     único en `App` (o `LocationMap`) hace el setFilters real, evitando
 *     que cada componente importe el store.
 *
 * Sin emojis. Sin colores hardcoded — usa tokens semánticos del DS.
 */

import { useMemo } from 'react';
import type { GeoLocation } from '@/types/location';
import {
  resolvePoiSource,
  type PoiSourceType,
  type UsernameLookup,
} from '@/domains/content/lib/poi-source';

export interface SourceHashtagProps {
  poi: GeoLocation;
  viewerUid: string | null;
  /** Resolver opcional uid -> username para etiquetas legibles. */
  usernameLookup?: UsernameLookup;
  /** Callback alternativo si no quieres usar el evento global. */
  onApplyFilter?: (filter: { type: PoiSourceType; id: string; label: string }) => void;
  className?: string;
}

export const SOURCE_FILTER_EVENT = 'lovable:apply-source-filter';

export interface SourceFilterEventDetail {
  type: PoiSourceType;
  id: string;
  label: string;
}

export function dispatchSourceFilter(detail: SourceFilterEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SOURCE_FILTER_EVENT, { detail }));
}

export function SourceHashtag({
  poi,
  viewerUid,
  usernameLookup,
  onApplyFilter,
  className,
}: SourceHashtagProps) {
  const source = useMemo(
    () => resolvePoiSource(viewerUid, poi, { usernameLookup }),
    [viewerUid, poi, usernameLookup],
  );

  if (source.hashtags.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ''}`}>
      {source.hashtags.map((tag, idx) => {
        // El primer hashtag identifica al owner / source / app raíz.
        // Los siguientes (en app) son groupId.
        const isPrimary = idx === 0;
        const filterId = isPrimary
          ? source.type === 'own' || source.type === 'followed'
            ? source.ownerUid ?? tag
            : source.sourceId ?? tag
          : tag; // groupId
        if (!filterId) return null;
        const filter: SourceFilterEventDetail = {
          type: source.type,
          id: filterId,
          label: tag,
        };
        return (
          <button
            key={`${tag}-${idx}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onApplyFilter) onApplyFilter(filter);
              else dispatchSourceFilter(filter);
            }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
            title={`Filtrar por #${tag}`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}
