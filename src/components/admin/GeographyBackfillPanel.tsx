// Domain: Geography — Admin panel block to launch the universal geography
// backfill (fill / reconcile / overwrite / repair) and inspect coverage stats.
//
// Layout:
//  - Para usuarios sin rol admin/master: 2 columnas (árbol propio + acciones).
//  - Para admin/master: 3 columnas (usuarios con cadenas rotas + árbol del
//    usuario seleccionado + acciones).
//
// El árbol no toca filtros del mapa: solo recolecta IDs para el job.
//
// Job "repair" cross-user: el admin puede lanzar reparación contra el
// usuario seleccionado. La inserción en geocoding_jobs registra
// `created_by = admin.uid` y `user_id = target.uid`; el cron sigue
// procesando con permisos de service role como hasta ahora.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Compass, Loader2, Play, RefreshCw, Square, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';
import { useLocationsStore } from '@/domains/content';
import { computeEta, formatDuration, formatClock, formatRate } from '@/shared/geography/eta';
import { GeographyScopeTree } from './GeographyScopeTree';
import { AdminBrokenUsersList, type BrokenUser } from './AdminBrokenUsersList';
import type { GeoLocation } from '@/types/location';

type Mode = 'fill' | 'reconcile' | 'overwrite' | 'repair';

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
  repair: {
    title: 'Reparar cadenas rotas',
    desc: 'Reprocesa solo los puntos con jerarquía inconsistente (region.parent ≠ country, country_code mismatch, etc.).',
  },
  fill: {
    title: 'Rellenar huecos',
    desc: 'Solo procesa puntos sin jerarquía completa. No toca nada existente.',
  },
  reconcile: {
    title: 'Reconciliar',
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Admin detection ---------------------------------------------------------
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<BrokenUser | null>(null);
  const [brokenLocations, setBrokenLocations] = useState<GeoLocation[]>([]);
  const [loadingBroken, setLoadingBroken] = useState(false);
  const [refreshUsersKey, setRefreshUsersKey] = useState(0);

  // Subscribe to documents (own data) — kept for the non-admin layout.
  const documents = useLocationsStore((s) => s.documents);
  const ownLocations = useMemo(() => documents.flatMap((d) => d.locations), [documents]);

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

  // Tick every second while job runs.
  useEffect(() => {
    if (!job.running) return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [job.running]);

  // Coverage --------------------------------------------------------------
  const refreshCoverage = useCallback(async () => {
    setLoadingCov(true);
    try {
      if (isAdmin && targetUser && targetUser.user_id !== selfUserId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('admin_geo_coverage', {
          _user_id: targetUser.user_id,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        setCoverage((row as Coverage) ?? null);
      } else {
        if (!selfUserId) {
          setCoverage(null);
        } else {
          const { data, error } = await supabase
            .from('v_geo_coverage')
            .select(
              'total, with_country, with_admin1, with_timezone, with_postal, resolved, avg_confidence',
            )
            .eq('user_id', selfUserId)
            .maybeSingle();
          if (error) throw error;
          setCoverage((data as Coverage) ?? null);
        }
      }
    } catch (err) {
      console.error('[geo-coverage]', err);
    } finally {
      setLoadingCov(false);
    }
  }, [isAdmin, targetUser, selfUserId]);

  useEffect(() => {
    refreshCoverage();
  }, [refreshCoverage]);

  // Refresh coverage + broken list when job ends.
  useEffect(() => {
    if (!job.running) {
      const t = setTimeout(() => {
        refreshCoverage();
        setRefreshUsersKey((k) => k + 1);
        if (isAdmin && targetUser) {
          void loadBroken(targetUser.user_id);
        } else {
          window.dispatchEvent(new CustomEvent('reload-locations'));
        }
      }, 500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.running, refreshCoverage, isAdmin, targetUser]);

  // Broken locations of the target user ----------------------------------
  const loadBroken = useCallback(async (userId: string) => {
    setLoadingBroken(true);
    setSelectedIds(new Set());
    setBrokenLocations([]);
    try {
      const PAGE_SIZE = 1000;
      let offset = 0;
      const accumulated: GeoLocation[] = [];
      // Page through the RPC until we drain all broken rows. PostgREST caps
      // single RPC responses at 1000 rows, so we must paginate explicitly.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('admin_broken_locations_for_user', {
          _user_id: userId,
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
          country_code: r.country_code ?? undefined,
          place_type: r.place_type ?? undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any;
        accumulated.push(...mapped);
        // Update progressively so the header counter advances live.
        setBrokenLocations([...accumulated]);
        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    } catch (err) {
      console.error('[admin-broken-for-user]', err);
      toast.error('No se pudieron cargar los puntos rotos');
      setBrokenLocations([]);
    } finally {
      setLoadingBroken(false);
    }
  }, []);

  const handleSelectUser = useCallback(
    (u: BrokenUser) => {
      setTargetUser(u);
      setMode('repair');
      void loadBroken(u.user_id);
    },
    [loadBroken],
  );

  // Launch ----------------------------------------------------------------
  const isCrossUser = isAdmin && targetUser && targetUser.user_id !== selfUserId;
  const isAdminTargeted = isAdmin && !!targetUser;
  const treeLocations = isAdminTargeted ? brokenLocations : ownLocations;

  const handleStart = async () => {
    if (job.running) return;
    try {
      const useExplicit = selectedIds.size > 0;
      let total = 0;
      let label = MODE_LABELS[mode].title;
      const ownerId = isCrossUser ? targetUser!.user_id : selfUserId;
      if (!ownerId) {
        toast.error('Sesión expirada');
        return;
      }

      if (useExplicit) {
        total = selectedIds.size;
        label = `${MODE_LABELS[mode].title} · ${total} POIs`;
      } else if (isCrossUser && mode === 'repair') {
        total = brokenLocations.length;
        label = `Reparar @${targetUser!.username ?? targetUser!.user_id.slice(0, 8)} · ${total}`;
      } else if (isCrossUser) {
        // Count target user points
        const { count } = await supabase
          .from('locations')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .eq('owner_user_id', ownerId);
        total = count ?? 0;
      } else {
        let q = supabase
          .from('locations')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .eq('owner_user_id', ownerId);
        if (mode === 'fill') {
          q = q.or(
            'continent_id.is.null,country_id.is.null,region_id.is.null,zone_id.is.null,locality_id.is.null',
          );
        }
        const { count } = await q;
        total = count ?? 0;
      }

      if (total === 0) {
        toast.message('No hay puntos para procesar');
        return;
      }

      // For cross-user repair without explicit selection, pass the broken IDs
      // explicitly so the worker iterates only those.
      const explicitIds = useExplicit
        ? Array.from(selectedIds)
        : isCrossUser && mode === 'repair'
          ? brokenLocations.map((l) => l.id)
          : undefined;

      await useGeocodingJobStore.getState().start(total, {
        label,
        mode,
        locationIds: explicitIds,
        targetUserId: isCrossUser ? targetUser!.user_id : undefined,
      });
    } catch (err) {
      console.error('[backfill-start]', err);
      toast.error('No se pudo lanzar el backfill');
    }
  };

  const launchLabel = (() => {
    if (selectedIds.size > 0) return `Lanzar sobre selección (${selectedIds.size})`;
    if (isCrossUser) {
      return mode === 'repair'
        ? `Reparar ${brokenLocations.length} puntos rotos`
        : `Lanzar sobre @${targetUser!.username ?? 'usuario'} (todos)`;
    }
    return `Lanzar (todos mis puntos)`;
  })();

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  const gridCols = isAdmin
    ? 'lg:grid-cols-[220px_minmax(0,1fr)_300px]'
    : 'lg:grid-cols-[minmax(0,1fr)_300px]';

  return (
    <div className={`flex-1 min-h-0 grid grid-cols-1 ${gridCols} gap-4 p-4 overflow-hidden`}>
      {/* COL 1 — Lista de usuarios (solo admin) */}
      {isAdmin && (
        <AdminBrokenUsersList
          selectedUserId={targetUser?.user_id ?? null}
          onSelect={handleSelectUser}
          refreshKey={refreshUsersKey}
        />
      )}

      {/* COL 2 — Árbol jerárquico */}
      <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            {isAdminTargeted && <Wrench className="w-4 h-4 text-destructive" />}
            <h3 className="text-sm font-semibold">
              {isAdminTargeted
                ? `Cadenas rotas · ${targetUser!.display_name || targetUser!.username || targetUser!.user_id.slice(0, 8)}`
                : 'Selección de POIs'}
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isAdminTargeted
              ? loadingBroken
                ? 'Cargando…'
                : `${brokenLocations.length} puntos rotos`
              : `${ownLocations.length} puntos · jerarquía geográfica`}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          {isAdmin && !targetUser ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground p-6 text-center">
              Selecciona un usuario en la lista de la izquierda para ver sus puntos
              con cadenas geográficas rotas.
            </div>
          ) : isAdminTargeted && loadingBroken ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando puntos rotos…
            </div>
          ) : (
            <GeographyScopeTree
              locations={treeLocations}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
            />
          )}
        </div>
      </section>

      {/* COL 3 — Acciones */}
      <aside className="flex flex-col min-h-0 overflow-y-auto space-y-4 pb-2">
        {/* Cobertura */}
        <section className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold">
                Cobertura{isCrossUser ? ' del usuario' : ' geográfica'}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={refreshCoverage}
              disabled={loadingCov}
            >
              {loadingCov ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
          {loadingCov && !coverage ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : !coverage || coverage.total === 0 ? (
            <div className="text-sm text-muted-foreground">
              {isCrossUser ? 'El usuario no tiene puntos.' : 'No hay puntos en tu cuenta.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 text-sm">
              <CovRow label="Total puntos" value={coverage.total} />
              <CovRow
                label="Resueltos"
                value={`${coverage.resolved} (${pct(coverage.resolved, coverage.total)}%)`}
              />
              <CovRow
                label="Con país"
                value={`${coverage.with_country} (${pct(coverage.with_country, coverage.total)}%)`}
              />
              <CovRow
                label="Con región (ISO)"
                value={`${coverage.with_admin1} (${pct(coverage.with_admin1, coverage.total)}%)`}
              />
              <CovRow
                label="Con timezone"
                value={`${coverage.with_timezone} (${pct(coverage.with_timezone, coverage.total)}%)`}
              />
              <CovRow
                label="Con código postal"
                value={`${coverage.with_postal} (${pct(coverage.with_postal, coverage.total)}%)`}
              />
              <CovRow label="Confianza media" value={coverage.avg_confidence ?? '—'} />
            </div>
          )}
        </section>

        {/* Modo */}
        <section className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Modo de normalización</h3>
          <div className="space-y-2">
            {(['repair', 'fill', 'reconcile', 'overwrite'] as Mode[]).map((m) => (
              <label
                key={m}
                className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
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
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {m === 'repair' && <Wrench className="w-3.5 h-3.5 text-destructive" />}
                    {MODE_LABELS[m].title}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {MODE_LABELS[m].desc}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground pt-1">
            Solo toca campos administrativos y FKs. No modifica nombre, descripción,
            enriquecimiento, fotos, notas ni colecciones.
          </div>
        </section>

        {/* Ejecución */}
        <section className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Ejecución</h3>
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
                        <strong className="text-foreground">{formatDuration(eta.etaMs)}</strong>{' '}
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
              >
                <Square className="w-3.5 h-3.5 mr-2" />
                {job.stopping ? 'Deteniendo…' : 'Detener'}
              </Button>
            </>
          ) : (
            <Button
              onClick={handleStart}
              className="w-full"
              disabled={isAdmin && !targetUser && false /* allow self when no target */}
            >
              <Play className="w-3.5 h-3.5 mr-2" />
              {launchLabel}
            </Button>
          )}
          <div className="text-[11px] text-muted-foreground space-y-1.5">
            <p>
              El proceso se ejecuta en el servidor: continúa aunque cierres el navegador. Solo se
              detiene si pulsas "Detener".
            </p>
            {isCrossUser && (
              <p>
                Lanzando como administrador sobre <strong>@{targetUser!.username ?? targetUser!.user_id.slice(0, 8)}</strong>.
                Quedará registrado en <code>created_by</code>.
              </p>
            )}
            <p>
              Al terminar verás los cambios en: cobertura geográfica (arriba), árbol de selección y
              árbol de "Buscar y Filtrar". Si un punto ya tenía la jerarquía correcta, no aparecerá
              ningún cambio visible aunque se haya procesado.
            </p>
          </div>
        </section>
      </aside>
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
