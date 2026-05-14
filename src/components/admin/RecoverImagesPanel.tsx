/**
 * RecoverImagesPanel — Admin console to launch the retroactive
 * `recover-missing-images` job.
 *
 * Layout: same 3-zone structure as GeographyBackfillPanel.
 *
 *   ┌─ PASO 1 · Modo (tarjetas con métrica del universo) ─────────┐
 *   ├─ Usuarios (admin) ┬─ Árbol geográfico ┬─ Lanzar / Job ──────┤
 *   └────────────────────────────────────────────────────────────┘
 *
 * The actual loop, progress and stop controls live in the global
 * `image-recovery-job-store` and are surfaced by `ImageRecoveryLane`
 * inside the BottomProgressBar — closing this panel does NOT abort the job.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ImageOff,
  RefreshCw,
  Play,
  Pause,
  Loader2,
  AlertTriangle,
  ImageIcon,
  Settings2,
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
} from '@/stores/image-recovery-job-store';
import { cn } from '@/lib/utils';
import type { GeoLocation } from '@/types/location';

type Mode = 'pending' | 'force';

interface ModeMeta {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  badgeTone: 'amber' | 'destructive';
  force: boolean;
}

const MODE_META: Record<Mode, ModeMeta> = {
  pending: {
    title: 'Pendientes (recomendado)',
    desc: 'POIs enriquecidos sin imagen que aún no se han intentado o cuyo último intento es más antiguo que el cooldown.',
    icon: ImageOff,
    iconClass: 'text-amber-600',
    badgeTone: 'amber',
    force: false,
  },
  force: {
    title: 'Reintentar todos',
    desc: 'Ignora intentos previos: re-busca imagen para todo POI enriquecido sin imagen aunque ya se haya intentado.',
    icon: RefreshCw,
    iconClass: 'text-destructive',
    badgeTone: 'destructive',
    force: true,
  },
};

export function RecoverImagesPanel() {
  const [mode, setMode] = useState<Mode>('pending');
  const job = useImageRecoveryJobStore();
  const running = job.running;

  // Admin / target user
  const [isAdmin, setIsAdmin] = useState(false);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<BrokenUser | null>(null);
  const [refreshUsersKey, setRefreshUsersKey] = useState(0);

  // Universe (per active user + mode)
  const [universeLocations, setUniverseLocations] = useState<GeoLocation[]>([]);
  const [loadingUniverse, setLoadingUniverse] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [universeCount, setUniverseCount] = useState<number | null>(null);

  // Global breakdown for the "Universe" card + mode counts
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
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const globalCounts: Record<Mode, number | null> = {
    pending: breakdown?.pending_candidates ?? null,
    force: breakdown == null ? null : breakdown.pending_candidates + breakdown.in_cooldown,
  };

  // Advanced options
  const [retryStaleDays, setRetryStaleDays] = useState(30);
  const [batchSize, setBatchSize] = useState(50);
  const [dryRun, setDryRun] = useState(true);
  const [maxTotalText, setMaxTotalText] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const meta = MODE_META[mode];
  const force = meta.force;

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
    return () => {
      cancelled = true;
    };
  }, []);

  // Global breakdown (drives Universe card + mode card counts) ---------------
  const refreshGlobalCounts = useCallback(
    async (currentRetry: number) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('admin_image_recovery_breakdown', {
          _retry_stale_days: currentRetry,
        });
        if (error) {
          console.error('[image-recovery-breakdown]', error);
          return;
        }
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
    },
    [],
  );

  useEffect(() => {
    if (!isAdmin) return;
    void refreshGlobalCounts(retryStaleDays);
  }, [isAdmin, retryStaleDays, refreshGlobalCounts]);

  // Universe loader ---------------------------------------------------------
  const refreshUniverse = useCallback(
    async (uid: string, _force: boolean, _retry: number) => {
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
            _force,
            _retry_stale_days: _retry,
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
    void refreshUniverse(activeUserId, force, retryStaleDays);
    setSelectedIds(new Set());
  }, [activeUserId, force, retryStaleDays, refreshUniverse]);

  // After job ends, refresh -------------------------------------------------
  useEffect(() => {
    if (!running && activeUserId) {
      const t = setTimeout(() => {
        void refreshUniverse(activeUserId, force, retryStaleDays);
        void refreshGlobalCounts(retryStaleDays);
        setRefreshUsersKey((k) => k + 1);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [running, activeUserId, force, retryStaleDays, refreshUniverse, refreshGlobalCounts]);

  // Handlers ----------------------------------------------------------------
  const handleSelectUser = useCallback((u: BrokenUser) => {
    setTargetUser(u);
    setSelectedIds(new Set());
  }, []);

  const start = () => {
    if (running) return;
    if (!activeUserId) {
      toast.error('Sesión expirada');
      return;
    }
    const useExplicit = selectedIds.size > 0;
    const total = useExplicit ? selectedIds.size : (universeCount ?? universeLocations.length);
    if (total === 0) {
      toast.message('No hay POIs candidatos en este modo.');
      return;
    }
    const maxTotalNum = maxTotalText.trim() ? Math.max(1, Number(maxTotalText)) : null;

    void useImageRecoveryJobStore.getState().start({
      scope: useExplicit ? 'ids' : 'user',
      userId: useExplicit ? undefined : activeUserId,
      locationIds: useExplicit ? Array.from(selectedIds) : undefined,
      batchSize,
      dryRun,
      force,
      retryStaleDays,
      maxTotal: Number.isFinite(maxTotalNum as number) ? maxTotalNum : null,
      country: null,
      region: null,
      zone: null,
      createdBefore: createdBefore ? `${createdBefore}T00:00:00Z` : null,
      createdAfter: createdAfter ? `${createdAfter}T00:00:00Z` : null,
    });
  };

  const stop = () => useImageRecoveryJobStore.getState().stop();

  const launchLabel = (() => {
    const verb = dryRun ? 'Dry-run' : 'Recuperar';
    if (selectedIds.size > 0) return `${verb} sobre selección (${selectedIds.size})`;
    return `${verb} sobre universo (${universeCount ?? '…'})`;
  })();

  const gridCols = isAdmin
    ? 'lg:grid-cols-[220px_minmax(0,1fr)_320px]'
    : 'lg:grid-cols-[minmax(0,1fr)_320px]';

  const userLabel = isCrossUser
    ? targetUser!.display_name || targetUser!.username || 'usuario'
    : 'mis puntos';

  const isMassive = selectedIds.size === 0 && (universeCount ?? 0) > 0;

  return (
    <section className="border rounded-lg bg-card flex flex-col min-h-0 overflow-hidden">
      <header className="flex items-center gap-2 p-3 border-b shrink-0">
        <ImageIcon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Recuperar imágenes faltantes</h3>
        <Badge variant="secondary" className="text-xs">retroactivo</Badge>
        {running && (
          <Badge variant="outline" className="text-xs ml-auto">
            En marcha · ver barra inferior
          </Badge>
        )}
      </header>

      <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 overflow-auto">
        {/* Subheader */}
        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          <p>
            Reintenta búsqueda multi-fuente (Wikipedia, Commons, Wikidata, Openverse) para POIs ya
            enriquecidos sin imagen. Empieza siempre con <strong className="text-foreground">dry-run</strong> para
            medir cobertura. El progreso aparece en la barra inferior y sobrevive al cierre de este panel.
          </p>
        </div>

        {/* PASO 0 — Universo del panel (desglose por fuente de imagen) */}
        <section className="rounded-lg border bg-background">
          <header className="px-4 py-2.5 border-b flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Universo del panel
            </h4>
            <span className="ml-auto text-[11px] text-muted-foreground">
              de dónde sale el conteo de candidatos
            </span>
          </header>
          {breakdown == null ? (
            <div className="px-4 py-6 text-xs text-muted-foreground">Cargando desglose…</div>
          ) : (
            <ul className="px-4 py-3 text-xs space-y-1.5 font-mono">
              <li className="flex items-baseline">
                <span className="text-foreground">Total POIs activos</span>
                <span className="flex-1 mx-2 border-b border-dotted border-border/60" />
                <span className="tabular-nums font-semibold text-foreground">{breakdown.total_active.toLocaleString()}</span>
              </li>
              <li className="flex items-baseline pl-3">
                <span className="text-muted-foreground">└ Enriquecidos</span>
                <span className="flex-1 mx-2 border-b border-dotted border-border/60" />
                <span className="tabular-nums text-foreground">{breakdown.enriched.toLocaleString()}</span>
              </li>
              <li className="flex items-baseline pl-8">
                <span className="text-muted-foreground">├ Con foto (cualquier fuente)</span>
                <span className="flex-1 mx-2 border-b border-dotted border-border/60" />
                <span className="tabular-nums text-foreground">{breakdown.with_image_any.toLocaleString()}</span>
              </li>
              <li className="flex items-baseline pl-12 text-[11px] text-muted-foreground/80">
                <span>· IA / scraping (enriched_data.imagen)</span>
                <span className="flex-1 mx-2" />
                <span className="tabular-nums">{breakdown.image_from_enriched.toLocaleString()}</span>
              </li>
              <li className="flex items-baseline pl-12 text-[11px] text-muted-foreground/80">
                <span>· Subida por el usuario (user_image_url)</span>
                <span className="flex-1 mx-2" />
                <span className="tabular-nums">{breakdown.image_from_user_url.toLocaleString()}</span>
              </li>
              <li className="flex items-baseline pl-12 text-[11px] text-muted-foreground/80">
                <span>· Galería (location_photos)</span>
                <span className="flex-1 mx-2" />
                <span className="tabular-nums">{breakdown.image_from_photos_table.toLocaleString()}</span>
              </li>
              <li className="flex items-baseline pl-8">
                <span className="text-amber-700 dark:text-amber-400 font-semibold">└ Sin foto · candidatos</span>
                <span className="flex-1 mx-2 border-b border-dotted border-border/60" />
                <span className="tabular-nums font-bold text-amber-700 dark:text-amber-400">
                  {breakdown.enriched_without_image.toLocaleString()}
                </span>
              </li>
              <li className="flex items-baseline pl-3">
                <span className="text-muted-foreground/70">└ No enriquecidos</span>
                <span className="flex-1 mx-2 border-b border-dotted border-border/60" />
                <span className="tabular-nums text-muted-foreground">
                  {breakdown.not_enriched.toLocaleString()}
                  <span className="ml-1 text-[10px]">(no aplican)</span>
                </span>
              </li>
            </ul>
          )}
        </section>

        {/* PASO 1 — Tarjetas de modo (acciones sobre el subconjunto "sin foto") */}
        <section className="rounded-lg border bg-muted/10">
          <div className="px-3 pt-2.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            Acción sobre los <strong className="text-foreground normal-case">{(breakdown?.enriched_without_image ?? 0).toLocaleString()} POIs sin foto</strong>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
            {(Object.keys(MODE_META) as Mode[]).map((m) => {
              const mm = MODE_META[m];
              const Icon = mm.icon;
              const count = globalCounts[m];
              const isActive = mode === m;
              const subtitle = m === 'pending'
                ? `Nunca intentados o último intento > ${retryStaleDays}d`
                : `Incluye ${(breakdown?.in_cooldown ?? 0).toLocaleString()} ya intentados en cooldown`;
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
                    <span
                      className={cn(
                        'text-3xl font-bold tabular-nums leading-none tracking-tight',
                        isActive ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {count == null ? '…' : count.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {count === 1 ? 'POI' : 'POIs'}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-2 leading-snug">
                    {subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Opciones avanzadas (colapsable) */}
        <section className="rounded-lg border bg-background">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold hover:bg-muted/30"
          >
            <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
            Opciones avanzadas
            <span className="ml-auto text-[11px] text-muted-foreground font-normal">
              lote {batchSize} · cooldown {retryStaleDays}d · {dryRun ? 'dry-run' : 'escribe en BD'}
              {maxTotalText && ` · tope ${maxTotalText}`}
            </span>
          </button>
          {advancedOpen && (
            <div className="px-4 pb-4 pt-1 space-y-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tamaño de lote</Label>
                  <Input
                    type="number"
                    value={batchSize}
                    min={1}
                    max={200}
                    onChange={(e) =>
                      setBatchSize(Math.min(200, Math.max(1, Number(e.target.value) || 50)))
                    }
                    disabled={running}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tope total (parar tras N escaneados)</Label>
                  <Input
                    type="number"
                    value={maxTotalText}
                    onChange={(e) => setMaxTotalText(e.target.value)}
                    placeholder="vacío = sin tope"
                    min={1}
                    disabled={running}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Reintentar tras: <span className="font-mono">{retryStaleDays}</span> días
                </Label>
                <Slider
                  value={[retryStaleDays]}
                  onValueChange={(v) => setRetryStaleDays(v[0])}
                  min={0}
                  max={180}
                  step={1}
                  disabled={running || force}
                />
                {force && (
                  <p className="text-[11px] text-muted-foreground">
                    Inactivo en modo "Reintentar todos".
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Creados antes de</Label>
                  <Input
                    type="date"
                    value={createdBefore}
                    onChange={(e) => setCreatedBefore(e.target.value)}
                    disabled={running}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Creados después de</Label>
                  <Input
                    type="date"
                    value={createdAfter}
                    onChange={(e) => setCreatedAfter(e.target.value)}
                    disabled={running}
                    className="h-8 text-sm"
                  />
                </div>
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

        {/* PASOS 2 + 3 */}
        <div className={`grid grid-cols-1 ${gridCols} gap-4`}>
          {/* COL 1 — Lista de usuarios */}
          {isAdmin && (
            <ImageRecoveryUsersList
              selectedUserId={targetUser?.user_id ?? null}
              onSelect={handleSelectUser}
              refreshKey={refreshUsersKey}
              force={force}
              retryStaleDays={retryStaleDays}
              modeTitle={meta.title}
              badgeTone={meta.badgeTone}
            />
          )}

          {/* COL 2 — Árbol */}
          <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden min-h-[320px]">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shrink-0">
                  2
                </span>
                <h3 className="text-sm font-semibold truncate">Alcance · {userLabel}</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide bg-primary/10 text-primary shrink-0">
                  {meta.title}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {loadingUniverse
                  ? 'Cargando…'
                  : `${universeLocations.length} POI${universeLocations.length === 1 ? '' : 's'} en el universo`}
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
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                3
              </span>
              <h3 className="text-sm font-semibold">Lanzar</h3>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
              <div className="rounded-md border bg-muted/10 px-3 py-2 text-xs space-y-1.5">
                <SummaryRow label="Modo" value={meta.title} />
                <SummaryRow label="Usuario" value={isCrossUser ? `@${targetUser!.username ?? targetUser!.user_id.slice(0, 8)}` : 'self'} />
                <SummaryRow label="Universo" value={(universeCount ?? 0).toLocaleString()} />
                <SummaryRow
                  label="Selección"
                  value={selectedIds.size > 0 ? selectedIds.size.toLocaleString() : '— (todo el universo)'}
                />
              </div>

              {isMassive && (
                <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 leading-snug">
                  <div className="flex items-center gap-1.5 font-semibold mb-0.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Operación masiva
                  </div>
                  Vas a procesar los {(universeCount ?? 0).toLocaleString()} POIs del universo.
                  Para acotar usa el árbol o las opciones avanzadas (tope total / fechas).
                </div>
              )}

              {!running ? (
                <Button onClick={start} className="w-full gap-2" disabled={(universeCount ?? 0) === 0}>
                  <Play className="w-4 h-4" />
                  {launchLabel}
                </Button>
              ) : (
                <Button
                  onClick={stop}
                  variant="secondary"
                  className="w-full gap-2"
                  disabled={job.stopping}
                >
                  {job.stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                  Detener tras lote actual
                </Button>
              )}

              <p className="text-[11px] text-muted-foreground leading-snug">
                Solo escribe <code>enriched_data.imagen</code> y marca el intento. No modifica
                nombre, descripción, enriquecimiento ni notas.
              </p>

              {(job.scanned > 0 || running) && (
                <div className="border rounded p-2.5 bg-muted/30 space-y-1.5">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <Stat label="Lotes" value={job.waves} />
                    <Stat label="Escaneados" value={job.scanned} />
                    <Stat
                      label={(job.config?.dryRun ?? dryRun) ? 'Encontrarían' : 'Actualizados'}
                      value={job.updated}
                      tone="success"
                    />
                    <Stat label="Saltados" value={job.skippedAlreadyAttempted} />
                  </div>
                  {job.failedTransient > 0 && (
                    <p className="text-[11px] text-amber-600">
                      Errores transitorios: {job.failedTransient}
                    </p>
                  )}
                  {job.scanned > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Tasa éxito: {((job.updated / job.scanned) * 100).toFixed(1)}%
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => useImageRecoveryJobStore.getState().reset()}
                    disabled={running}
                    className="w-full h-7 text-xs"
                  >
                    Limpiar resultados
                  </Button>
                </div>
              )}

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

interface UsersListProps {
  selectedUserId: string | null;
  onSelect: (u: BrokenUser) => void;
  refreshKey: number;
  force: boolean;
  retryStaleDays: number;
  modeTitle: string;
  badgeTone: 'amber' | 'destructive';
}

const TONE_CLASSES: Record<'amber' | 'destructive', string> = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  destructive: 'bg-destructive/15 text-destructive',
};

function ImageRecoveryUsersList({
  selectedUserId,
  onSelect,
  refreshKey,
  force,
  retryStaleDays,
  modeTitle,
  badgeTone,
}: UsersListProps) {
  const [users, setUsers] = useState<BrokenUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_image_recovery_users', {
        _force: force,
        _retry_stale_days: retryStaleDays,
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
    } finally {
      setLoading(false);
    }
  }, [force, retryStaleDays]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const toneClass = TONE_CLASSES[badgeTone];

  return (
    <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shrink-0">
            1
          </span>
          <h3 className="text-sm font-semibold truncate" title={modeTitle}>
            Usuarios · {modeTitle}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={load}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
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
                  <button
                    type="button"
                    onClick={() => onSelect(u)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors',
                      isSelected && 'bg-primary/10',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums',
                          toneClass,
                        )}
                      >
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

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-semibold">{value}</span>
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
