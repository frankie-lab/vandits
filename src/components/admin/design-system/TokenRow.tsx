/**
 * TokenRow — fila expandible con identidad humana + uso + preview.
 *
 *  - Swatch (color) o icono según tipo.
 *  - Identidad: label humano (es) + nombre técnico + alias en chips si hay dedupe.
 *  - "Dónde se usa": frase curada del glosario.
 *  - Click → expande con TokenPreview en vivo.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PairedRow } from './token-grouping';
import {
  isColorValue,
  toCssColor,
  hslTripletToHex,
  isHslTriplet,
} from './token-grouping';
import { lookupGlossary } from './token-glossary';
import { TokenPreview } from './TokenPreviews';

interface Props {
  row: PairedRow;
  groupId: string;
}

export function TokenRow({ row, groupId }: Props) {
  const [open, setOpen] = useState(false);
  const entry = lookupGlossary(row.glossaryKey);

  return (
    <div className="border border-border rounded-token-md bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/40 transition-colors rounded-token-md"
      >
        <Swatch row={row} groupId={groupId} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{entry.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {entry.usage}
          </div>
          <AliasChips row={row} />
        </div>
        <ValueColumn row={row} />
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2">Vista previa</div>
          <TokenPreview row={row} groupId={groupId} />
        </div>
      )}
    </div>
  );
}

// ─── Swatch ────────────────────────────────────────────────────────

function Swatch({ row, groupId }: { row: PairedRow; groupId: string }) {
  if (row.kind === 'lightDark') {
    return (
      <div className="flex shrink-0 rounded-token-sm overflow-hidden border border-border">
        <div
          className="h-10 w-6"
          style={{ background: toCssColor(String(row.light.value)) }}
          title={`Claro · ${row.light.value}`}
        />
        {row.dark && (
          <div
            className="h-10 w-6"
            style={{ background: toCssColor(String(row.dark.value)) }}
            title={`Oscuro · ${row.dark.value}`}
          />
        )}
      </div>
    );
  }
  const value = String(row.value);
  if (isColorValue(value)) {
    return (
      <div
        className="h-10 w-12 shrink-0 rounded-token-sm border border-border"
        style={{ background: toCssColor(value) }}
      />
    );
  }
  if (groupId === 'radius') {
    return (
      <div
        className="h-10 w-12 shrink-0 bg-primary/70 border border-border"
        style={{ borderRadius: value }}
      />
    );
  }
  // Etiqueta numérica/textual genérica
  return (
    <div className="h-10 w-12 shrink-0 rounded-token-sm bg-muted flex items-center justify-center">
      <span className="text-[10px] font-mono text-muted-foreground truncate px-1">
        {value}
      </span>
    </div>
  );
}

// ─── Alias chips ───────────────────────────────────────────────────

function AliasChips({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  if (row.tokens.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {row.tokens.map((t) => (
        <span
          key={t.path.join('.')}
          className="inline-flex items-center px-1.5 py-0.5 rounded-token-sm bg-muted text-[10px] font-mono text-muted-foreground"
        >
          {t.cssVar ?? t.path.join('.')}
        </span>
      ))}
      <span className="text-[10px] text-muted-foreground">
        · {row.tokens.length} alias con el mismo valor
      </span>
    </div>
  );
}

// ─── Value column ──────────────────────────────────────────────────

function ValueColumn({ row }: { row: PairedRow }) {
  if (row.kind === 'lightDark') {
    return (
      <div className="text-right shrink-0 hidden sm:block">
        <ValueLine label="Claro" value={String(row.light.value)} />
        {row.dark && <ValueLine label="Oscuro" value={String(row.dark.value)} />}
      </div>
    );
  }
  return (
    <div className="text-right shrink-0 hidden sm:block">
      <code className="text-xs font-mono text-muted-foreground">
        {String(row.value)}
      </code>
      {typeof row.value === 'string' && isHslTriplet(row.value) && (
        <div className="text-[10px] font-mono text-muted-foreground/70">
          {hslTripletToHex(row.value)}
        </div>
      )}
    </div>
  );
}

function ValueLine({ label, value }: { label: string; value: string }) {
  const hex = isHslTriplet(value) ? hslTripletToHex(value) : null;
  return (
    <div className="flex items-baseline gap-2 justify-end">
      <span className="text-[10px] uppercase text-muted-foreground/70 tracking-wide">
        {label}
      </span>
      <code className="text-xs font-mono text-muted-foreground">
        {hex ?? value}
      </code>
    </div>
  );
}
