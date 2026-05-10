/**
 * popup-collections-mount — helper único transversal para hidratar el bloque
 * de hashtags de colecciones dentro del popup del mapa.
 *
 * El popup emite un nodo estable `[data-collections-root="<locationId>"]`
 * (helper `buildCollectionChipsPlaceholder` en `map-popups.ts`) y este módulo
 * monta dentro el componente React único `LocationCollectionChips`, que ya
 * usan la ficha lateral y el resto de vistas.
 *
 * Por qué un mount React (en vez de inyección HTML asíncrona):
 *  - misma fuente de datos transversal que la ficha lateral (useLocationCollections)
 *  - sin caché de "vacío" ni reintentos con setTimeout
 *  - re-renderiza solo cuando cambian las colecciones del punto
 *  - sobrevive a `setPopupContent` (regeneración del popup tras enrichment,
 *    notas o fotos) gracias al MutationObserver sobre el contenido del popup.
 */
import L from 'leaflet';
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { LocationCollectionChips } from '@/domains/content/components/LocationCollectionChips';

interface MountState {
  observer: MutationObserver | null;
  root: Root | null;
  host: HTMLElement | null;
}

const states = new WeakMap<L.Marker, MountState>();

function findHost(el: HTMLElement, locationId: string): HTMLElement | null {
  return el.querySelector(
    `[data-collections-root="${CSS.escape(locationId)}"]`,
  ) as HTMLElement | null;
}

function mountInto(host: HTMLElement, locationId: string): Root {
  const root = createRoot(host);
  root.render(
    React.createElement(LocationCollectionChips, {
      locationId,
      className: 'justify-center',
    }),
  );
  return root;
}

function unmountRoot(root: Root | null) {
  if (!root) return;
  // Defer to avoid React unmount-during-render warning.
  setTimeout(() => {
    try { root.unmount(); } catch { /* noop */ }
  }, 0);
}

export function bindCollectionsMount(
  marker: L.Marker,
  getLocationId: () => string | undefined,
): void {
  marker.on('popupopen', (e: L.LeafletEvent) => {
    const popup = (e as L.PopupEvent).popup;
    const popupEl = popup?.getElement() as HTMLElement | undefined;
    if (!popupEl) return;
    const contentEl = popupEl.querySelector('.leaflet-popup-content') as HTMLElement | null;
    if (!contentEl) return;

    const ensure = () => {
      const locId = getLocationId();
      if (!locId) return;
      const host = findHost(contentEl, locId);
      const state = states.get(marker);
      if (!host) {
        // Popup content regenerated without our host: drop previous mount.
        if (state?.root) {
          unmountRoot(state.root);
          states.set(marker, { ...(state ?? { observer: null, root: null, host: null }), root: null, host: null });
        }
        return;
      }
      // If host already mounted, nothing to do.
      if (state?.host === host && state.root) return;
      // Otherwise: unmount old, mount fresh on the new host.
      if (state?.root) unmountRoot(state.root);
      const root = mountInto(host, locId);
      states.set(marker, {
        observer: state?.observer ?? null,
        root,
        host,
      });
    };

    // Initial mount.
    ensure();

    // Re-hydrate on every popup content mutation (covers setPopupContent
    // while the popup is open — enrichment, notes, photos…).
    const observer = new MutationObserver(() => ensure());
    observer.observe(contentEl, { childList: true, subtree: true });

    const prev = states.get(marker);
    states.set(marker, {
      observer,
      root: prev?.root ?? null,
      host: prev?.host ?? null,
    });
  });

  marker.on('popupclose', () => {
    const state = states.get(marker);
    if (!state) return;
    state.observer?.disconnect();
    unmountRoot(state.root);
    states.delete(marker);
  });
}
