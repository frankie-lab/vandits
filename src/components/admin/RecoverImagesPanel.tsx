/**
 * RecoverImagesPanel — Admin console for image recovery / refresh.
 *
 * Hierarchical mental model (matches user spec):
 *
 *   1. UNIVERSO TOTAL (always visible, neutral)
 *      Total → Enriched → With/without photo → Not enriched
 *
 *   2. TIPO DE OPERACIÓN (3 mode cards, mutually exclusive)
 *      - missing  → enriquecidos sin foto (rellenar huecos)
 *      - refresh  → todos los enriquecidos (mejorar / reintentar)
 *      - full     → todos los POIs (reproceso global)
 *
 *   3. FILTROS sobre el universo base
 *      Usuario · Continente · País · Zona  (+ avanzadas)
 *
 *   4. SUBCONJUNTO OPERATIVO + Lanzar
 *      Resumen + botón con N final
 *
 * The actual loop lives in `image-recovery-job-store` and surfaces in the
 * BottomProgressBar lane — closing this panel does NOT abort the job.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ImageOff,
  RefreshCw,
  Play,
  Pause,
  Loader2,
  AlertTriangle,
  ImageIcon,
  Settings2,
  Layers,
  Filter as FilterIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GeographyScopeTree } from './GeographyScopeTree';
import type { BrokenUser } from './AdminBrokenUsersList';
import {
  useImageRecoveryJobStore,
  type ImageRecoveryItemLog,
  type ImageRecoveryMode,
} from '@/stores/image-recovery-job-store';
import { cn } from '@/lib/utils';
import type { GeoLocation } from '@/types/location';

// ─────────────────────────────────────────────────────────────────────────
// Modes
// ─────────────────────────────────────────────────────────────────────────

interface ModeMeta {
  title: string;
  short: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  badgeTone: 'amber' | 'sky' | 'destructive';
  /** Llave del breakdown que define el universo base */
  baseKey: 'pending_candidates' | 'enriched' | 'total_active';
  /** Si ese modo respeta el cooldown */
  honorsCooldown: boolean;
}

const MODE_META: Record<ImageRecoveryMode, ModeMeta> = {
  missing: {
    title: 'Puntos enriquecidos sin foto',
    short: 'faltantes',
    desc: 'POIs enriquecidos sin foto en ninguna fuente. Rellena huecos.',
    icon: ImageOff,
    iconClass: 'text-amber-600',
    badgeTone: 'amber',
    baseKey: 'pending_candidates',
    honorsCooldown: true,
  },
  refresh: {
    title: 'Puntos enriquecidos',
    short: 'refrescar',
    desc: 'Todos los enriquecidos. Re-busca para mejorar atribución / reintentar fuentes.',
    icon: RefreshCw,
    iconClass: 'text-sky-600',
    badgeTone: 'sky',
    baseKey: 'enriched',
    honorsCooldown: true,
  },
  full: {
    title: 'Reprocesar universo',
    short: 'todos',
    desc: 'TODOS los POIs activos, enriquecidos o no. Operación masiva.',
    icon: Layers,
    iconClass: 'text-destructive',
    badgeTone: 'destructive',
    baseKey: 'total_active',
    honorsCooldown: false,
  },
};

const TONE_CLASSES: Record<'amber' | 'sky' | 'destructive', string> = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  destructive: 'bg-destructive/15 text-destructive',
};

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

type Breakdown = {
  total_active: number;
  enriched: number;
  not_enriched: number;
  with_image_any: number;
  image_from_enriched: number;
  image_from_user_url: number;
  image_from_photos_table: number;
  enriched_without_image: number;
  pending_candidates: number;
  in_cooldown: number;
};

