/**
 * popup-recovery-mount — helper único para hidratar <UnenrichedRecoveryBlock>
 * dentro del popup del mapa.
 *
 * Cualquier marcador del mapa, al abrir su popup, busca un nodo
 * `[data-recovery-root="<locationId>"]` (emitido por createPopupContent SOLO
 * cuando el POI no está enriquecido) y monta ahí el componente React único de
 * recuperación. Al cerrar el popup, se desmonta para no dejar roots huérfanas.
 *
 * Ver mem://logic/enrichment/per-poi-recovery-block
 */
import L from 'leaflet';
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { GeoLocation } from '@/types/location';
import { UnenrichedRecoveryBlock } from '@/domains/content/components/UnenrichedRecoveryBlock';

const roots = new WeakMap<HTMLElement, Root>();

export function bindRecoveryMount(
  marker: L.Marker,
  getLocation: () => GeoLocation | undefined,
): void {
  marker.on('popupopen', (e: L.LeafletEvent) => {
    const popup = (e as any).popup as L.Popup | undefined;
    const el = popup?.getElement() as HTMLElement | undefined;
    const location = getLocation();
    if (!el || !location) return;
    const host = el.querySelector(
      `[data-recovery-root="${CSS.escape(location.id)}"]`,
    ) as HTMLElement | null;
    if (!host) return;
    let root = roots.get(host);
    if (!root) {
      root = createRoot(host);
      roots.set(host, root);
    }
    root.render(React.createElement(UnenrichedRecoveryBlock, { location, variant: 'card' }));
  });

  marker.on('popupclose', (e: L.LeafletEvent) => {
    const popup = (e as any).popup as L.Popup | undefined;
    const el = popup?.getElement() as HTMLElement | undefined;
    if (!el) return;
    const hosts = el.querySelectorAll('[data-recovery-root]');
    hosts.forEach((h) => {
      const host = h as HTMLElement;
      const root = roots.get(host);
      if (root) {
        // Defer unmount to avoid React warning when called sync during render.
        setTimeout(() => {
          try { root.unmount(); } catch {}
          roots.delete(host);
        }, 0);
      }
    });
  });
}
