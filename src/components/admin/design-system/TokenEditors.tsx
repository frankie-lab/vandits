/**
 * Editores de tokens, agrupados por tipo.
 *
 * Cada editor recibe `(value, onChange, baseValue)` y emite valores ya
 * formateados (string) listos para escribir en la CSS var correspondiente.
 *
 *  - ColorEditor       : 3 inputs H/S/L + preview + hex.
 *  - NumberEditor      : número + unidad detectada del baseValue.
 *  - FontFamilyEditor  : select de seguras + custom string.
 *  - EasingEditor      : presets + cubic-bezier custom.
 *  - ShadowEditor      : textarea + preview.
 *  - TextEditor        : input plano (fallback).
 */
import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/design-system/primitives/input';
import { Button } from '@/design-system/primitives/button';
import { Label } from '@/design-system/primitives/label';
import { isHslTriplet } from '@/components/admin/design-system/token-grouping';
import {
  parseHslTriplet,
  formatHslTriplet,
  hslToRgb,
  rgbToHsl,
  rgbToHex,
  parseHex,
  hslTripletToHex,
  hexToHslTriplet,
  type Hsl,
  type Rgb,
} from '@/components/admin/design-system/color-conversions';
import { getAllLeaves } from '@/design-system/runtime/token-registry';
import { useResolvedTokenValue } from '@/components/admin/design-system/useResolvedTokenValue';
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';

type Common = {
  value: string | number;
  baseValue: string | number;
  onChange: (next: string) => void;
};

// ─── helpers ──────────────────────────────────────────────────────

function parseHsl(v: string): { h: number; s: number; l: number } | null {
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
}
function hslToString(h: number, s: number, l: number) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return `${round(h)} ${round(s)}% ${round(l)}%`;
}

