/**
 * TokenRow — fila expandible.
 *
 * En modo edición:
 *   - El swatch del header (mitades claro/oscuro o bloque único) es clicable.
 *   - Cada hex de la columna de valor es clicable.
 *   - Cada preview del bloque expandido (vía TokenPreviews) también.
 *   - El lápiz queda como fallback (solo aparece si no hay swatch/preview clicable).
 *
 * Toda la lectura del valor pasa por `useResolvedTokenValue` para que los
 * cambios live (draft) se reflejen al instante en el row y el preview.
 */
import { useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import type { PairedRow, LeafToken } from './token-grouping';
import { isColorValue, toCssColor } from './token-grouping';
import { hslTripletToHex, parseHslTriplet } from './color-conversions';
import { lookupGlossary } from './token-glossary';
import { TokenPreview } from './TokenPreviews';
import { Badge } from '@/design-system/primitives/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/primitives/popover';
import { Button } from '@/design-system/primitives/button';
import { TokenValueEditor } from './TokenEditors';
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';
import { getLeaf } from '@/design-system/runtime/token-registry';
import { useResolvedTokenValue } from './useResolvedTokenValue';
import { EditableTokenSurface } from './EditableTokenSurface';

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
    (t) => t.path.join('.') in draft || t.path.join('.') in published,
  );

  return (
    <div className="border border-border rounded-token-md bg-card">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-start gap-3 text-left hover:bg-muted/40 transition-colors rounded-token-md -m-1 p-1 min-w-0"
        >
          <Swatch row={row} groupId={groupId} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-medium truncate">{entry.label}</div>
              {hasOverride && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  Modificado
                </Badge>
              )}
              <RefChip row={row} />
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
        {editMode && editableTokens.length > 0 && !hasClickableSurface(row, groupId) && (
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

/**
 * Decide si el row ya tiene una superficie clicable (swatch o columna de hex)
 * gracias a EditableTokenSurface, en cuyo caso el lápiz fallback NO se muestra.
 *
 * Hoy todos los rows de `color` y los `single` con valor color tienen swatch
 * clicable; el resto cae al fallback del lápiz.
 */
function hasClickableSurface(row: PairedRow, groupId: string): boolean {
  if (groupId === 'color') return true;
  if (row.kind === 'single' && typeof row.value === 'string' && isColorValue(row.value)) {
    return true;
  }
  return false;
}

/** Pequeño chip "→ neutral.0" cuando el token es un alias. */
function RefChip({ row }: { row: PairedRow }) {
  let refPath: string | undefined;
  if (row.kind === 'lightDark') {
    refPath = extractRefName(row.light.refPath);
  } else {
    refPath = extractRefName(row.refPath);
  }
  if (!refPath) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded-token-sm bg-muted">
      <span aria-hidden>→</span>
      {refPath}
    </span>
  );
}

function extractRefName(refPath?: string): string | undefined {
  if (!refPath) return undefined;
  const m = refPath.match(/^color\.primitives\.(?:light|dark)\.(.+)$/);
  return m ? m[1] : refPath;
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
  // Hooks must be called unconditionally.
  const singlePath =
    row.kind === 'single' ? row.tokens[0]?.path.join('.') : undefined;
  const singleLive = useResolvedTokenValue(singlePath);

  if (row.kind === 'lightDark') {
    return (
      <div className="flex shrink-0 rounded-token-sm overflow-hidden border border-border">
        <SwatchHalf token={row.light} fallback={String(row.light.value)} label="Modo claro" />
        {row.dark && (
          <SwatchHalf token={row.dark} fallback={String(row.dark.value)} label="Modo oscuro" />
        )}
      </div>
    );
  }

  const live = String(singleLive ?? row.value);

  if (isColorValue(live)) {
    return (
      <EditableTokenSurface
        path={singlePath}
        label="Color"
        title="Editar color"
        className="block"
      >
        <SwatchInner value={live} />
      </EditableTokenSurface>
    );
  }
  if (groupId === 'radius') {
    return (
      <EditableTokenSurface path={singlePath} label="Radius" className="block">
        <div
          className="h-10 w-12 shrink-0 bg-primary/70 border border-border"
          style={{ borderRadius: live }}
        />
      </EditableTokenSurface>
    );
  }
  return (
    <EditableTokenSurface path={singlePath} className="block">
      <div className="h-10 w-12 shrink-0 rounded-token-sm bg-muted flex items-center justify-center">
        <span className="text-[10px] font-mono text-muted-foreground truncate px-1">
          {live}
        </span>
      </div>
    </EditableTokenSurface>
  );
}

function SwatchHalf({
  token,
  fallback,
  label,
}: {
  token: LeafToken;
  fallback: string;
  label: string;
}) {
  const path = token.path.join('.');
  const live = String(useResolvedTokenValue(path) ?? fallback);
  return (
    <EditableTokenSurface path={path} label={label} title={`Editar (${label})`} className="block">
      <div
        className="h-10 w-6"
        style={{ background: toCssColor(live) }}
        title={`${label} · ${live}`}
      />
    </EditableTokenSurface>
  );
}

function SwatchInner({ value }: { value: string }) {
  return (
    <div
      className="h-10 w-12 shrink-0 rounded-token-sm border border-border"
      style={{ background: toCssColor(value) }}
    />
  );
}

/** Lee valor "live" como string (con fallback). */
function useLiveString(path: string | undefined, fallback: string): string {
  const v = useResolvedTokenValue(path);
  return v === undefined ? fallback : String(v);
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
        <ValueLine label="Claro" token={row.light} />
        {row.dark && <ValueLine label="Oscuro" token={row.dark} />}
      </div>
    );
  }
  const single = row.tokens[0];
  return (
    <div className="text-right shrink-0 hidden sm:block">
      <SingleValueLine token={single} fallback={String(row.value)} />
    </div>
  );
}

function ValueLine({ label, token }: { label: string; token: LeafToken }) {
  const path = token.path.join('.');
  const live = String(useResolvedTokenValue(path) ?? token.value);
  const hex = parseHslTriplet(live) ? hslTripletToHex(live) : null;
  return (
    <EditableTokenSurface
      path={path}
      label={label === 'Claro' ? 'Modo claro' : 'Modo oscuro'}
      className="block w-full"
      title={`Editar ${label.toLowerCase()}`}
    >
      <div className="flex items-baseline gap-2 justify-end px-1 py-0.5">
        <span className="text-[10px] uppercase text-muted-foreground/70 tracking-wide">
          {label}
        </span>
        <code className="text-xs font-mono text-muted-foreground">{hex ?? live}</code>
      </div>
    </EditableTokenSurface>
  );
}

function SingleValueLine({
  token,
  fallback,
}: {
  token?: LeafToken;
  fallback: string;
}) {
  const path = token?.path.join('.');
  const live = String(useResolvedTokenValue(path) ?? fallback);
  const hex = parseHslTriplet(live) ? hslTripletToHex(live) : null;
  return (
    <EditableTokenSurface path={path} className="block w-full">
      <div className="px-1 py-0.5">
        <code className="text-xs font-mono text-muted-foreground">{live}</code>
        {hex && (
          <div className="text-[10px] font-mono text-muted-foreground/70">{hex}</div>
        )}
      </div>
    </EditableTokenSurface>
  );
}
