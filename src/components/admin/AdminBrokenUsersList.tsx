// Domain: Admin — list of users with points in the active mode's universe.
// Mode-aware: receives a healthFilter (e.g. ['broken','stale_name'] for Repair)
// and shows the per-user count of points in that bucket. Users with 0 points
// in the active universe are hidden.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { GeoHealth } from '@/stores/geocoding-job-store';

export interface BrokenUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  // universe_count for the current mode. Kept as `broken_count` for backwards
  // compatibility with the prop name across the panel.
  broken_count: number;
  total_locations: number;
}

interface Props {
  selectedUserId: string | null;
  onSelect: (user: BrokenUser) => void;
  refreshKey?: number;
  /** Health buckets that define the active mode's universe. */
  healthFilter: GeoHealth[];
  /** Mode title shown in the header (e.g. "Reparar cadenas rotas"). */
  modeTitle: string;
  /** Tone for the count badge — matches the mode card color. */
  badgeTone?: 'destructive' | 'amber' | 'primary';
}

const TONE_CLASSES: Record<NonNullable<Props['badgeTone']>, string> = {
  destructive: 'bg-destructive/15 text-destructive',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  primary: 'bg-primary/15 text-primary',
};

export function AdminBrokenUsersList({
  selectedUserId,
  onSelect,
  refreshKey,
  healthFilter,
  modeTitle,
  badgeTone = 'destructive',
}: Props) {
  const [users, setUsers] = useState<BrokenUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterKey = useMemo(() => [...healthFilter].sort().join(','), [healthFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_users_geo_universe', {
        _health_filter: healthFilter,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: BrokenUser[] = (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        username: r.username ?? null,
        display_name: r.display_name ?? null,
        broken_count: r.universe_count ?? 0,
        total_locations: r.total_locations ?? 0,
      }));
      setUsers(mapped);
    } catch (err) {
      console.error('[admin-universe-users]', err);
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [healthFilter]);

  useEffect(() => {
    load();
    // filterKey ensures a fresh load when the filter contents change
  }, [load, refreshKey, filterKey]);

  const toneClass = TONE_CLASSES[badgeTone];

  return (
    <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-semibold truncate" title={modeTitle}>
            Usuarios · {modeTitle}
          </h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={loading}>
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
            Ningún usuario tiene puntos en este modo.
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
