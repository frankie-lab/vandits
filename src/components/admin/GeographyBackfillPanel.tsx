// Domain: Geography — Admin panel block to launch the universal geography
// backfill (fill / reconcile / overwrite) and inspect coverage stats.
// Reuses useGeocodingJobStore + GeocodingProgressBar (do not introduce a
// parallel progress system).

import { useEffect, useState, useCallback } from 'react';
import { Compass, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';
import { computeEta, formatDuration, formatClock, formatRate } from '@/shared/geography/eta';

type Mode = 'fill' | 'reconcile' | 'overwrite';

interface Coverage {
  total: number;
  with_country: number;
  with_admin1: number;
  with_timezone: number;
  with_postal: number;
  resolved: number;
  avg_confidence: number | null;
}

const MODE_LABELS: Record<Mode, { title: string; desc: string }> = {
  fill: {
    title: 'Rellenar huecos',
    desc: 'Solo procesa puntos sin jerarquía completa. No toca nada existente.',
  },
  reconcile: {
    title: 'Reconciliar (recomendado)',
    desc: 'Recorre TODOS los puntos. Sobrescribe niveles que difieran de OSM y guarda histórico en raw_geocode.previous.',
  },
  overwrite: {
    title: 'Reescribir todo',
    desc: 'Recorre TODOS los puntos y sobrescribe siempre. Más coste; usar tras cambios de catálogo.',
  },
};

export function GeographyBackfillPanel() {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loadingCov, setLoadingCov] = useState(true);
  const [mode, setMode] = useState<Mode>('reconcile');
  const [, forceTick] = useState(0);
  const job = useGeocodingJobStore();

  // Tick every second while job runs so elapsed/ETA refresh visually
  // even if no new point comes back from the worker.
  useEffect(() => {
    if (!job.running) return;
    const id = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [job.running]);

  const refreshCoverage = useCallback(async () => {
    setLoadingCov(true);
    try {
      const { data, error } = await supabase
        .from('v_geo_coverage')
        .select('total, with_country, with_admin1, with_timezone, with_postal, resolved, avg_confidence')
        .maybeSingle();
      if (error) throw error;
      setCoverage((data as Coverage) ?? null);
    } catch (err) {
      console.error('[geo-coverage]', err);
    } finally {
      setLoadingCov(false);
    }
  }, []);

  useEffect(() => {
    refreshCoverage();
  }, [refreshCoverage]);

  // Refresh when job ends
  useEffect(() => {
    if (!job.running) {
      const t = setTimeout(refreshCoverage, 500);
      return () => clearTimeout(t);
    }
  }, [job.running, refreshCoverage]);

  const handleStart = async () => {
    if (job.running) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { toast.error('Sesión expirada'); return; }

      // Compute total to process
      let q = supabase.from('locations').select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .eq('owner_user_id', uid);
      if (mode === 'fill') {
        q = q.or('continent_id.is.null,country_id.is.null,region_id.is.null,zone_id.is.null,locality_id.is.null');
      }
      const { count } = await q;
      const total = count ?? 0;
      if (total === 0) { toast.message('No hay puntos para procesar'); return; }

      await useGeocodingJobStore.getState().start(total, {
        label: MODE_LABELS[mode].title,
        mode,
      });
    } catch (err) {
      console.error('[backfill-start]', err);
      toast.error('No se pudo lanzar el backfill');
    }
  };

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-12">
      {/* Cobertura */}
      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Cobertura geográfica</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refreshCoverage} disabled={loadingCov}>
            {loadingCov ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
        {loadingCov && !coverage ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : !coverage || coverage.total === 0 ? (
          <div className="text-sm text-muted-foreground">No hay puntos en tu cuenta.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <CovRow label="Total puntos" value={coverage.total} />
            <CovRow label="Resueltos" value={`${coverage.resolved} (${pct(coverage.resolved, coverage.total)}%)`} />
            <CovRow label="Con país" value={`${coverage.with_country} (${pct(coverage.with_country, coverage.total)}%)`} />
            <CovRow label="Con región (ISO)" value={`${coverage.with_admin1} (${pct(coverage.with_admin1, coverage.total)}%)`} />
            <CovRow label="Con timezone" value={`${coverage.with_timezone} (${pct(coverage.with_timezone, coverage.total)}%)`} />
            <CovRow label="Con código postal" value={`${coverage.with_postal} (${pct(coverage.with_postal, coverage.total)}%)`} />
            <CovRow label="Confianza media" value={coverage.avg_confidence ?? '—'} />
          </div>
        )}
      </section>

      {/* Modo */}
      <section className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Modo de normalización</h3>
        <div className="space-y-2">
          {(['fill', 'reconcile', 'overwrite'] as Mode[]).map(m => (
            <label
              key={m}
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                mode === m ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
              }`}
            >
              <input
                type="radio"
                name="bf-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{MODE_LABELS[m].title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{MODE_LABELS[m].desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground pt-1">
          La normalización solo toca campos administrativos y FKs. No modifica nombre, descripción,
          enriquecimiento, fotos, notas ni colecciones.
        </div>
      </section>

      {/* Lanzar */}
      <section className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Ejecución</h3>
        {job.running ? (
          <>
            <div className="text-sm">
              Procesados <strong>{job.totalUpdated}</strong> / {job.initialPending} · quedan {job.remaining}
              {job.failedThisBatch > 0 && <> · errores {job.failedThisBatch}</>}
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct(job.totalUpdated, Math.max(1, job.initialPending))}%` }}
              />
            </div>
            {(() => {
              const eta = computeEta({
                startedAt: job.startedAt,
                totalUpdated: job.totalUpdated,
                remaining: job.remaining,
              });
              return (
                <div className="text-xs text-muted-foreground tabular-nums">
                  Transcurrido <strong className="text-foreground">{formatDuration(eta.elapsedMs)}</strong>
                  {eta.ratePerMin > 0 && <> · {formatRate(eta.ratePerMin)}</>}
                  {eta.etaMs !== null && eta.finishAt ? (
                    <>
                      {' '}· ETA ~<strong className="text-foreground">{formatDuration(eta.etaMs)}</strong>
                      {' '}· termina ~{formatClock(eta.finishAt)}
                    </>
                  ) : (
                    <> · Calculando ETA…</>
                  )}
                </div>
              );
            })()}
            <Button variant="destructive" size="sm" onClick={() => useGeocodingJobStore.getState().stop()} disabled={job.stopping}>
              <Square className="w-3.5 h-3.5 mr-2" />
              {job.stopping ? 'Deteniendo…' : 'Detener'}
            </Button>
          </>
        ) : (
          <Button onClick={handleStart} className="w-full">
            <Play className="w-3.5 h-3.5 mr-2" />
            Lanzar backfill ({MODE_LABELS[mode].title})
          </Button>
        )}
        <div className="text-[11px] text-muted-foreground">
          El proceso se ejecuta en el servidor: continúa aunque cierres el navegador o apagues el ordenador. Solo se detiene si pulsas "Detener".
        </div>
        <div className="text-[11px] text-muted-foreground">
          Una vez termine en modo reconcile/overwrite, el árbol "Buscar y filtrar" mostrará la cascada
          postal completa (p.ej. Galicia → 4 provincias → ayuntamientos → localidades → barrios/calles).
        </div>
      </section>
    </div>
  );
}

function CovRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded bg-muted/30 px-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}
