/**
 * camera-fit-trace.ts — Buffer genérico de trazas para Camera QA.
 *
 * Debug-only. Espejo de los logs `[camera-fit-trace]` en
 * `window.__cameraFitTrace` para que el panel `CameraFitQaPanel` pueda
 * exportarlos sin obligar al usuario a abrir DevTools.
 *
 * Genérico: NO específico de F1. Cualquier flujo que quiera dejar rastro
 * para QA de cámara llama `traceCameraFit(label, payload)` con un label
 * descriptivo (`'popover-fit subset computed'`, `'LocationMap SUBSET_FIT
 * listener received'`, etc.).
 *
 * Gate: solo escribe cuando `isCameraFitDebugEnabled()` (flag dev /
 * `?debugCameraFit=1` / `localStorage.vandits_debug_camera_fit==='true'`).
 * Off → no-op para mantener prod limpio.
 *
 * Cap: ring-buffer (drop-oldest) para evitar crecimiento ilimitado.
 *
 * Ver docs/architecture/camera-subset-fit-stabilization-plan.md.
 */

import { isCameraFitDebugEnabled } from '@/components/map/subset-fit';
// Side-effect: install window.__resetCameraQa / __startCameraCapture /
// __exportCameraQa for Playwright. Must be imported AFTER subset-fit so
// `ensureCameraFitMetrics()` runs against an existing module.
import './camera-qa-globals';

export type CameraFitTraceEvent = {
  timestamp: number;
  iso: string;
  label: string;
  payload?: unknown;
};

const TRACE_CAP = 500;

declare global {
  interface Window {
    __cameraFitTrace?: CameraFitTraceEvent[];
  }
}

/** Idempotente. Inicializa el buffer global si no existe. */
export function ensureCameraFitTraceBuffer(): CameraFitTraceEvent[] {
  if (typeof window === 'undefined') return [];
  if (!Array.isArray(window.__cameraFitTrace)) {
    window.__cameraFitTrace = [];
  }
  return window.__cameraFitTrace;
}

/**
 * Empuja un evento al buffer + emite `console.debug('[camera-fit-trace]', ...)`.
 * No-op si el debug flag está apagado.
 */
export function traceCameraFit(label: string, payload?: unknown): void {
  if (typeof window === 'undefined') return;
  if (!isCameraFitDebugEnabled()) return;

  const buf = ensureCameraFitTraceBuffer();
  const now = Date.now();
  const evt: CameraFitTraceEvent = {
    timestamp: now,
    iso: new Date(now).toISOString(),
    label,
    ...(payload !== undefined ? { payload } : {}),
  };
  buf.push(evt);
  if (buf.length > TRACE_CAP) {
    buf.splice(0, buf.length - TRACE_CAP);
  }

  try {
    if (payload !== undefined) {
      // eslint-disable-next-line no-console
      console.debug('[camera-fit-trace]', label, payload);
    } else {
      // eslint-disable-next-line no-console
      console.debug('[camera-fit-trace]', label);
    }
  } catch {
    /* ignore */
  }
}

/** Lectura defensiva (clone shallow) para el panel. */
export function getCameraFitTrace(): CameraFitTraceEvent[] {
  if (typeof window === 'undefined') return [];
  const buf = window.__cameraFitTrace;
  return Array.isArray(buf) ? buf.slice() : [];
}

/** Limpia el buffer global. */
export function resetCameraFitTrace(): void {
  if (typeof window === 'undefined') return;
  window.__cameraFitTrace = [];
}
