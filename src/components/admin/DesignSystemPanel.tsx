/**
 * DesignSystemPanel — Nivel 1 "DS Inspector" (read-only).
 *
 * Vista interna del catálogo del Design System:
 *   - Tokens  : valores fuente leídos de `src/design-system/tokens/source/*.json`.
 *   - Primitives : galería rápida de los primitives canónicos (Button, Badge, Input, Card, Switch, etc.).
 *   - Patterns : composiciones (Skeletons) y referencia a stories de Popup.
 *   - Memorias : índice de entradas `mem://` relacionadas con DS (informativo).
 *
 * No edita nada. Para experimentar con valores en sesión, se hará en Nivel 2.
 */
import { useMemo, useState } from 'react';
import {
  Palette, Type, Layers, Box, Sparkles, BookOpen, ExternalLink,
} from 'lucide-react';
import { Button } from '@/design-system/primitives/button';
import { Badge } from '@/design-system/primitives/badge';
import { Input } from '@/design-system/primitives/input';
import { Switch } from '@/design-system/primitives/switch';
import { Checkbox } from '@/design-system/primitives/checkbox';
import { Card, CardContent } from '@/design-system/primitives/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PoiCardSkeleton,
  PoiPopupSkeleton,
  PanelListSkeleton,
  HeroImageSkeleton,
  BadgeRowSkeleton,
} from '@/design-system/patterns/Skeletons';

import colorTokens from '@/design-system/tokens/source/color.json';
import typographyTokens from '@/design-system/tokens/source/typography.json';
import densityTokens from '@/design-system/tokens/source/density.json';
import motionTokens from '@/design-system/tokens/source/motion.json';
import radiusTokens from '@/design-system/tokens/source/radius.json';
import zindexTokens from '@/design-system/tokens/source/z-index.json';
import popupTokens from '@/design-system/tokens/source/popup.json';
import mapTokens from '@/design-system/tokens/source/map.json';
import poiTokens from '@/design-system/tokens/source/poi.json';
import elevationTokens from '@/design-system/tokens/source/elevation.json';

type Section = 'tokens' | 'primitives' | 'patterns' | 'memories';

interface TokenGroup {
  id: string;
  label: string;
  icon: typeof Palette;
  data: unknown;
}

const TOKEN_GROUPS: TokenGroup[] = [
  { id: 'color',      label: 'Color',      icon: Palette, data: colorTokens },
  { id: 'typography', label: 'Tipografía', icon: Type,    data: typographyTokens },
  { id: 'density',    label: 'Densidad',   icon: Box,     data: densityTokens },
  { id: 'motion',     label: 'Motion',     icon: Sparkles, data: motionTokens },
  { id: 'radius',     label: 'Radius',     icon: Box,     data: radiusTokens },
  { id: 'z-index',    label: 'Z-index',    icon: Layers,  data: zindexTokens },
  { id: 'popup',      label: 'Popup',      icon: Box,     data: popupTokens },
  { id: 'map',        label: 'Map',        icon: Layers,  data: mapTokens },
  { id: 'poi',        label: 'POI',        icon: Box,     data: poiTokens },
  { id: 'elevation',  label: 'Elevation',  icon: Layers,  data: elevationTokens },
];

const DS_MEMORIES: Array<{ id: string; label: string }> = [
  { id: 'style/tokens/design-system-v1',       label: 'Design system tokens v1' },
  { id: 'ui/shared-primitives',                label: 'Shared UI primitives (AppTooltip/Spinner/Skeleton/EmptyState)' },
  { id: 'style/tokens/color-codemod-phase-4',  label: 'Color codemod Phase 4' },
  { id: 'style/tokens/button-variants-v1',     label: 'Button variants v1' },
  { id: 'architecture/design-system-phase-1',  label: 'Phase 1 — tokens foundation' },
  { id: 'architecture/design-system-phase-2',  label: 'Phase 2 — map domain types' },
  { id: 'architecture/design-system-phase-3',  label: 'Phase 3 — primitives surface' },
  { id: 'architecture/design-system-phase-4a', label: 'Phase 4A — Map Lab (Storybook)' },
  { id: 'style/popup/matrix-rule',             label: 'Popup matrix rule' },
  { id: 'ui/skeleton-patterns',                label: 'Skeleton patterns' },
  { id: 'ui/panel-loading-pattern',            label: 'Panel loading pattern' },
  { id: 'ui/panel-system',                     label: 'Panel system (ADR 003)' },
  { id: 'ui/panel-body-children-rule',         label: 'Panel children rule' },
];

