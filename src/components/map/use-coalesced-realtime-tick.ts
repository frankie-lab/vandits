/**
 * useCoalescedRealtimeTick — Helper único transversal para colapsar ráfagas de
 * eventos `location-realtime-update` / `store-updated` en una sola actualización
 * trailing-debounced. Reutilizado por LocationMap (para refrescar sólo los
 * marcadores afectados) y por FloatingToolbar (para refrescar contadores).
 *
 * Motivación: durante batch-enrich llegan UPDATEs cada ~500ms. Sin colapsar,
 * cada uno provoca un re-render completo del mapa de 2k+ líneas y bloquea el
 * hilo principal, hasta el punto de que Leaflet no consigue hidratar los
 * tiles y el mapa se queda en gris.
 *
 * - Mantiene un Set<string> de los locationId tocados desde el último flush.
 * - `kind: 'invalidateAll'` o evento sin detail → marca un flush "todos".
 * - Flushea con trailing debounce y `requestIdleCallback` cuando esté disponible.
 */
import { useEffect, useRef } from 'react';

export type RealtimeTickPayload = {
  /** IDs concretos que cambiaron desde el último flush; null = invalidar todo. */
  ids: Set<string> | null;
};

export interface UseCoalescedRealtimeTickOptions {
  /** Ventana de coalescing en ms. Default 350. */
  delayMs?: number;
  /** Si true, también escucha `store-updated`. Default true. */
  listenStoreUpdated?: boolean;
}

export function useCoalescedRealtimeTick(
  onTick: (payload: RealtimeTickPayload) => void,
  opts: UseCoalescedRealtimeTickOptions = {},
) {
  const { delayMs = 350, listenStoreUpdated = true } = opts;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    let timer: number | null = null;
    let idleHandle: number | null = null;
    const pendingIds = new Set<string>();
    let invalidateAll = false;

    const flush = () => {
      const payload: RealtimeTickPayload = invalidateAll
        ? { ids: null }
        : { ids: new Set(pendingIds) };
      pendingIds.clear();
      invalidateAll = false;
      try {
        onTickRef.current(payload);
      } catch (e) {
        console.warn('[coalesced-realtime-tick] handler error', e);
      }
    };

    const schedule = () => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        const ric = (window as any).requestIdleCallback as
          | ((cb: () => void, opts?: { timeout: number }) => number)
          | undefined;
        if (ric) {
          idleHandle = ric(() => {
            idleHandle = null;
            flush();
          }, { timeout: 200 });
        } else {
          flush();
        }
      }, delayMs);
    };

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail as { locationId?: string } | undefined;
      if (detail?.locationId) {
        pendingIds.add(detail.locationId);
      } else {
        invalidateAll = true;
      }
      schedule();
    };

    // `location:enriched` es el contrato canónico de refresco tras enrich
    // success. Lo enrutamos al mismo flush para que el popup HTML + icon del
    // marker afectado se regeneren in-place sin depender de focusAfter.
    // Ver mem://logic/content/enrichment-trigger-unified.
    const handleEnriched = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (detail?.id) {
        pendingIds.add(detail.id);
      } else {
        invalidateAll = true;
      }
      schedule();
    };

    const handleStore = () => {
      invalidateAll = true;
      schedule();
    };

    window.addEventListener('location-realtime-update', handleRealtime);
    window.addEventListener('location:enriched', handleEnriched);
    if (listenStoreUpdated) window.addEventListener('store-updated', handleStore);

    return () => {
      window.removeEventListener('location-realtime-update', handleRealtime);
      window.removeEventListener('location:enriched', handleEnriched);
      if (listenStoreUpdated) window.removeEventListener('store-updated', handleStore);
      if (timer != null) window.clearTimeout(timer);
      const cic = (window as any).cancelIdleCallback as ((h: number) => void) | undefined;
      if (idleHandle != null && cic) cic(idleHandle);
    };
  }, [delayMs, listenStoreUpdated]);
}
