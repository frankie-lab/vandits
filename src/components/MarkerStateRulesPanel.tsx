import { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw, Loader2, RotateCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type MarkerStateRules,
  type StateRule,
  updateMarkerStateRules,
  mixColors,
} from '@/components/map/useMarkerStateRules';

const SAMPLE_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#6b7280'];

const STATES = [
  { key: 'hover' as const, label: 'Hover', desc: 'Aclarar', defaults: { mix_percent: 25, shadow_blur: 8, shadow_opacity: 0.3, border_width: 2 } },
  { key: 'selected' as const, label: 'Seleccionado', desc: 'Oscurecer', defaults: { mix_percent: 15, shadow_blur: 6, shadow_opacity: 0.25, border_width: 2.5 } },
  { key: 'focused' as const, label: 'Enfocado', desc: 'Énfasis', defaults: { mix_percent: 30, shadow_blur: 12, shadow_opacity: 0.4, border_width: 3 } },
  { key: 'recent' as const, label: 'Reciente', desc: 'Selección', defaults: { mix_percent: 20, shadow_blur: 10, shadow_opacity: 0.35, border_width: 2 } },
];

const DEFAULT_ACCENT = '#3b82f6';
const DEFAULT_SELECTION = '#f59e0b';

const DOT_SIZE = 44;

function resolveTarget(rule: StateRule, rules: MarkerStateRules): string {
  switch (rule.mix_target) {
    case 'white': return '#ffffff';
    case 'black': return '#000000';
    case 'accent': return rules.accent_color;
    case 'selection': return rules.selection_color;
  }
}

function PreviewDot({ base, rule, rules, stateKey }: { base: string; rule: StateRule; rules: MarkerStateRules; stateKey: string }) {
  const target = resolveTarget(rule, rules);
  const mixed = mixColors(base, target, rule.mix_percent);
  const r = DOT_SIZE / 2;
  const uid = `pd-${stateKey}-${base.replace('#', '')}`;
  const normalBorder = 1.5;

  // Render two half-circles side by side as separate divs so each gets its own shadow
  return (
    <div className="shrink-0 flex" style={{ width: DOT_SIZE, height: DOT_SIZE }}>
      {/* Left half: normal */}
      <div
        style={{
          width: r,
          height: DOT_SIZE,
          overflow: 'hidden',
          filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.2))`,
        }}
      >
        <svg width={DOT_SIZE} height={DOT_SIZE} viewBox={`0 0 ${DOT_SIZE} ${DOT_SIZE}`}>
          <circle cx={r} cy={r} r={r - normalBorder} fill={base} />
          <circle cx={r} cy={r} r={r - normalBorder / 2} fill="none" stroke="white" strokeWidth={normalBorder} />
        </svg>
      </div>
      {/* Right half: state */}
      <div
        style={{
          width: r,
          height: DOT_SIZE,
          overflow: 'hidden',
          marginLeft: -r,
          clipPath: `inset(0 0 0 50%)`,
          filter: `drop-shadow(0 2px ${rule.shadow_blur}px rgba(0,0,0,${rule.shadow_opacity}))`,
        }}
      >
        <svg width={DOT_SIZE} height={DOT_SIZE} viewBox={`0 0 ${DOT_SIZE} ${DOT_SIZE}`}>
          <circle cx={r} cy={r} r={r - rule.border_width} fill={mixed} />
          <circle cx={r} cy={r} r={r - rule.border_width / 2} fill="none" stroke="white" strokeWidth={rule.border_width} />
        </svg>
      </div>
    </div>
  );
}

function MiniSlider({ label, value, onChange, min, max, step, unit, defaultVal }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string; defaultVal: number;
}) {
  const isDefault = value === defaultVal;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-14 shrink-0">{label}</span>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} className="flex-1" />
      <span className="text-[10px] font-mono w-10 text-right shrink-0">{value}{unit}</span>
      {!isDefault && (
        <button onClick={() => onChange(defaultVal)} className="text-muted-foreground hover:text-foreground shrink-0" title="Por defecto">
          <RotateCw className="w-2.5 h-2.5" />
        </button>
      )}
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

  const updateRule = (stateKey: 'hover' | 'selected' | 'focused' | 'recent', field: keyof StateRule, value: number) => {
    if (!rules) return;
    setRules({ ...rules, [stateKey]: { ...rules[stateKey], [field]: value } });
  };

  if (loading || !rules) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <p className="text-[11px] text-muted-foreground">Reglas visuales por estado</p>
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

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pb-8 space-y-5">
        {STATES.map(({ key, label, desc, defaults }) => {
          const rule = rules[key];
          return (
            <div key={key} className="grid grid-cols-2 gap-4">
              {/* Left: controls */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{label} <span className="text-muted-foreground font-normal">· {desc}</span></Label>
                <MiniSlider label="Color" value={rule.mix_percent} onChange={(v) => updateRule(key, 'mix_percent', v)} min={5} max={60} step={5} unit="%" defaultVal={defaults.mix_percent} />
                <MiniSlider label="Sombra" value={rule.shadow_blur} onChange={(v) => updateRule(key, 'shadow_blur', v)} min={0} max={24} step={2} unit="px" defaultVal={defaults.shadow_blur} />
                <MiniSlider label="Opacidad" value={Math.round(rule.shadow_opacity * 100)} onChange={(v) => updateRule(key, 'shadow_opacity', v / 100)} min={0} max={80} step={5} unit="%" defaultVal={Math.round(defaults.shadow_opacity * 100)} />
                <MiniSlider label="Borde" value={rule.border_width} onChange={(v) => updateRule(key, 'border_width', v)} min={0} max={6} step={0.5} unit="px" defaultVal={defaults.border_width} />
              </div>
              {/* Right: preview dots */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {SAMPLE_COLORS.map((base) => (
                  <PreviewDot key={base} base={base} rule={rule} rules={rules} stateKey={key} />
                ))}
              </div>
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
