/**
 * use-my-catalog-popover-fit.ts — Subset-fit del popover "mis POI" (PR 1).
 *
 * Hook hermano (NO sustituto) de `useHealthFilterFit`. Solo escucha el
 * evento dedicado `lovable:my-catalog-popover-applied` que emite
 * `MyCatalogQuickFilters`. Esto garantiza que:
 *
 *   - FilterBar visualState (si se añade en el futuro) NO mueve cámara.
 *   - El popover SIEMPRE encuadra (visual / health / "Ver todos").
 *   - No se duplica el comportamiento de salud que ya gobierna FilterBar:
 *     cuando el filtro de salud viene del popover el evento manda; cuando
 *     viene de FilterBar es `useHealthFilterFit` quien dispara.
 *
 * Política:
 *   - Modo `if-outside`, `minZoom: 7` (alineado con health en FilterBar).
 *   - Universo: `mine` (POIs cuyo owner === user.id).
 *   - Subset:
 *       axis='visual'  → getPointVisualState(loc) === value.
 *       axis='health'  → getPointHealthRings(loc).includes(value).
 *       axis='all'     → todo el universo `mine`.
 *   - Subset vacío → no dispara fit, emite `lovable:my-catalog-popover-empty`
 *     para que el popover muestre estado vacío (no se inventa fit a 0 ids).
 *
 * Ver mem://logic/map/subset-fit-contract y mem://ui/filter-axes-norm.
 */

import { useEffect, useRef } from 'react';
import { requestSubsetFit } from '@/components/map/subset-fit';
import { getPointVisualState } from '@/domains/content/lib/point-visual-state';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';
import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';
import { useLocationsStore } from '@/domains/content/store/locations-store';
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
 * Monta UNA vez (en FloatingToolbar). Escucha el evento del popover y
 * dispara `requestSubsetFit`.
 */
export function useMyCatalogPopoverFit(currentUserId: string | null | undefined): void {
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MyCatalogPopoverAppliedDetail>).detail;
      if (!detail) return;

      const uid = userIdRef.current;
      if (!uid) return;

      const all = useLocationsStore.getState().getAllLocations() as GeoLocation[];
      // Universo "mine" (alineado con el matcher: owner resolver canónico).
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

      if (subset.length === 0) {
        window.dispatchEvent(
          new CustomEvent<MyCatalogPopoverEmptyDetail>(MY_CATALOG_POPOVER_EMPTY_EVENT, {
            detail: { axis: detail.axis, value: detail.value },
          }),
        );
        return;
      }

      const reason =
        detail.axis === 'all'
          ? 'my-catalog-popover:all'
          : `my-catalog-popover:${detail.axis}:${String(detail.value)}`;

      requestSubsetFit(
        subset.map((l) => l.id),
        { mode: 'if-outside', reason, minZoom: 7 },
      );
    };

    window.addEventListener(MY_CATALOG_POPOVER_APPLIED_EVENT, handler);
    return () => window.removeEventListener(MY_CATALOG_POPOVER_APPLIED_EVENT, handler);
  }, []);
}

/**
 * Helper para emitir el evento desde el popover. Mantiene el contrato
 * en un único sitio (consumidor + emisor leen el mismo símbolo).
 */
export function emitMyCatalogPopoverApplied(detail: MyCatalogPopoverAppliedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<MyCatalogPopoverAppliedDetail>(MY_CATALOG_POPOVER_APPLIED_EVENT, { detail }),
  );
}
