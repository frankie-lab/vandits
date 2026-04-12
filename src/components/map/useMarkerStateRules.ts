import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StateRule {
  mix_target: 'white' | 'black' | 'accent' | 'selection';
  mix_percent: number; // 0-100
  shadow_blur: number;
  shadow_opacity: number; // 0-1
  border_width: number;
}

export interface MarkerStateRules {
  hover: StateRule;
  selected: StateRule;
  focused: StateRule;
  recent: StateRule;
  accent_color: string;
  selection_color: string;
}

const DEFAULTS: MarkerStateRules = {
  hover: { mix_target: 'white', mix_percent: 25, shadow_blur: 8, shadow_opacity: 0.3, border_width: 2 },
  selected: { mix_target: 'black', mix_percent: 15, shadow_blur: 6, shadow_opacity: 0.25, border_width: 2.5 },
  focused: { mix_target: 'accent', mix_percent: 30, shadow_blur: 12, shadow_opacity: 0.4, border_width: 3 },
  recent: { mix_target: 'selection', mix_percent: 20, shadow_blur: 10, shadow_opacity: 0.35, border_width: 2 },
  accent_color: '#3b82f6',
  selection_color: '#f59e0b',
};

let cachedRules: MarkerStateRules | null = null;
let fetchPromise: Promise<MarkerStateRules> | null = null;
type Listener = (rules: MarkerStateRules) => void;
const listeners = new Set<Listener>();

function notifyListeners(rules: MarkerStateRules) {
  listeners.forEach((fn) => fn(rules));
}

async function fetchRules(): Promise<MarkerStateRules> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'marker_state_rules')
    .maybeSingle();

  if (error || !data) {
    console.warn('Failed to load marker state rules, using defaults', error);
    return DEFAULTS;
  }

  return { ...DEFAULTS, ...(data.value as unknown as Partial<MarkerStateRules>) };
}

function ensureFetched(): Promise<MarkerStateRules> {
  if (!fetchPromise) {
    fetchPromise = fetchRules().then((result) => {
      cachedRules = result;
      notifyListeners(result);
      return result;
    });
  }
  return fetchPromise;
}

// Eager fetch on module load
ensureFetched();

export function getMarkerStateRules(): MarkerStateRules {
  return cachedRules || DEFAULTS;
}

export function updateMarkerStateRules(rules: MarkerStateRules) {
  cachedRules = rules;
  notifyListeners(rules);
}

export function invalidateMarkerStateRulesCache() {
  cachedRules = null;
  fetchPromise = null;
  ensureFetched();
}

export function onMarkerStateRulesChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useMarkerStateRules() {
  const [rules, setRules] = useState<MarkerStateRules>(cachedRules || DEFAULTS);

  useEffect(() => {
    const unsub = onMarkerStateRulesChange(setRules);
    if (cachedRules) {
      setRules(cachedRules);
    } else {
      ensureFetched().then(setRules);
    }
    return unsub;
  }, []);

  return rules;
}

/** Parse any CSS color (hex or hsl) to [r, g, b] */
function parseColor(color: string): [number, number, number] {
  const trimmed = color.trim();
  // Handle hex
  if (trimmed.startsWith('#')) {
    const h = trimmed.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  // Handle hsl(h, s%, l%) or hsl(h s% l%)
  const hslMatch = trimmed.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)/i);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1/3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1/3) * 255),
    ];
  }
  // Fallback: return black
  return [0, 0, 0];
}

/** Mix any CSS color (hex or hsl) with a target color by a percentage. Always returns hex. */
export function mixColors(baseColor: string, targetColor: string, percent: number): string {
  const [r1, g1, b1] = parseColor(baseColor);
  const [r2, g2, b2] = parseColor(targetColor);
  const p = percent / 100;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * p);
  const toHex = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0');
  return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`;
}

/** Convert any CSS color to hex */
export function toHex(color: string): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return trimmed;
  const [r, g, b] = parseColor(trimmed);
  const h = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
  };
  const [r1, g1, b1] = parse(baseHex);
  const [r2, g2, b2] = parse(targetHex);
  const p = percent / 100;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * p);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`;
}

/** Get the resolved target color for a state rule */
function resolveTarget(rule: StateRule, rules: MarkerStateRules): string {
  switch (rule.mix_target) {
    case 'white': return '#ffffff';
    case 'black': return '#000000';
    case 'accent': return rules.accent_color;
    case 'selection': return rules.selection_color;
  }
}

/** Apply state rules to get a derived color from base */
export function getStateColor(baseColor: string, state: 'hover' | 'selected' | 'focused' | 'recent', rules?: MarkerStateRules): string {
  const r = rules || getMarkerStateRules();
  const rule = r[state];
  const target = resolveTarget(rule, r);
  return mixColors(baseColor, target, rule.mix_percent);
}

/** Get shadow CSS for a given state */
export function getStateShadow(state: 'normal' | 'hover' | 'selected' | 'focused' | 'recent', baseColor: string, rules?: MarkerStateRules): string {
  if (state === 'normal') return 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))';
  const r = rules || getMarkerStateRules();
  const rule = r[state as keyof Pick<MarkerStateRules, 'hover' | 'selected' | 'focused' | 'recent'>];
  if (!rule) return 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))';
  return `drop-shadow(0 2px ${rule.shadow_blur}px rgba(0,0,0,${rule.shadow_opacity}))`;
}

/** Get border width for a given state */
export function getStateBorderWidth(state: 'normal' | 'hover' | 'selected' | 'focused' | 'recent', rules?: MarkerStateRules): number {
  if (state === 'normal') return 1.5;
  const r = rules || getMarkerStateRules();
  const rule = r[state as keyof Pick<MarkerStateRules, 'hover' | 'selected' | 'focused' | 'recent'>];
  return rule?.border_width || 1.5;
}
