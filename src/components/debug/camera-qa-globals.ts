/**
 * camera-qa-globals.ts — Test harness globals for Playwright / QA automation.
 *
 * Installs a small, stable surface on `window`:
 *
 *   - window.__cameraFitMetrics  (already exposed by subset-fit.ts)
 *   - window.__cameraFitTrace    (already exposed by camera-fit-trace.ts)
 *   - window.__resetCameraQa()         → clears metrics + trace, re-enables flag
 *   - window.__startCameraCapture(label?) → reset + stamp captureId/label
 *   - window.__exportCameraQa()        → JSON-serializable snapshot
 *
 * Also force-enables the camera-fit debug flag in localStorage so
 * `traceCameraFit(...)` actually writes the ring buffer during automated
 * runs (otherwise tests would see an empty trace).
 *
 * Side-effect import: this module runs at app start (re-exported from
 * `camera-fit-trace.ts`). No UI, no React. Safe to ship in prod — the
 * helpers are inert until called from the test runner / DevTools.
 */

import {
  ensureCameraFitMetrics,
  resetCameraFitMetrics,
  type CameraFitMetrics,
} from '@/components/map/subset-fit';
import {
  ensureCameraFitTraceBuffer,
  resetCameraFitTrace,
  getCameraFitTrace,
  type CameraFitTraceEvent,
} from '@/components/debug/camera-fit-trace';

export interface CameraQaSnapshot {
  capturedAt: string;
  captureId: string | null;
  captureLabel: string | null;
  captureStartedAt: string | null;
  metrics: CameraFitMetrics | null;
  trace: CameraFitTraceEvent[];
}

declare global {
  interface Window {
    __cameraQaCaptureId?: string | null;
    __cameraQaCaptureLabel?: string | null;
    __cameraQaCaptureStartedAt?: number | null;
    __resetCameraQa?: () => void;
    __startCameraCapture?: (label?: string) => string;
    __exportCameraQa?: () => CameraQaSnapshot;
  }
}

const DEBUG_FLAG_KEY = 'vandits_debug_camera_fit';

function enableDebugFlag(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem(DEBUG_FLAG_KEY) !== 'true') {
        localStorage.setItem(DEBUG_FLAG_KEY, 'true');
      }
    }
  } catch {
    /* ignore */
  }
}

function newCaptureId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `cap-${ts}-${rnd}`;
}

function installCameraQaGlobals(): void {
  if (typeof window === 'undefined') return;

  // Make sure both buffers exist immediately so tests can read them
  // before any flow has fired.
  ensureCameraFitMetrics();
  ensureCameraFitTraceBuffer();
  enableDebugFlag();

  if (typeof window.__resetCameraQa !== 'function') {
    window.__resetCameraQa = () => {
      enableDebugFlag();
      resetCameraFitMetrics();
      resetCameraFitTrace();
      window.__cameraQaCaptureId = null;
      window.__cameraQaCaptureLabel = null;
      window.__cameraQaCaptureStartedAt = null;
    };
  }

  if (typeof window.__startCameraCapture !== 'function') {
    window.__startCameraCapture = (label?: string) => {
      enableDebugFlag();
      resetCameraFitMetrics();
      resetCameraFitTrace();
      const id = newCaptureId();
      window.__cameraQaCaptureId = id;
      window.__cameraQaCaptureLabel = label ?? null;
      window.__cameraQaCaptureStartedAt = Date.now();
      return id;
    };
  }

  if (typeof window.__exportCameraQa !== 'function') {
    window.__exportCameraQa = (): CameraQaSnapshot => {
      const metrics = window.__cameraFitMetrics ?? null;
      const trace = getCameraFitTrace();
      const startedAt = window.__cameraQaCaptureStartedAt ?? null;
      return {
        capturedAt: new Date().toISOString(),
        captureId: window.__cameraQaCaptureId ?? null,
        captureLabel: window.__cameraQaCaptureLabel ?? null,
        captureStartedAt: startedAt ? new Date(startedAt).toISOString() : null,
        metrics: metrics
          ? {
              ...metrics,
              byReason: { ...metrics.byReason },
              byMode: { ...metrics.byMode },
              unknownReasons: { ...metrics.unknownReasons },
              bypasses: metrics.bypasses.slice(),
              lastRequest: metrics.lastRequest ? { ...metrics.lastRequest } : null,
            }
          : null,
        trace: startedAt ? trace.filter((e) => e.timestamp >= startedAt) : trace,
      };
    };
  }
}

installCameraQaGlobals();

export {};
