/**
 * SourceFilterBridge — listener global para `lovable:apply-source-filter`
 * + delegación DOM sobre `.source-filter-chip` (popups Leaflet HTML).
 *
 * Cuando un `<SourceHashtag />` (React, fichas) o un chip `.source-filter-chip`
 * (HTML, popups del mapa) se activan, este puente:
 *   1. Aplica `filterBySource` canónico en `useLocationsStore`.
 *   2. Mantiene el alias legacy `filterByUserId` sincronizado.
 *   3. Solicita `requestSubsetFit({ reason: 'source-filter' })` con los IDs
 *      del subconjunto resultante para encuadrar el mapa.
 *
 * No-op cuando se hace toggle off (quitar filtro) — el mapa conserva el
 * viewport actual.
 */

import { useEffect } from 'react';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import { requestSubsetFit } from '@/components/map/subset-fit';
import {
  SOURCE_FILTER_EVENT,
  dispatchSourceFilter,
  type SourceFilterEventDetail,
} from '@/components/poi/SourceHashtag';
import type { PoiSourceType } from '@/domains/content/lib/poi-source';

const POPUP_CHIP_SELECTOR = '.source-filter-chip';

function applySourceFilter(detail: SourceFilterEventDetail): void {
  const { type, id, label } = detail;
  const store = useLocationsStore.getState();
  const current = store.filters;

  // Toggle: si ya está aplicado el mismo filtro, lo quitamos.
  const isActive =
    current.filterBySource?.type === type && current.filterBySource?.id === id;

  const nextFilters = {
    ...current,
    filterBySource: isActive ? undefined : { type, id, label },
    // Alias legacy: solo own/followed
    filterByUserId: isActive
      ? undefined
      : type === 'own' || type === 'followed'
        ? id
        : undefined,
    filterByUserName: isActive
      ? undefined
      : type === 'own' || type === 'followed'
        ? label
        : undefined,
  };
  store.setFilters(nextFilters);

  // Subset fit: solo cuando ACTIVAMOS un filtro (no al quitarlo). Calculamos
  // los IDs y coords del subconjunto pasando el filtro recién aplicado por el
  // matcher transversal. `reason='source-filter'` para telemetría/cooldown.
  if (!isActive) {
    const all = useLocationsStore.getState().locations;
    const ids: string[] = [];
    const coords: Array<[number, number]> = [];
    for (const loc of all) {
      if (matchesLocationFilters(loc, nextFilters, { collectionsForLocation: () => [] })) {
        ids.push(loc.id);
        if (loc.coordinates) coords.push([loc.coordinates.lat, loc.coordinates.lng]);
      }
    }
    if (ids.length > 0) {
      requestSubsetFit(ids, {
        reason: 'source-filter',
        mode: 'if-outside',
        coords,
      });
    }
  }
}

export function SourceFilterBridge() {
  useEffect(() => {
    // 1) React-side: SourceHashtag.tsx dispara el evento canónico.
    const eventHandler = (e: Event) => {
      const detail = (e as CustomEvent<SourceFilterEventDetail>).detail;
      if (!detail) return;
      applySourceFilter(detail);
    };
    window.addEventListener(SOURCE_FILTER_EVENT, eventHandler);

    // 2) DOM-side: popups Leaflet emiten HTML con `.source-filter-chip`.
    //    Delegación a nivel document (los popups se montan/desmontan
    //    fuera del árbol React).
    const domHandler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.(POPUP_CHIP_SELECTOR) as HTMLElement | null;
      if (!target) return;
      const type = target.dataset.sourceType as PoiSourceType | undefined;
      const id = target.dataset.sourceId;
      const label = target.dataset.sourceLabel ?? id ?? '';
      if (!type || !id) return;
      e.preventDefault();
      e.stopPropagation();
      dispatchSourceFilter({ type, id, label });
    };
    document.addEventListener('click', domHandler);

    return () => {
      window.removeEventListener(SOURCE_FILTER_EVENT, eventHandler);
      document.removeEventListener('click', domHandler);
    };
  }, []);
  return null;
}