export function RecoverImagesPanel() {
  const [mode, setMode] = useState<ImageRecoveryMode>('missing');
  const job = useImageRecoveryJobStore();
  const running = job.running;

  // Admin / target user
  const [isAdmin, setIsAdmin] = useState(false);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<BrokenUser | null>(null);
  const [refreshUsersKey, setRefreshUsersKey] = useState(0);

  // Universe POIs (driven by mode + geo filters + user)
  const [universeLocations, setUniverseLocations] = useState<GeoLocation[]>([]);
  const [loadingUniverse, setLoadingUniverse] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [universeCount, setUniverseCount] = useState<number | null>(null);

  // Global breakdown (universe pyramid)
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);

  // Geo filter (applied on top of mode)
  const [geoFilter, setGeoFilter] = useState<{
    continent: string | null;
    country: string | null;
    zone: string | null;
  }>({ continent: null, country: null, zone: null });

  // Scope counter (subset operativo final)
  const [scopeCount, setScopeCount] = useState<number | null>(null);
  const [loadingScope, setLoadingScope] = useState(false);

  // Advanced options
  const [retryStaleDays, setRetryStaleDays] = useState(30);
  const [batchSize, setBatchSize] = useState(50);
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [maxTotalText, setMaxTotalText] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const meta = MODE_META[mode];
  const activeUserId = isAdmin && targetUser ? targetUser.user_id : selfUserId;
  const isCrossUser = !!(isAdmin && targetUser && targetUser.user_id !== selfUserId);

  // Auth / role bootstrap ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      const uid = user?.id ?? null;
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
      if (has) {
        setTargetUser({
          user_id: uid,
          username: (user?.user_metadata?.username as string | undefined) ?? null,
          display_name:
            (user?.user_metadata?.display_name as string | undefined) ??
            (user?.user_metadata?.full_name as string | undefined) ??
            'Yo',
          broken_count: 0,
          total_locations: 0,
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Global breakdown --------------------------------------------------------
  const refreshGlobalCounts = useCallback(async (currentRetry: number) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_image_recovery_breakdown', {
        _retry_stale_days: currentRetry,
      });
      if (error) { console.error('[image-recovery-breakdown]', error); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      setBreakdown({
        total_active: Number(row.total_active ?? 0),
        enriched: Number(row.enriched ?? 0),
        not_enriched: Number(row.not_enriched ?? 0),
        with_image_any: Number(row.with_image_any ?? 0),
        image_from_enriched: Number(row.image_from_enriched ?? 0),
        image_from_user_url: Number(row.image_from_user_url ?? 0),
        image_from_photos_table: Number(row.image_from_photos_table ?? 0),
        enriched_without_image: Number(row.enriched_without_image ?? 0),
        pending_candidates: Number(row.pending_candidates ?? 0),
        in_cooldown: Number(row.in_cooldown ?? 0),
      });
    } catch (err) {
      console.error('[image-recovery-breakdown]', err);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void refreshGlobalCounts(retryStaleDays);
  }, [isAdmin, retryStaleDays, refreshGlobalCounts]);

  // Universe POIs loader ----------------------------------------------------
  const refreshUniverse = useCallback(
    async (
      uid: string,
      _mode: ImageRecoveryMode,
      _force: boolean,
      _retry: number,
      geo: { continent: string | null; country: string | null; zone: string | null },
    ) => {
      setLoadingUniverse(true);
      setUniverseLocations([]);
      try {
        const PAGE_SIZE = 1000;
        const HARD_CAP = 5000;
        let offset = 0;
        const accumulated: GeoLocation[] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase as any).rpc('admin_image_recovery_locations', {
            _user_id: uid,
            _mode,
            _force,
            _retry_stale_days: _retry,
            _continent: geo.continent,
            _country: geo.country,
            _zone: geo.zone,
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
            enrichedData: {
              datos_geograficos: {
                admin_nivel_3: r.admin_level_3 ?? undefined,
                localidad: r.locality ?? undefined,
                sublocalidad: r.sublocality ?? undefined,
              },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any;
          accumulated.push(...mapped);
          setUniverseLocations([...accumulated]);
          if (rows.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
          if (offset >= HARD_CAP) break;
        }
        setUniverseCount(accumulated.length);
      } catch (err) {
        console.error('[image-recovery-universe]', err);
        toast.error('No se pudieron cargar los puntos del universo');
        setUniverseLocations([]);
        setUniverseCount(0);
      } finally {
        setLoadingUniverse(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeUserId) {
      setUniverseLocations([]);
      setUniverseCount(0);
      return;
    }
    void refreshUniverse(activeUserId, mode, force, retryStaleDays, geoFilter);
    setSelectedIds(new Set());
  }, [activeUserId, mode, force, retryStaleDays, geoFilter, refreshUniverse]);

  // Scope (subset operativo) — debounced ------------------------------------
  const scopeTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    if (scopeTimer.current) window.clearTimeout(scopeTimer.current);
    setLoadingScope(true);
    scopeTimer.current = window.setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('admin_image_recovery_scope', {
          _mode: mode,
          _user_id: activeUserId,
          _continent: geoFilter.continent,
          _country: geoFilter.country,
          _zone: geoFilter.zone,
          _force: force,
          _retry_stale_days: retryStaleDays,
        });
        if (error) throw error;
        setScopeCount(Number(data ?? 0));
      } catch (err) {
        console.error('[image-recovery-scope]', err);
        setScopeCount(null);
      } finally {
        setLoadingScope(false);
      }
    }, 300);
    return () => { if (scopeTimer.current) window.clearTimeout(scopeTimer.current); };
  }, [isAdmin, mode, activeUserId, geoFilter, force, retryStaleDays]);

  // After job ends, refresh -------------------------------------------------
  useEffect(() => {
    if (!running && activeUserId) {
      const t = setTimeout(() => {
        void refreshUniverse(activeUserId, mode, force, retryStaleDays, geoFilter);
        void refreshGlobalCounts(retryStaleDays);
        setRefreshUsersKey((k) => k + 1);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [running, activeUserId, mode, force, retryStaleDays, geoFilter, refreshUniverse, refreshGlobalCounts]);

  // Geo options derived from currently-loaded universe ----------------------
  const geoOptions = useMemo(() => {
    const continents = new Set<string>();
    const countries = new Set<string>();
    const zones = new Set<string>();
    for (const l of universeLocations) {
      if (l.continent) continents.add(l.continent);
      if (l.country && (!geoFilter.continent || l.continent === geoFilter.continent)) {
        countries.add(l.country);
      }
      if (l.zone && (!geoFilter.country || l.country === geoFilter.country)) {
        zones.add(l.zone);
      }
    }
    return {
      continents: Array.from(continents).sort(),
      countries: Array.from(countries).sort(),
      zones: Array.from(zones).sort(),
    };
  }, [universeLocations, geoFilter.continent, geoFilter.country]);

  // Handlers ---------------------------------------------------------------
  const handleSelectUser = useCallback((u: BrokenUser) => {
    setTargetUser(u);
    setSelectedIds(new Set());
  }, []);

  const start = () => {
    if (running) return;
    if (!activeUserId) { toast.error('Sesión expirada'); return; }
    const useExplicit = selectedIds.size > 0;
    const total = useExplicit ? selectedIds.size : (scopeCount ?? 0);
    if (total === 0) { toast.message('No hay POIs en el subconjunto operativo.'); return; }
    const maxTotalNum = maxTotalText.trim() ? Math.max(1, Number(maxTotalText)) : null;

    void useImageRecoveryJobStore.getState().start({
      scope: useExplicit ? 'ids' : 'user',
      // explicit total so progress bar reflects subconjunto operativo, not batch
      // (passed below as 2nd arg)
      mode,
      userId: useExplicit ? undefined : activeUserId,
      locationIds: useExplicit ? Array.from(selectedIds) : undefined,
      batchSize,
      dryRun,
      force,
      retryStaleDays,
      maxTotal: Number.isFinite(maxTotalNum as number) ? maxTotalNum : null,
      continent: geoFilter.continent,
      country: geoFilter.country,
      zone: geoFilter.zone,
      createdBefore: createdBefore ? `${createdBefore}T00:00:00Z` : null,
      createdAfter: createdAfter ? `${createdAfter}T00:00:00Z` : null,
    }, total);
  };

  const stop = () => useImageRecoveryJobStore.getState().stop();

  const launchLabel = (() => {
    const verb = dryRun ? 'Dry-run' : (mode === 'missing' ? 'Recuperar' : mode === 'refresh' ? 'Refrescar' : 'Reprocesar');
    if (selectedIds.size > 0) return `${verb} selección (${selectedIds.size})`;
    return `${verb} subconjunto (${scopeCount ?? '…'})`;
  })();

  const gridCols = isAdmin
    ? 'lg:grid-cols-[220px_minmax(0,1fr)_320px]'
    : 'lg:grid-cols-[minmax(0,1fr)_320px]';

  const userLabel = isCrossUser
    ? targetUser!.display_name || targetUser!.username || 'usuario'
    : 'mis puntos';

  const isMassive = selectedIds.size === 0 && (scopeCount ?? 0) > 200;
  const baseUniverseForMode = breakdown ? breakdown[meta.baseKey] : null;
  const baseUniverseAdjustedForce = (() => {
    if (!breakdown) return null;
    if (mode === 'missing' && force) return breakdown.pending_candidates + breakdown.in_cooldown;
    return breakdown[meta.baseKey];
  })();
  const filtersActive =
    !!geoFilter.continent || !!geoFilter.country || !!geoFilter.zone || isCrossUser;

  return (
    <section className="border rounded-lg bg-card flex flex-col min-h-0 overflow-hidden">
      {running && (
        <header className="flex items-center gap-2 p-3 border-b shrink-0">
          <Badge variant="outline" className="text-xs ml-auto">
            En marcha · ver barra inferior
          </Badge>
        </header>
      )}

      <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 overflow-hidden">
        <div className="shrink-0 flex flex-col gap-4 max-h-[55%] overflow-y-auto pr-1">

        {/* ────── TIPO DE OPERACIÓN ──────────────────────────────────── */}
        <section className="rounded-lg border bg-muted/10">
          <div className="px-3 pt-2.5 pb-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Tipo de operación <span className="normal-case text-muted-foreground/70">· elige el universo base</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3">
            {/* UNIVERSO — solo informativa */}
            <div className="relative text-left rounded-lg border border-dashed border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Layers className="w-4 h-4 shrink-0" />
                <span className="truncate">Total puntos</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground">
                  {breakdown ? breakdown.total_active.toLocaleString() : '…'}
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">POIs</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 leading-snug">
                Total de alcance de puntos en la APP.
              </div>
            </div>
            {(['refresh', 'missing'] as ImageRecoveryMode[]).map((m) => {
              const mm = MODE_META[m];
              const Icon = mm.icon;
              const baseCount = breakdown
                ? (m === 'missing' && force
                    ? breakdown.pending_candidates + breakdown.in_cooldown
                    : breakdown[mm.baseKey])
                : null;
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'group relative text-left rounded-lg border p-4 transition-all',
                    isActive
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/40 shadow-sm'
                      : 'border-border hover:bg-muted/30 hover:border-muted-foreground/40',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className={cn('w-4 h-4 shrink-0', mm.iconClass)} />
                    <span className="truncate">{mm.title}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className={cn(
                      'text-3xl font-bold tabular-nums leading-none tracking-tight',
                      isActive ? 'text-primary' : 'text-foreground',
                    )}>
                      {baseCount == null ? '…' : baseCount.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">POIs</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-2 leading-snug">
                    {mm.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Filtros geo: ya no se duplican aquí. Se eligen desde el árbol "Subconjunto" más abajo. */}

        {/* Opciones avanzadas */}
        <section className="rounded-lg border bg-background">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold hover:bg-muted/30"
          >
            <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
            Opciones avanzadas
            <span className="ml-auto text-[11px] text-muted-foreground font-normal">
              cooldown {meta.honorsCooldown ? `${retryStaleDays}d` : 'n/a'} · {dryRun ? 'dry-run' : 'escribe en BD'}
              {force ? ' · force' : ''}
            </span>
          </button>
          {advancedOpen && (
            <div className="px-4 pb-4 pt-1 space-y-4 border-t">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Reintentar tras: <span className="font-mono">{retryStaleDays}</span> días
                </Label>
                <Slider
                  value={[retryStaleDays]}
                  onValueChange={(v) => setRetryStaleDays(v[0])}
                  min={0} max={180} step={1}
                  disabled={running || !meta.honorsCooldown || force}
                />
                {!meta.honorsCooldown && (
                  <p className="text-[11px] text-muted-foreground">
                    El modo "{meta.title}" no usa cooldown.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Creados antes de</Label>
                  <Input type="date" value={createdBefore}
                    onChange={(e) => setCreatedBefore(e.target.value)}
                    disabled={running} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Creados después de</Label>
                  <Input type="date" value={createdAfter}
                    onChange={(e) => setCreatedAfter(e.target.value)}
                    disabled={running} className="h-8 text-sm" />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Switch checked={force} onCheckedChange={setForce} disabled={running} id="force" />
                <Label htmlFor="force" className="text-sm cursor-pointer">
                  Force (ignora cooldown e intentos previos)
                </Label>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Switch checked={dryRun} onCheckedChange={setDryRun} disabled={running} id="dryrun" />
                <Label htmlFor="dryrun" className="text-sm cursor-pointer">
                  Dry-run (no escribe en BD)
                </Label>
                {!dryRun && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
              </div>
            </div>
          )}
        </section>
        </div>

        {/* ────── Filas inferiores: Usuarios · Árbol · Lanzar ───────── */}
        <div className={`flex-1 min-h-0 grid grid-cols-1 ${gridCols} gap-4 overflow-hidden`}>
          {/* COL 1 — Usuarios */}
          {isAdmin && (
            <ImageRecoveryUsersList
              selectedUserId={targetUser?.user_id ?? null}
              onSelect={handleSelectUser}
              refreshKey={refreshUsersKey}
              mode={mode}
              force={force}
              retryStaleDays={retryStaleDays}
              modeTitle={meta.title}
              badgeTone={meta.badgeTone}
              geo={geoFilter}
            />
          )}

          {/* COL 2 — Árbol */}
          <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden min-h-[320px]">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shrink-0">
                  •
                </span>
                <h3 className="text-sm font-semibold truncate">Subconjunto · {userLabel}</h3>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide shrink-0',
                  TONE_CLASSES[meta.badgeTone],
                )}>
                  {meta.short}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {loadingUniverse
                  ? 'Cargando…'
                  : `${universeLocations.length} POI${universeLocations.length === 1 ? '' : 's'}`}
              </span>
            </div>
            <div className="flex-1 min-h-0 min-h-[280px]">
              <GeographyScopeTree
                locations={universeLocations}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
              />
            </div>
          </section>

          {/* COL 3 — Lanzar */}
          <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
              <Play className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-sm font-semibold">4 · Subconjunto operativo</h3>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
              <div className="rounded-md border bg-muted/10 px-3 py-2 text-xs space-y-1.5">
                <SummaryRow label="Universo base" value={(baseUniverseAdjustedForce ?? 0).toLocaleString()} sub={meta.title} />
                <SummaryRow label="Usuario" value={isCrossUser ? `@${targetUser!.username ?? targetUser!.user_id.slice(0, 8)}` : 'self'} />
                {(geoFilter.continent || geoFilter.country || geoFilter.zone) && (
                  <SummaryRow
                    label="Geo"
                    value={[geoFilter.continent, geoFilter.country, geoFilter.zone].filter(Boolean).join(' · ')}
                  />
                )}
                <div className="border-t pt-1.5 flex items-baseline justify-between">
                  <span className="text-[11px] text-muted-foreground">Subconjunto operativo</span>
                  <span className="text-base font-bold tabular-nums text-primary">
                    {loadingScope ? '…' : (scopeCount ?? 0).toLocaleString()}
                  </span>
                </div>
                {selectedIds.size > 0 && (
                  <SummaryRow label="Selección manual" value={selectedIds.size.toLocaleString()} />
                )}
              </div>

              {isMassive && (
                <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 leading-snug">
                  <div className="flex items-center gap-1.5 font-semibold mb-0.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Operación masiva
                  </div>
                  Vas a procesar {(scopeCount ?? 0).toLocaleString()} POIs.
                  Para acotar usa el árbol, los filtros geo o las opciones avanzadas.
                </div>
              )}

              {!running ? (
                <Button onClick={start} className="w-full gap-2"
                  disabled={(scopeCount ?? 0) === 0 && selectedIds.size === 0}>
                  <Play className="w-4 h-4" />
                  {launchLabel}
                </Button>
              ) : (
                <Button onClick={stop} variant="secondary" className="w-full gap-2" disabled={job.stopping}>
                  {job.stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                  Detener tras lote actual
                </Button>
              )}

              <p className="text-[11px] text-muted-foreground leading-snug">
                {mode === 'missing'
                  ? 'Solo escribe enriched_data.imagen y marca el intento. No modifica nombre, descripción, enriquecimiento ni notas.'
                  : mode === 'refresh'
                    ? 'Re-busca imagen para POIs ya enriquecidos. Si encuentra una mejor, sobrescribe enriched_data.imagen y la atribución.'
                    : 'Procesa TODOS los POIs activos. Solo afecta al campo de imagen.'}
              </p>

              {(job.scanned > 0 || running) && (() => {
                const m = getImageRecoveryMetrics(job);
                const updatedLabel = (job.config?.dryRun ?? dryRun) ? 'Encontrarían' : 'Actualizados';
                return (
                  <div className="border rounded p-2.5 bg-muted/30 space-y-1.5">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <Stat label="Avance" value={`${m.progressLabel}${m.progressPct != null ? ` (${formatPct(m.progressPct)})` : ''}`} />
                      <Stat label="Lote" value={job.waves} />
                      <Stat label={updatedLabel} value={`${m.updateLabel} (${formatPct(m.updateRatePct)})`} tone="success" />
                      <Stat label="Sin imagen" value={`${m.noImageLabel} (${formatPct(m.noImageRatePct)})`} />
                      <Stat label="Fallos téc." value={`${m.failedLabel} (${formatPct(m.technicalFailRatePct)})`} />
                      <Stat label="Saltados" value={m.skippedLabel} />
                    </div>
                    {m.scanned > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Éxito técnico: {formatPct(m.technicalSuccessRatePct)} · (actualizados + sin imagen) / escaneados
                      </p>
                    )}
                    <Button variant="ghost" size="sm"
                      onClick={() => useImageRecoveryJobStore.getState().reset()}
                      disabled={running} className="w-full h-7 text-xs">
                      Limpiar resultados
                    </Button>
                  </div>
                );
              })()}

              {job.recentItems.length > 0 && (
                <div className="border rounded">
                  <div className="text-[11px] font-semibold px-2 py-1.5 border-b bg-muted/30">
                    Últimos {job.recentItems.length} POIs
                  </div>
                  <ul className="max-h-48 overflow-y-auto divide-y text-[11px]">
                    {job.recentItems.map((it, i) => (
                      <li key={`${it.id}-${i}`} className="px-2 py-1 flex items-center gap-1.5">
                        <ResultBadge result={it.result} />
                        <span className="flex-1 truncate">{it.name ?? it.id}</span>
                        {it.source && (
                          <code className="text-[10px] text-muted-foreground">{it.source}</code>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function UniversePyramid({ breakdown }: { breakdown: Breakdown | null }) {
  return (
    <section className="rounded-lg border bg-background">
      <header className="px-4 py-2.5 border-b flex items-center gap-2">
        <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          1 · Universo total
        </h4>
        <span className="ml-auto text-[11px] text-muted-foreground">desglose por fuente de imagen</span>
      </header>
      {breakdown == null ? (
        <div className="px-4 py-6 text-xs text-muted-foreground">Cargando desglose…</div>
      ) : (
        <ul className="px-4 py-3 text-xs space-y-1.5 font-mono">
          <PyramidRow label="Total POIs activos" value={breakdown.total_active} bold />
          <PyramidRow label="└ Enriquecidos" value={breakdown.enriched} indent={3} />
          <PyramidRow label="├ Con foto (cualquier fuente)" value={breakdown.with_image_any} indent={8} />
          <PyramidRow label="· IA / scraping (enriched_data.imagen)" value={breakdown.image_from_enriched} indent={12} muted />
          <PyramidRow label="· Subida por el usuario (user_image_url)" value={breakdown.image_from_user_url} indent={12} muted />
          <PyramidRow label="· Galería (location_photos)" value={breakdown.image_from_photos_table} indent={12} muted />
          <li className="flex items-baseline pl-8">
            <span className="text-amber-700 dark:text-amber-400 font-semibold">└ Sin foto</span>
            <span className="flex-1 mx-2 border-b border-dotted border-border/60" />
            <span className="tabular-nums font-bold text-amber-700 dark:text-amber-400">
              {breakdown.enriched_without_image.toLocaleString()}
            </span>
          </li>
          <PyramidRow label="└ No enriquecidos" value={breakdown.not_enriched} indent={3} muted />
        </ul>
      )}
    </section>
  );
}

function PyramidRow({
  label, value, indent = 0, bold, muted,
}: { label: string; value: number; indent?: number; bold?: boolean; muted?: boolean }) {
  return (
    <li className="flex items-baseline" style={{ paddingLeft: indent * 4 }}>
      <span className={cn(
        muted ? 'text-muted-foreground/80' : 'text-foreground',
        muted && 'text-[11px]',
      )}>{label}</span>
      <span className="flex-1 mx-2 border-b border-dotted border-border/60" />
      <span className={cn(
        'tabular-nums',
        bold ? 'font-semibold text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground',
      )}>{value.toLocaleString()}</span>
    </li>
  );
}

function GeoSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={options.length === 0}
        className="w-full h-8 text-sm rounded-md border bg-background px-2 disabled:opacity-50"
      >
        <option value="">— Todos —</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

interface UsersListProps {
  selectedUserId: string | null;
  onSelect: (u: BrokenUser) => void;
  refreshKey: number;
  mode: ImageRecoveryMode;
  force: boolean;
  retryStaleDays: number;
  modeTitle: string;
  badgeTone: 'amber' | 'sky' | 'destructive';
  geo: { continent: string | null; country: string | null; zone: string | null };
}

function ImageRecoveryUsersList({
  selectedUserId, onSelect, refreshKey, mode, force, retryStaleDays, modeTitle, badgeTone, geo,
}: UsersListProps) {
  const [users, setUsers] = useState<BrokenUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_image_recovery_users', {
        _mode: mode,
        _force: force,
        _retry_stale_days: retryStaleDays,
        _continent: geo.continent,
        _country: geo.country,
        _zone: geo.zone,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: BrokenUser[] = (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        username: r.username ?? null,
        display_name: r.display_name ?? null,
        broken_count: Number(r.universe_count ?? 0),
        total_locations: Number(r.total_locations ?? 0),
      }));
      setUsers(mapped);
    } catch (err) {
      console.error('[image-recovery-users]', err);
      setError(err instanceof Error ? err.message : 'Error');
    } finally { setLoading(false); }
  }, [mode, force, retryStaleDays, geo.continent, geo.country, geo.zone]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const toneClass = TONE_CLASSES[badgeTone];

  return (
    <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shrink-0">
            •
          </span>
          <h3 className="text-sm font-semibold truncate" title={modeTitle}>
            Usuarios · {modeTitle}
          </h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <div className="p-3 text-xs text-destructive">{error}</div>
        ) : loading && users.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Cargando…</div>
        ) : users.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            Ningún usuario con candidatos en este modo.
          </div>
        ) : (
          <ul className="divide-y">
            {users.map((u) => {
              const isSelected = u.user_id === selectedUserId;
              const label = u.display_name || u.username || u.user_id.slice(0, 8);
              const sub = u.username ? `@${u.username}` : u.user_id.slice(0, 8);
              return (
                <li key={u.user_id}>
                  <button type="button" onClick={() => onSelect(u)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors',
                      isSelected && 'bg-primary/10',
                    )}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className={cn(
                        'inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums',
                        toneClass,
                      )}>
                        {u.broken_count.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        de {u.total_locations.toLocaleString()}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function SummaryRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-muted-foreground">
        {label}
        {sub && <span className="ml-1 text-muted-foreground/60">· {sub}</span>}
      </span>
      <span className="text-[11px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warn' }) {
  const color =
    tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : 'text-foreground';
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-mono text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function ResultBadge({ result }: { result: ImageRecoveryItemLog['result'] }) {
  const map: Record<ImageRecoveryItemLog['result'], { label: string; cls: string }> = {
    found: { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    none: { label: '—', cls: 'bg-muted text-muted-foreground' },
    skipped: { label: 'SKIP', cls: 'bg-muted text-muted-foreground' },
    transient: { label: 'RETRY', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  };
  const m = map[result];
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${m.cls}`}>{m.label}</span>;
}
