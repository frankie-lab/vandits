/**
 * subset-fit.ts — Helper único para "haz fit del mapa a este subconjunto de POIs".
 *
 * Contrato canónico (PR-4A.1). Sustituye cualquier llamada directa a
 * `mapRef.flyToBounds`/`fitBounds` desde consolas (FilterBar, diálogos de
 * reparación, selección, etc.).
 *
 * Principio rector: "Filtrar ≠ mover cámara. Seleccionar/Reparar = sí puede
 * mover cámara, con guardarraíles".
 *
 * El listener real vive en LocationMap.tsx y aplica:
 *  - Modo `if-outside` (default): solo encuadra si <40% del subconjunto está
 *    dentro del viewport actual.
 *  - Modo `always`: siempre encuadra.
 *  - Clamp de zoom (≈ z12) para no saltar a z18 con dos puntos juntos.
 *  - Cooldown 4s tras intención manual del usuario (pan/zoom/drag).
 *
 * Ver mem://logic/map/subset-fit-contract y
 * docs/architecture/camera-subset-fit-stabilization-plan.md.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 1 — Freeze + Observability (PR-CAMERA-PHASE-1)
 * ─────────────────────────────────────────────────────────────────────────
 * - `FIT_REASONS` y `FitReason` congelados como enum cerrado (warn en dev
 *   si se usa un valor fuera del enum, sin bloquear runtime).
 * - Observabilidad temporal detrás de flag dev:
 *     localStorage.setItem('vandits_debug_camera_fit', 'true')
 *   En dev este flag se considera ON por defecto. En producción siempre
 *   requiere opt-in explícito.
 * - `window.__cameraFitMetrics` con contadores agregados.
 * - Detección de bypasses (llamadas directas a `L.Map#fitBounds/flyTo/setView`)
 *   vía monkey-patch idempotente cuando el flag está activo.
 * NO cambia comportamiento. Solo instrumenta.
 */

export const SUBSET_FIT_BOUNDS_EVENT = 'subset-fit-bounds-request';

export type SubsetFitMode = 'always' | 'if-outside';

/**
 * Enum cerrado de razones canónicas para mover la cámara via subset-fit.
 *
 * Añadir un nuevo `reason` requiere:
 *  1. Añadirlo aquí.
 *  2. Documentarlo en docs/architecture/camera-subset-fit-stabilization-plan.md §3.3.
 *  3. Anotarlo en mem://logic/map/subset-fit-contract.
 *
 * En Phase 1 los valores nuevos solo emiten warn (no bloquean) para no
 * romper PRs en vuelo. La transición a `error` se hará en Phase 4.
 */
export const FIT_REASONS = [
  // canonical (ya cableados a `requestSubsetFit`)
  'health-repair-preview',
  'health-filter',
  'selection-on-start',
  'my-catalog-popover',
  'user-filter',
  'source-filter',
  // legacy `map-fit-bounds` — pendiente de migración (Phase 3)
  'route-focus',
  'segment-focus',
  'collection-focus',
  'document-focus',
  'document-content',
  'documents-panel',
  'orphan-focus',
  'duplicates-focus',
  'index-route-focus',
  // futuras (Phase 3+)
  'nearby-marker',
  'route-preview',
] as const;

export type FitReason = (typeof FIT_REASONS)[number];

const FIT_REASONS_SET: ReadonlySet<string> = new Set(FIT_REASONS);

/**
 * Phase 1: el tipo público sigue aceptando `string` para no romper callers
 * existentes. Si el valor no pertenece al enum congelado, se loggea warn.
 */
export type FitReasonLoose = FitReason | (string & {});

export interface SubsetFitDetail {
  locationIds: string[];
  mode: SubsetFitMode;
  reason: FitReasonLoose;
  /**
   * Piso de zoom opcional. Si tras calcular el bounds el zoom resultante
   * es menor, el listener fuerza este valor manteniendo el centro.
   * Default `null` = sin piso (retrocompatible).
   */
  minZoom?: number | null;
  /**
   * Coords pre-resueltas opcionales (paralelas a `locationIds`). Si se
   * proporcionan, el listener las usa directamente y NO consulta
   * `markersRef`/`locationsRef`. Útil cuando el caller dispara el fit
   * antes de que el store haya re-renderizado y los markers no están
   * todavía montados (p.ej. filtro por usuario en `UsersSidebar`).
   */
  coords?: Array<[number, number]>;
}

