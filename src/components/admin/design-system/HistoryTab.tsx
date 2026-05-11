/**
 * Pestaña Historial — lista versiones publicadas y permite restaurar una.
 */
import { useEffect, useState } from 'react';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/design-system/primitives/button';
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';
import { toast } from 'sonner';
import type { OverrideMap } from '@/design-system/runtime/apply-overrides';

interface Row {
  id: string;
  value: OverrideMap;
  note: string | null;
  published_at: string;
  published_by: string | null;
}

export function HistoryTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const hydrate = useDesignSystemEdit((s) => s.hydrate);
  const publish = useDesignSystemEdit((s) => s.publish);
  const resetAll = useDesignSystemEdit((s) => s.resetAll);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('design_system_history')
      .select('id,value,note,published_at,published_by')
      .order('published_at', { ascending: false })
      .limit(50);
    if (error) {
      toast.error('No se pudo cargar el historial');
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const restore = async (row: Row) => {
    if (!confirm(`¿Restaurar versión del ${new Date(row.published_at).toLocaleString()}?`)) return;
    hydrate(row.value);
    try {
      await publish(`Restaurada versión ${row.id.slice(0, 8)}`);
      toast.success('Versión restaurada');
      void refresh();
    } catch (e) {
      toast.error('No se pudo restaurar', { description: (e as Error).message });
    }
  };

  const onResetAll = async () => {
    if (!confirm('Esto vacía todos los overrides y restaura los valores de fábrica para todos los usuarios. ¿Continuar?')) return;
    try {
      await resetAll();
      toast.success('Valores de fábrica restaurados');
      void refresh();
    } catch (e) {
      toast.error('No se pudo restaurar', { description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cada publicación guarda una versión. Puedes restaurar cualquiera.
        </p>
        <Button size="sm" variant="outline" onClick={onResetAll}>
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Restaurar valores de fábrica
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Aún no hay versiones publicadas.</p>
      )}

      {rows.map((row) => {
        const count = Object.keys(row.value ?? {}).length;
        return (
          <div
            key={row.id}
            className="flex items-center gap-3 px-3 py-2 rounded-token-sm border border-border bg-muted/20"
          >
            <History className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {row.note || `Versión ${row.id.slice(0, 8)}`}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(row.published_at).toLocaleString()} · {count} override
                {count === 1 ? '' : 's'}
              </div>
            </div>
            <Button size="xs" variant="outline" onClick={() => restore(row)}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Restaurar
            </Button>
          </div>
        );
      })}

      <div className="pt-2">
        <Button size="sm" variant="ghost" onClick={() => setEditMode(true)}>
          Activar modo edición
        </Button>
      </div>
    </div>
  );
}
