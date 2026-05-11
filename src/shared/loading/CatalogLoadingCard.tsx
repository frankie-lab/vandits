// Catalog loading card — shown in the same slot as the welcome card while
// the initial catalog sync is in flight. Mirrors the welcome summary card
// (greeting + last login + counts) and adds a live progress bar with ETA.
// Real progress only — no simulation.
import React, { useEffect, useRef, useState } from 'react';
import { Compass, Loader2 } from 'lucide-react';
import { useActiveLoadings } from './loading-bus';
import { useLocationsStore } from '@/domains/content/store/locations-store';


function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return 'menos de 1 s';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `≈ ${totalSec} s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `≈ ${m} min` : `≈ ${m} min ${s} s`;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  const months = Math.floor(d / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  return `hace ${Math.floor(months / 12)} año${Math.floor(months / 12) === 1 ? '' : 's'}`;
}

interface CatalogLoadingCardProps {
  userDisplayName?: string | null;
  lastSeenAt?: Date | null;
}

export function CatalogLoadingCard({ userDisplayName, lastSeenAt }: CatalogLoadingCardProps = {}) {
  const tasks = useActiveLoadings(0);
  const task = tasks.find((t) => t.id === 'db-sync');
  const hasDocs = useLocationsStore((s) => s.documents.length > 0);
  // La card representa "no hay catálogo usable todavía", no "hay sync en curso".
  // Doble gate: tarea bloqueante + store vacío. Defensa frente a bugs futuros
  // que marquen blocking=true con datos cargados.
  const shouldShow = !!task && task.blocking === true && !hasDocs;

  // EMA del ritmo (items/ms). Más estable que current/elapsed global cuando
  // updateLoading dispara saltos discretos (1 tick por página).
  const lastSampleRef = useRef<{ t: number; v: number } | null>(null);
  const rateEmaRef = useRef<number | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (!task) {
      lastSampleRef.current = null;
      rateEmaRef.current = null;
      return;
    }
    const now = Date.now();
    const v = task.current ?? 0;
    const last = lastSampleRef.current;
    if (last && v > last.v && now > last.t) {
      const instant = (v - last.v) / (now - last.t); // items/ms
      const prev = rateEmaRef.current;
      const alpha = 0.4; // EMA factor — prioriza muestras recientes
      rateEmaRef.current = prev == null ? instant : prev * (1 - alpha) + instant * alpha;
    }
    lastSampleRef.current = { t: now, v };
  }, [task?.current, task?.total]);

  // Tick para refrescar ETA cada 500ms mientras hay tarea activa.
  useEffect(() => {
    if (!task) return;
    const id = window.setInterval(() => force((x) => x + 1), 500);
    return () => window.clearInterval(id);
  }, [task?.id]);

  if (!task) return null;

  const current = task.current ?? 0;
  const total = task.total ?? 0;
  const determinate = total > 0;
  const pct = determinate ? Math.min(100, Math.round((current / total) * 100)) : 0;

  const elapsedMs = Date.now() - task.startedAt;
  let etaLabel: string | null = null;
  if (determinate && current < total) {
    const rate = rateEmaRef.current;
    if (rate && rate > 0 && elapsedMs > 600) {
      etaLabel = formatEta((total - current) / rate);
    } else {
      etaLabel = 'Calculando…';
    }
  }

  const showLastSeen =
    !!userDisplayName && !!lastSeenAt && Date.now() - lastSeenAt.getTime() >= 60_000;
  const lastLoginText = lastSeenAt
    ? `Último acceso: ${lastSeenAt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} ${lastSeenAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : null;

  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[500] px-4 pointer-events-none w-full max-w-md"
      role="status"
      aria-live="polite"
      aria-label="Cargando catálogo"
    >
      <div className="relative pointer-events-auto overflow-hidden rounded-2xl border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-40 bg-gradient-to-b from-primary/25 via-primary/10 to-transparent blur-2xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative p-5">
          {/* Brand mark — same as welcome card */}
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient shadow-lg shadow-primary/30 ring-1 ring-primary/20">
            <Compass className="h-6 w-6 text-primary-foreground" />
          </div>

          {/* Greeting block — same structure as summary welcome card */}
          <div className="text-center mb-4">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {userDisplayName ? `Hola, ${userDisplayName}` : 'Bienvenido a Vandits'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {showLastSeen
                ? `No te vemos desde ${formatRelative(lastSeenAt!)}`
                : 'Preparando tu catálogo'}
            </p>
            {lastLoginText && (
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                {lastLoginText}
              </p>
            )}
          </div>

          {/* Progress section */}
          <div className="rounded-xl border border-border/40 bg-background/40 p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Cargando catálogo
              </span>
              <span className="tabular-nums text-muted-foreground">
                {determinate
                  ? `${current.toLocaleString('es-ES')} / ${total.toLocaleString('es-ES')}`
                  : '…'}
              </span>
            </div>

            <div className="h-2 rounded-full bg-muted overflow-hidden">
              {determinate ? (
                <div
                  className="h-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-full w-1/3 bg-primary global-loading-indeterminate" />
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground/90 mt-2 tabular-nums">
              <span>{determinate ? `${pct}%` : 'Preparando datos…'}</span>
              {etaLabel && <span>Tiempo restante {etaLabel}</span>}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground/80 text-center mt-3">
            El mapa estará disponible cuando termine la carga.
          </p>
        </div>
      </div>
    </div>
  );
}
