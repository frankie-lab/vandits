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
import {
  parseHslTriplet,
  formatHslTriplet,
  hslToRgb,
  rgbToHsl,
  rgbToHex,
  parseHex,
  type Hsl,
  type Rgb,
} from '@/components/admin/design-system/color-conversions';
import { getAllLeaves } from '@/design-system/runtime/token-registry';
import { useResolvedTokenValue } from '@/components/admin/design-system/useResolvedTokenValue';

type Common = {
  value: string | number;
  baseValue: string | number;
  onChange: (next: string) => void;
};

// ─── helpers ──────────────────────────────────────────────────────

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
  const triplet = String(value);
  const hsl: Hsl = useMemo(
    () => parseHslTriplet(triplet) ?? { h: 0, s: 0, l: 50 },
    [triplet],
  );
  const rgb: Rgb = useMemo(() => hslToRgb(hsl), [hsl]);
  const hex = useMemo(() => rgbToHex(rgb), [rgb]);

  const emitHsl = (next: Hsl) => onChange(formatHslTriplet(next));
  const emitRgb = (next: Rgb) => onChange(formatHslTriplet(rgbToHsl(next)));

  const [hexDraft, setHexDraft] = useState(hex);
  useEffect(() => setHexDraft(hex), [hex]);

  const commitHex = (raw: string) => {
    const parsed = parseHex(raw);
    if (parsed) emitRgb(parsed);
    else setHexDraft(hex);
  };

  return (
    <div className="space-y-3">
      {/* Swatch + HEX + native picker */}
      <div className="flex items-center gap-3">
        <div
          className="h-14 w-14 rounded-token-sm border border-border shrink-0"
          style={{ background: `hsl(${triplet})` }}
        />
        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground w-7 shrink-0">
              HEX
            </Label>
            <Input
              value={hexDraft}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={(e) => commitHex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="h-7 text-xs font-mono"
              spellCheck={false}
            />
            <input
              type="color"
              value={hex}
              onChange={(e) => commitHex(e.target.value)}
              className="h-7 w-9 rounded-token-sm border border-border bg-transparent cursor-pointer shrink-0"
              title="Selector nativo"
            />
          </div>
          <div className="font-mono text-[10px] text-muted-foreground truncate">
            hsl({triplet})
          </div>
        </div>
      </div>

      {/* RGB numeric */}
      <ChannelRow
        label="RGB"
        names={['R', 'G', 'B']}
        max={[255, 255, 255]}
        values={[rgb.r, rgb.g, rgb.b]}
        onChange={(idx, v) => {
          const next: Rgb = { ...rgb };
          if (idx === 0) next.r = v;
          else if (idx === 1) next.g = v;
          else next.b = v;
          emitRgb(next);
        }}
      />

      {/* HSL numeric */}
      <ChannelRow
        label="HSL"
        names={['H', 'S', 'L']}
        max={[360, 100, 100]}
        suffix={['', '%', '%']}
        values={[Math.round(hsl.h), Math.round(hsl.s), Math.round(hsl.l)]}
        onChange={(idx, v) => {
          const next: Hsl = { ...hsl };
          if (idx === 0) next.h = v;
          else if (idx === 1) next.s = v;
          else next.l = v;
          emitHsl(next);
        }}
      />

      {/* Fine-tune sliders */}
      <div className="grid grid-cols-3 gap-2">
        <Slider label="H" min={0} max={360} value={hsl.h} onChange={(v) => emitHsl({ ...hsl, h: v })} />
        <Slider label="S" min={0} max={100} value={hsl.s} onChange={(v) => emitHsl({ ...hsl, s: v })} suffix="%" />
        <Slider label="L" min={0} max={100} value={hsl.l} onChange={(v) => emitHsl({ ...hsl, l: v })} suffix="%" />
      </div>

      {/* Primitive palette */}
      <PrimitivePalette currentTriplet={triplet} onPick={(t) => onChange(t)} />

      <ResetRow baseValue={baseValue} value={value} onChange={onChange} />
    </div>
  );
}

function ChannelRow({
  label,
  values,
  names,
  max,
  suffix,
  onChange,
}: {
  label: string;
  values: number[];
  names: string[];
  max: number[];
  suffix?: string[];
  onChange: (idx: number, value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground w-7 shrink-0">
        {label}
      </Label>
      <div className="grid grid-cols-3 gap-1.5 flex-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-muted-foreground w-3">
              {names[i]}
            </span>
            <Input
              type="number"
              min={0}
              max={max[i]}
              value={Number.isFinite(v) ? v : 0}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) onChange(i, n);
              }}
              className="h-7 text-xs font-mono px-1.5"
            />
            {suffix?.[i] && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {suffix[i]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrimitivePalette({
  currentTriplet,
  onPick,
}: {
  currentTriplet: string;
  onPick: (triplet: string) => void;
}) {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');
  const mode: 'light' | 'dark' = isDark ? 'dark' : 'light';

  const primitives = useMemo(
    () =>
      getAllLeaves().filter(
        (l) =>
          l.groupId === 'color' &&
          l.isPrimitive &&
          l.mode === mode &&
          l.path.startsWith('color.primitives.'),
      ),
    [mode],
  );

  if (!primitives.length) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Paleta primitiva ({mode === 'dark' ? 'oscuro' : 'claro'})
      </div>
      <div className="flex flex-wrap gap-1">
        {primitives.map((p) => (
          <PaletteSwatch
            key={p.path}
            primitivePath={p.path}
            fallbackTriplet={String(p.baseValue)}
            label={p.path.replace(`color.primitives.${mode}.`, '')}
            currentTriplet={currentTriplet}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

function PaletteSwatch({
  primitivePath,
  fallbackTriplet,
  label,
  onPick,
  currentTriplet,
}: {
  primitivePath: string;
  fallbackTriplet: string;
  label: string;
  currentTriplet: string;
  onPick: (triplet: string) => void;
}) {
  const live = useResolvedTokenValue(primitivePath);
  const triplet = String(live ?? fallbackTriplet);
  const selected = triplet.trim() === currentTriplet.trim();
  return (
    <button
      type="button"
      title={`${label} · ${triplet}`}
      onClick={() => onPick(triplet)}
      className={
        'h-7 w-7 rounded-token-sm border transition-shadow ' +
        (selected
          ? 'border-foreground ring-2 ring-ring'
          : 'border-border hover:ring-2 hover:ring-ring/40')
      }
      style={{ background: `hsl(${triplet})` }}
    />
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