function detectUnit(v: string | number): string {
  const s = String(v).trim();
  const m = s.match(/(px|rem|em|ms|s|%)$/);
  return m ? m[1] : '';
}
function stripUnit(v: string | number): number {
  const s = String(v).trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// ─── ColorEditor ──────────────────────────────────────────────────

export function ColorEditor({ value, baseValue, onChange }: Common) {
  const initial = parseHsl(String(value)) ?? { h: 0, s: 0, l: 50 };
  const [h, setH] = useState(initial.h);
  const [s, setS] = useState(initial.s);
  const [l, setL] = useState(initial.l);

  useEffect(() => {
    const next = parseHsl(String(value));
    if (next) {
      setH(next.h);
      setS(next.s);
      setL(next.l);
    }
  }, [value]);

  const emit = (nh: number, ns: number, nl: number) => {
    setH(nh);
    setS(ns);
    setL(nl);
    onChange(hslToString(nh, ns, nl));
  };

  const hex = isHslTriplet(String(value)) ? hslTripletToHex(String(value)) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="h-12 w-16 rounded-token-sm border border-border shrink-0"
          style={{ background: `hsl(${value})` }}
        />
        <div className="flex-1 space-y-1">
          <div className="font-mono text-xs">{String(value)}</div>
          {hex && <div className="font-mono text-[10px] text-muted-foreground">{hex}</div>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Slider label="H" min={0} max={360} value={h} onChange={(v) => emit(v, s, l)} />
        <Slider label="S" min={0} max={100} value={s} onChange={(v) => emit(h, v, l)} suffix="%" />
        <Slider label="L" min={0} max={100} value={l} onChange={(v) => emit(h, s, v)} suffix="%" />
      </div>

      <ResetRow baseValue={baseValue} value={value} onChange={onChange} />
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
  suffix = '',
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

// ─── NumberEditor ─────────────────────────────────────────────────

export function NumberEditor({ value, baseValue, onChange }: Common) {
  const unit = detectUnit(baseValue);
  const [n, setN] = useState(stripUnit(value));

  useEffect(() => {
    setN(stripUnit(value));
  }, [value]);

  const emit = (next: number) => {
    setN(next);
    onChange(unit ? `${next}${unit}` : String(next));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={n}
          onChange={(e) => emit(parseFloat(e.target.value || '0'))}
          className="h-9 font-mono"
        />
        {unit && <span className="text-sm font-mono text-muted-foreground">{unit}</span>}
      </div>
      <ResetRow baseValue={baseValue} value={value} onChange={onChange} />
    </div>
  );
}

// ─── FontFamilyEditor ─────────────────────────────────────────────

const FONT_PRESETS = [
  'Inter, sans-serif',
  '"SF Pro Display", system-ui, sans-serif',
  'system-ui, sans-serif',
  '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Georgia, serif',
  '"Playfair Display", Georgia, serif',
  '"JetBrains Mono", monospace',
  '"Fira Code", monospace',
];

export function FontFamilyEditor({ value, baseValue, onChange }: Common) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <div className="space-y-3">
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        className="h-9 font-mono text-xs"
      />
      <div className="flex flex-wrap gap-1">
        {FONT_PRESETS.map((f) => (
          <Button
            key={f}
            size="xs"
            variant="outline"
            onClick={() => {
              setText(f);
              onChange(f);
            }}
            style={{ fontFamily: f }}
          >
            {f.split(',')[0].replace(/['"]/g, '')}
          </Button>
        ))}
      </div>
      <div className="rounded-token-sm border border-border p-3" style={{ fontFamily: String(value) }}>
        <div className="text-xl">Aa Bb Cc 123</div>
        <div className="text-sm text-muted-foreground">El zorro marrón salta sobre el perro.</div>
      </div>
      <ResetRow baseValue={baseValue} value={value} onChange={onChange} />
    </div>
  );
}

// ─── EasingEditor ─────────────────────────────────────────────────

const EASING_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Standard', value: 'cubic-bezier(0.2, 0, 0, 1)' },
  { label: 'Emphasized', value: 'cubic-bezier(0.3, 0, 0, 1)' },
  { label: 'Decel', value: 'cubic-bezier(0, 0, 0.2, 1)' },
  { label: 'Accel', value: 'cubic-bezier(0.4, 0, 1, 1)' },
  { label: 'Linear', value: 'linear' },
  { label: 'Ease', value: 'ease' },
];

export function EasingEditor({ value, baseValue, onChange }: Common) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <div className="space-y-3">
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        className="h-9 font-mono text-xs"
      />
      <div className="flex flex-wrap gap-1">
        {EASING_PRESETS.map((p) => (
          <Button
            key={p.label}
            size="xs"
            variant="outline"
            onClick={() => {
              setText(p.value);
              onChange(p.value);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <ResetRow baseValue={baseValue} value={value} onChange={onChange} />
    </div>
  );
}

// ─── ShadowEditor ─────────────────────────────────────────────────

export function ShadowEditor({ value, baseValue, onChange }: Common) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        rows={3}
        className="w-full font-mono text-xs px-3 py-2 rounded-token-sm bg-background border border-border resize-y"
      />
      <div className="h-16 rounded-token-md bg-card border border-border" style={{ boxShadow: String(value) }} />
      <ResetRow baseValue={baseValue} value={value} onChange={onChange} />
    </div>
  );
}

// ─── TextEditor (fallback) ─────────────────────────────────────────

export function TextEditor({ value, baseValue, onChange }: Common) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <div className="space-y-3">
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        className="h-9 font-mono text-xs"
      />
      <ResetRow baseValue={baseValue} value={value} onChange={onChange} />
    </div>
  );
}

// ─── Shared reset row ─────────────────────────────────────────────

function ResetRow({ value, baseValue, onChange }: Common) {
  const isOverridden = String(value) !== String(baseValue);
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground font-mono">
        Base: <span className="text-foreground">{String(baseValue)}</span>
      </span>
      <Button
        size="xs"
        variant="ghost"
        disabled={!isOverridden}
        onClick={() => onChange(String(baseValue))}
      >
        Volver a la base
      </Button>
    </div>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────

import type { TokenType } from '@/design-system/runtime/token-registry';

export function TokenValueEditor({
  type,
  value,
  baseValue,
  onChange,
}: {
  type: TokenType;
} & Common) {
  switch (type) {
    case 'color':
      return <ColorEditor value={value} baseValue={baseValue} onChange={onChange} />;
    case 'number':
      return <NumberEditor value={value} baseValue={baseValue} onChange={onChange} />;
    case 'fontFamily':
      return <FontFamilyEditor value={value} baseValue={baseValue} onChange={onChange} />;
    case 'easing':
      return <EasingEditor value={value} baseValue={baseValue} onChange={onChange} />;
    case 'shadow':
      return <ShadowEditor value={value} baseValue={baseValue} onChange={onChange} />;
    case 'text':
    default:
      return <TextEditor value={value} baseValue={baseValue} onChange={onChange} />;
  }
}

// avoid lint warnings on memo unused import
void useMemo;
