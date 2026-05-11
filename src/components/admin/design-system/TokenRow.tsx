/**
 * TokenRow — fila de token.
 *
 * Dos layouts según el tipo de row:
 *
 *  - Color (kind=lightDark o kind=single con valor color):
 *      Cabecera compacta (nombre + descripción + ref + badge "Modificado")
 *      + grid de 1 o 2 columnas grandes (Claro / Oscuro) siempre visibles.
 *      Cada columna es un swatch clicable (EditableTokenSurface) que abre el
 *      color picker. NO hay chevron de expandir: no hay nada más que mostrar.
 *
 *  - No-color (radius, density, motion, typography, z-index, elevation):
 *      Cabecera compacta + swatch específico + chevron expandible con
 *      <TokenPreview> para ver el efecto del valor.
 *
 * Toda la lectura del valor pasa por `useResolvedTokenValue` para que los
 * cambios live (draft) se reflejen al instante.
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
  const entry = lookupGlossary(row.glossaryKey);
  const draft = useDesignSystemEdit((s) => s.draft);
  const published = useDesignSystemEdit((s) => s.published);

  const editableTokens = collectEditableTokens(row);
  const hasOverride = editableTokens.some(
    (t) => t.path.join('.') in draft || t.path.join('.') in published,
  );

  const colorLayout = isColorRow(row);

  if (colorLayout) {
    return (
      <div className="border border-border rounded-token-md bg-card overflow-hidden">
        <div className="px-3 pt-3 pb-2">
          <RowHeader entry={entry} row={row} hasOverride={hasOverride} />
        </div>
        <ColorColumns row={row} />
      </div>
    );
  }

  return <NonColorRow row={row} groupId={groupId} entry={entry} hasOverride={hasOverride} editableTokens={editableTokens} />;
}

function isColorRow(row: PairedRow): boolean {
  if (row.kind === 'lightDark') return true;
  if (row.kind === 'single' && typeof row.value === 'string' && isColorValue(row.value)) {
    return true;
  }
  return false;
}

// ─── Header (compartido) ───────────────────────────────────────────

function RowHeader({
  entry,
  row,
  hasOverride,
}: {
  entry: ReturnType<typeof lookupGlossary>;
  row: PairedRow;
  hasOverride: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-medium truncate">{entry.label}</div>
        {hasOverride && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
            Modificado
          </Badge>
        )}
        <RefChip row={row} />
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{entry.usage}</div>
      <AliasChips row={row} />
    </div>
  );
}

// ─── Color layout (1 o 2 columnas) ────────────────────────────────

function ColorColumns({ row }: { row: PairedRow }) {
  if (row.kind === 'lightDark') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-border">
        <ColorColumn token={row.light} fallback={String(row.light.value)} mode="light" />
        {row.dark && (
          <ColorColumn
            token={row.dark}
            fallback={String(row.dark.value)}
            mode="dark"
            withDivider
          />
        )}
      </div>
    );
  }
  // single con color
  const single = row.tokens[0];
  return (
    <div className="border-t border-border">
      <ColorColumn token={single} fallback={String(row.value)} mode="light" />
    </div>
  );
}

function ColorColumn({
  token,
  fallback,
  mode,
  withDivider,
}: {
  token: LeafToken;
  fallback: string;
  mode: 'light' | 'dark';
  withDivider?: boolean;
}) {
  const path = token.path.join('.');
  const live = String(useResolvedTokenValue(path) ?? fallback);
  const css = toCssColor(live);
  const hex = parseHslTriplet(live) ? hslTripletToHex(live) : null;

  // Fondo contextual: el swatch claro se ve sobre superficie clara,
  // el oscuro sobre superficie oscura, para reflejar el contexto real.
  const wrapBg = mode === 'dark' ? 'bg-foreground/90' : 'bg-background';
  const labelColor = mode === 'dark' ? 'text-background/70' : 'text-muted-foreground';
  const hexColor = mode === 'dark' ? 'text-background' : 'text-foreground';
  const dividerClass = withDivider ? 'sm:border-l border-border' : '';

  return (
    <div className={`p-3 ${wrapBg} ${dividerClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] uppercase tracking-wide ${labelColor}`}>
          {mode === 'dark' ? 'Oscuro' : 'Claro'}
        </span>
        <code className={`text-xs font-mono ${hexColor}`}>{hex ?? live}</code>
      </div>
      <EditableTokenSurface
        path={path}
        label={mode === 'dark' ? 'Modo oscuro' : 'Modo claro'}
        title={`Editar ${mode === 'dark' ? 'modo oscuro' : 'modo claro'}`}
        className="block w-full"
      >
        <div
          className="h-12 w-full rounded-token-sm border border-border"
          style={{ background: css }}
        />
      </EditableTokenSurface>
    </div>
  );
}

// ─── No-color layout (radius, density, typography, motion, etc.) ──

function NonColorRow({
  row,
  groupId,
  entry,
  hasOverride,
  editableTokens,
}: {
  row: PairedRow;
  groupId: string;
  entry: ReturnType<typeof lookupGlossary>;
  hasOverride: boolean;
  editableTokens: LeafToken[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-token-md bg-card">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-start gap-3 text-left hover:bg-muted/40 transition-colors rounded-token-md -m-1 p-1 min-w-0"
        >
          <NonColorSwatch row={row} groupId={groupId} />
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
          <NonColorValue row={row} />
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
        {editableTokens.length > 0 && <EditButton tokens={editableTokens} row={row} />}
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

function NonColorSwatch({ row, groupId }: { row: PairedRow; groupId: string }) {
  const singlePath =
    row.kind === 'single' ? row.tokens[0]?.path.join('.') : undefined;
  const singleLive = useResolvedTokenValue(singlePath);
  if (row.kind !== 'single') return null;
  const live = String(singleLive ?? row.value);

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

function NonColorValue({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  const single = row.tokens[0];
  const path = single?.path.join('.');
  const live = String(useResolvedTokenValue(path) ?? row.value);
  return (
    <div className="text-right shrink-0 hidden sm:block px-1 py-0.5">
      <code className="text-xs font-mono text-muted-foreground">{live}</code>
    </div>
  );
}

// ─── Edit popover (no-color fallback) ─────────────────────────────

function EditButton({ tokens, row }: { tokens: LeafToken[]; row: PairedRow }) {
  const editMode = useDesignSystemEdit((s) => s.editMode);
  const setDraft = useDesignSystemEdit((s) => s.setDraft);
  const draft = useDesignSystemEdit((s) => s.draft);
  const published = useDesignSystemEdit((s) => s.published);
  if (!editMode) return null;

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

// ─── Helpers de header ────────────────────────────────────────────

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
