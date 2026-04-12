import { useState, useEffect, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RotateCcw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type MarkerStateRules,
  type StateRule,
  updateMarkerStateRules,
  mixColors,
} from '@/components/map/useMarkerStateRules';

const STATE_META: Record<string, { label: string; icon: string; description: string }> = {
  hover: { label: 'Hover', icon: '👆', description: 'Al pasar el cursor' },
  selected: { label: 'Seleccionado', icon: '✅', description: 'Punto seleccionado' },
  focused: { label: 'Enfocado', icon: '🎯', description: 'Punto con foco activo' },
  recent: { label: 'Reciente', icon: '✨', description: 'Recién enriquecido' },
};

const MIX_TARGETS: Record<string, { label: string; color: string }> = {
  white: { label: 'Blanco (aclarar)', color: '#ffffff' },
  black: { label: 'Negro (oscurecer)', color: '#000000' },
  accent: { label: 'Color de énfasis', color: '#3b82f6' },
  selection: { label: 'Color de selección', color: '#f59e0b' },
};

const SAMPLE_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#6b7280'];

function ColorPreviewStrip({ rule, rules }: { rule: StateRule; rules: MarkerStateRules }) {
  const targetColor = rule.mix_target === 'accent' ? rules.accent_color
    : rule.mix_target === 'selection' ? rules.selection_color
    : rule.mix_target === 'white' ? '#ffffff' : '#000000';

  return (
    <div className="flex gap-1 items-center">
      {SAMPLE_COLORS.map((base) => {
        const mixed = mixColors(base, targetColor, rule.mix_percent);
        return (
          <div key={base} className="flex flex-col items-center gap-0.5">
            <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: base }} />
            <div className="w-0.5 h-2 bg-border" />
            <div
              className="w-4 h-4 rounded-full border border-border"
              style={{
                backgroundColor: mixed,
                boxShadow: `0 0 ${rule.shadow_blur}px rgba(0,0,0,${rule.shadow_opacity})`,
                borderWidth: `${rule.border_width}px`,
                borderColor: 'white',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function StateRuleEditor({
  stateKey,
  rule,
  rules,
  onChange,
}: {
  stateKey: string;
  rule: StateRule;
  rules: MarkerStateRules;
  onChange: (updated: StateRule) => void;
}) {
  const meta = STATE_META[stateKey];

  return (
    <div className="space-y-3 py-3 border-b border-border/50 last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{meta.icon}</span>
          <div>
            <span className="text-xs font-semibold text-foreground">{meta.label}</span>
            <p className="text-[10px] text-muted-foreground">{meta.description}</p>
          </div>
        </div>
        <ColorPreviewStrip rule={rule} rules={rules} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Mix target */}
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">Mezcla con</Label>
          <Select
            value={rule.mix_target}
            onValueChange={(v) => onChange({ ...rule, mix_target: v as StateRule['mix_target'] })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MIX_TARGETS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: k === 'accent' ? rules.accent_color : k === 'selection' ? rules.selection_color : v.color }} />
                    {v.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mix percent */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[10px] text-muted-foreground">Intensidad</Label>
            <span className="text-[10px] font-mono text-foreground">{rule.mix_percent}%</span>
          </div>
          <Slider min={5} max={80} step={5} value={[rule.mix_percent]} onValueChange={([v]) => onChange({ ...rule, mix_percent: v })} />
        </div>

        {/* Shadow blur */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[10px] text-muted-foreground">Sombra</Label>
            <span className="text-[10px] font-mono text-foreground">{rule.shadow_blur}px</span>
          </div>
          <Slider min={0} max={20} step={1} value={[rule.shadow_blur]} onValueChange={([v]) => onChange({ ...rule, shadow_blur: v })} />
        </div>

        {/* Shadow opacity */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[10px] text-muted-foreground">Opacidad sombra</Label>
            <span className="text-[10px] font-mono text-foreground">{Math.round(rule.shadow_opacity * 100)}%</span>
          </div>
          <Slider min={0} max={100} step={5} value={[Math.round(rule.shadow_opacity * 100)]} onValueChange={([v]) => onChange({ ...rule, shadow_opacity: v / 100 })} />
        </div>

        {/* Border width */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[10px] text-muted-foreground">Grosor borde</Label>
            <span className="text-[10px] font-mono text-foreground">{rule.border_width}px</span>
          </div>
          <Slider min={0.5} max={5} step={0.5} value={[rule.border_width]} onValueChange={([v]) => onChange({ ...rule, border_width: v })} />
        </div>
      </div>
    </div>
  );
}

export function MarkerStateRulesPanel() {
  const [rules, setRules] = useState<MarkerStateRules | null>(null);
  const [originalRules, setOriginalRules] = useState<MarkerStateRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'marker_state_rules')
      .maybeSingle();

    if (error || !data) {
      toast.error('Error al cargar reglas de estado');
    } else {
      const parsed = data.value as unknown as MarkerStateRules;
      setRules(parsed);
      setOriginalRules(JSON.parse(JSON.stringify(parsed)));
    }
    setLoading(false);
  };

  useEffect(() => { fetchRules(); }, []);

  const hasChanges = JSON.stringify(rules) !== JSON.stringify(originalRules);

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: rules as any, updated_at: new Date().toISOString() })
        .eq('key', 'marker_state_rules');
      if (error) throw error;
      toast.success('Reglas de estado guardadas');
      setOriginalRules(JSON.parse(JSON.stringify(rules)));
      updateMarkerStateRules(rules);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalRules) {
      const orig = JSON.parse(JSON.stringify(originalRules));
      setRules(orig);
    }
  };

  const updateState = useCallback((stateKey: string, updated: StateRule) => {
    setRules((prev) => prev ? { ...prev, [stateKey]: updated } : prev);
  }, []);

  if (loading || !rules) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Norma de estados</h3>
          <p className="text-[11px] text-muted-foreground">Color · Sombra · Borde por estado</p>
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

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
        {/* System colors */}
        <div className="flex items-center gap-4 mb-3 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground">Énfasis</Label>
            <label className="relative w-6 h-6 rounded border border-border cursor-pointer overflow-hidden">
              <input
                type="color"
                value={rules.accent_color}
                onChange={(e) => setRules({ ...rules, accent_color: e.target.value })}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-full h-full" style={{ backgroundColor: rules.accent_color }} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground">Selección</Label>
            <label className="relative w-6 h-6 rounded border border-border cursor-pointer overflow-hidden">
              <input
                type="color"
                value={rules.selection_color}
                onChange={(e) => setRules({ ...rules, selection_color: e.target.value })}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-full h-full" style={{ backgroundColor: rules.selection_color }} />
            </label>
          </div>
        </div>

        {/* State rules */}
        {(['hover', 'selected', 'focused', 'recent'] as const).map((stateKey) => (
          <StateRuleEditor
            key={stateKey}
            stateKey={stateKey}
            rule={rules[stateKey]}
            rules={rules}
            onChange={(updated) => updateState(stateKey, updated)}
          />
        ))}
      </div>
    </div>
  );
}
