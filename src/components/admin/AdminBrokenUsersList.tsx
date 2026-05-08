// Domain: Admin — list of users that have broken geographic chains.
// Only callable by admins/masters via the `admin_users_with_broken_geo_chain` RPC.

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BrokenUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  broken_count: number;
  total_locations: number;
}

interface Props {
  selectedUserId: string | null;
  onSelect: (user: BrokenUser) => void;
  refreshKey?: number;
}

export function AdminBrokenUsersList({ selectedUserId, onSelect, refreshKey }: Props) {
  const [users, setUsers] = useState<BrokenUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_users_with_broken_geo_chain');
      if (error) throw error;
      setUsers((data ?? []) as BrokenUser[]);
    } catch (err) {
      console.error('[admin-broken-users]', err);
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="rounded-lg border flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Usuarios con cadenas rotas</h3>
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
            Ningún usuario tiene cadenas geográficas rotas.
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
                      <span className="inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-full bg-destructive/15 text-destructive text-[11px] font-semibold tabular-nums">
                        {u.broken_count}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        de {u.total_locations}
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