export interface SubsetFitOptions {
  mode?: SubsetFitMode;
  /** Etiqueta de telemetría/debug. Debe pertenecer a `FIT_REASONS`. */
  reason: FitReasonLoose;
  /** Piso de zoom opcional. Ver SubsetFitDetail.minZoom. */
  minZoom?: number | null;
  /** Coords pre-resueltas opcionales. Ver SubsetFitDetail.coords. */
  coords?: Array<[number, number]>;
}

// ──────────────────────────────────────────────────────────────────────────
// Observability (Phase 1)
// ──────────────────────────────────────────────────────────────────────────

const DEBUG_FLAG_KEY = 'vandits_debug_camera_fit';

/**
 * Devuelve true cuando el debug de cámara está activo.
 *  - En dev (import.meta.env.DEV) está ON por defecto, OFF si se setea 'false'.
 *  - En producción está OFF por defecto, ON si se setea 'true'.
 */
export function isCameraFitDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(DEBUG_FLAG_KEY);
  } catch {
    // localStorage puede tirar en algunos contextos; degradar silenciosamente.
  }
  const isDev = !!(import.meta as { env?: { DEV?: boolean } }).env?.DEV;
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return isDev;
}

export interface CameraFitMetrics {
  totalRequests: number;
  byReason: Record<string, number>;
  byMode: Record<SubsetFitMode, number>;
  unknownReasons: Record<string, number>;
  /** Llamadas a `requestSubsetFit` con `coords` pre-resueltas. */
  coordsProvided: number;
  /** Listener resolvió bounds desde markers/locations (sin coords). */
  resolvedFromMarkers: number;
  /** Listener resolvió bounds desde coords del payload. */
  resolvedFromCoords: number;
  /** Veces que el cooldown manual silenció un fit (`mode:if-outside`). */
  cooldownSkipped: number;
  /** Veces que el cooldown se bypaseó (`mode:always` con gesto reciente). */
  cooldownBypassedByAlways: number;
  /** Llamadas directas a Leaflet camera APIs detectadas (bypasses). */
  directLeafletCalls: number;
  /** Detalle de bypasses para inspección en DevTools. */
  bypasses: Array<{ api: string; ts: number; stack?: string }>;
  /** Última request emitida. */
  lastRequest:
    | {
        reason: string;
        mode: SubsetFitMode;
        idsCount: number;
        coordsCount: number;
        ts: number;
      }
    | null;
}

function emptyMetrics(): CameraFitMetrics {
  return {
    totalRequests: 0,
    byReason: {},
    byMode: { always: 0, 'if-outside': 0 },
    unknownReasons: {},
    coordsProvided: 0,
    resolvedFromMarkers: 0,
    resolvedFromCoords: 0,
    cooldownSkipped: 0,
    cooldownBypassedByAlways: 0,
    directLeafletCalls: 0,
    bypasses: [],
    lastRequest: null,
  };
}

declare global {
  interface Window {
    __cameraFitMetrics?: CameraFitMetrics;
    __cameraFitObserverInstalled?: boolean;
  }
}

function getMetrics(): CameraFitMetrics | null {
  if (typeof window === 'undefined') return null;
  if (!window.__cameraFitMetrics) {
    window.__cameraFitMetrics = emptyMetrics();
  }
  return window.__cameraFitMetrics;
}

/** Reset desde DevTools: `window.__cameraFitMetrics = undefined`. */
export function resetCameraFitMetrics(): void {
  if (typeof window === 'undefined') return;
  window.__cameraFitMetrics = emptyMetrics();
}

/**
 * Registrar el resultado del listener (cooldown / bounds source).
 * Llamado desde LocationMap.tsx. No-op si debug OFF.
 */
export function recordFitOutcome(outcome: {
  reason: string;
  mode: SubsetFitMode;
  cooldownSkipped?: boolean;
  cooldownBypassedByAlways?: boolean;
  resolvedFrom?: 'coords' | 'markers';
}): void {
  if (!isCameraFitDebugEnabled()) return;
  const m = getMetrics();
  if (!m) return;
  if (outcome.cooldownSkipped) m.cooldownSkipped++;
  if (outcome.cooldownBypassedByAlways) m.cooldownBypassedByAlways++;
  if (outcome.resolvedFrom === 'coords') m.resolvedFromCoords++;
  if (outcome.resolvedFrom === 'markers') m.resolvedFromMarkers++;
  // eslint-disable-next-line no-console
  console.debug('[camera-fit] outcome', outcome);
}

/**
 * Monkey-patch idempotente de `L.Map.prototype.{fitBounds,flyTo,setView}` para
 * detectar bypasses cuando el debug flag está activo. Cualquier llamada que
 * NO se origine dentro de este módulo (subset-fit.ts) se considera bypass y
 * se registra. NO altera el comportamiento (delega en la implementación
 * original).
 */
