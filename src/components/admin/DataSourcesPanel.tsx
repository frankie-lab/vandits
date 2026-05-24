/**
 * DataSourcesPanel — gestión unificada de fuentes externas.
 * 4 grupos: búsqueda, enriquecimiento, scrapers, imágenes.
 *
 * PR-BACKOFFICE-UX-CANON-2 — MERGE: los proveedores de imagen ahora se
 * gestionan aquí (single source of truth para provider orchestration).
 * El picker inline de imágenes en `EnrichmentCardConfig` se eliminó.
 *
 * Precedencia (efecto real en `enrich-location`):
 *   1. `data_sources.enabled` (kind=enrichment) actúa como kill-switch global.
 *   2. `enrichment_card_config.image_sources` filtra cuáles de las activas
 *      se intentan, en qué combinación. Si ambas están off → no se intenta.
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
  Image as ImageIcon,
  Info,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

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
    description: 'Fuentes consultadas al enriquecer un POI (descripción, taxonomía, datos).',
  },
  scraper: {
    label: 'Scrapers',
    icon: Globe,
    description: 'Importadores de catálogos externos (Atlas Obscura, JSON-LD genérico).',
  },
};

/* ── Image sources (merge desde EnrichmentCardConfig) ─────────────────── */

interface ImageSourceSpec {
  key: string;
  label: string;
  description: string;
  /** Código en `data_sources` que actúa como kill-switch global. */
  killSwitchCode?: string;
}

const IMAGE_SOURCES: readonly ImageSourceSpec[] = [
  { key: 'wikimedia_commons', label: 'Wikimedia Commons', description: 'Banco libre de imágenes (búsqueda por nombre).', killSwitchCode: 'enrich.commons' },
  { key: 'wikipedia', label: 'Wikipedia', description: 'Imagen principal del artículo.', killSwitchCode: 'enrich.wikipedia' },
  { key: 'wikimedia_geosearch', label: 'Commons cercanas', description: 'Fotos georreferenciadas alrededor del punto.', killSwitchCode: 'enrich.commons' },
  { key: 'wikidata', label: 'Wikidata', description: 'Imagen oficial vinculada a la entidad.', killSwitchCode: 'enrich.wikidata_sparql' },
  { key: 'openverse', label: 'Openverse', description: 'Buscador CC (Flickr CC, museos…).', killSwitchCode: 'enrich.openverse' },
  { key: 'osm', label: 'OpenStreetMap', description: 'URL de foto enlazada en POIs cercanos (tag image=).', killSwitchCode: 'enrich.overpass' },
  { key: 'user_uploaded', label: 'Foto del usuario', description: 'Imagen subida manualmente.' },
];

const DEFAULT_IMAGE_KEYS = IMAGE_SOURCES.map((s) => s.key);

