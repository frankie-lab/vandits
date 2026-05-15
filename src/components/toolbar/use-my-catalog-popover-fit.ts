/**
 * use-my-catalog-popover-fit.ts — Subset-fit del popover "mis POI".
 *
 * Hook hermano (NO sustituto) de `useHealthFilterFit`. Solo escucha el
 * evento dedicado `lovable:my-catalog-popover-applied` que emite
 * `MyCatalogQuickFilters`. Esto garantiza que:
 *
 *   - FilterBar visualState (si se añade en el futuro) NO mueve cámara.
 *   - El popover SIEMPRE encuadra (visual / health / "Ver todos").
 *
 * Política:
 *   - Modo `always` (acción explícita del usuario → siempre encuadra).
 *   - Sin `minZoom`: el subset puede ser disperso y requerir z<7 para verse íntegro.
 *   - Coords pre-resueltas desde el subset filtrado (NO desde markersRef):
 *     evita fits parciales bajo viewport culling.
 *   - Universo: `mine` (POIs cuyo owner === user.id).
 *   - Subset vacío → no dispara fit, emite `lovable:my-catalog-popover-empty`.
 *
 * Cierre de operaciones (PR 2):
 *   - Cada axis/value tiene un `operationId` reproducible (ver
 *     `buildMyCatalogPopoverOpId`). Tras procesar el evento se invoca
 *     `finishOperation(opId, { resultLabel })` con:
 *       'Filtro aplicado' (subset > 0) — significa "fit solicitado", no
 *         "encuadre completado": no hay confirmación real del fit.
 *       'Sin resultados'  (subset = 0).
 *
 * Ver mem://logic/map/subset-fit-contract, mem://ui/filter-axes-norm,
 * mem://logic/operations/heavy-operations-feedback.
 */

import { useEffect, useRef } from 'react';
import { requestSubsetFit } from '@/components/map/subset-fit';
import { traceCameraFit } from '@/components/debug/camera-fit-trace';
import { getPointVisualState } from '@/domains/content/lib/point-visual-state';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';
import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { finishOperation } from '@/shared/operations/heavy-operations-store';
import type { GeoLocation, VisualStateFilter, HealthFilter } from '@/types/location';

export const MY_CATALOG_POPOVER_APPLIED_EVENT = 'lovable:my-catalog-popover-applied';
export const MY_CATALOG_POPOVER_EMPTY_EVENT = 'lovable:my-catalog-popover-empty';

export type MyCatalogPopoverAxis = 'visual' | 'health' | 'all';

export interface MyCatalogPopoverAppliedDetail {
  axis: MyCatalogPopoverAxis;
  value: VisualStateFilter | HealthFilter | null;
}

export interface MyCatalogPopoverEmptyDetail {
  axis: MyCatalogPopoverAxis;
  value: VisualStateFilter | HealthFilter | null;
}

/**
 * Single source of truth for the operationId tied to each popover action.
 * Both the emitter (popover button) and the listener (this hook) call it,
 * so finish/start always agree on the id.
 */
export function buildMyCatalogPopoverOpId(detail: MyCatalogPopoverAppliedDetail): string {
  if (detail.axis === 'all' || detail.value == null) {
    return 'my-catalog-popover:all';
  }
  return `my-catalog-popover:${detail.axis}:${String(detail.value)}`;
}

/**
 * Monta UNA vez (en FloatingToolbar). Escucha el evento del popover y
 * dispara `requestSubsetFit`.
 */
