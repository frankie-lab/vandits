/**
 * TokenPreviews — mini-ejemplos en vivo para cada tipo de token.
 * Token recibido en bruto (valor + glossaryKey/path). Cero hex hardcoded:
 * el color usa `style={{ background: hsl(...) }}` con el valor del propio token.
 */
import type { PairedRow } from './token-grouping';
import { toCssColor, isColorValue } from './token-grouping';
import { Button } from '@/design-system/primitives/button';
import { Badge } from '@/design-system/primitives/badge';
import { Card, CardContent } from '@/design-system/primitives/card';
import { Input } from '@/design-system/primitives/input';

interface PreviewProps {
  row: PairedRow;
  groupId: string;
}

export function TokenPreview({ row, groupId }: PreviewProps) {
  // Color: muestra in-place del color aplicado a primitives reales
  if (groupId === 'color') {
    return <ColorPreview row={row} />;
  }
  if (groupId === 'poi') return <PoiTokenPreview row={row} />;
  if (groupId === 'popup') return <PopupTokenPreview row={row} />;
  if (groupId === 'motion') return <MotionTokenPreview row={row} />;
  if (groupId === 'radius') return <RadiusTokenPreview row={row} />;
  if (groupId === 'density') return <DensityTokenPreview row={row} />;
  if (groupId === 'typography') return <TypographyTokenPreview row={row} />;
  if (groupId === 'z-index') return <ZIndexTokenPreview row={row} />;
  if (groupId === 'elevation') return <ElevationTokenPreview row={row} />;
  if (groupId === 'map') return <MapTokenPreview row={row} />;
  return null;
}

// ─── Color ─────────────────────────────────────────────────────────

function ColorPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'lightDark') return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <LiveColorExample
        token={row.light}
        fallback={String(row.light.value)}
        colorKey={row.glossaryKey}
        mode="light"
      />
      {row.dark && (
        <LiveColorExample
          token={row.dark}
          fallback={String(row.dark.value)}
          colorKey={row.glossaryKey}
          mode="dark"
        />
      )}
    </div>
  );
}

function LiveColorExample({
  token,
  fallback,
  colorKey,
  mode,
}: {
  token: import('./token-grouping').LeafToken;
  fallback: string;
  colorKey: string;
  mode: 'light' | 'dark';
}) {
  const path = token.path.join('.');
  const live = String(useResolvedTokenValue(path) ?? fallback);
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {mode === 'dark' ? 'Modo oscuro' : 'Modo claro'}
      </div>
      <EditableTokenSurface
        path={path}
        label={mode === 'dark' ? 'Modo oscuro' : 'Modo claro'}
        title="Editar color"
        className="block w-full"
      >
        <ColorExample colorKey={colorKey} cssColor={toCssColor(live)} mode={mode} />
      </EditableTokenSurface>
    </div>
  );
}

function ColorExample({
  colorKey,
  cssColor,
  mode,
}: {
  colorKey: string;
  cssColor: string;
  mode: 'light' | 'dark';
}) {
  const bgWrap = mode === 'dark' ? 'bg-foreground/90' : 'bg-background';
  const wrapClass = `p-3 rounded-token-md border border-border ${bgWrap}`;

  // Ejemplo según rol
  switch (colorKey) {
    case 'color.primary':
      return (
        <div className={wrapClass}>
          <button
            className="px-3 h-9 rounded-token-sm text-sm font-medium"
            style={{ background: cssColor, color: 'white' }}
          >
            Guardar
          </button>
        </div>
      );
    case 'color.destructive':
      return (
        <div className={wrapClass}>
          <button
            className="px-3 h-9 rounded-token-sm text-sm font-medium"
            style={{ background: cssColor, color: 'white' }}
          >
            Eliminar
          </button>
        </div>
      );
    case 'color.secondary':
      return (
        <div className={wrapClass}>
          <button
            className="px-3 h-9 rounded-token-sm text-sm font-medium"
            style={{ background: cssColor, color: 'white' }}
          >
            Acción
          </button>
        </div>
      );
    case 'color.muted':
      return (
        <div className={wrapClass}>
          <div className="space-y-1">
            <div className="h-6 rounded-token-sm" style={{ background: cssColor }} />
            <div className="h-6 rounded-token-sm" />
            <div className="h-6 rounded-token-sm" style={{ background: cssColor }} />
          </div>
        </div>
      );
    case 'color.card':
    case 'color.popover':
      return (
        <div className={wrapClass}>
          <div
            className="p-3 rounded-token-md border border-border shadow-sm"
            style={{ background: cssColor }}
          >
            <div className="text-sm font-medium" style={{ color: mode === 'dark' ? 'white' : 'black' }}>
              Título de tarjeta
            </div>
            <div className="text-xs opacity-70" style={{ color: mode === 'dark' ? 'white' : 'black' }}>
              Contenido de ejemplo.
            </div>
          </div>
        </div>
      );
    case 'color.border':
    case 'color.input':
      return (
        <div className={wrapClass}>
          <div
            className="p-3 rounded-token-md"
            style={{ background: 'transparent', border: `1px solid ${cssColor}` }}
          >
            <div className="text-xs">Contenedor con este borde</div>
          </div>
        </div>
      );
    case 'color.ring':
      return (
        <div className={wrapClass}>
          <button
            className="px-3 h-9 rounded-token-sm text-sm bg-muted"
            style={{ boxShadow: `0 0 0 2px ${cssColor}` }}
          >
            Foco activo
          </button>
        </div>
      );
    case 'color.foreground':
    case 'color.cardForeground':
    case 'color.popoverForeground':
      return (
        <div className={wrapClass}>
          <div className="text-base" style={{ color: cssColor }}>
            Texto de muestra (Aa Bb Cc 123)
          </div>
        </div>
      );
    case 'color.primaryForeground':
    case 'color.secondaryForeground':
    case 'color.destructiveForeground':
    case 'color.accentForeground':
    case 'color.mutedForeground':
      // Texto sobre el color hermano si lo conocemos
      return (
        <div className={wrapClass}>
          <div className="text-sm" style={{ color: cssColor }}>
            Texto encima de un fondo de color (preview neutro).
          </div>
        </div>
      );
    case 'color.background':
      return (
        <div className={wrapClass}>
          <div
            className="p-6 rounded-token-md border border-border"
            style={{ background: cssColor }}
          />
        </div>
      );
    default:
      return (
        <div className={wrapClass}>
          <div className="h-12 rounded-token-md" style={{ background: cssColor }} />
        </div>
      );
  }
}

