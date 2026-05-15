/**
 * CameraFitQaPanel — Panel temporal de QA para el sistema de cámara.
 *
 * Solo visible en dev/debug. Permite leer `window.__cameraFitMetrics` sin
 * abrir DevTools, etiquetar snapshots por flujo (F1..Fn) y exportarlos.
 *
 * Activación:
 *  - `localStorage.vandits_debug_camera_fit === 'true'` (o dev por defecto), o
 *  - query param `?debugCameraFit=1` (auto-set localStorage para persistir).
 *
 * Ver docs/architecture/camera-subset-fit-stabilization-plan.md.
 *
 * NO cambia comportamiento de cámara. Solo lectura + reset.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ensureCameraFitMetrics,
  installCameraFitObserver,
  isCameraFitDebugEnabled,
  isCameraFitObserverInstalled,
  resetCameraFitMetrics,
  type CameraFitMetrics,
} from '@/components/map/subset-fit';
import {
  ensureCameraFitTraceBuffer,
  getCameraFitTrace,
  resetCameraFitTrace,
  type CameraFitTraceEvent,
} from '@/components/debug/camera-fit-trace';

const FLOW_LABELS = [
  { id: 'unlabeled', label: '— sin etiquetar —' },
  { id: 'F1', label: 'F1 — Mis POI → Enriquecidos' },
  { id: 'F2', label: 'F2 — Mis POI → Vacíos' },
  { id: 'F3', label: 'F3 — Mis POI → Ver todos' },
  { id: 'F4', label: 'F4 — FilterBar → healthFilter' },
  { id: 'F5', label: 'F5 — Click marker' },
  { id: 'F6', label: 'F6 — Open popup → close' },
  { id: 'F7', label: 'F7 — User filter (UsersSidebar)' },
  { id: 'F8', label: 'F8 — Document view enter' },
  { id: 'F9', label: 'F9 — Document view exit' },
  { id: 'F10', label: 'F10 — Route / waypoint focus' },
  { id: 'F11', label: 'F11 — Locate-me' },
  { id: 'F12', label: 'F12 — Manual gesture + fit (cooldown)' },
  { id: 'AGGREGATE', label: 'Aggregate — corrida completa sin reset' },
] as const;

function readMetricsSnapshot(): CameraFitMetrics | null {
  if (typeof window === 'undefined') return null;
  const m = window.__cameraFitMetrics;
  if (!m) return null;
  // shallow clone for stable rendering; arrays/objects re-leídos en cada tick
  return {
    totalRequests: m.totalRequests,
    byReason: { ...m.byReason },
    byMode: { ...m.byMode },
    unknownReasons: { ...m.unknownReasons },
    coordsProvided: m.coordsProvided,
    resolvedFromMarkers: m.resolvedFromMarkers,
    resolvedFromCoords: m.resolvedFromCoords,
    cooldownSkipped: m.cooldownSkipped,
    cooldownBypassedByAlways: m.cooldownBypassedByAlways,
    directLeafletCalls: m.directLeafletCalls,
    bypasses: m.bypasses.slice(-50),
    lastRequest: m.lastRequest ? { ...m.lastRequest } : null,
    reset: m.reset,
  };
}

function buildExportPayload(
  metrics: CameraFitMetrics | null,
  trace: CameraFitTraceEvent[],
  flowLabel: string,
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    route:
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : null,
    viewportSize:
      typeof window !== 'undefined'
        ? { w: window.innerWidth, h: window.innerHeight }
        : null,
    flowLabel,
    metrics: metrics
      ? {
          totalRequests: metrics.totalRequests,
          byReason: metrics.byReason,
          byMode: metrics.byMode,
          unknownReasons: metrics.unknownReasons,
          coordsProvided: metrics.coordsProvided,
          resolvedFromMarkers: metrics.resolvedFromMarkers,
          resolvedFromCoords: metrics.resolvedFromCoords,
          cooldownSkipped: metrics.cooldownSkipped,
          cooldownBypassedByAlways: metrics.cooldownBypassedByAlways,
          directLeafletCalls: metrics.directLeafletCalls,
          bypasses: metrics.bypasses,
          lastRequest: metrics.lastRequest,
        }
      : null,
    trace,
  };
}

export function CameraFitQaPanel() {
  const [observerInstalled, setObserverInstalled] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  // Honor query-param activation + force init of metrics + observer.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debugCameraFit') === '1') {
        window.localStorage.setItem('vandits_debug_camera_fit', 'true');
      }
    } catch {
      // ignore
    }
    if (!isCameraFitDebugEnabled()) return;
    // Force-init metrics object so the panel can read it before the first fit.
    ensureCameraFitMetrics();
    // Force-install observer (idempotente). Cubre el caso en que el flag se
    // activó vía query-param DESPUÉS de que el módulo subset-fit.ts ya hizo
    // su auto-init y vio el flag OFF.
    void installCameraFitObserver().then(() => {
      setObserverInstalled(isCameraFitObserverInstalled());
    });
    setObserverInstalled(isCameraFitObserverInstalled());
  }, []);

  const enabled = isCameraFitDebugEnabled();
  const [open, setOpen] = useState(false);
  const [flowLabel, setFlowLabel] = useState<string>('unlabeled');
  const [, setTick] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Polling 500ms mientras esté abierto. También refresca el estado del observer.
  useEffect(() => {
    if (!open) return;
    intervalRef.current = window.setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000);
      const installed = isCameraFitObserverInstalled();
      setObserverInstalled((prev) => (prev === installed ? prev : installed));
    }, 500);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open]);

  const metrics = useMemo(
    () => (open ? readMetricsSnapshot() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, /* re-read each tick: */ intervalRef.current, /* state: */ flowLabel],
  );

  if (!enabled) return null;

  const metricsAvailable = metrics !== null;
  const exportPayload = () => buildExportPayload(metrics, flowLabel);

  const handleCopy = async () => {
    setCopyError(null);
    if (!metricsAvailable) {
      setCopyError(
        'No metrics yet. window.__cameraFitMetrics is not initialized. Trigger any fit first or check that the observer is installed.',
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(exportPayload(), null, 2),
      );
    } catch {
      // Fallback: textarea
      try {
        const ta = document.createElement('textarea');
        ta.value = JSON.stringify(exportPayload(), null, 2);
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch (e) {
        setCopyError(`Copy failed: ${(e as Error).message}`);
      }
    }
  };

  const handleDownload = () => {
    setCopyError(null);
    if (!metricsAvailable) {
      setCopyError(
        'No metrics yet. window.__cameraFitMetrics is not initialized. Trigger any fit first or check that the observer is installed.',
      );
      return;
    }
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `camera-fit-metrics_${flowLabel}_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    const m = typeof window !== 'undefined' ? window.__cameraFitMetrics : null;
    if (m && typeof m.reset === 'function') {
      m.reset();
    } else {
      resetCameraFitMetrics();
    }
    setTick((t) => t + 1);
  };

  // Floating launcher
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 99999,
          padding: '6px 10px',
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          background: 'rgba(15,23,42,0.85)',
          color: '#fde68a',
          border: '1px solid #fde68a',
          borderRadius: 6,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        aria-label="Open Camera QA panel"
        title="Camera fit metrics (debug)"
      >
        Camera QA{metrics ? ` · ${metrics.totalRequests}` : ''}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Camera fit QA panel"
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 99999,
        width: 380,
        maxHeight: '80vh',
        overflow: 'auto',
        background: 'rgba(15,23,42,0.96)',
        color: '#e2e8f0',
        border: '1px solid #fde68a',
        borderRadius: 8,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
        lineHeight: 1.4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid #334155',
          background: 'rgba(30,41,59,0.7)',
          position: 'sticky',
          top: 0,
        }}
      >
        <strong style={{ color: '#fde68a' }}>Camera QA · Phase 1</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            color: '#e2e8f0',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
          }}
          aria-label="Close panel"
        >
          ×
        </button>
      </header>

      <div style={{ padding: 10 }}>
        {/* Flow selector */}
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ color: '#94a3b8' }}>Mark flow:</span>{' '}
          <select
            value={flowLabel}
            onChange={(e) => setFlowLabel(e.target.value)}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '4px 6px',
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #475569',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontSize: 11,
            }}
          >
            {FLOW_LABELS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <ActionBtn onClick={handleReset} label="Reset" />
          <ActionBtn onClick={handleCopy} label="Copy JSON" />
          <ActionBtn onClick={handleDownload} label="Download JSON" />
        </div>

        {/* Status */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 8,
            padding: '4px 6px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 4,
          }}
        >
          <span>
            <span style={{ color: '#94a3b8' }}>Observer:</span>{' '}
            <strong style={{ color: observerInstalled ? '#86efac' : '#fca5a5' }}>
              {observerInstalled ? 'installed' : 'not installed'}
            </strong>
          </span>
          <span>
            <span style={{ color: '#94a3b8' }}>Metrics:</span>{' '}
            <strong style={{ color: metricsAvailable ? '#86efac' : '#fca5a5' }}>
              {metricsAvailable ? 'available' : 'unavailable'}
            </strong>
          </span>
        </div>

        {copyError && (
          <div
            role="alert"
            style={{
              padding: '6px 8px',
              marginBottom: 8,
              background: 'rgba(127,29,29,0.4)',
              border: '1px solid #fca5a5',
              borderRadius: 4,
              color: '#fecaca',
            }}
          >
            {copyError}
          </div>
        )}

        {!metrics && (
          <p style={{ color: '#fca5a5' }}>
            window.__cameraFitMetrics no inicializado todavía. Disparar
            cualquier fit o esperar al primer evento.
          </p>
        )}

        {metrics && (
          <>
            <Section title="Totals">
              <Row k="totalRequests" v={metrics.totalRequests} />
              <Row k="coordsProvided" v={metrics.coordsProvided} />
              <Row k="resolvedFromCoords" v={metrics.resolvedFromCoords} />
              <Row k="resolvedFromMarkers" v={metrics.resolvedFromMarkers} />
              <Row k="cooldownSkipped" v={metrics.cooldownSkipped} />
              <Row
                k="cooldownBypassedByAlways"
                v={metrics.cooldownBypassedByAlways}
              />
              <Row
                k="directLeafletCalls"
                v={metrics.directLeafletCalls}
                warn={metrics.directLeafletCalls > 0}
              />
            </Section>

            <Section title="byReason">
              <KvBlock obj={metrics.byReason} emptyMsg="(sin requests)" />
            </Section>

            <Section title="byMode">
              <KvBlock obj={metrics.byMode} />
            </Section>

            <Section title="unknownReasons (warn)">
              <KvBlock
                obj={metrics.unknownReasons}
                emptyMsg="(ninguno)"
                warn
              />
            </Section>

            <Section title={`bypasses (${metrics.bypasses.length})`}>
              {metrics.bypasses.length === 0 ? (
                <div style={{ color: '#64748b' }}>(ninguno)</div>
              ) : (
                <div style={{ maxHeight: 160, overflow: 'auto' }}>
                  {metrics.bypasses.map((b, i) => (
                    <div
                      key={i}
                      style={{
                        borderTop: i === 0 ? 'none' : '1px dashed #334155',
                        padding: '4px 0',
                        color: '#fca5a5',
                      }}
                    >
                      <div>
                        <strong>{b.api}</strong>{' '}
                        <span style={{ color: '#64748b' }}>
                          @ {new Date(b.ts).toLocaleTimeString()}
                        </span>
                      </div>
                      {b.stack && (
                        <pre
                          style={{
                            margin: '2px 0 0',
                            fontSize: 10,
                            color: '#94a3b8',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {b.stack.split('\n').slice(0, 4).join('\n')}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {metrics.lastRequest && (
              <Section title="lastRequest">
                <pre
                  style={{
                    margin: 0,
                    fontSize: 10,
                    color: '#cbd5e1',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {JSON.stringify(metrics.lastRequest, null, 2)}
                </pre>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          color: '#fde68a',
          fontWeight: 'bold',
          marginBottom: 4,
          borderBottom: '1px solid #334155',
          paddingBottom: 2,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, warn }: { k: string; v: number; warn?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        color: warn && v > 0 ? '#fca5a5' : '#cbd5e1',
      }}
    >
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function KvBlock({
  obj,
  emptyMsg,
  warn,
}: {
  obj: Record<string, number>;
  emptyMsg?: string;
  warn?: boolean;
}) {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <div style={{ color: '#64748b' }}>{emptyMsg ?? '(vacío)'}</div>;
  }
  return (
    <div>
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => (
          <div
            key={k}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: warn ? '#fca5a5' : '#cbd5e1',
            }}
          >
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
    </div>
  );
}

function ActionBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 8px',
        background: '#1e293b',
        color: '#fde68a',
        border: '1px solid #475569',
        borderRadius: 4,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 11,
      }}
    >
      {label}
    </button>
  );
}

export default CameraFitQaPanel;
