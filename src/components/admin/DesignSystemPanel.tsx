/**
 * DesignSystemPanel — Nivel 1 "DS Inspector" (read-only).
 *
 * Tokens reorganizados en Esenciales / Dominio / Avanzado con filas humanas:
 * label + uso + preview en vivo. Light/Dark se emparejan. Valores idénticos
 * se deduplican en una fila "alias".
 */
import { useMemo, useState } from 'react';
import {
  Palette, Type, Layers, Box, Sparkles, BookOpen, ChevronDown, History, Pencil,
} from 'lucide-react';
import { HistoryTab } from './design-system/HistoryTab';
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';
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

import { buildRows, GROUP_SECTIONS, SECTION_LABEL, type GroupSection } from './design-system/token-grouping';
import { lookupGlossary } from './design-system/token-glossary';
import { TokenRow } from './design-system/TokenRow';

type Section = 'tokens' | 'primitives' | 'patterns' | 'memories';

const TOKEN_DATA: Record<string, unknown> = {
  color: colorTokens,
  typography: typographyTokens,
  density: densityTokens,
  motion: motionTokens,
  radius: radiusTokens,
  'z-index': zindexTokens,
  popup: popupTokens,
  map: mapTokens,
  poi: poiTokens,
  elevation: elevationTokens,
};

const DS_MEMORIES: Array<{ id: string; label: string }> = [
  { id: 'style/tokens/design-system-v1',       label: 'Design system tokens v1' },
  { id: 'ui/shared-primitives',                label: 'Shared UI primitives' },
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

// ─── Tokens section ────────────────────────────────────────────────

function TokensSection() {
  const [groupId, setGroupId] = useState<string>('color');
  const [query, setQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const rows = useMemo(() => {
    const data = TOKEN_DATA[groupId];
    if (!data) return [];
    return buildRows(data, { dedupe: groupId === 'color' });
  }, [groupId]);

  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => {
      const entry = lookupGlossary(r.glossaryKey);
      const labelHit = entry.label.toLowerCase().includes(q) || entry.usage.toLowerCase().includes(q);
      if (labelHit) return true;
      if (r.kind === 'single') {
        return r.tokens.some(
          (t) =>
            t.path.join('.').toLowerCase().includes(q) ||
            (t.cssVar ?? '').toLowerCase().includes(q) ||
            String(t.value).toLowerCase().includes(q),
        );
      }
      return (
        r.light.path.join('.').toLowerCase().includes(q) ||
        (r.light.cssVar ?? '').toLowerCase().includes(q) ||
        String(r.light.value).toLowerCase().includes(q) ||
        (r.dark ? String(r.dark.value).toLowerCase().includes(q) : false)
      );
    });
  }, [rows, query]);

  const groupsBySection: Record<GroupSection, typeof GROUP_SECTIONS> = {
    essentials: GROUP_SECTIONS.filter((g) => g.section === 'essentials'),
    domain: GROUP_SECTIONS.filter((g) => g.section === 'domain'),
    advanced: GROUP_SECTIONS.filter((g) => g.section === 'advanced'),
  };

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r overflow-y-auto py-2">
        <SidebarSection
          label={SECTION_LABEL.essentials}
          groups={groupsBySection.essentials}
          activeId={groupId}
          onSelect={setGroupId}
        />
        <SidebarSection
          label={SECTION_LABEL.domain}
          groups={groupsBySection.domain}
          activeId={groupId}
          onSelect={setGroupId}
        />
        <Collapsible
          label={SECTION_LABEL.advanced}
          open={advancedOpen}
          onToggle={() => setAdvancedOpen((v) => !v)}
        >
          <SidebarSection
            label=""
            groups={groupsBySection.advanced}
            activeId={groupId}
            onSelect={setGroupId}
          />
        </Collapsible>
      </div>

      {/* Token list */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="p-3 border-b">
          <Input
            placeholder="Buscar por nombre, uso o valor…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin tokens que coincidan con la búsqueda.
              </p>
            ) : (
              filteredRows.map((row, idx) => (
                <TokenRow
                  key={`${row.glossaryKey}-${idx}`}
                  row={row}
                  groupId={groupId}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function SidebarSection({
  label,
  groups,
  activeId,
  onSelect,
}: {
  label: string;
  groups: typeof GROUP_SECTIONS;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-2">
      {label && (
        <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      )}
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors ${
            activeId === g.id ? 'bg-muted font-medium' : ''
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && children}
    </div>
  );
}

// ─── Primitives gallery ───────────────────────────────────────────

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

// ─── Patterns gallery ─────────────────────────────────────────────

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

// ─── Memories list ────────────────────────────────────────────────

function MemoriesList() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        Reglas vivas del Design System. Solo lectura — pídelo en chat si hace falta editar.
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

// ─── Main panel ────────────────────────────────────────────────────

export function DesignSystemPanel() {
  const [section, setSection] = useState<Section>('tokens');

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

      {section === 'tokens' && <TokensSection />}

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
  );
}