// --- Helpers --------------------------------------------------------------

/** Detecta si un nodo del JSON es una entrada de token (tiene `value`). */
function isLeafToken(node: unknown): node is { value: string; _css?: string } {
  return !!node && typeof node === 'object' && 'value' in (node as Record<string, unknown>);
}

interface LeafEntry {
  path: string[];
  value: string;
  cssVar?: string;
}

function walkTokens(data: unknown, path: string[] = []): LeafEntry[] {
  if (!data || typeof data !== 'object') return [];
  // Skip metadata keys
  const entries: LeafEntry[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k.startsWith('$')) continue;
    const nextPath = [...path, k];
    if (isLeafToken(v)) {
      entries.push({ path: nextPath, value: String(v.value), cssVar: v._css });
    } else if (v && typeof v === 'object') {
      entries.push(...walkTokens(v, nextPath));
    }
  }
  return entries;
}

function isHslTriplet(value: string): boolean {
  // HSL triplet without commas, e.g. "24 75% 50%"
  return /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(value.trim());
}

// --- Token previews -------------------------------------------------------

function TokenSwatch({ value, cssVar }: { value: string; cssVar?: string }) {
  const isHsl = isHslTriplet(value);
  const isHex = /^#[0-9a-f]{3,8}$/i.test(value);
  const isColor = isHsl || isHex;
  const style: React.CSSProperties = isHsl
    ? { background: `hsl(${value})` }
    : isHex
    ? { background: value }
    : {};
  if (isColor) {
    return (
      <div
        className="h-8 w-12 rounded-token-sm border border-border shrink-0"
        style={style}
        aria-label={cssVar ?? value}
      />
    );
  }
  // Duration (e.g. 200ms) → render mini progress bar that loops
  if (/\d+m?s$/.test(value.trim())) {
    return (
      <span className="text-xs font-mono text-muted-foreground">{value}</span>
    );
  }
  // Sizes (px/em/rem/%/vh)
  if (/^[\d.]+(px|rem|em|%|vh|vw)/.test(value.trim())) {
    return <span className="text-xs font-mono text-muted-foreground">{value}</span>;
  }
  return <span className="text-xs font-mono text-muted-foreground truncate">{value}</span>;
}

function TokenTable({ data }: { data: unknown }) {
  const rows = useMemo(() => walkTokens(data), [data]);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin tokens en este grupo.</p>;
  }
  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div
          key={row.path.join('.')}
          className="flex items-center gap-3 px-3 py-2 rounded-token-sm hover:bg-muted/40"
        >
          <TokenSwatch value={row.value} cssVar={row.cssVar} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {row.path.join(' · ')}
            </div>
            {row.cssVar && (
              <div className="text-xs font-mono text-muted-foreground truncate">
                {row.cssVar}
              </div>
            )}
          </div>
          <code className="text-xs font-mono text-muted-foreground shrink-0">
            {row.value}
          </code>
        </div>
      ))}
    </div>
  );
}

// --- Primitives gallery ---------------------------------------------------

function PrimitivesGallery() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Button — variants</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="cta">CTA</Button>
          <Button variant="toolbar">Toolbar</Button>
          <Button variant="filter-chip">Chip</Button>
          <Button variant="filter-chip-active">Chip activo</Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Button — sizes</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">xs</Button>
          <Button size="sm">sm</Button>
          <Button size="md">md</Button>
          <Button size="lg">lg</Button>
          <Button size="xl">xl</Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Badge</h3>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Inputs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <Input placeholder="Texto…" />
          <Input placeholder="Disabled" disabled />
          <div className="flex items-center gap-2">
            <Switch id="ds-sw" defaultChecked />
            <label htmlFor="ds-sw" className="text-sm">Switch</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ds-cb" defaultChecked />
            <label htmlFor="ds-cb" className="text-sm">Checkbox</label>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Card</h3>
        <Card className="max-w-md">
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-medium">Card · ejemplo</div>
            <p className="text-sm text-muted-foreground">
              Contenedor canónico. Usa <code className="font-mono">bg-card</code>{' '}
              y <code className="font-mono">text-card-foreground</code>.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// --- Patterns gallery -----------------------------------------------------

