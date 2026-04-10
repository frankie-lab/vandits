import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, MapPin, Globe, Map, Route as RouteIcon, Users, Star, TrendingUp, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

// ── helpers ──────────────────────────────────────────────────
function pct(a: number, b: number) {
  if (b === 0) return 0;
  return Math.round((a / b) * 100 * 10) / 10;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

// ── Bar helper ───────────────────────────────────────────────
function HBar({ label, value, max, accent = false }: { label: string; value: number; max: number; accent?: boolean }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-4 group">
      <div className="w-32 text-sm truncate group-hover:text-[hsl(var(--hud-cyan))] transition-colors">{label}</div>
      <div className="flex-1 h-1.5 bg-[hsl(var(--hud-surface))] overflow-hidden rounded-sm">
        <div
          className={cn(
            'h-full transition-all duration-700 rounded-sm',
            accent
              ? 'bg-[hsl(var(--hud-amber))]'
              : 'bg-[hsl(var(--hud-cyan))] shadow-[0_0_8px_hsl(var(--hud-cyan)/0.4)]'
          )}
          style={{ width: `${w}%` }}
        />
      </div>
      <div className="w-14 text-right text-sm tabular-nums text-[hsl(var(--hud-dim))]">{value}</div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stats, isLoading, isRefreshing, refresh } = useDashboardStats();

  // Auto-refresh on first load if no data
  useEffect(() => {
    if (!isLoading && !stats && user) {
      refresh();
    }
  }, [isLoading, stats, user]);

  const enrichPct = stats ? pct(stats.enriched_locations, stats.total_locations) : 0;

  // Geo distribution: flatten to country list sorted by count
  const countryList = React.useMemo(() => {
    if (!stats?.geo_distribution) return [];
    const list: { name: string; count: number }[] = [];
    for (const [, countries] of Object.entries(stats.geo_distribution)) {
      if (typeof countries === 'object' && countries !== null) {
        for (const [country, count] of Object.entries(countries as Record<string, number>)) {
          list.push({ name: country, count: count as number });
        }
      }
    }
    return list.sort((a, b) => b.count - a.count).slice(0, 10);
  }, [stats?.geo_distribution]);

  const maxCountry = countryList[0]?.count || 1;

  // Classification sorted
  const classificationList = React.useMemo(() => {
    if (!stats?.classification_distribution) return [];
    return Object.entries(stats.classification_distribution)
      .map(([name, count]) => ({
        name: name.replace(/^\d+\.\s*/, ''),
        count: count as number,
      }))
      .sort((a, b) => b.count - a.count);
  }, [stats?.classification_distribution]);

  const totalClassified = classificationList.reduce((s, c) => s + c.count, 0) || 1;

  // Monthly activity for chart
  const months = stats?.monthly_activity || [];
  const maxMonthly = Math.max(1, ...months.map(m => m.locations_added));

  return (
    <div className="min-h-screen bg-[hsl(var(--hud-void))] text-[hsl(var(--hud-bright))] font-sans selection:bg-[hsl(var(--hud-cyan)/0.3)]">
      <div className="max-w-[1440px] mx-auto p-6 lg:p-8">

        {/* ── Header ─────────────────────────────────────────── */}
        <header className="flex justify-between items-end border-b border-[hsl(var(--hud-grid))] pb-4 mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="text-[hsl(var(--hud-dim))] hover:text-[hsl(var(--hud-bright))] hover:bg-[hsl(var(--hud-surface))]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="text-[hsl(var(--hud-cyan))] font-mono text-xs tracking-widest uppercase mb-1 flex gap-2 items-center">
                <span className="size-1.5 bg-[hsl(var(--hud-cyan))] rounded-full animate-pulse shadow-[0_0_8px_hsl(var(--hud-cyan)/0.8)]" />
                Telemetría Personal
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Cuadro de Mando</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {stats?.computed_at && (
              <span className="text-xs text-[hsl(var(--hud-dim))] font-mono">
                Actualizado: {new Date(stats.computed_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              disabled={isRefreshing}
              className="border-[hsl(var(--hud-grid))] bg-[hsl(var(--hud-panel))] text-[hsl(var(--hud-bright))] hover:bg-[hsl(var(--hud-surface))] hover:border-[hsl(var(--hud-cyan)/0.5)]"
            >
              <RefreshCw className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[hsl(var(--hud-cyan))] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── KPI Cards ──────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              <KpiCard icon={MapPin} label="Puntos" value={fmtNum(stats?.total_locations || 0)} accent="cyan" />
              <KpiCard icon={Globe} label="Países" value={`${stats?.countries_count || 0}`} sub="/195" />
              <KpiCard icon={Map} label="Continentes" value={`${stats?.continents_count || 0}`} sub="/7" />
              <KpiCard icon={RouteIcon} label="Rutas" value={`${stats?.total_routes || 0}`} />
              <KpiCard icon={TrendingUp} label="Km recorridos" value={fmtNum(Math.round(stats?.total_distance_km || 0))} accent="amber" />
              <KpiCard icon={Users} label="Seguidores" value={`${stats?.followers_count || 0}`} sub={`/ ${stats?.following_count || 0} sig.`} />
            </div>

            {/* ── Enrichment Progress ────────────────────────── */}
            <div className="flex items-center gap-4 mb-8 bg-[hsl(var(--hud-panel))] border border-[hsl(var(--hud-grid))] rounded-sm p-4">
              <Layers className="w-4 h-4 text-[hsl(var(--hud-cyan))]" />
              <span className="text-xs text-[hsl(var(--hud-dim))] font-mono uppercase tracking-widest shrink-0">Enriquecimiento</span>
              <div className="flex-1 h-2 bg-[hsl(var(--hud-surface))] rounded-sm overflow-hidden">
                <div
                  className="h-full bg-[hsl(var(--hud-cyan))] shadow-[0_0_10px_hsl(var(--hud-cyan)/0.5)] transition-all duration-1000 rounded-sm"
                  style={{ width: `${enrichPct}%` }}
                />
              </div>
              <span className="text-sm font-mono text-[hsl(var(--hud-cyan))] tabular-nums shrink-0">
                {enrichPct}%
              </span>
              <span className="text-xs text-[hsl(var(--hud-dim))] font-mono tabular-nums">
                {stats?.enriched_locations || 0}/{stats?.total_locations || 0}
              </span>
            </div>

            {/* ── Main Grid ──────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left: Geography + Classification */}
              <div className="lg:col-span-2 flex flex-col gap-6">

                {/* Geographic Distribution */}
                <Panel title="Distribución Geográfica" icon={Globe}>
                  {countryList.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--hud-dim))]">Sin datos geográficos aún</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {countryList.map((c) => (
                        <HBar key={c.name} label={c.name} value={c.count} max={maxCountry} />
                      ))}
                    </div>
                  )}
                </Panel>

                {/* Classification + Transport side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Classification Donut */}
                  <Panel title="Clasificación" icon={Layers}>
                    {classificationList.length === 0 ? (
                      <p className="text-sm text-[hsl(var(--hud-dim))]">Sin datos</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {classificationList.slice(0, 6).map((c, i) => {
                          const p = pct(c.count, totalClassified);
                          const colors = [
                            'bg-[hsl(var(--hud-cyan))]',
                            'bg-[hsl(var(--hud-amber))]',
                            'bg-emerald-500',
                            'bg-purple-500',
                            'bg-rose-500',
                            'bg-[hsl(var(--hud-surface))]',
                          ];
                          return (
                            <div key={c.name} className="flex items-center gap-3 text-sm">
                              <span className={cn('size-2 rounded-full shrink-0', colors[i % colors.length])} />
                              <span className="flex-1 truncate">{c.name}</span>
                              <span className="text-[hsl(var(--hud-dim))] font-mono tabular-nums text-xs">{c.count} ({p}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Panel>

                  {/* Transport Modes */}
                  <Panel title="Modos de Transporte" icon={RouteIcon}>
                    {Object.keys(stats?.transport_mode_distribution || {}).length === 0 ? (
                      <p className="text-sm text-[hsl(var(--hud-dim))]">Sin rutas aún</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {Object.entries(stats!.transport_mode_distribution)
                          .sort(([, a], [, b]) => (b as number) - (a as number))
                          .map(([mode, count]) => (
                            <div key={mode} className="flex items-center justify-between text-sm">
                              <span className="capitalize">{mode}</span>
                              <span className="font-mono text-[hsl(var(--hud-dim))] tabular-nums">{count as number}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </Panel>
                </div>
              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-6">

                {/* Monthly Activity */}
                <Panel title="Actividad Mensual" icon={TrendingUp}>
                  {months.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--hud-dim))]">Sin actividad reciente</p>
                  ) : (
                    <>
                      <div className="h-28 flex items-end justify-between gap-1 border-b border-[hsl(var(--hud-surface))]">
                        {months.map((m, i) => {
                          const h = (m.locations_added / maxMonthly) * 100;
                          const isMax = m.locations_added === maxMonthly;
                          return (
                            <div
                              key={m.month}
                              className={cn(
                                'flex-1 transition-colors rounded-t-sm relative',
                                isMax
                                  ? 'bg-[hsl(var(--hud-cyan))] shadow-[0_0_12px_hsl(var(--hud-cyan)/0.5)]'
                                  : 'bg-[hsl(var(--hud-surface))] hover:bg-[hsl(var(--hud-cyan)/0.3)]'
                              )}
                              style={{ height: `${Math.max(4, h)}%` }}
                              title={`${m.month}: ${m.locations_added} puntos`}
                            >
                              {isMax && (
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[hsl(var(--hud-cyan))] bg-[hsl(var(--hud-void))] px-1 border border-[hsl(var(--hud-cyan)/0.5)] whitespace-nowrap">
                                  {m.locations_added}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-[hsl(var(--hud-dim))] mt-2 uppercase tracking-widest">
                        <span>{months[0]?.month?.slice(5)}</span>
                        <span>{months[months.length - 1]?.month?.slice(5)}</span>
                      </div>
                    </>
                  )}
                </Panel>

                {/* Top Rated */}
                <Panel title="Top Puntos" icon={Star} className="flex-1">
                  {(!stats?.top_rated_locations || stats.top_rated_locations.length === 0) ? (
                    <p className="text-sm text-[hsl(var(--hud-dim))]">Sin ratings aún</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {stats.top_rated_locations.slice(0, 5).map((loc) => (
                        <div key={loc.id} className="flex items-start justify-between border-b border-[hsl(var(--hud-surface))] pb-3 last:border-0 group cursor-default">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm truncate group-hover:text-[hsl(var(--hud-cyan))] transition-colors">{loc.name}</div>
                            <div className="text-[11px] text-[hsl(var(--hud-dim))] font-mono mt-0.5">{loc.country || 'Sin país'}</div>
                          </div>
                          <div className={cn(
                            'font-mono text-sm px-2 py-0.5 border shrink-0 ml-2',
                            loc.rating >= 4
                              ? 'text-[hsl(var(--hud-amber))] bg-[hsl(var(--hud-amber)/0.1)] border-[hsl(var(--hud-amber)/0.2)]'
                              : 'text-[hsl(var(--hud-dim))] border-[hsl(var(--hud-grid))]'
                          )}>
                            {loc.rating}/5
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                {/* Recent Activity */}
                <Panel title="Actividad Reciente" icon={MapPin}>
                  {(!stats?.recent_activity || stats.recent_activity.length === 0) ? (
                    <p className="text-sm text-[hsl(var(--hud-dim))]">Sin actividad</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {stats.recent_activity.slice(0, 5).map((loc) => (
                        <div key={loc.id} className="flex items-center gap-3 text-sm">
                          <span className={cn(
                            'size-1.5 rounded-full shrink-0',
                            loc.enriched ? 'bg-[hsl(var(--hud-cyan))]' : 'bg-[hsl(var(--hud-amber))]'
                          )} />
                          <span className="truncate flex-1">{loc.name}</span>
                          <span className="text-[10px] text-[hsl(var(--hud-dim))] font-mono shrink-0">
                            {new Date(loc.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: 'cyan' | 'amber';
}) {
  const valueColor = accent === 'cyan'
    ? 'text-[hsl(var(--hud-cyan))] drop-shadow-[0_0_12px_hsl(var(--hud-cyan)/0.3)]'
    : accent === 'amber'
      ? 'text-[hsl(var(--hud-amber))] drop-shadow-[0_0_12px_hsl(var(--hud-amber)/0.3)]'
      : 'text-[hsl(var(--hud-bright))]';

  return (
    <div className="bg-[hsl(var(--hud-panel))] border border-[hsl(var(--hud-grid))] p-4 rounded-sm relative overflow-hidden group hover:border-[hsl(var(--hud-cyan)/0.4)] transition-colors">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--hud-cyan)/0.4)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5 text-[hsl(var(--hud-dim))]" />
        <span className="text-[hsl(var(--hud-dim))] text-[10px] uppercase tracking-widest font-mono">{label}</span>
      </div>
      <div className={cn('text-2xl font-mono tabular-nums tracking-tight', valueColor)}>
        {value}
        {sub && <span className="text-sm text-[hsl(var(--hud-dim))] ml-1">{sub}</span>}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-[hsl(var(--hud-panel))] border border-[hsl(var(--hud-grid))] rounded-sm p-5', className)}>
      <h2 className="text-sm font-medium mb-5 flex items-center gap-2 uppercase tracking-widest text-[hsl(var(--hud-dim))]">
        <span className="w-1 h-3 bg-[hsl(var(--hud-cyan))]" />
        <Icon className="w-3.5 h-3.5" />
        {title}
      </h2>
      {children}
    </div>
  );
}