export async function installCameraFitObserver(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.__cameraFitObserverInstalled) return;
  if (!isCameraFitDebugEnabled()) return;
  let L: typeof import('leaflet');
  try {
    L = (await import('leaflet')).default ?? (await import('leaflet'));
  } catch {
    return;
  }
  const proto = (L as unknown as { Map: { prototype: Record<string, unknown> } })
    .Map.prototype;
  const wrap = (api: 'fitBounds' | 'flyTo' | 'setView') => {
    const original = proto[api];
    if (typeof original !== 'function') return;
    if ((original as { __cameraFitWrapped?: boolean }).__cameraFitWrapped) return;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      // Heurística: marcar como "internal" cuando el listener canónico
      // dispara la API. Stack contiene `subset-fit` o `LocationMap` y la
      // función handler. Imperfecto pero útil para detectar nuevos bypasses.
      const err = new Error();
      const stack = err.stack ?? '';
      const isInternal =
        stack.includes('subset-fit') ||
        stack.includes('handleSubsetFit') ||
        // listener anónimo en LocationMap.tsx — heurística por línea conocida
        /LocationMap\.tsx:(2[34]\d\d|24\d\d|25\d\d)/.test(stack);
      if (!isInternal) {
        const m = getMetrics();
        if (m) {
          m.directLeafletCalls++;
          if (m.bypasses.length < 50) {
            m.bypasses.push({ api, ts: Date.now(), stack: stack.split('\n').slice(1, 6).join('\n') });
          }
        }
        // eslint-disable-next-line no-console
        console.warn('[camera-fit] bypass', { api, stack: stack.split('\n').slice(1, 4).join('\n') });
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
    (wrapped as { __cameraFitWrapped?: boolean }).__cameraFitWrapped = true;
    proto[api] = wrapped;
  };
  wrap('fitBounds');
  wrap('flyTo');
  wrap('setView');
  window.__cameraFitObserverInstalled = true;
  // eslint-disable-next-line no-console
  console.debug('[camera-fit] observer installed');
}

// Auto-init en browser. Idempotente.
if (typeof window !== 'undefined') {
  // No bloquear el módulo; ejecutar en microtask.
  void installCameraFitObserver();
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Solicita al mapa hacer fit (suave, vía flyToBounds) sobre un subconjunto
 * de POIs identificados por id. No-op en SSR o si no hay ids.
 */
export function requestSubsetFit(
  locationIds: string[],
  opts: SubsetFitOptions,
): void {
  if (typeof window === 'undefined') return;
  if (!Array.isArray(locationIds) || locationIds.length === 0) return;

  const mode: SubsetFitMode = opts.mode ?? 'if-outside';
  const reason = opts.reason;

  const detail: SubsetFitDetail = {
    locationIds: [...locationIds],
    mode,
    reason,
    minZoom: opts.minZoom ?? null,
    coords: opts.coords,
  };

  // Observability: contar antes de despachar.
  if (isCameraFitDebugEnabled()) {
    const m = getMetrics();
    if (m) {
      m.totalRequests++;
      m.byReason[reason] = (m.byReason[reason] ?? 0) + 1;
      m.byMode[mode] = (m.byMode[mode] ?? 0) + 1;
      if (opts.coords && opts.coords.length > 0) m.coordsProvided++;
      if (!FIT_REASONS_SET.has(reason)) {
        m.unknownReasons[reason] = (m.unknownReasons[reason] ?? 0) + 1;
        // eslint-disable-next-line no-console
        console.warn(
          '[camera-fit] unknown reason — añadir a FIT_REASONS y documentar:',
          reason,
        );
      }
      m.lastRequest = {
        reason: String(reason),
        mode,
        idsCount: detail.locationIds.length,
        coordsCount: opts.coords?.length ?? 0,
        ts: Date.now(),
      };
    }
    // eslint-disable-next-line no-console
    console.debug('[camera-fit] request', {
      reason,
      mode,
      idsCount: detail.locationIds.length,
      coordsCount: opts.coords?.length ?? 0,
      minZoom: detail.minZoom,
    });
  } else if (!FIT_REASONS_SET.has(reason)) {
    // En producción, sin debug, mantener un único warn por reason desconocido.
    // eslint-disable-next-line no-console
    console.warn('[camera-fit] unknown reason:', reason);
  }

  window.dispatchEvent(
    new CustomEvent<SubsetFitDetail>(SUBSET_FIT_BOUNDS_EVENT, { detail }),
  );
}
