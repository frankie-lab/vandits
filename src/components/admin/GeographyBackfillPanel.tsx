// Domain: Geography — Admin panel block to launch the universal geography
// backfill (fill / reconcile / overwrite) and inspect coverage stats.
// Reuses useGeocodingJobStore + GeocodingProgressBar (do not introduce a
// parallel progress system).
//
// Scope selector (added): cascading admin selectors (Continent → Country →
// Region → Zone) + actionable POI list with checkboxes. Both filter the same
// canonical pipeline (geocoding_jobs → geocoding-job-tick → backfill-admin-fks).

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Compass, Loader2, Play, RefreshCw, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGeocodingJobStore, type GeocodingAdminScope } from '@/stores/geocoding-job-store';
import { computeEta, formatDuration, formatClock, formatRate } from '@/shared/geography/eta';

type Mode = 'fill' | 'reconcile' | 'overwrite';
type AdminLevel = 'continent' | 'country' | 'region' | 'zone';
const LEVEL_ORDER: AdminLevel[] = ['continent', 'country', 'region', 'zone'];
const LEVEL_LABEL: Record<AdminLevel, string> = {
  continent: 'Continente', country: 'País', region: 'Región', zone: 'Zona',
};
const FK_BY_LEVEL: Record<AdminLevel, 'continent_id' | 'country_id' | 'region_id' | 'zone_id'> = {
  continent: 'continent_id', country: 'country_id', region: 'region_id', zone: 'zone_id',
};