function PatternsGallery() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">PoiCardSkeleton</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <PoiCardSkeleton />
          <PoiCardSkeleton />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">PanelListSkeleton (rows=4)</h3>
        <div className="max-w-md">
          <PanelListSkeleton rows={4} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">HeroImageSkeleton</h3>
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <HeroImageSkeleton ratio="16/9" />
          <HeroImageSkeleton ratio="4/3" />
          <HeroImageSkeleton ratio="1/1" />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">BadgeRowSkeleton (count=5)</h3>
        <BadgeRowSkeleton count={5} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">PoiPopupSkeleton</h3>
        <div className="max-w-sm">
          <PoiPopupSkeleton />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Popup matrix &amp; Map domain</h3>
        <p className="text-sm text-muted-foreground">
          Las matrices completas (popup 5×3, POI por zoom, etc.) viven en Storybook.
          Ejecuta <code className="font-mono">npm run storybook</code> en local para inspeccionarlas.
        </p>
      </section>
    </div>
  );
}

// --- Memories list --------------------------------------------------------

function MemoriesList() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        Reglas vivas del Design System almacenadas como memoria del proyecto.
        Solo lectura — para editar, pídelo en chat.
      </p>
      {DS_MEMORIES.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-3 px-3 py-2 rounded-token-sm border border-border bg-muted/20"
        >
          <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{m.label}</div>
            <code className="text-xs font-mono text-muted-foreground truncate block">
              mem://{m.id}
            </code>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Main panel -----------------------------------------------------------

export function DesignSystemPanel() {
  const [section, setSection] = useState<Section>('tokens');
  const [tokenGroup, setTokenGroup] = useState<string>('color');
  const [query, setQuery] = useState('');

  const activeGroup = TOKEN_GROUPS.find((g) => g.id === tokenGroup) ?? TOKEN_GROUPS[0];

  const filteredGroup = useMemo(() => {
    if (!query.trim()) return activeGroup.data;
    // Filter leaves matching path or value
    const q = query.toLowerCase();
    function prune(node: unknown, path: string[] = []): unknown {
      if (!node || typeof node !== 'object') return undefined;
      if (isLeafToken(node)) {
        const hay = [...path, node.value, node._css ?? ''].join(' ').toLowerCase();
        return hay.includes(q) ? node : undefined;
      }
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k.startsWith('$')) continue;
        const pruned = prune(v, [...path, k]);
        if (pruned !== undefined) next[k] = pruned;
      }
      return Object.keys(next).length ? next : undefined;
    }
    return prune(activeGroup.data) ?? {};
  }, [activeGroup, query]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Section tabs */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b">
        {(
          [
            { id: 'tokens', label: 'Tokens', icon: Palette },
            { id: 'primitives', label: 'Primitives', icon: Box },
            { id: 'patterns', label: 'Patterns', icon: Layers },
            { id: 'memories', label: 'Memorias', icon: BookOpen },
          ] as const
        ).map((s) => (
          <Button
            key={s.id}
            variant={section === s.id ? 'filter-chip-active' : 'filter-chip'}
            size="sm"
            onClick={() => setSection(s.id as Section)}
          >
            <s.icon className="w-3.5 h-3.5 mr-1.5" />
            {s.label}
          </Button>
        ))}
        <div className="ml-auto text-xs text-muted-foreground">
          DS Inspector · Read-only
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {section === 'tokens' && (
          <>
            {/* Token group sidebar */}
            <div className="w-48 shrink-0 border-r overflow-y-auto py-2">
              {TOKEN_GROUPS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setTokenGroup(g.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors ${
                    tokenGroup === g.id ? 'bg-muted font-medium' : ''
                  }`}
                >
                  <g.icon className="w-4 h-4 text-muted-foreground" />
                  {g.label}
                </button>
              ))}
            </div>

            {/* Token list */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="p-3 border-b">
                <Input
                  placeholder="Buscar token…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-9"
                />
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3">
                  <TokenTable data={filteredGroup} />
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {section === 'primitives' && (
          <ScrollArea className="flex-1">
            <div className="p-4 pb-8">
              <PrimitivesGallery />
            </div>
          </ScrollArea>
        )}

        {section === 'patterns' && (
          <ScrollArea className="flex-1">
            <div className="p-4 pb-8">
              <PatternsGallery />
            </div>
          </ScrollArea>
        )}

        {section === 'memories' && (
          <ScrollArea className="flex-1">
            <div className="p-4 pb-8">
              <MemoriesList />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
