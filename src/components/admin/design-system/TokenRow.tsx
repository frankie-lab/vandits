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
import { ChevronDown, Pencil, Link2, Link2Off } from 'lucide-react';
import type { PairedRow, LeafToken } from './token-grouping';
import { isColorValue, toCssColor } from './token-grouping';
import { hslTripletToHex, parseHslTriplet } from './color-conversions';
import {
  contrastRatio,
  wcagLevel,
  tripletToRgb,
  resolveTargetBackgroundPath,
} from './color-adaptive';
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

  if (isColorRow(row)) {
    return <ColorRowLayout row={row} entry={entry} hasOverride={hasOverride} />;
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

// ─── Color row: 3 columnas (Info · Claro · Oscuro) ─────────────────

function ColorRowLayout({
  row,
  entry,
  hasOverride,
}: {
  row: PairedRow;
  entry: ReturnType<typeof lookupGlossary>;
  hasOverride: boolean;
}) {
  const lightToken = row.kind === 'lightDark' ? row.light : row.tokens[0];
  const darkToken = row.kind === 'lightDark' ? row.dark : undefined;

  return (
    <div className="border border-border rounded-token-md bg-card overflow-hidden grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <ColorInfoColumn row={row} entry={entry} hasOverride={hasOverride} anchorPath={lightToken?.path.join('.')} hasDark={!!darkToken} />
      {lightToken && (
        <ColorSwatchColumn
          token={lightToken}
          fallback={String(row.kind === 'lightDark' ? row.light.value : row.value)}
          mode="light"
        />
      )}
      {darkToken ? (
        <ColorSwatchColumn token={darkToken} fallback={String(darkToken.value)} mode="dark" withDivider />
      ) : (
        <div className="hidden md:block border-l border-border bg-muted/20" />
      )}
    </div>
  );
}

function ColorInfoColumn({
  row,
  entry,
  hasOverride,
  anchorPath,
  hasDark,
}: {
  row: PairedRow;
  entry: ReturnType<typeof lookupGlossary>;
  hasOverride: boolean;
  anchorPath?: string;
  hasDark: boolean;
}) {
  const isLinked = useDesignSystemEdit((s) => (anchorPath ? s.isLinked(anchorPath) : false));
  const setLinked = useDesignSystemEdit((s) => s.setLinked);
  const canLink = !!anchorPath && hasDark && !!anchorPath.match(/^color\.(light|dark)\./);

  const cssVars = collectEditableTokens(row)
    .map((t) => t.cssVar)
    .filter(Boolean) as string[];

  return (
    <div className="p-3 min-w-0 md:border-r border-border flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-medium truncate">{entry.label}</div>
        {hasOverride && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
            Modificado
          </Badge>
        )}
        <RefChip row={row} />
      </div>
      <div className="text-xs text-muted-foreground">{entry.usage}</div>
      {cssVars.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cssVars.map((v) => (
            <code
              key={v}
              className="inline-flex items-center px-1.5 py-0.5 rounded-token-sm bg-muted text-[10px] font-mono text-muted-foreground"
            >
              {v}
            </code>
          ))}
        </div>
      )}
      {canLink && (
        <button
          type="button"
          onClick={() => setLinked(anchorPath!, !isLinked)}
          className={
            'mt-auto inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-token-sm border w-fit transition-colors ' +
            (isLinked
              ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
              : 'border-border text-muted-foreground hover:bg-muted/40')
          }
          title={
            isLinked
              ? 'Auto-link activo: al editar un modo se calcula el equivalente perceptual del otro'
              : 'Auto-link desactivado: cada modo se edita por separado'
          }
        >
          {isLinked ? <Link2 className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
          <span>{isLinked ? 'Claro ↔ Oscuro vinculados' : 'Edición independiente'}</span>
        </button>
      )}
    </div>
  );
}

function extractRole(path: string): string | undefined {
  const m = path.match(/^color\.(?:light|dark)\.(.+)$/);
  return m ? m[1] : undefined;
}

function isForegroundRole(role: string): boolean {
  if (role.startsWith('text.')) return true;
  if (/Foreground$/.test(role)) return true;
  return false;
}

function isSurfaceRole(role: string): boolean {
  return role.startsWith('surface.') || role.startsWith('map.') && role === 'map.background';
}

