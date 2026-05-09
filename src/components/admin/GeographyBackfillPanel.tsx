// Domain: Geography — Admin panel block to launch the universal geography
// backfill (fill / reconcile / overwrite / repair) and inspect coverage stats.
//
// Flujo (post-refactor): el "Modo de normalización" es el PASO 1 y dicta el
// universo de puntos (filtro de salud) que se ven en el árbol y en los
// contadores. Cambiar de modo recalcula contadores y selección.
//
//   ┌─ Paso 1 · Modo (4 tarjetas horizontales) ─────────────┐
//   ├─ Usuarios (admin) ┬─ Árbol filtrado ┬─ Lanzar / Job ──┤
//   └─────────────────────────────────────────────────────────┘
//
// Mapa modo → health_filter (single source of truth):
//   repair    → ['broken', 'stale_name']
//   fill      → ['empty', 'partial']
//   reconcile → ['ok', 'stale_name', 'partial', 'broken']  (excluye 'empty')
//   overwrite → todos
//
// El árbol no toca filtros del mapa: solo recolecta IDs para el job.
//
// Job "repair" cross-user: el admin puede lanzar reparación contra el
// usuario seleccionado. La inserción en geocoding_jobs registra
// `created_by = admin.uid` y `user_id = target.uid`; el cron sigue
// procesando con permisos de service role como hasta ahora.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, Play, Square, Wrench, Sparkles, RotateCcw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGeocodingJobStore, type GeoHealth } from '@/stores/geocoding-job-store';
import { computeEta, formatDuration, formatClock, formatRate } from '@/shared/geography/eta';
import { GeographyScopeTree } from './GeographyScopeTree';
import { AdminBrokenUsersList, type BrokenUser } from './AdminBrokenUsersList';
import { cn } from '@/lib/utils';
import type { GeoLocation } from '@/types/location';

type Mode = 'fill' | 'reconcile' | 'overwrite' | 'repair';

interface HealthSummary {
  total: number;
  empty: number;
  broken: number;
  partial: number;
  stale_name: number;
  ok: number;
}

const HEALTH_LABELS: Record<GeoHealth, string> = {
  empty: 'Vacíos',
  broken: 'Rotos',
  partial: 'Parciales',
  stale_name: 'Desactualizados',
  ok: 'Correctos',
};

const HEALTH_TONE: Record<GeoHealth, string> = {
  empty: 'text-muted-foreground bg-muted/40',
  broken: 'text-destructive bg-destructive/10',
  partial: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15',
  stale_name: 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-500/15',
  ok: 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15',
};