export function DataSourcesPanel() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // image_sources slice de app_settings.enrichment_card_config
  const [imageSources, setImageSources] = useState<string[]>(DEFAULT_IMAGE_KEYS);
  const [imageInclude, setImageInclude] = useState<boolean>(true);
  const [imageConfigLoaded, setImageConfigLoaded] = useState(false);
  const [savingImageKey, setSavingImageKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [sourcesRes, settingRes] = await Promise.all([
        supabase
          .from('data_sources')
          .select('*')
          .order('kind', { ascending: true })
          .order('priority', { ascending: true }),
        supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'enrichment_card_config')
          .maybeSingle(),
      ]);
      if (!mounted) return;
      if (sourcesRes.error) {
        toast.error('Error cargando fuentes', { description: sourcesRes.error.message });
      } else {
        setSources((sourcesRes.data ?? []) as DataSource[]);
      }
      const cfg = (settingRes.data?.value ?? {}) as { image_sources?: string[]; include_image?: boolean };
      if (Array.isArray(cfg.image_sources)) setImageSources(cfg.image_sources);
      if (typeof cfg.include_image === 'boolean') setImageInclude(cfg.include_image);
      setImageConfigLoaded(true);
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

  /** Mapa `code → enabled` para mostrar el kill-switch en cada fila de imagen. */
  const enrichmentEnabledByCode = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const s of sources) if (s.kind === 'enrichment') map.set(s.code, s.enabled);
    return map;
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

  /** Persiste `enrichment_card_config.image_sources` / `include_image`. */
  async function persistImageConfig(nextImageSources: string[], nextInclude: boolean) {
    const { data: existing } = await supabase
      .from('app_settings')
      .select('value, description')
      .eq('key', 'enrichment_card_config')
      .maybeSingle();
    const prevValue = (existing?.value ?? {}) as Record<string, unknown>;
    const value = {
      ...prevValue,
      image_sources: nextImageSources,
      include_image: nextInclude,
    };
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        {
          key: 'enrichment_card_config',
          value: value as any,
          description: existing?.description ?? 'Configuración de estructura de fichas enriquecidas',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
    if (error) throw error;
  }

  async function toggleImageSource(key: string, enabled: boolean) {
    const prev = imageSources;
    const next = enabled ? Array.from(new Set([...prev, key])) : prev.filter((k) => k !== key);
    setImageSources(next);
    setSavingImageKey(key);
    try {
      await persistImageConfig(next, imageInclude);
    } catch (err: any) {
      toast.error('No se pudo guardar', { description: err?.message });
      setImageSources(prev);
    } finally {
      setSavingImageKey(null);
    }
  }

  async function toggleImageInclude(enabled: boolean) {
    const prev = imageInclude;
    setImageInclude(enabled);
    setSavingImageKey('__include__');
    try {
      await persistImageConfig(imageSources, enabled);
    } catch (err: any) {
      toast.error('No se pudo guardar', { description: err?.message });
      setImageInclude(prev);
    } finally {
      setSavingImageKey(null);
    }
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

      {/* ── Group 4: imágenes (merge desde EnrichmentCardConfig) ── */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Imágenes (proveedores)</h3>
          <Badge variant="secondary" className="text-xs">
            {imageSources.length}/{IMAGE_SOURCES.length} activas
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Buscar imagen automática</span>
            <Switch
              checked={imageInclude}
              onCheckedChange={toggleImageInclude}
              disabled={!imageConfigLoaded || savingImageKey === '__include__'}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Proveedores que <code>enrich-location</code> consulta para encontrar una imagen del lugar.
        </p>
        <div className="flex items-start gap-2 mb-3 px-2 py-1.5 rounded bg-muted/40 border border-border/60">
          <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-snug">
            Precedencia: el kill-switch global vive en <span className="font-semibold">Enriquecimiento</span> (arriba). Aquí defines cuáles
            de las activas se prueban para imagen. Si la fila aparece <span className="text-amber-600 dark:text-amber-400 font-semibold">deshabilitada arriba</span>,
            su toggle aquí no surte efecto aunque esté activo.
          </p>
        </div>
        <div className="border rounded-lg divide-y bg-card">
          {IMAGE_SOURCES.map((spec) => {
            const isActive = imageSources.includes(spec.key);
            const killSwitchOff = spec.killSwitchCode
              ? enrichmentEnabledByCode.get(spec.killSwitchCode) === false
              : false;
            const saving = savingImageKey === spec.key;
            return (
              <div key={spec.key} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{spec.label}</span>
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {spec.key}
                    </code>
                    {spec.killSwitchCode && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        kill-switch: {spec.killSwitchCode}
                      </Badge>
                    )}
                    {killSwitchOff && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        anulada por kill-switch
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{spec.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : isActive && !killSwitchOff ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-muted-foreground/50" />
                  )}
                  <Switch
                    checked={isActive}
                    onCheckedChange={(v) => toggleImageSource(spec.key, v)}
                    disabled={!imageConfigLoaded || saving}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
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
