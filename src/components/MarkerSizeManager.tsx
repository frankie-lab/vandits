import { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, RotateCcw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MarkerConfig {
  id: string;
  marker_type: string;
  base_normal: number;
  base_selected: number;
  base_focused: number;
  base_recent: number;
  hover_normal: number | null;
  hover_selected: number | null;
  hover_focused: number | null;
  hover_recent: number | null;
  marker_shape: string;
}

const MARKER_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  own_enriched: { label: 'Propios enriquecidos', description: 'Puntos propios con datos de enriquecimiento' },
  own_new: { label: 'Propios sin enriquecer', description: 'Puntos propios nuevos o importados' },
  followed: { label: 'Seguidos', description: 'Puntos de usuarios seguidos' },
  curator_enriched: { label: 'Curador enriquecido', description: 'Puntos de curador con datos' },
  curator_default: { label: 'Curador sin enriquecer', description: 'Puntos de curador sin datos' },
};

const SHAPE_COLORS: Record<string, string> = {
  own_enriched: '#22c55e',
  own_new: '#ef4444',
  followed: '#6366f1',
  curator_enriched: '#14b8a6',
  curator_default: '#94a3b8',
};

function PinPreview({ size, color, shape }: { size: number; color: string; shape: string }) {
  const displaySize = Math.max(size, 8);
  const containerSize = 48;
  
  if (shape === 'pin') {
    const w = displaySize * 0.7;
    const h = displaySize;
    return (
      <div className="flex items-end justify-center" style={{ width: containerSize, height: containerSize }}>
        <svg width={w} height={h} viewBox="0 0 24 36" fill="none">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill={color} stroke="white" strokeWidth="1.5"/>
          <circle cx="12" cy="12" r={h * 0.25} fill="white" fillOpacity="0.95"/>
        </svg>
      </div>
    );
  }
  
  if (shape === 'icon') {
    return (
      <div className="flex items-center justify-center" style={{ width: containerSize, height: containerSize }}>
        <svg width={displaySize} height={displaySize} viewBox="0 0 24 24" fill="none">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="10" r="3" fill="none" stroke={color} strokeWidth="2"/>
        </svg>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center" style={{ width: containerSize, height: containerSize }}>
      <svg width={displaySize} height={displaySize} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill={color} stroke="white" strokeWidth="2"/>
      </svg>
    </div>
  );
}

function MarkerTypeEditor({ config, onChange }: { config: MarkerConfig; onChange: (c: MarkerConfig) => void }) {
  const info = MARKER_TYPE_LABELS[config.marker_type] || { label: config.marker_type, description: '' };
  const color = SHAPE_COLORS[config.marker_type] || '#6b7280';
  const hasHover = config.hover_normal !== null;

  const setBase = (key: keyof MarkerConfig, val: number) => onChange({ ...config, [key]: val });
  const setHover = (key: keyof MarkerConfig, val: number | null) => onChange({ ...config, [key]: val });

  const toggleHover = (enabled: boolean) => {
    if (enabled) {
      onChange({ ...config, hover_normal: 24, hover_selected: 28, hover_focused: 30, hover_recent: 32 });
    } else {
      onChange({ ...config, hover_normal: null, hover_selected: null, hover_focused: null, hover_recent: null });
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-3">
        <PinPreview size={config.base_normal} color={color} shape={config.marker_shape} />
        <div>
          <h4 className="font-medium text-sm text-foreground">{info.label}</h4>
          <p className="text-xs text-muted-foreground">{info.description}</p>
          <span className="text-[10px] text-muted-foreground/60 font-mono">{config.marker_shape}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Base</div>
        
        {(['normal', 'selected', 'focused', 'recent'] as const).map((state) => {
          const key = `base_${state}` as keyof MarkerConfig;
          const val = config[key] as number;
          return (
            <div key={state} className="space-y-1">
              <div className="flex justify-between items-center">
                <Label className="text-xs capitalize">{state}</Label>
                <span className="text-xs font-mono text-muted-foreground">{val}px</span>
              </div>
              <div className="flex items-center gap-2">
                <PinPreview size={val} color={color} shape={config.marker_shape} />
                <Slider
                  min={6}
                  max={50}
                  step={1}
                  value={[val]}
                  onValueChange={([v]) => setBase(key, v)}
                  className="flex-1"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Switch checked={hasHover} onCheckedChange={toggleHover} />
        <Label className="text-xs">Rollover (hover)</Label>
      </div>

      {hasHover && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {(['normal', 'selected', 'focused', 'recent'] as const).map((state) => {
            const key = `hover_${state}` as keyof MarkerConfig;
            const val = config[key] as number | null;
            if (val === null) return null;
            return (
              <div key={state} className="space-y-1">
                <div className="flex justify-between items-center">
                  <Label className="text-xs capitalize">{state}</Label>
                  <span className="text-xs font-mono text-muted-foreground">{val}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <PinPreview size={val} color={color} shape={config.marker_shape} />
                  <Slider
                    min={6}
                    max={60}
                    step={1}
                    value={[val]}
                    onValueChange={([v]) => setHover(key, v)}
                    className="flex-1"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MarkerSizeManager() {
  const [configs, setConfigs] = useState<MarkerConfig[]>([]);
  const [originalConfigs, setOriginalConfigs] = useState<MarkerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
            hover_normal: config.hover_normal,
            hover_selected: config.hover_selected,
            hover_focused: config.hover_focused,
            hover_recent: config.hover_recent,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);
        
        if (error) throw error;
      }
      // Invalidate the cached config so the map picks up new sizes
      const { invalidateMarkerSizeCache } = await import('@/components/map/useMarkerSizeConfig');
      invalidateMarkerSizeCache();
      toast.success('Tamaños de marcadores guardados — se aplicarán al mapa');
      setOriginalConfigs(JSON.parse(JSON.stringify(configs)));
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfigs(JSON.parse(JSON.stringify(originalConfigs)));
  };

  const updateConfig = (index: number, updated: MarkerConfig) => {
    setConfigs(prev => prev.map((c, i) => i === index ? updated : c));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const order = ['own_enriched', 'own_new', 'followed', 'curator_enriched', 'curator_default'];
  const sorted = [...configs].sort((a, b) => order.indexOf(a.marker_type) - order.indexOf(b.marker_type));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tamaños de marcadores</h3>
          <p className="text-xs text-muted-foreground">Configura el tamaño base y rollover de cada tipo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={!hasChanges || saving}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Revertir
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="space-y-4">
          {sorted.map((config) => {
            const realIndex = configs.findIndex(c => c.id === config.id);
            return (
              <MarkerTypeEditor
                key={config.id}
                config={config}
                onChange={(updated) => updateConfig(realIndex, updated)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
