/**
 * DataSourcesPanel — gestión unificada de fuentes externas.
 * 3 grupos: búsqueda, enriquecimiento, scrapers.
 * Permite activar/desactivar, cambiar prioridad e ver estado de credenciales.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Sparkles,
  Globe,
  Loader2,
  KeyRound,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
// RecoverImagesPanel se ha movido a su propia entrada de Back Office (tab 'image-recovery').

type Kind = 'search' | 'enrichment' | 'scraper';

interface DataSource {
  id: string;
  code: string;
  kind: Kind;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  weight: number;
  requires_secret: boolean;
  secret_name: string | null;
  config: Record<string, unknown>;
  stats: Record<string, unknown>;
}

const GROUP_META: Record<Kind, { label: string; icon: any; description: string }> = {
  search: {
    label: 'Búsqueda',
    icon: Search,
    description: 'Fuentes consultadas al buscar candidatos por nombre (recovery, edición manual).',
  },
  enrichment: {
    label: 'Enriquecimiento',
    icon: Sparkles,
    description: 'Fuentes consultadas al enriquecer un POI (descripción, imágenes, taxonomía).',
  },
  scraper: {
    label: 'Scrapers',
    icon: Globe,
    description: 'Importadores de catálogos externos (Atlas Obscura, JSON-LD genérico).',
  },
};

export function DataSourcesPanel() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('data_sources')
        .select('*')
        .order('kind', { ascending: true })
        .order('priority', { ascending: true });
      if (!mounted) return;
      if (error) {
        toast.error('Error cargando fuentes', { description: error.message });
      } else {
        setSources((data ?? []) as DataSource[]);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const out: Record<Kind, DataSource[]> = { search: [], enrichment: [], scraper: [] };
    for (const s of sources) out[s.kind].push(s);
    return out;
  }, [sources]);

  async function toggle(source: DataSource, enabled: boolean) {
    setSavingId(source.id);
    const prev = source.enabled;
    setSources((s) => s.map((x) => (x.id === source.id ? { ...x, enabled } : x)));
    const { error } = await supabase
      .from('data_sources')
      .update({ enabled })
      .eq('id', source.id);
    setSavingId(null);
    if (error) {
      toast.error('No se pudo guardar', { description: error.message });
      setSources((s) => s.map((x) => (x.id === source.id ? { ...x, enabled: prev } : x)));
    }
  }

  async function updatePriority(source: DataSource, priority: number) {
    if (!Number.isFinite(priority)) return;
    setSavingId(source.id);
    setSources((s) => s.map((x) => (x.id === source.id ? { ...x, priority } : x)));
    const { error } = await supabase
      .from('data_sources')
      .update({ priority })
      .eq('id', source.id);
    setSavingId(null);
    if (error) toast.error('No se pudo guardar prioridad', { description: error.message });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 pb-8 space-y-6">
      {(Object.keys(GROUP_META) as Kind[]).map((kind) => {
        const meta = GROUP_META[kind];
        const Icon = meta.icon;
        const rows = grouped[kind];
        if (rows.length === 0) return null;
        const activeCount = rows.filter((r) => r.enabled).length;
        return (
          <section key={kind}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{meta.label}</h3>
              <Badge variant="secondary" className="text-xs">
                {activeCount}/{rows.length} activas
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{meta.description}</p>
            <div className="border rounded-lg divide-y bg-card">
              {rows.map((s) => (
                <SourceRow
                  key={s.id}
                  source={s}
                  saving={savingId === s.id}
                  onToggle={(v) => toggle(s, v)}
                  onPriorityChange={(v) => updatePriority(s, v)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SourceRow({
  source,
  saving,
  onToggle,
  onPriorityChange,
}: {
  source: DataSource;
  saving: boolean;
  onToggle: (v: boolean) => void;
  onPriorityChange: (v: number) => void;
}) {
  const endpoint = (source.config as any)?.endpoint as string | undefined;
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{source.name}</span>
          <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {source.code}
          </code>
          {source.requires_secret && (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
            >
              <KeyRound className="w-3 h-3" />
              {source.secret_name}
            </Badge>
          )}
        </div>
        {source.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{source.description}</p>
        )}
        {endpoint && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{endpoint}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <label className="text-[10px] text-muted-foreground">Prioridad</label>
        <Input
          type="number"
          value={source.priority}
          onChange={(e) => onPriorityChange(Number(e.target.value))}
          className="w-16 h-8 text-xs"
          disabled={saving}
        />
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : source.enabled ? (
          <Check className="w-4 h-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-muted-foreground/50" />
        )}
        <Switch checked={source.enabled} onCheckedChange={onToggle} disabled={saving} />
      </div>
    </div>
  );
}
