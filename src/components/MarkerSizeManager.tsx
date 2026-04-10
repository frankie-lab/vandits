import { useState, useEffect, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Save, RotateCcw, Loader2, ChevronDown, MapPin, Users, Leaf, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { updateMarkerSizeConfig, type MarkerSizeMap } from '@/components/map/useMarkerSizeConfig';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface MarkerConfig {
  id: string;
  marker_type: string;
  base_normal: number;
  base_selected: number;
  base_focused: number;
  base_recent: number;
  hover_size: number | null;
  marker_shape: string;
}

const MARKER_META: Record<string, { label: string }> = {
  own_new: { label: 'Importados (gris)' },
  own_empty: { label: 'Vacíos (naranja)' },
  own_enriched: { label: 'Enriquecidos' },
  followed_new: { label: 'Sin enriquecer' },
  followed_enriched: { label: 'Enriquecidos' },
  druid_new: { label: 'Sin enriquecer' },
  druid_enriched: { label: 'Enriquecido' },
  curator_default: { label: 'Sin enriquecer' },
  curator_enriched: { label: 'Enriquecido' },
};

const SHAPE_COLORS: Record<string, { main: string; light: string }> = {
  own_new: { main: 'hsl(220, 9%, 46%)', light: 'hsl(220, 9%, 56%)' },
  own_empty: { main: 'hsl(25, 95%, 53%)', light: 'hsl(25, 95%, 63%)' },
  own_enriched: { main: 'hsl(142, 76%, 36%)', light: 'hsl(142, 76%, 50%)' },
  followed_new: { main: 'hsl(220, 65%, 45%)', light: 'hsl(220, 65%, 55%)' },
  followed_enriched: { main: 'hsl(220, 65%, 45%)', light: 'hsl(220, 65%, 55%)' },
  druid_new: { main: '#a855f7', light: '#c084fc' },
  druid_enriched: { main: '#a855f7', light: '#c084fc' },
  curator_default: { main: '#94a3b8', light: '#cbd5e1' },
  curator_enriched: { main: '#14b8a6', light: '#5eead4' },
};

const GROUP_ICONS = {
  own: MapPin,
  followed: Users,
  druid: Leaf,
  curator: Building2,
};

const GROUPS = [
  { key: 'own', label: 'Propios', types: ['own_new', 'own_empty', 'own_enriched'] },
  { key: 'followed', label: 'Seguidos', types: ['followed_new', 'followed_enriched'] },
  { key: 'druid', label: 'Druida', types: ['druid_new', 'druid_enriched'] },
  { key: 'curator', label: 'Curador', types: ['curator_default', 'curator_enriched'] },
];

function MiniPreview({ color, shape, markerType, size = 14 }: { color: { main: string; light: string }; shape: string; markerType: string; size?: number }) {
  const uid = `mp-${markerType}`;
  if (shape === 'pin') {
    const w = size * 0.7;
    return (
      <svg width={w} height={size} viewBox="0 0 24 36" fill="none">
        <defs>
          <linearGradient id={`g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color.light} />
            <stop offset="100%" stopColor={color.main} />
          </linearGradient>
        </defs>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill={`url(#g-${uid})`} stroke="white" strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.95"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id={`g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color.light} />
          <stop offset="100%" stopColor={color.main} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#g-${uid})`} stroke="white" strokeWidth="2"/>
      {markerType.startsWith('followed') && (
        <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="8" fontWeight="600" fontFamily="system-ui">AB</text>
      )}
    </svg>
  );
}

const STATES = ['normal', 'selected', 'focused', 'recent'] as const;
const STATE_LABELS: Record<string, string> = {
  normal: 'Normal',
  selected: 'Selec.',
  focused: 'Foco',
  recent: 'Reciente',
  hover: 'Hover',
};

function CompactMarkerRow({ config, onChange }: { config: MarkerConfig; onChange: (c: MarkerConfig) => void }) {
  const meta = MARKER_META[config.marker_type] || { label: config.marker_type };
  const color = SHAPE_COLORS[config.marker_type] || { main: '#6b7280', light: '#9ca3af' };
  const hasHover = config.hover_size !== null;

  const allFields = [...STATES.map(s => ({ key: `base_${s}` as keyof MarkerConfig, label: STATE_LABELS[s] }))];
  if (hasHover) {
    allFields.push({ key: 'hover_size' as keyof MarkerConfig, label: 'Hover' });
  }

  return (
    <div className="py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          <MiniPreview color={color} shape={config.marker_shape} markerType={config.marker_type} size={14} />
        </div>
        <span className="text-xs font-medium text-foreground flex-1">{meta.label}</span>
        <div className="flex items-center gap-1">
          <Switch
            checked={hasHover}
            onCheckedChange={(on) => onChange({ ...config, hover_size: on ? Math.round(config.base_normal * 1.8) : null })}
            className="scale-[0.65] origin-right"
          />
          <span className="text-[10px] text-muted-foreground">Hover</span>
        </div>
      </div>

      <div className="space-y-1 pl-6">
        {allFields.map(({ key, label }) => {
          const val = (config[key] as number) || 12;
          const max = key === 'hover_size' ? 80 : 60;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-12 shrink-0">{label}</span>
              <Slider
                min={4}
                max={max}
                step={1}
                value={[val]}
                onValueChange={([v]) => onChange({ ...config, [key]: v })}
                className="flex-1"
              />
              <span className="text-[10px] font-mono text-muted-foreground w-6 text-right shrink-0">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MarkerSizeManager() {
  const [configs, setConfigs] = useState<MarkerConfig[]>([]);
  const [originalConfigs, setOriginalConfigs] = useState<MarkerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ own: true, followed: true, druid: true, curator: true });

  const fetchConfigs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('marker_size_config')
      .select('*')
      .order('marker_type');

    if (error) {
      toast.error('Error al cargar configuración de marcadores');
      console.error(error);
    } else if (data) {
      const typed = data as unknown as MarkerConfig[];
      setConfigs(typed);
      setOriginalConfigs(JSON.parse(JSON.stringify(typed)));
    }
    setLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, []);

  const hasChanges = JSON.stringify(configs) !== JSON.stringify(originalConfigs);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const config of configs) {
        const { error } = await supabase
          .from('marker_size_config')
          .update({
            base_normal: config.base_normal,
            base_selected: config.base_selected,
            base_focused: config.base_focused,
            base_recent: config.base_recent,
            hover_size: config.hover_size,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);
        if (error) throw error;
      }
      toast.success('Tamaños de marcadores guardados');
      setOriginalConfigs(JSON.parse(JSON.stringify(configs)));
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const orig = JSON.parse(JSON.stringify(originalConfigs));
    setConfigs(orig);
    pushLiveConfig(orig);
  };

  const pushLiveConfig = useCallback((cfgs: MarkerConfig[]) => {
    const map: MarkerSizeMap = {};
    for (const c of cfgs) {
      map[c.marker_type] = {
        base_normal: c.base_normal,
        base_selected: c.base_selected,
        base_focused: c.base_focused,
        base_recent: c.base_recent,
        hover_size: c.hover_size,
        marker_shape: c.marker_shape,
      };
    }
    updateMarkerSizeConfig(map);
  }, []);

  const updateConfig = (markerType: string, updated: MarkerConfig) => {
    const next = configs.map((c) => c.marker_type === markerType ? updated : c);
    setConfigs(next);
    pushLiveConfig(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const configMap = Object.fromEntries(configs.map(c => [c.marker_type, c]));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Marcadores</h3>
          <p className="text-[11px] text-muted-foreground">Tamaño (px) por estado</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={!hasChanges || saving} className="h-7 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" /> Revertir
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving} className="h-7 px-2 text-xs">
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
            Guardar
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          {GROUPS.map((group) => {
            const groupConfigs = group.types.map(t => configMap[t]).filter(Boolean);
            if (groupConfigs.length === 0) return null;
            const Icon = GROUP_ICONS[group.key as keyof typeof GROUP_ICONS];

            return (
              <Collapsible
                key={group.key}
                open={openGroups[group.key]}
                onOpenChange={(open) => setOpenGroups(prev => ({ ...prev, [group.key]: open }))}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 px-1 hover:bg-muted/50 rounded text-left">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground flex-1">{group.label}</span>
                  <span className="text-[10px] text-muted-foreground">{groupConfigs.length}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${openGroups[group.key] ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-1 pr-1 divide-y divide-border/50">
                    {groupConfigs.map((config) => (
                      <CompactMarkerRow
                        key={config.id}
                        config={config}
                        onChange={(updated) => updateConfig(config.marker_type, updated)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>
    </div>
  );
}