function ColorSwatchColumn({
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

  const isPrimitive = path.startsWith('color.primitives.');
  const role = extractRole(path) ?? '';
  const foreground = !isPrimitive && isForegroundRole(role);
  // Solo los surfaces semánticos pintan TODA la columna con su color.
  // Los primitivos se muestran como chip sobre el lienzo del modo (claro/oscuro)
  // para que se vea el contraste real.
  const surfaceItself = !isPrimitive && isSurfaceRole(role);

  // WCAG: se sigue calculando contra el surface destino real (donde el color
  // se aplica de verdad). Esto NO cambia el lienzo de la columna.
  const wcagTargetPath = resolveTargetBackgroundPath(path) ?? `color.${mode}.surface.background`;
  const wcagSurfaceTriplet = String(useResolvedTokenValue(wcagTargetPath) ?? '');
  const wcag = computeWcag(live, wcagSurfaceTriplet || undefined);

  // Lienzo de la columna: SIEMPRE el fondo de página del modo (claro/oscuro).
  // Excepción única: si el token ES el propio fondo de página semántico.
  const pageBgTriplet = String(
    useResolvedTokenValue(`color.${mode}.surface.background`) ?? ''
  );
  const pageBgCss = pageBgTriplet ? toCssColor(pageBgTriplet) : undefined;
  const canvasBg = surfaceItself ? css : (pageBgCss ?? css);

  // Texto secundario contrastado contra el lienzo (no contra el surface destino).
  const canvasHsl = parseHslTriplet(surfaceItself ? live : pageBgTriplet);
  const onSurfaceText = canvasHsl && canvasHsl.l > 55 ? 'text-black/70' : 'text-white/80';

  // Para chips, escoger color de texto contrastado contra el chip mismo.
  const chipHsl = parseHslTriplet(live);
  const onChipText = chipHsl && chipHsl.l > 55 ? 'text-black/85' : 'text-white/95';

  // Si el primitivo es casi indistinguible del lienzo, mostramos un ajedrezado
  // sutil detrás del chip para que su borde nunca desaparezca.
  const needsCheckerboard =
    isPrimitive &&
    canvasHsl != null &&
    chipHsl != null &&
    Math.abs(canvasHsl.l - chipHsl.l) < 6 &&
    Math.abs(canvasHsl.s - chipHsl.s) < 10;


  return (
    <div
      className={
        'relative ' +
        (withDivider
          ? 'md:border-l border-t md:border-t-0 border-border'
          : 'border-t md:border-t-0 border-border')
      }
    >
      <EditableTokenSurface
        path={path}
        label={mode === 'dark' ? 'Modo oscuro' : 'Modo claro'}
        title={`Editar ${mode === 'dark' ? 'modo oscuro' : 'modo claro'}`}
        className="block w-full h-full"
      >
        <div
          className="relative h-full min-h-[128px] w-full flex flex-col justify-between p-3 gap-3"
          style={{ background: canvasBg }}
        >
          {/* Header: label modo + WCAG */}
          <div className={`flex items-center justify-between gap-2 ${onSurfaceText}`}>
            <span className="text-[10px] uppercase tracking-wide font-semibold">
              {mode === 'dark' ? 'Oscuro' : 'Claro'}
            </span>
            {wcag && !surfaceItself && (
              <WcagBadge {...wcag} onSwatchText={onSurfaceText} />
            )}
          </div>

          {/* Muestra del color en contexto */}
          {surfaceItself ? (
            // El token ES el surface: solo HEX, sin chip.
            <code className={`text-sm font-mono font-semibold ${onChipText}`}>
              {hex ?? live}
            </code>
          ) : foreground ? (
            // Token de texto: pintamos texto en el color del token sobre el surface.
            <div className="flex flex-col gap-1 min-w-0">
              <div
                className="text-lg font-semibold truncate leading-tight"
                style={{ color: css }}
              >
                Texto sobre fondo
              </div>
              <code
                className="text-xs font-mono"
                style={{ color: css }}
              >
                {hex ?? live}
              </code>
            </div>
          ) : (
            // Chip relleno con el color, sobre el surface.
            <div
              className="rounded-token-sm border border-border/30 px-2.5 py-2 flex items-center justify-between gap-2 shadow-token-sm"
              style={{ background: css }}
            >
              <span className={`text-[10px] uppercase tracking-wide font-semibold ${onChipText}`}>
                Muestra
              </span>
              <code className={`text-xs font-mono font-semibold ${onChipText}`}>
                {hex ?? live}
              </code>
            </div>
          )}
        </div>
      </EditableTokenSurface>
    </div>
  );
}

interface WcagInfo {
  ratio: number;
  level: ReturnType<typeof wcagLevel>;
}

function computeWcag(triplet: string, bgTriplet?: string): WcagInfo | null {
  if (!bgTriplet) return null;
  const fg = tripletToRgb(triplet);
  const bg = tripletToRgb(bgTriplet);
  if (!fg || !bg) return null;
  const ratio = contrastRatio(fg, bg);
  return { ratio, level: wcagLevel(ratio, { uiComponent: true }) };
}

function WcagBadge({ ratio, level, onSwatchText }: WcagInfo & { onSwatchText: string }) {
  const fail = level === 'fail';
  return (
    <span
      className={
        'inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-token-sm backdrop-blur-sm ' +
        (fail
          ? 'bg-destructive/80 text-destructive-foreground'
          : `bg-background/70 ${onSwatchText}`)
      }
      title={`Contraste vs surface destino · ${ratio.toFixed(2)}:1`}
    >
      <span>{ratio.toFixed(2)}:1</span>
      <span className="font-semibold">{fail ? 'fail' : level}</span>
    </span>
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
