import { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw, Loader2, RotateCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type MarkerStateRules,
  updateMarkerStateRules,
  mixColors,
} from '@/components/map/useMarkerStateRules';

const SAMPLE_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#6b7280'];

const STATES = [
  { key: 'hover', label: 'Hover', desc: 'Aclarar', defaultPercent: 25 },
  { key: 'selected', label: 'Seleccionado', desc: 'Oscurecer', defaultPercent: 15 },
  { key: 'focused', label: 'Enfocado', desc: 'Énfasis', defaultPercent: 30 },
  { key: 'recent', label: 'Reciente', desc: 'Selección', defaultPercent: 20 },
] as const;

const DEFAULT_ACCENT = '#3b82f6';
const DEFAULT_SELECTION = '#f59e0b';

function PreviewDots({ rules }: { rules: MarkerStateRules }) {
  return (
    <div className="flex flex-wrap gap-3">
      {STATES.map(({ key }) => {
        const rule = rules[key];
        const target = rule.mix_target === 'accent' ? rules.accent_color
          : rule.mix_target === 'selection' ? rules.selection_color
          : rule.mix_target === 'white' ? '#ffffff' : '#000000';
        return (
          <div key={key} className="flex gap-0.5">
            {SAMPLE_COLORS.map((base) => (
              <div key={base} className="w-3 h-3 rounded-full" style={{ backgroundColor: mixColors(base, target, rule.mix_percent) }} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function MarkerStateRulesPanel() {
  const [rules, setRules] = useState<MarkerStateRules | null>(null);
  const [originalRules, setOriginalRules] = useState<MarkerStateRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'marker_state_rules')
        .maybeSingle();
      if (data) {
        const parsed = data.value as unknown as MarkerStateRules;
        setRules(parsed);
        setOriginalRules(JSON.parse(JSON.stringify(parsed)));
      }
      setLoading(false);
    })();
  }, []);

  const hasChanges = JSON.stringify(rules) !== JSON.stringify(originalRules);

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .update({ value: rules as any, updated_at: new Date().toISOString() })
      .eq('key', 'marker_state_rules');
    if (error) { toast.error('Error al guardar'); } else {
      toast.success('Reglas guardadas');
      setOriginalRules(JSON.parse(JSON.stringify(rules)));
      updateMarkerStateRules(rules);
    }
    setSaving(false);
  };

  if (loading || !rules) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <p className="text-[11px] text-muted-foreground">Intensidad de mezcla por estado</p>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => { setRules(JSON.parse(JSON.stringify(originalRules))); }} disabled={!hasChanges || saving} className="h-7 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" /> Revertir
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving} className="h-7 px-2 text-xs">
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
            Guardar
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
        {/* Preview */}
        <PreviewDots rules={rules} />

        {/* One slider per state */}
        {STATES.map(({ key, label, desc, defaultPercent }) => {
          const isDefault = rules[key].mix_percent === defaultPercent;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium">{label} <span className="text-muted-foreground font-normal">· {desc}</span></Label>
                <div className="flex items-center gap-2">
                  {!isDefault && (
                    <button
                      onClick={() => setRules({ ...rules, [key]: { ...rules[key], mix_percent: defaultPercent } })}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      title="Restaurar valor por defecto"
                    >
                      <RotateCw className="w-2.5 h-2.5" />
                      {defaultPercent}%
                    </button>
                  )}
                  <span className="text-xs font-mono text-foreground w-8 text-right">{rules[key].mix_percent}%</span>
                </div>
              </div>
              <Slider min={5} max={60} step={5} value={[rules[key].mix_percent]} onValueChange={([v]) => setRules({ ...rules, [key]: { ...rules[key], mix_percent: v } })} />
            </div>
          );
        })}

        {/* System colors */}
        <div className="flex items-center gap-4 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground">Énfasis</Label>
            <label className="relative w-5 h-5 rounded border border-border cursor-pointer overflow-hidden">
              <input type="color" value={rules.accent_color} onChange={(e) => setRules({ ...rules, accent_color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="w-full h-full" style={{ backgroundColor: rules.accent_color }} />
            </label>
            {rules.accent_color !== DEFAULT_ACCENT && (
              <button onClick={() => setRules({ ...rules, accent_color: DEFAULT_ACCENT })} className="text-[10px] text-muted-foreground hover:text-foreground" title="Por defecto"><RotateCw className="w-2.5 h-2.5" /></button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground">Selección</Label>
            <label className="relative w-5 h-5 rounded border border-border cursor-pointer overflow-hidden">
              <input type="color" value={rules.selection_color} onChange={(e) => setRules({ ...rules, selection_color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="w-full h-full" style={{ backgroundColor: rules.selection_color }} />
            </label>
            {rules.selection_color !== DEFAULT_SELECTION && (
              <button onClick={() => setRules({ ...rules, selection_color: DEFAULT_SELECTION })} className="text-[10px] text-muted-foreground hover:text-foreground" title="Por defecto"><RotateCw className="w-2.5 h-2.5" /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}