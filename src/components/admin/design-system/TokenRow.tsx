/**
 * TokenRow — fila expandible. En modo edición muestra botón "Editar" con popover.
 */
import { useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import type { PairedRow, LeafToken } from './token-grouping';
import {
  isColorValue,
  toCssColor,
  hslTripletToHex,
  isHslTriplet,
} from './token-grouping';
import { lookupGlossary } from './token-glossary';
import { TokenPreview } from './TokenPreviews';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/primitives/popover';
import { Badge } from '@/design-system/primitives/badge';
import { Button } from '@/design-system/primitives/button';
import { TokenValueEditor } from './TokenEditors';
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';
import { getLeaf } from '@/design-system/runtime/token-registry';

interface Props {
  row: PairedRow;
  groupId: string;
}

export function TokenRow({ row, groupId }: Props) {
  const [open, setOpen] = useState(false);
  const entry = lookupGlossary(row.glossaryKey);
  const editMode = useDesignSystemEdit((s) => s.editMode);
  const draft = useDesignSystemEdit((s) => s.draft);
  const published = useDesignSystemEdit((s) => s.published);

  const editableTokens = collectEditableTokens(row);
  const hasOverride = editableTokens.some(
    (t) => t.path.join(".") in draft || t.path.join(".") in published,
  );

  return (
    <div className="border border-border rounded-token-md bg-card">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-start gap-3 text-left hover:bg-muted/40 transition-colors rounded-token-md -m-1 p-1"
        >
          <Swatch row={row} groupId={groupId} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium truncate">{entry.label}</div>
              {hasOverride && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  Modificado
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{entry.usage}</div>
            <AliasChips row={row} />
          </div>
          <ValueColumn row={row} />
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
        {editMode && editableTokens.length > 0 && (
          <EditButton tokens={editableTokens} row={row} />
        )}
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2">Vista previa</div>
          <TokenPreview row={row} groupId={groupId} />
        </div>
      )}
    </div>
  );
}

function collectEditableTokens(row: PairedRow): LeafToken[] {
  if (row.kind === 'lightDark') {
    return row.dark ? [row.light, row.dark] : [row.light];
  }
  return row.tokens.filter((t) => !!t.cssVar);
}

function EditButton({ tokens, row }: { tokens: LeafToken[]; row: PairedRow }) {
  const setDraft = useDesignSystemEdit((s) => s.setDraft);
  const draft = useDesignSystemEdit((s) => s.draft);
  const published = useDesignSystemEdit((s) => s.published);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" title="Editar token">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          {tokens.map((t) => {
            const dotted = t.path.join('.');
            const leaf = getLeaf(dotted);
            if (!leaf) return null;
            const current = draft[dotted] ?? published[dotted] ?? leaf.baseValue;
            const modeLabel =
              row.kind === 'lightDark'
                ? dotted.includes('.dark.')
                  ? 'Modo oscuro'
                  : 'Modo claro'
                : dotted;
            return (
              <div key={dotted} className="space-y-2">
                <div className="text-xs font-medium">{modeLabel}</div>
                <TokenValueEditor
                  type={leaf.type}
                  value={current}
                  baseValue={leaf.baseValue}
                  onChange={(next) => setDraft(dotted, next)}
                />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
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
