/**
 * use-health-filter-fit.ts — Hook canónico (PR-A).
 *
 * Cuando el usuario activa un chip del eje "Salud" (partial / chain /
 * review / hardError) o cambia entre chips, el mapa hace fit `if-outside`
 * al subconjunto correspondiente.
 *
 * Reglas (alineadas con el subset-fit contract):
 *  - Solo `healthFilter ∈ {partial, chain, review, hardError}` mueve cámara.
 *  - Geo / Tipo / Tags / búsqueda NO mueven cámara (no son input de este hook).
 *  - Universo lógico: `filteredLocations` (NUNCA `markerLocations` ni
 *    viewport-culling). El subset se calcula vía `getPointHealthRings`.
 *  - Side-effect VIVE EN UI (FilterBar), no en stores.
 *  - Primer render con filtro persistido desde sessionStorage → no-op
 *    (evita fit no solicitado al recargar).
 *  - Solo reacciona a cambios de VALOR de `healthFilter`. Cambios en
 *    `filteredLocations` por sí solos NO disparan fit (evita ruido por
 *    realtime, geocoding, etc.). El listener del mapa aplica clamp z12,
 *    umbral if-outside 40 % y cooldown manual 4 s.
 *
 * Ver mem://logic/map/subset-fit-contract y mem://ui/discovery/panel-modes.
 */

import { useEffect, useRef } from 'react';
import { requestSubsetFit } from '@/components/map/subset-fit';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';
import type { GeoLocation, HealthFilter } from '@/types/location';

export function useHealthFilterFit(
  healthFilter: HealthFilter | null | undefined,
  filteredLocations: ReadonlyArray<GeoLocation>,
): void {
  // Snapshot estable del último valor disparado. Empieza en `undefined`
  // para que el primer render NUNCA dispare fit, incluso si el filtro
  // ya viene activo desde sessionStorage.
  const lastValueRef = useRef<HealthFilter | null | undefined>(undefined);
  // Mantenemos las locations en ref para que el effect pueda leer el
  // universo actual sin depender de él (evita disparos por mutaciones
  // ajenas al chip).
  const locationsRef = useRef(filteredLocations);
  locationsRef.current = filteredLocations;

  useEffect(() => {
    const prev = lastValueRef.current;
    const next = healthFilter ?? null;

    // Primer render: registrar y salir sin disparar.
    if (prev === undefined) {
      lastValueRef.current = next;
      return;
    }

    // Sin cambio real de valor → nada que hacer.
    if (prev === next) return;
    lastValueRef.current = next;

    // Desactivado o sin valor → no se mueve cámara.
    if (!next) return;

    const universe = locationsRef.current;
    if (!universe || universe.length === 0) return;

    const ids: string[] = [];
    for (const loc of universe) {
      if (getPointHealthRings(loc).includes(next)) ids.push(loc.id);
    }
    if (ids.length === 0) return;

    requestSubsetFit(ids, {
      mode: 'if-outside',
      reason: `health-filter:${next}`,
      // Piso z7: primer escalón compact donde los aros amber/yellow son
      // visibles. Sin esto, 19 puntos dispersos por España aterrizan en
      // z≈5 (banda micro, sin rings).
      minZoom: 7,
    });
  }, [healthFilter]);
}
