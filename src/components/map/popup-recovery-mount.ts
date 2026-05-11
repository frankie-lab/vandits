/**
 * popup-recovery-mount — helper único para hidratar <UnenrichedRecoveryBlock>
 * dentro del popup del mapa.
 *
 * El popup se regenera entero vía `marker.setPopupContent(...)` desde varios
 * sitios (subscripción a collections-store y efecto de `locations` en
 * LocationMap). Cada regeneración reemplaza el host `[data-recovery-root]`,
 * por lo que NO basta con montar React en `popupopen`: hay que reaccionar a
 * cada reemplazo del nodo.
 *
 * Estrategia: al abrir el popup, instalamos un `MutationObserver` sobre el
 * elemento del popup. Cada vez que aparece un host nuevo, desmontamos el
 * root viejo (si lo hubiera) y creamos uno fresco en el host actual.
 *
 * Ver mem://logic/enrichment/per-poi-recovery-block
 */
import L from 'leaflet';
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { GeoLocation } from '@/types/location';
import { UnenrichedRecoveryBlock } from '@/domains/content/components/UnenrichedRecoveryBlock';

type Entry = {
  observer: MutationObserver;
  root: Root | null;
  host: HTMLElement | null;
};

const entries = new WeakMap<L.Marker, Entry>();

function unmountRoot(entry: Entry) {
  const root = entry.root;
  entry.root = null;
  entry.host = null;
  if (root) {
    // Defer to avoid React "unmount during render" warning.
    setTimeout(() => {
      try {
        root.unmount();
      } catch {
        /* noop */
      }
    }, 0);
  }
}

export function bindRecoveryMount(
  marker: L.Marker,
  getLocation: () => GeoLocation | undefined,
): void {
  marker.on('popupopen', (e: L.LeafletEvent) => {
    const popup = (e as any).popup as L.Popup | undefined;
    const popupEl = popup?.getElement() as HTMLElement | undefined;
    if (!popupEl) return;

    // If a previous entry exists (shouldn't, but be safe), tear it down.
    const previous = entries.get(marker);
    if (previous) {
      previous.observer.disconnect();
      unmountRoot(previous);
      entries.delete(marker);
    }

    const entry: Entry = { observer: null as any, root: null, host: null };

    const mountInto = () => {
      const location = getLocation();
      if (!location) return;
      const host = popupEl.querySelector(
        `[data-recovery-root="${CSS.escape(location.id)}"]`,
      ) as HTMLElement | null;
      if (!host) return;
      if (host === entry.host && entry.root) {
        // Same host — re-render keeps the component in sync without unmounting.
        entry.root.render(
          React.createElement(UnenrichedRecoveryBlock, { location, variant: 'card' }),
        );
        return;
      }
      // Host changed (popup HTML was regenerated) — discard old root and remount.
      if (entry.root) {
        const old = entry.root;
        entry.root = null;
        try {
          old.unmount();
        } catch {
          /* noop */
        }
      }
      entry.host = host;
      entry.root = createRoot(host);
      entry.root.render(
        React.createElement(UnenrichedRecoveryBlock, { location, variant: 'card' }),
      );
    };

    const observer = new MutationObserver(() => {
      // Cheap idempotent check; mountInto bails when host is unchanged.
      mountInto();
    });
    entry.observer = observer;
    entries.set(marker, entry);

    // Initial mount + watch for subsequent setPopupContent replacements.
    mountInto();
    observer.observe(popupEl, { childList: true, subtree: true });
  });

  marker.on('popupclose', () => {
    const entry = entries.get(marker);
    if (!entry) return;
    entry.observer.disconnect();
    unmountRoot(entry);
    entries.delete(marker);
  });
}