// ─── POI ───────────────────────────────────────────────────────────

function PoiTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  const value = String(row.value);
  const key = row.glossaryKey;
  if (isColorValue(value)) {
    const css = toCssColor(value);
    if (key.startsWith('poi.state.')) {
      return (
        <div className="flex items-center gap-3">
          <Marker color={css} />
          <div className="text-xs text-muted-foreground">Marker en estado correspondiente.</div>
        </div>
      );
    }
    if (key.startsWith('poi.ring.')) {
      return (
        <div className="flex items-center gap-3">
          <Marker color="hsl(220 9% 65%)" ring={css} />
          <div className="text-xs text-muted-foreground">Halo apilado por fuera del marker.</div>
        </div>
      );
    }
    if (key.startsWith('poi.originBorder.')) {
      return (
        <div className="flex items-center gap-3">
          <Marker color="hsl(142 71% 45%)" border={css} />
          <div className="text-xs text-muted-foreground">Borde de origen.</div>
        </div>
      );
    }
    if (key.startsWith('poi.collectionTintSample.')) {
      return (
        <div className="flex items-center gap-3">
          <Marker color="hsl(142 71% 45%)" ring={css} />
          <div className="text-xs text-muted-foreground">Tinte de colección.</div>
        </div>
      );
    }
  }
  // Tamaños o ratios
  return <ScalarPreview value={value} />;
}