interface AdminOption { id: string; name: string; }
interface PoiRow { id: string; name: string; country: string | null; region: string | null; }
const POI_PAGE = 200;

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

  // Scope state
  const [typeIdByLevel, setTypeIdByLevel] = useState<Record<AdminLevel, string | null>>({
    continent: null, country: null, region: null, zone: null,
  });
  const [optionsByLevel, setOptionsByLevel] = useState<Record<AdminLevel, AdminOption[]>>({
    continent: [], country: [], region: [], zone: [],
  });
  const [selectedByLevel, setSelectedByLevel] = useState<Record<AdminLevel, string | null>>({
    continent: null, country: null, region: null, zone: null,
  });
  const [pois, setPois] = useState<PoiRow[]>([]);
  const [poiCount, setPoiCount] = useState<number>(0);
  const [loadingPois, setLoadingPois] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Load place_types ids for the 4 admin levels (one-time).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('place_types')
        .select('id, code')
        .in('code', LEVEL_ORDER);
      const map: Record<AdminLevel, string | null> = { continent: null, country: null, region: null, zone: null };
      (data ?? []).forEach((row: { id: string; code: string }) => {
        if ((LEVEL_ORDER as string[]).includes(row.code)) map[row.code as AdminLevel] = row.id;
      });
      setTypeIdByLevel(map);
    })();
  }, []);

  // Load options for a level whenever its parent selection or type id changes.
  const loadOptions = useCallback(async (level: AdminLevel, parentId: string | null) => {
    const typeId = typeIdByLevel[level];
    if (!typeId) { setOptionsByLevel(o => ({ ...o, [level]: [] })); return; }
    let q = supabase.from('admin_areas').select('id, name').eq('type_id', typeId);
    if (level === 'continent') {
      q = q.is('parent_id', null);
    } else {
      if (!parentId) { setOptionsByLevel(o => ({ ...o, [level]: [] })); return; }
      q = q.eq('parent_id', parentId);
    }
    const { data } = await q.order('name').limit(500);
    setOptionsByLevel(o => ({ ...o, [level]: (data ?? []) as AdminOption[] }));
  }, [typeIdByLevel]);

  useEffect(() => { loadOptions('continent', null); }, [loadOptions]);
  useEffect(() => { loadOptions('country', selectedByLevel.continent); }, [loadOptions, selectedByLevel.continent]);
  useEffect(() => { loadOptions('region', selectedByLevel.country); }, [loadOptions, selectedByLevel.country]);
  useEffect(() => { loadOptions('zone', selectedByLevel.region); }, [loadOptions, selectedByLevel.region]);

  const adminScope: GeocodingAdminScope = useMemo(() => {
    const s: GeocodingAdminScope = {};
    if (selectedByLevel.continent) s.continent_id = selectedByLevel.continent;
    if (selectedByLevel.country)   s.country_id   = selectedByLevel.country;
    if (selectedByLevel.region)    s.region_id    = selectedByLevel.region;
    if (selectedByLevel.zone)      s.zone_id      = selectedByLevel.zone;
    return s;
  }, [selectedByLevel]);

  const hasAnyScope = Object.keys(adminScope).length > 0;

  // Fetch POIs in scope (and total count). Re-runs whenever scope changes.
  const refreshPois = useCallback(async () => {
    setLoadingPois(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return;
      let baseList = supabase
        .from('locations')
        .select('id, name, country, region')
        .eq('owner_user_id', uid)
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      let baseCount = supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', uid)
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      (Object.entries(adminScope) as Array<[keyof GeocodingAdminScope, string]>).forEach(([k, v]) => {
        baseList = baseList.eq(k, v);
        baseCount = baseCount.eq(k, v);
      });
      const [{ data: rows }, { count }] = await Promise.all([
        baseList.order('name').limit(POI_PAGE),
        baseCount,
      ]);
      setPois((rows ?? []) as PoiRow[]);
      setPoiCount(count ?? 0);
      // Drop any selected ids no longer in scope.
      setSelectedIds(prev => {
        const visible = new Set((rows ?? []).map(r => r.id));
        const next = new Set<string>();
        prev.forEach(id => { if (visible.has(id)) next.add(id); });
        return next;
      });
    } catch (err) {
      console.error('[geo-scope-pois]', err);
    } finally {
      setLoadingPois(false);
    }
  }, [adminScope]);

  useEffect(() => { refreshPois(); }, [refreshPois]);

  const resetScope = () => {
    setSelectedByLevel({ continent: null, country: null, region: null, zone: null });
    setSelectedIds(new Set());
  };

  const setLevel = (level: AdminLevel, value: string | null) => {
    setSelectedByLevel(prev => {
      const next = { ...prev, [level]: value };
      // Reset descendants
      const idx = LEVEL_ORDER.indexOf(level);
      LEVEL_ORDER.slice(idx + 1).forEach(l => { next[l] = null; });
      return next;
    });
  };

  const allInPageSelected = pois.length > 0 && pois.every(p => selectedIds.has(p.id));
  const togglePoi = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllInPage = () => setSelectedIds(new Set(pois.map(p => p.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleStart = async () => {
    if (job.running) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { toast.error('Sesión expirada'); return; }

      const useExplicit = selectedIds.size > 0;
      let total = 0;
      let label = MODE_LABELS[mode].title;

      if (useExplicit) {
        total = selectedIds.size;
        label = `${MODE_LABELS[mode].title} · ${total} POIs`;
      } else {
        let q = supabase.from('locations').select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .eq('owner_user_id', uid);
        if (mode === 'fill') {
          q = q.or('continent_id.is.null,country_id.is.null,region_id.is.null,zone_id.is.null,locality_id.is.null');
        }
        (Object.entries(adminScope) as Array<[keyof GeocodingAdminScope, string]>).forEach(([k, v]) => {
          q = q.eq(k, v);
        });
        const { count } = await q;
        total = count ?? 0;
        if (hasAnyScope) label = `${MODE_LABELS[mode].title} · ámbito (${total})`;
      }

      if (total === 0) { toast.message('No hay puntos para procesar'); return; }

      await useGeocodingJobStore.getState().start(total, {
        label,
        mode,
        adminScope: hasAnyScope ? adminScope : undefined,
        locationIds: useExplicit ? Array.from(selectedIds) : undefined,
      });
    } catch (err) {
      console.error('[backfill-start]', err);
      toast.error('No se pudo lanzar el backfill');
    }
  };

  const launchLabel = selectedIds.size > 0
    ? `Lanzar sobre selección (${selectedIds.size})`
    : hasAnyScope
      ? `Lanzar sobre ámbito (${poiCount})`
      : `Lanzar (todos mis puntos)`;

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

      {/* Ámbito */}
      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ámbito</h3>
          {(hasAnyScope || selectedIds.size > 0) && (
            <Button variant="ghost" size="sm" className="h-7" onClick={resetScope}>
              <X className="w-3.5 h-3.5 mr-1" /> Limpiar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LEVEL_ORDER.map(level => {
            const opts = optionsByLevel[level];
            const value = selectedByLevel[level];
            const idx = LEVEL_ORDER.indexOf(level);
            const parentReady = level === 'continent' || !!selectedByLevel[LEVEL_ORDER[idx - 1]];
            return (
              <Select
                key={level}
                value={value ?? '__all'}
                onValueChange={(v) => setLevel(level, v === '__all' ? null : v)}
                disabled={!parentReady || opts.length === 0}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={LEVEL_LABEL[level]} />
                </SelectTrigger>
                <SelectContent className="max-h-72 bg-popover z-50">
                  <SelectItem value="__all">{LEVEL_LABEL[level]} — todos</SelectItem>
                  {opts.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Puntos en ámbito: <strong className="text-foreground tabular-nums">{poiCount}</strong>
            {pois.length < poiCount && <> · mostrando {pois.length}</>}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7" onClick={selectAllInPage} disabled={pois.length === 0}>
              {allInPageSelected ? 'Deseleccionar página' : 'Seleccionar página'}
            </Button>
            {selectedIds.size > 0 && (
              <Button variant="ghost" size="sm" className="h-7" onClick={clearSelection}>Ninguno</Button>
            )}
          </div>
        </div>

        <div className="rounded-md border max-h-72 overflow-y-auto divide-y">
          {loadingPois ? (
            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando POIs…
            </div>
          ) : pois.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              {hasAnyScope ? 'No hay POIs en este ámbito.' : 'Selecciona un ámbito para ver POIs.'}
            </div>
          ) : (
            pois.map(p => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"
              >
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onCheckedChange={() => togglePoi(p.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[p.country, p.region].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              </label>
            ))
          )}
        </div>
        {selectedIds.size > 0 && (
          <div className="text-[11px] text-muted-foreground">
            Seleccionados: <strong className="text-foreground">{selectedIds.size}</strong>. Solo se procesarán esos POIs.
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
            {launchLabel}
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
