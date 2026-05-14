/**
 * useZoomGates — hook trivial que expone los zoom gates canónicos para el
 * pipeline de visibilidad de POIs (`resolveLayerVisibility`).
 *
 * Hoy devuelve constantes; en el futuro leerá de `app_settings` con un
 * listener al evento `app-settings-changed` para refresco en caliente.
 */
import { useMemo } from 'react';
import { DEFAULT_ZOOM_GATES, type ZoomGates } from '@/domains/content/lib/poi-layer';

export function useZoomGates(): ZoomGates {
  return useMemo(() => ({ ...DEFAULT_ZOOM_GATES }), []);
}