export function useMyCatalogPopoverFit(currentUserId: string | null | undefined): void {
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MyCatalogPopoverAppliedDetail>).detail;
      traceCameraFit('popover-fit handler RECEIVED event', { detail });
      if (!detail) return;

      const opId = buildMyCatalogPopoverOpId(detail);
      const uid = userIdRef.current;
      if (!uid) {
        traceCameraFit('popover-fit ABORT: no uid (currentUserId=null)');
        finishOperation(opId, { resultLabel: 'Filtro aplicado' });
        return;
      }

      const all = useLocationsStore.getState().getAllLocations() as GeoLocation[];
      const mine: GeoLocation[] = [];
      for (const loc of all) {
        if (getLocationOwnerUserId(loc as any) === uid) mine.push(loc);
      }

      let subset: GeoLocation[] = [];
      if (detail.axis === 'all' || detail.value == null) {
        subset = mine;
      } else if (detail.axis === 'visual') {
        const v = detail.value as VisualStateFilter;
        for (const loc of mine) {
          if (getPointVisualState(loc) === v) subset.push(loc);
        }
      } else if (detail.axis === 'health') {
        const h = detail.value as HealthFilter;
        for (const loc of mine) {
          if (getPointHealthRings(loc).includes(h)) subset.push(loc);
        }
      }

      traceCameraFit('popover-fit subset computed', {
        uid,
        allCount: all.length,
        mineCount: mine.length,
        subsetCount: subset.length,
        axis: detail.axis,
        value: detail.value,
      });

      if (subset.length === 0) {
        traceCameraFit('popover-fit ABORT: subset.length === 0 (emitiendo MY_CATALOG_POPOVER_EMPTY_EVENT)');
        window.dispatchEvent(
          new CustomEvent<MyCatalogPopoverEmptyDetail>(MY_CATALOG_POPOVER_EMPTY_EVENT, {
            detail: { axis: detail.axis, value: detail.value },
          }),
        );
        finishOperation(opId, { resultLabel: 'Sin resultados' });
        return;
      }

      const reason =
        detail.axis === 'all'
          ? 'my-catalog-popover:all'
          : `my-catalog-popover:${detail.axis}:${String(detail.value)}`;

      // Coords pre-resueltas desde el subset filtrado: evita que el listener
      // resuelva bounds desde markersRef (viewport culling produciría fit
      // parcial). Solo entran POIs con lat/lng numéricos finitos.
      // Shape canónico GeoLocation: loc.coordinates.{lat,lng}. Los fallbacks
      // legacy (loc.latitude/longitude, loc.lat/lng) se mantienen por
      // defensa, pero el path principal es coordinates.{lat,lng}.
      const coords: Array<[number, number]> = [];
      const ids: string[] = [];
      for (const loc of subset) {
        const c = getLocationCoords(loc);
        if (c) {
          coords.push(c);
          ids.push(loc.id);
        }
      }

      traceCameraFit('popover-fit coords resolved', {
        subsetCount: subset.length,
        idsCount: ids.length,
        coordsCount: coords.length,
        droppedNoCoords: subset.length - ids.length,
      });

      if (ids.length === 0) {
        traceCameraFit('popover-fit ABORT: ids.length === 0 después de filtrar coords inválidas');
        finishOperation(opId, { resultLabel: 'Filtro aplicado' });
        return;
      }

      traceCameraFit('popover-fit requestSubsetFit', {
        reason,
        mode: 'always',
        idsCount: ids.length,
        coordsCount: coords.length,
      });
      requestSubsetFit(ids, { mode: 'always', reason, coords });
      // No hay confirmación real del fit en Fase 1: cerramos como
      // "Filtro aplicado" (operación lanzada / fit solicitado).
      finishOperation(opId, { resultLabel: 'Filtro aplicado' });
    };

    window.addEventListener(MY_CATALOG_POPOVER_APPLIED_EVENT, handler);
    traceCameraFit('popover-fit handler MOUNTED', { event: MY_CATALOG_POPOVER_APPLIED_EVENT });
    return () => window.removeEventListener(MY_CATALOG_POPOVER_APPLIED_EVENT, handler);
  }, []);
}

export function emitMyCatalogPopoverApplied(detail: MyCatalogPopoverAppliedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<MyCatalogPopoverAppliedDetail>(MY_CATALOG_POPOVER_APPLIED_EVENT, { detail }),
  );
}
