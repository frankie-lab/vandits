/**
 * CameraFitQaPanel — Panel temporal de QA para el sistema de cámara.
 *
 * Solo visible en dev/debug. Permite leer `window.__cameraFitMetrics` y
 * `window.__cameraFitTrace` sin abrir DevTools, etiquetar snapshots por
 * flujo (F1..Fn) y exportarlos.
 *
 * Build: trace-v2 — añade UX para QA humana (toasts inline, live event
 * stream, heartbeat, status pills).
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

const PANEL_BUILD = 'trace-v2';

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

type ToastKind = 'success' | 'error' | 'info';
type ToastState = { kind: ToastKind; text: string; ts: number } | null;

function readMetricsSnapshot(): CameraFitMetrics | null {
  if (typeof window === 'undefined') return null;
  const m = window.__cameraFitMetrics;
  if (!m) return null;
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

function newCaptureId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `cap-${ts}-${rnd}`;
}

interface CaptureWindow {
  captureId: string | null;
  captureStartedAt: number | null;
  resetAt: number | null;
}

function buildExportPayload(
  metrics: CameraFitMetrics | null,
  trace: CameraFitTraceEvent[],
  flowLabel: string,
  capture: CaptureWindow,
): Record<string, unknown> {
  const since = capture.captureStartedAt ?? capture.resetAt ?? 0;
  const filteredTrace = since > 0 ? trace.filter((e) => e.timestamp >= since) : trace;
  const filteredBypasses = metrics
    ? since > 0
      ? metrics.bypasses.filter((b) => b.ts >= since)
      : metrics.bypasses
    : [];
  return {
    timestamp: new Date().toISOString(),
    panelBuild: PANEL_BUILD,
    captureId: capture.captureId,
    captureStartedAt: capture.captureStartedAt
      ? new Date(capture.captureStartedAt).toISOString()
      : null,
    resetAt: capture.resetAt ? new Date(capture.resetAt).toISOString() : null,
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
          bypasses: filteredBypasses,
          lastRequest: metrics.lastRequest,
        }
      : null,
    trace: filteredTrace,
  };
}

function fmtClock(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function summarizePayload(payload: unknown): string {
  if (payload === undefined || payload === null) return '';
  if (typeof payload !== 'object') return String(payload);
  try {
    const s = JSON.stringify(payload);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  } catch {
    return '[unserializable]';
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function CameraFitQaPanel() {
  const [observerInstalled, setObserverInstalled] = useState(false);
  const [observerInstalledAt, setObserverInstalledAt] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [lastResetAt, setLastResetAt] = useState<number | null>(null);
  const [lastMetricsUpdateAt, setLastMetricsUpdateAt] = useState<number | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [captureStartedAt, setCaptureStartedAt] = useState<number | null>(null);
  const lastTotalRequestsRef = useRef<number>(-1);

  // Honor query-param activation + force init of metrics + observer.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debugCameraFit') === '1') {
        window.localStorage.setItem('vandits_debug_camera_fit', 'true');
      }
    } catch {
      /* ignore */
    }
    if (!isCameraFitDebugEnabled()) return;
    ensureCameraFitMetrics();
    ensureCameraFitTraceBuffer();
    void installCameraFitObserver().then(() => {
      const ok = isCameraFitObserverInstalled();
      setObserverInstalled(ok);
      if (ok) setObserverInstalledAt((prev) => prev ?? Date.now());
    });
    const ok = isCameraFitObserverInstalled();
    setObserverInstalled(ok);
    if (ok) setObserverInstalledAt((prev) => prev ?? Date.now());
  }, []);

  const enabled = isCameraFitDebugEnabled();
  const [open, setOpen] = useState(false);
  const [flowLabel, setFlowLabel] = useState<string>('unlabeled');
  const [, setTick] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Polling 500ms mientras esté abierto. Refresca observer + heartbeat.
  useEffect(() => {
    if (!open) return;
    intervalRef.current = window.setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000);
      const installed = isCameraFitObserverInstalled();
      setObserverInstalled((prev) => (prev === installed ? prev : installed));
      if (installed) setObserverInstalledAt((prev) => prev ?? Date.now());
      // Heartbeat: detect monotonic growth in totalRequests.
      const m = typeof window !== 'undefined' ? window.__cameraFitMetrics : null;
      if (m && m.totalRequests !== lastTotalRequestsRef.current) {
        lastTotalRequestsRef.current = m.totalRequests;
        setLastMetricsUpdateAt(Date.now());
      }
    }, 500);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open]);

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const metrics = useMemo(
    () => (open ? readMetricsSnapshot() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, intervalRef.current, flowLabel],
  );

  const trace = useMemo<CameraFitTraceEvent[]>(
    () => (open ? getCameraFitTrace() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, intervalRef.current, flowLabel],
  );

  // Auto-scroll del live stream al último evento.
  const streamRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [trace.length, open]);

  if (!enabled) return null;

  const metricsAvailable = metrics !== null;
  const traceCount = trace.length;
  const recent = trace.slice(-10);
  const lastBypassTs = metrics?.bypasses?.length
    ? metrics.bypasses[metrics.bypasses.length - 1].ts
    : null;
  const lastRequestTs = metrics?.lastRequest?.ts ?? null;

  const exportPayload = () =>
    buildExportPayload(metrics, trace, flowLabel, {
      captureId,
      captureStartedAt,
      resetAt: lastResetAt,
    });

  const performReset = (now: number) => {
    const m = typeof window !== 'undefined' ? window.__cameraFitMetrics : null;
    if (m && typeof m.reset === 'function') {
      m.reset();
    } else {
      resetCameraFitMetrics();
    }
    resetCameraFitTrace();
    lastTotalRequestsRef.current = 0;
    setLastMetricsUpdateAt(null);
    setLastResetAt(now);
    setTick((t) => t + 1);
  };

  const handleCopy = async () => {
    if (!metricsAvailable) {
      setToast({
        kind: 'error',
        text: 'No metrics yet. Trigger any fit first.',
        ts: Date.now(),
      });
      return;
    }
    const json = JSON.stringify(exportPayload(), null, 2);
    const bytes = new Blob([json]).size;
    try {
      await navigator.clipboard.writeText(json);
      setToast({
        kind: 'success',
        text: `Copied to clipboard (${fmtBytes(bytes)})`,
        ts: Date.now(),
      });
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = json;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        setToast({
          kind: 'success',
          text: `Copied via fallback (${fmtBytes(bytes)})`,
          ts: Date.now(),
        });
      } catch (e) {
        setToast({
          kind: 'error',
          text: `Copy failed: ${(e as Error).message}`,
          ts: Date.now(),
        });
      }
    }
  };

  const handleDownload = () => {
    if (!metricsAvailable) {
      setToast({
        kind: 'error',
        text: 'No metrics yet. Trigger any fit first.',
        ts: Date.now(),
      });
      return;
    }
    const json = JSON.stringify(exportPayload(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const idPart = captureId ? `-${captureId}` : '';
    const filename = `camera-fit-${flowLabel}${idPart}-${stamp}.json`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast({ kind: 'success', text: `Downloaded ${filename}`, ts: Date.now() });
  };

  const handleReset = () => {
    const now = Date.now();
    performReset(now);
    setToast({ kind: 'success', text: 'Metrics + trace reset', ts: now });
  };

  const handleStartCapture = () => {
    const now = Date.now();
    const id = newCaptureId();
    performReset(now);
    setCaptureId(id);
    setCaptureStartedAt(now);
    setToast({ kind: 'success', text: `Capture started · ${id}`, ts: now });
  };


  // ───────── Floating launcher ─────────
  if (!open) {
    const launcherStatus = !observerInstalled
      ? '#fca5a5'
      : !metricsAvailable
        ? '#fde68a'
        : traceCount > 0
          ? '#86efac'
          : '#94a3b8';
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
          color: launcherStatus,
          border: `1px solid ${launcherStatus}`,
          borderRadius: 6,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        aria-label="Open Camera QA panel"
        title="Camera fit metrics (debug)"
      >
        Camera QA · {traceCount}t / {metrics?.totalRequests ?? 0}r
      </button>
    );
  }

  // ───────── Status pill state ─────────
  let statusKind: 'idle' | 'active' | 'warn' | 'error';
  let statusTitle: string;
  let statusSubtitle: string;
  if (!observerInstalled) {
    statusKind = 'error';
    statusTitle = 'Observer missing';
    statusSubtitle = 'L.Map not patched yet';
  } else if (!metricsAvailable) {
    statusKind = 'error';
    statusTitle = 'No metrics';
    statusSubtitle = 'window.__cameraFitMetrics missing';
  } else if (traceCount === 0) {
    statusKind = 'idle';
    statusTitle = 'Trace buffer IDLE';
    statusSubtitle = '0 events captured — trigger a flow';
  } else if (metrics && metrics.directLeafletCalls > 0) {
    statusKind = 'warn';
    statusTitle = 'Trace buffer ACTIVE';
    statusSubtitle = `${traceCount} events · ${metrics.directLeafletCalls} bypass(es) detected`;
  } else {
    statusKind = 'active';
    statusTitle = 'Trace buffer ACTIVE';
    statusSubtitle = `${traceCount} event${traceCount === 1 ? '' : 's'} captured`;
  }
  const statusColor =
    statusKind === 'active'
      ? '#86efac'
      : statusKind === 'warn'
        ? '#fde68a'
        : statusKind === 'error'
          ? '#fca5a5'
          : '#94a3b8';
  const statusBg =
    statusKind === 'error'
      ? 'rgba(127,29,29,0.35)'
      : statusKind === 'warn'
        ? 'rgba(120,53,15,0.35)'
        : statusKind === 'active'
          ? 'rgba(6,78,59,0.35)'
          : 'rgba(30,41,59,0.6)';

  return (
    <div
      role="dialog"
      aria-label="Camera fit QA panel"
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 99999,
        width: 400,
        maxHeight: '85vh',
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
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong style={{ color: '#fde68a' }}>Camera QA</strong>
          <span style={{ color: '#64748b', fontSize: 10 }}>
            build: {PANEL_BUILD} · observer @ {fmtClock(observerInstalledAt)}
          </span>
        </div>
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
        {/* Toast */}
        {toast && (
          <div
            role="status"
            style={{
              padding: '6px 8px',
              marginBottom: 8,
              background:
                toast.kind === 'success'
                  ? 'rgba(6,78,59,0.6)'
                  : toast.kind === 'error'
                    ? 'rgba(127,29,29,0.55)'
                    : 'rgba(30,58,138,0.55)',
              border: `1px solid ${
                toast.kind === 'success'
                  ? '#86efac'
                  : toast.kind === 'error'
                    ? '#fca5a5'
                    : '#93c5fd'
              }`,
              borderRadius: 4,
              color:
                toast.kind === 'success'
                  ? '#bbf7d0'
                  : toast.kind === 'error'
                    ? '#fecaca'
                    : '#bfdbfe',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>{toast.text}</span>
            <span style={{ color: '#64748b', fontSize: 10 }}>
              {fmtClock(toast.ts)}
            </span>
          </div>
        )}

        {/* Status pill */}
        <div
          style={{
            padding: '6px 8px',
            marginBottom: 8,
            background: statusBg,
            border: `1px solid ${statusColor}`,
            borderRadius: 4,
          }}
        >
          <div style={{ color: statusColor, fontWeight: 'bold' }}>
            {statusTitle}
          </div>
          <div style={{ color: '#cbd5e1', fontSize: 10 }}>{statusSubtitle}</div>
        </div>

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
          <ActionBtn onClick={handleStartCapture} label="Start capture" />
          <ActionBtn onClick={handleReset} label="Reset" />
          <ActionBtn onClick={handleCopy} label="Copy JSON" />
          <ActionBtn onClick={handleDownload} label="Download JSON" />
        </div>

        {/* Capture window */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 6,
            marginBottom: 8,
            padding: '4px 8px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 4,
            fontSize: 10,
            color: '#cbd5e1',
          }}
        >
          <span style={{ color: '#64748b' }}>Capture:</span>
          <span style={{ color: captureId ? '#86efac' : '#64748b' }}>
            {captureId ?? '(none — using last reset as window)'}
          </span>
          <span style={{ color: '#64748b' }}>started @ {fmtClock(captureStartedAt)}</span>
        </div>

        {/* Heartbeat */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            marginBottom: 8,
            padding: '6px 8px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 4,
            fontSize: 10,
          }}
        >
          <HeartbeatRow label="Observer" value={observerInstalled ? 'installed' : 'missing'} ok={observerInstalled} />
          <HeartbeatRow label="Metrics" value={metricsAvailable ? 'available' : 'missing'} ok={metricsAvailable} />
          <HeartbeatRow label="Last metrics update" value={fmtClock(lastMetricsUpdateAt)} />
          <HeartbeatRow label="Last request" value={fmtClock(lastRequestTs)} />
          <HeartbeatRow label="Last bypass" value={fmtClock(lastBypassTs)} warn={!!lastBypassTs} />
          <HeartbeatRow label="Last reset" value={fmtClock(lastResetAt)} />
        </div>

        {/* Live event stream */}
        <Section title={`Recent trace events (last ${recent.length} of ${traceCount})`}>
          {recent.length === 0 ? (
            <div style={{ color: '#64748b' }}>(no events yet)</div>
          ) : (
            <div
              ref={streamRef}
              style={{
                maxHeight: 180,
                overflow: 'auto',
                background: '#020617',
                border: '1px solid #334155',
                borderRadius: 4,
                padding: 4,
              }}
            >
              {recent.map((ev, i) => (
                <div
                  key={`${ev.timestamp}-${i}`}
                  style={{
                    display: 'flex',
                    gap: 6,
                    padding: '2px 0',
                    borderTop: i === 0 ? 'none' : '1px dashed #1e293b',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: '#64748b', flex: '0 0 auto' }}>
                    {fmtClock(ev.timestamp)}
                  </span>
                  <span style={{ color: '#fde68a', flex: '0 0 auto' }}>
                    {ev.label}
                  </span>
                  {ev.payload !== undefined && (
                    <span
                      style={{
                        color: '#94a3b8',
                        flex: '1 1 auto',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={summarizePayload(ev.payload)}
                    >
                      {summarizePayload(ev.payload)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {metrics && (
          <>
            <Section title="Totals">
              <Row k="totalRequests" v={metrics.totalRequests} />
              <Row k="coordsProvided" v={metrics.coordsProvided} />
              <Row k="resolvedFromCoords" v={metrics.resolvedFromCoords} />
              <Row k="resolvedFromMarkers" v={metrics.resolvedFromMarkers} />
              <Row k="cooldownSkipped" v={metrics.cooldownSkipped} />
              <Row k="cooldownBypassedByAlways" v={metrics.cooldownBypassedByAlways} />
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
              <KvBlock obj={metrics.unknownReasons} emptyMsg="(ninguno)" warn />
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
                          @ {fmtClock(b.ts)}
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

function HeartbeatRow({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  const color =
    ok === false ? '#fca5a5' : warn ? '#fde68a' : ok ? '#86efac' : '#cbd5e1';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
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