function Marker({
  color,
  ring,
  border,
}: {
  color: string;
  ring?: string;
  border?: string;
}) {
  return (
    <div className="relative" style={{ width: 40, height: 40 }}>
      {ring && (
        <div
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 0 5px ${ring}` }}
        />
      )}
      <div
        className="absolute rounded-full"
        style={{
          inset: 6,
          background: color,
          border: border ? `2px solid ${border}` : '2px solid white',
        }}
      />
    </div>
  );
}

// ─── Popup ─────────────────────────────────────────────────────────

function PopupTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  const value = String(row.value);
  const key = row.glossaryKey;
  if (key === 'popup.maxWidth' || key === 'popup.minWidth') {
    return (
      <div className="bg-muted/40 p-2 rounded-token-sm">
        <div
          className="bg-card border border-border rounded-token-md p-2 text-xs"
          style={{ width: value }}
        >
          Ficha con ancho {value}
        </div>
      </div>
    );
  }
  if (key === 'popup.hero.ratio') {
    return (
      <div
        className="bg-muted rounded-token-md w-48"
        style={{ aspectRatio: value }}
      />
    );
  }
  return <ScalarPreview value={value} />;
}

// ─── Motion ────────────────────────────────────────────────────────

function MotionTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  const value = String(row.value);
  const key = row.glossaryKey;

  if (key.startsWith('motion.duration.')) {
    return (
      <div className="bg-muted/40 p-3 rounded-token-sm">
        <div
          className="h-3 w-3 rounded-full bg-primary"
          style={{
            animation: `ds-token-move ${value} linear infinite alternate`,
          }}
        />
        <style>
          {`@keyframes ds-token-move { from { transform: translateX(0) } to { transform: translateX(80px) } }`}
        </style>
      </div>
    );
  }
  if (key.startsWith('motion.easing.')) {
    return (
      <div className="bg-muted/40 p-3 rounded-token-sm">
        <div
          className="h-3 w-3 rounded-full bg-primary"
          style={{
            animation: `ds-token-easing 1.4s ${value} infinite alternate`,
          }}
        />
        <style>
          {`@keyframes ds-token-easing { from { transform: translateX(0) } to { transform: translateX(120px) } }`}
        </style>
      </div>
    );
  }
  return <ScalarPreview value={value} />;
}

// ─── Radius ────────────────────────────────────────────────────────

function RadiusTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  return (
    <div
      className="bg-primary/80 w-16 h-16"
      style={{ borderRadius: String(row.value) }}
    />
  );
}

// ─── Density ───────────────────────────────────────────────────────

function DensityTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  const value = String(row.value);
  if (row.glossaryKey.startsWith('density.controlHeight.')) {
    return (
      <button
        className="px-4 bg-primary text-primary-foreground rounded-token-sm text-sm"
        style={{ height: value }}
      >
        Botón {value}
      </button>
    );
  }
  if (row.glossaryKey.startsWith('density.iconSize.')) {
    return (
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary" style={{ width: value, height: value }} />
        <span className="text-xs text-muted-foreground">{value}</span>
      </div>
    );
  }
  return <ScalarPreview value={value} />;
}

// ─── Typography ────────────────────────────────────────────────────

function TypographyTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  const value = String(row.value);
  const key = row.glossaryKey;

  if (key.startsWith('typography.fontFamily.')) {
    return (
      <div style={{ fontFamily: value }} className="text-base">
        El veloz murciélago hindú comía feliz cardillo y kiwi.
      </div>
    );
  }
  if (key.startsWith('typography.size.')) {
    return <div style={{ fontSize: value }}>Texto de muestra ({value})</div>;
  }
  if (key.startsWith('typography.lineHeight.')) {
    return (
      <div style={{ lineHeight: value }} className="max-w-md">
        Línea uno de ejemplo.<br />Línea dos para ver la altura ({value}).
      </div>
    );
  }
  if (key.startsWith('typography.weight.')) {
    return (
      <div style={{ fontWeight: value as React.CSSProperties['fontWeight'] }} className="text-base">
        Texto con peso {value}
      </div>
    );
  }
  return <ScalarPreview value={value} />;
}

// ─── Z-index ───────────────────────────────────────────────────────

function ZIndexTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  return (
    <div className="flex items-end gap-1 h-10">
      <div className="w-2 bg-muted rounded-token-sm" style={{ height: '20%' }} />
      <div className="w-2 bg-muted rounded-token-sm" style={{ height: '40%' }} />
      <div
        className="w-2 bg-primary rounded-token-sm"
        style={{ height: '100%' }}
        title={`z-index: ${row.value}`}
      />
      <div className="w-2 bg-muted rounded-token-sm" style={{ height: '60%' }} />
      <span className="text-xs text-muted-foreground ml-2">capa #{row.value}</span>
    </div>
  );
}

// ─── Elevation ─────────────────────────────────────────────────────

function ElevationTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  const value = String(row.value);
  if (row.glossaryKey.startsWith('elevation.shadow.')) {
    return (
      <div
        className="w-24 h-16 bg-card rounded-token-md border border-border"
        style={{ boxShadow: value }}
      />
    );
  }
  if (row.glossaryKey.startsWith('elevation.blur.')) {
    return (
      <div className="relative w-32 h-16 rounded-token-md overflow-hidden bg-primary/30">
        <div
          className="absolute inset-0"
          style={{ backdropFilter: `blur(${value})`, WebkitBackdropFilter: `blur(${value})` }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-xs text-foreground">
          blur {value}
        </div>
      </div>
    );
  }
  return <ScalarPreview value={value} />;
}

// ─── Map ───────────────────────────────────────────────────────────

function MapTokenPreview({ row }: { row: PairedRow }) {
  if (row.kind !== 'single') return null;
  const value = String(row.value);
  if (row.glossaryKey.startsWith('map.zoom.')) {
    return <div className="text-xs text-muted-foreground">Zoom Leaflet ≈ {value}</div>;
  }
  if (row.glossaryKey.startsWith('map.pane.')) {
    return <div className="text-xs text-muted-foreground">Leaflet pane z-index = {value}</div>;
  }
  if (isColorValue(value)) {
    return (
      <div
        className="h-8 w-24 rounded-token-sm border border-border"
        style={{ background: toCssColor(value) }}
      />
    );
  }
  return <ScalarPreview value={value} />;
}

// ─── Genérico ──────────────────────────────────────────────────────

function ScalarPreview({ value }: { value: string }) {
  return <code className="text-xs font-mono text-muted-foreground">{value}</code>;
}
