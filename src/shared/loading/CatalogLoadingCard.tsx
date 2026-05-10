// Catalog loading card — shown in the same slot as the welcome card while
// the initial catalog sync is in flight. Mirrors the welcome card visuals
// (gradient halo, brand mark, centered text) so the user sees a coherent
// "popup" instead of a cold spinner. Real progress only — no simulation.
import React from 'react';
import { Compass, Loader2 } from 'lucide-react';
import { useActiveLoadings } from './loading-bus';

function formatEta(ms: number): string {
  if (ms < 1000) return 'menos de 1 s';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `≈ ${totalSec} s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `≈ ${m} min` : `≈ ${m} min ${s} s`;
}

export function CatalogLoadingCard() {
  const tasks = useActiveLoadings(0);
  const task = tasks.find((t) => t.id === 'db-sync');
  if (!task) return null;

  const current = task.current ?? 0;
  const total = task.total ?? 0;
  const determinate = total > 0;
  const pct = determinate ? Math.min(100, Math.round((current / total) * 100)) : 0;

  const elapsedMs = Date.now() - task.startedAt;
  let etaLabel: string | null = null;
  if (determinate && current > 0 && elapsedMs > 500 && current < total) {
    const rate = current / elapsedMs;
    const remainingMs = (total - current) / rate;
    etaLabel = formatEta(remainingMs);
  } else if (determinate && current < total) {
    etaLabel = 'Calculando…';
  }

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
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient shadow-lg shadow-primary/30 ring-1 ring-primary/20">
            <Compass className="h-6 w-6 text-primary-foreground" />
          </div>

          <div className="text-center mb-4">
            <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Cargando catálogo
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {determinate ? (
                <>
                  {current.toLocaleString('es-ES')} / {total.toLocaleString('es-ES')} puntos
                  {etaLabel ? ` · ${etaLabel}` : ''}
                </>
              ) : (
                'Preparando datos…'
              )}
            </p>
          </div>

          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            {determinate ? (
              <div
                className="h-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${pct}%` }}
              />
            ) : (
              <div className="h-full w-1/3 bg-primary global-loading-indeterminate" />
            )}
          </div>

          <p className="text-[11px] text-muted-foreground/80 text-center mt-3">
            El mapa estará disponible cuando termine la carga.
          </p>
        </div>
      </div>
    </div>
  );
}
