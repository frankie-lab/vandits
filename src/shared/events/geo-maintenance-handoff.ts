/**
 * Geo Maintenance handoff bridge.
 *
 * Permite que un origen (p.ej. `HealthRepairPreviewDialog` grupo B) envíe un
 * scope explícito de `locationIds` al `GeographyBackfillPanel` SIN ejecutar
 * ninguna escritura. El panel destino debe mostrar preview + requerir
 * confirmación humana antes de lanzar el job.
 *
 * Reglas DURAS:
 *   - El emisor SOLO empaqueta IDs ya filtrados por Root Status (B).
 *   - El handoff NO ejecuta backfill: solo preselecciona y pinta banner.
 *   - Si el panel destino no está montado al despachar, el payload se guarda
 *     en `pendingHandoff` y lo consume el próximo mount.
 *   - Cualquier consumo limpia el pending.
 *
 * Ver `docs/audits/root-status-b-geo-maintenance-scoped-plan.md`.
 */

export const GEO_MAINTENANCE_HANDOFF_EVENT = 'lovable:open-geo-maintenance-scoped';

export type GeoMaintenanceHandoffSource = 'health-repair-triage';

export interface GeoMaintenanceHandoffPayload {
  /** UUIDs del subconjunto a preseleccionar en el panel destino. */
  locationIds: string[];
  /** Origen del handoff (para banner y telemetría). */
  source: GeoMaintenanceHandoffSource;
  /** Etiqueta humana para el banner ("Resolver deuda · Grupo B · 12 puntos"). */
  label: string;
  /** Marca temporal de emisión (ms). */
  emittedAt: number;
}

let pendingHandoff: GeoMaintenanceHandoffPayload | null = null;

/**
 * Despacha el handoff y lo deja en `pending` para el próximo mount del panel.
 * No navega — el caller decide cómo abrir `/admin/geography`.
 */
export function dispatchGeoMaintenanceHandoff(
  payload: Omit<GeoMaintenanceHandoffPayload, 'emittedAt'>,
): GeoMaintenanceHandoffPayload {
  const full: GeoMaintenanceHandoffPayload = { ...payload, emittedAt: Date.now() };
  pendingHandoff = full;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GEO_MAINTENANCE_HANDOFF_EVENT, { detail: full }));
  }
  return full;
}

/** Devuelve y limpia el handoff pendiente (consumido por el panel al montar). */
export function consumePendingGeoMaintenanceHandoff(): GeoMaintenanceHandoffPayload | null {
  const p = pendingHandoff;
  pendingHandoff = null;
  return p;
}

/** Permite inspeccionar sin consumir (tests). */
export function peekPendingGeoMaintenanceHandoff(): GeoMaintenanceHandoffPayload | null {
  return pendingHandoff;
}

/** Helper de suscripción tipada. Devuelve cleanup. */
export function subscribeGeoMaintenanceHandoff(
  cb: (payload: GeoMaintenanceHandoffPayload) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (evt: Event) => {
    const detail = (evt as CustomEvent<GeoMaintenanceHandoffPayload>).detail;
    if (detail && Array.isArray(detail.locationIds)) cb(detail);
  };
  window.addEventListener(GEO_MAINTENANCE_HANDOFF_EVENT, handler as EventListener);
  return () => window.removeEventListener(GEO_MAINTENANCE_HANDOFF_EVENT, handler as EventListener);
}

/**
 * Navega al panel destino. Idempotente: si ya estamos en `/admin/geography`
 * no recarga. Usa `history.pushState` en lugar de `assign` para no perder el
 * estado react-router.
 */
export function navigateToGeoMaintenance(): void {
  if (typeof window === 'undefined') return;
  const target = '/admin/geography';
  if (window.location.pathname === target) return;
  window.history.pushState({}, '', target);
  // Notifica a react-router (escucha `popstate`).
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Solo tests. */
export function __resetGeoMaintenanceHandoffForTests(): void {
  pendingHandoff = null;
}