interface ModeMeta {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

const MODE_META: Record<Mode, ModeMeta> = {
  repair: {
    title: 'Reparar cadenas rotas',
    desc: 'Solo puntos con jerarquía inconsistente o cuyo nombre no coincide con el catálogo.',
    icon: Wrench,
    iconClass: 'text-destructive',
  },
  fill: {
    title: 'Rellenar huecos',
    desc: 'Solo puntos sin jerarquía completa. No toca nada existente.',
    icon: Plus,
    iconClass: 'text-amber-600',
  },
  reconcile: {
    title: 'Reconciliar',
    desc: 'Recorre todos los puntos no vacíos. Sobrescribe niveles que difieran de OSM.',
    icon: RotateCcw,
    iconClass: 'text-primary',
  },
  overwrite: {
    title: 'Reescribir todo',
    desc: 'Todos los puntos, sobrescribe siempre. Más coste; tras cambios de catálogo.',
    icon: Sparkles,
    iconClass: 'text-purple-500',
  },
};

const ALL_HEALTH: GeoHealth[] = ['empty', 'broken', 'partial', 'stale_name', 'ok'];

/** SOURCE OF TRUTH: cada modo define qué estados de salud entran en el universo. */
export function modeToHealthFilter(mode: Mode): GeoHealth[] {
  switch (mode) {
    case 'repair':
      return ['broken', 'stale_name'];
    case 'fill':
      return ['empty', 'partial'];
    case 'reconcile':
      return ['ok', 'stale_name', 'partial', 'broken'];
    case 'overwrite':
    default:
      return [...ALL_HEALTH];
  }
}

function sumByHealth(s: HealthSummary | null, filter: GeoHealth[]): number {
  if (!s) return 0;
  return filter.reduce((acc, h) => acc + (s[h] ?? 0), 0);
}

export function GeographyBackfillPanel() {
  const [mode, setMode] = useState<Mode>('repair');
  const [, forceTick] = useState(0);
  const job = useGeocodingJobStore();

  // Admin detection ---------------------------------------------------------
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<BrokenUser | null>(null);
  const [refreshUsersKey, setRefreshUsersKey] = useState(0);

  // Universe (driven by mode) ----------------------------------------------
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [universeLocations, setUniverseLocations] = useState<GeoLocation[]>([]);
  const [loadingUniverse, setLoadingUniverse] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const healthFilter = useMemo(() => modeToHealthFilter(mode), [mode]);
  const universeTotal = useMemo(() => sumByHealth(summary, healthFilter), [summary, healthFilter]);

  // The user whose data drives the panel (self if no admin target).
  const activeUserId = isAdmin && targetUser ? targetUser.user_id : selfUserId;
  const isCrossUser = !!(isAdmin && targetUser && targetUser.user_id !== selfUserId);

  // Auth / role ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      if (cancelled) return;
      setSelfUserId(uid);
      if (!uid) return;
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid);
      if (cancelled) return;
      const has = (roles ?? []).some((r) => r.role === 'admin' || r.role === 'master');
      setIsAdmin(has);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick every second while job runs ---------------------------------------
  useEffect(() => {
    if (!job.running) return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [job.running]);

  // Summary ----------------------------------------------------------------
  const refreshSummary = useCallback(async (uid: string) => {
    setLoadingSummary(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_user_geo_summary', {
        _user_id: uid,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setSummary((row as HealthSummary) ?? null);
    } catch (err) {
      console.error('[geo-summary]', err);
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // Universe (paginated) ---------------------------------------------------
  const refreshUniverse = useCallback(
    async (uid: string, filter: GeoHealth[]) => {
      setLoadingUniverse(true);
      setUniverseLocations([]);
      try {
        const PAGE_SIZE = 1000;
        const HARD_CAP = 5000; // tree no escala bien por encima
        let offset = 0;
        const accumulated: GeoLocation[] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase as any).rpc('admin_user_geo_locations', {
            _user_id: uid,
            _health_filter: filter,
            _limit: PAGE_SIZE,
            _offset: offset,
          });
          if (error) throw error;
          const rows = (data ?? []) as Array<Record<string, unknown>>;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped: GeoLocation[] = rows.map((r: any) => ({
            id: r.id,
            name: r.name ?? 'Sin nombre',
            latitude: r.latitude,
            longitude: r.longitude,
            continent: r.continent ?? undefined,
            country: r.country ?? undefined,
            region: r.region ?? undefined,
            zone: r.zone ?? undefined,
            place_type: r.place_type ?? undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any;
          accumulated.push(...mapped);
          setUniverseLocations([...accumulated]);
          if (rows.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
          if (offset >= HARD_CAP) break;
        }
      } catch (err) {
        console.error('[admin-universe]', err);
        toast.error('No se pudieron cargar los puntos del universo');
        setUniverseLocations([]);
      } finally {
        setLoadingUniverse(false);
      }
    },
    [],
  );

  // Reload summary + universe whenever active user or mode changes ---------
  useEffect(() => {
    if (!activeUserId) return;
    void refreshSummary(activeUserId);
  }, [activeUserId, refreshSummary]);

  useEffect(() => {
    if (!activeUserId) {
      setUniverseLocations([]);
      return;
    }
    void refreshUniverse(activeUserId, healthFilter);
    // Drop selection that won't fit the new universe
    setSelectedIds(new Set());
  }, [activeUserId, healthFilter, refreshUniverse]);

  // Refresh after job ends -------------------------------------------------
  useEffect(() => {
    if (!job.running && activeUserId) {
      const t = setTimeout(() => {
        void refreshSummary(activeUserId);
        void refreshUniverse(activeUserId, healthFilter);
        setRefreshUsersKey((k) => k + 1);
        if (!isCrossUser) {
          window.dispatchEvent(new CustomEvent('reload-locations'));
        }
      }, 500);
      return () => clearTimeout(t);
    }
  }, [job.running, activeUserId, healthFilter, isCrossUser, refreshSummary, refreshUniverse]);

  // Handlers ---------------------------------------------------------------
  const handleSelectUser = useCallback((u: BrokenUser) => {
    setTargetUser(u);
    setSelectedIds(new Set());
  }, []);

  const handleStart = async () => {
    if (job.running) return;
    if (!activeUserId) {
      toast.error('Sesión expirada');
      return;
    }
    try {
      const useExplicit = selectedIds.size > 0;
      const total = useExplicit ? selectedIds.size : universeTotal;
      if (total === 0) {
        toast.message('No hay puntos en el universo del modo actual.');
        return;
      }

      const explicitIds = useExplicit ? Array.from(selectedIds) : undefined;
      const userLabel = isCrossUser
        ? `@${targetUser!.username ?? targetUser!.user_id.slice(0, 8)}`
        : 'mis puntos';
      const label = useExplicit
        ? `${MODE_META[mode].title} · selección (${total})`
        : `${MODE_META[mode].title} · ${userLabel} (${total})`;

      await useGeocodingJobStore.getState().start(total, {
        label,
        mode,
        locationIds: explicitIds,
        targetUserId: isCrossUser ? targetUser!.user_id : undefined,
        healthFilter,
      });
    } catch (err) {
      console.error('[backfill-start]', err);
      toast.error('No se pudo lanzar el backfill');
    }
  };

  const launchLabel = (() => {
    if (selectedIds.size > 0) return `Lanzar sobre selección (${selectedIds.size})`;
    return `Lanzar sobre universo (${universeTotal})`;
  })();

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  // Visible tabs for the tree ---------------------------------------------
  const visibleHealthForMode = healthFilter;

  const gridCols = isAdmin
    ? 'lg:grid-cols-[220px_minmax(0,1fr)_320px]'
    : 'lg:grid-cols-[minmax(0,1fr)_320px]';

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 overflow-hidden">
      {/* PASO 1 — Modo de normalización (cabecera) */}
      <section className="rounded-lg border bg-muted/10">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              1
            </span>
            <h3 className="text-sm font-semibold">Modo de normalización</h3>
            <span className="text-[11px] text-muted-foreground">
              Define qué puntos entran en el universo del paso siguiente.
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {visibleHealthForMode.map((h) => (
              <span
                key={h}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium tabular-nums',
                  HEALTH_TONE[h],
                )}
                title={HEALTH_LABELS[h]}
              >
                {HEALTH_LABELS[h]}
                <span className="opacity-70">{summary?.[h] ?? 0}</span>
              </span>
            ))}
            <span className="ml-1 text-muted-foreground">·</span>
            <span className="font-semibold tabular-nums">
              Universo: {loadingSummary ? '…' : universeTotal}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-3">
          {(Object.keys(MODE_META) as Mode[]).map((m) => {
            const meta = MODE_META[m];
            const Icon = meta.icon;
            const filter = modeToHealthFilter(m);
            const count = sumByHealth(summary, filter);
            const isActive = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'text-left rounded-md border p-3 transition-colors',
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:bg-muted/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className={cn('w-4 h-4', meta.iconClass)} />
                    {meta.title}
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-background border">
                    {loadingSummary ? '…' : count}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {meta.desc}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* PASOS 2 + 3 */}
      <div className={`flex-1 min-h-0 grid grid-cols-1 ${gridCols} gap-4 overflow-hidden`}>
        {/* COL 1 — Lista de usuarios (solo admin) */}
        {isAdmin && (
          <AdminBrokenUsersList
            selectedUserId={targetUser?.user_id ?? null}
            onSelect={handleSelectUser}
            refreshKey={refreshUsersKey}
          />
        )}

        {/* COL 2 — Árbol filtrado por el modo */}
        <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                2
              </span>
              <h3 className="text-sm font-semibold">
                Alcance ·{' '}
                {isCrossUser
                  ? targetUser!.display_name || targetUser!.username || 'usuario'
                  : 'mis puntos'}
              </h3>
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide',
                  'bg-primary/10 text-primary',
                )}
              >
                {MODE_META[mode].title}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {loadingUniverse
                ? 'Cargando…'
                : `${universeLocations.length} punto${universeLocations.length === 1 ? '' : 's'} en el universo`}
            </span>
          </div>
          <div className="flex-1 min-h-0">
            {isAdmin && !targetUser ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground p-6 text-center">
                Selecciona un usuario en la lista de la izquierda.
              </div>
            ) : loadingUniverse ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando universo…
              </div>
            ) : universeLocations.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground p-6 text-center">
                Sin puntos en el universo del modo «{MODE_META[mode].title}».
                <br />
                Prueba otro modo.
              </div>
            ) : (
              <GeographyScopeTree
                locations={universeLocations}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
              />
            )}
          </div>
        </section>

        {/* COL 3 — Lanzar */}
        <aside className="flex flex-col min-h-0 overflow-y-auto space-y-4 pb-2">
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                3
              </span>
              <h3 className="text-sm font-semibold">Lanzar</h3>
            </div>
            <div className="text-xs space-y-1.5 rounded-md bg-muted/40 p-2.5">
              <SummaryRow label="Modo" value={MODE_META[mode].title} />
              <SummaryRow
                label="Usuario"
                value={
                  isCrossUser
                    ? `@${targetUser!.username ?? targetUser!.user_id.slice(0, 8)}`
                    : 'self'
                }
              />
              <SummaryRow label="Universo" value={loadingSummary ? '…' : universeTotal} />
              <SummaryRow
                label="Selección"
                value={selectedIds.size > 0 ? selectedIds.size : '— (todo el universo)'}
              />
            </div>

            {job.running ? (
              <>
                <div className="text-sm">
                  Procesados <strong>{job.totalProcessed}</strong> / {job.initialPending} · quedan{' '}
                  {job.remaining}
                  {job.totalUpdated !== job.totalProcessed && (
                    <> · actualizados {job.totalUpdated}</>
                  )}
                  {job.failedThisBatch > 0 && <> · errores {job.failedThisBatch}</>}
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${pct(job.totalProcessed, Math.max(1, job.initialPending))}%`,
                    }}
                  />
                </div>
                {(() => {
                  const eta = computeEta({
                    startedAt: job.startedAt,
                    totalProcessed: job.totalProcessed,
                    remaining: job.remaining,
                  });
                  return (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      Transcurrido{' '}
                      <strong className="text-foreground">{formatDuration(eta.elapsedMs)}</strong>
                      {eta.ratePerMin > 0 && <> · {formatRate(eta.ratePerMin)}</>}
                      {eta.etaMs !== null && eta.finishAt ? (
                        <>
                          {' '}
                          · ETA ~
                          <strong className="text-foreground">
                            {formatDuration(eta.etaMs)}
                          </strong>{' '}
                          · termina ~{formatClock(eta.finishAt)}
                        </>
                      ) : (
                        <> · Calculando ETA…</>
                      )}
                    </div>
                  );
                })()}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => useGeocodingJobStore.getState().stop()}
                  disabled={job.stopping}
                  className="w-full"
                >
                  <Square className="w-3.5 h-3.5 mr-2" />
                  {job.stopping ? 'Deteniendo…' : 'Detener'}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleStart}
                className="w-full"
                disabled={!activeUserId || universeTotal === 0}
              >
                <Play className="w-3.5 h-3.5 mr-2" />
                {launchLabel}
              </Button>
            )}
            <div className="text-[11px] text-muted-foreground space-y-1.5">
              <p>
                Solo toca campos administrativos y FKs. No modifica nombre, descripción,
                enriquecimiento, fotos, notas ni colecciones.
              </p>
              <p>
                El proceso se ejecuta en el servidor: continúa aunque cierres el navegador.
                Solo se detiene si pulsas «Detener».
              </p>
              {isCrossUser && (
                <p>
                  Lanzando como administrador sobre{' '}
                  <strong>
                    @{targetUser!.username ?? targetUser!.user_id.slice(0, 8)}
                  </strong>
                  . Quedará registrado en <code>created_by</code>.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums truncate">{value}</span>
    </div>
  );
}
