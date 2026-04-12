import React, { useState, useMemo, lazy, Suspense } from 'react';
import { Search, Maximize2 } from 'lucide-react';
import { icons, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ICON_CATALOG } from '@/lib/icon-utils';
import { cn } from '@/lib/utils';

// Convert PascalCase to kebab-case
function toKebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
}

// Build full icon list from lucide-react's icons object
const ALL_ICONS: { key: string; label: string; Component: LucideIcon }[] = Object.entries(icons).map(
  ([name, Component]) => ({
    key: toKebab(name),
    label: name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'),
    Component: Component as LucideIcon,
  })
);

// Labeled icons from our catalog get priority
const CATALOG_MAP = new Map(ICON_CATALOG.map(i => [i.key, i.label]));

interface IconPickerGridProps {
  selected: string;
  onSelect: (iconKey: string) => void;
}

function IconGrid({ search, selected, onSelect, large = false }: {
  search: string;
  selected: string;
  onSelect: (key: string) => void;
  large?: boolean;
}) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = ALL_ICONS;
    if (q) {
      list = list.filter(i =>
        i.label.toLowerCase().includes(q) || i.key.includes(q)
      );
    }
    // Sort: catalog items first, then alphabetical
    return list.sort((a, b) => {
      const aInCat = CATALOG_MAP.has(a.key) ? 0 : 1;
      const bInCat = CATALOG_MAP.has(b.key) ? 0 : 1;
      if (aInCat !== bInCat) return aInCat - bInCat;
      return a.label.localeCompare(b.label);
    });
  }, [search]);

  return (
    <div className={cn('grid gap-1', large ? 'grid-cols-8' : 'grid-cols-6')}>
      {filtered.slice(0, large ? 200 : 60).map(opt => {
        const Icon = opt.Component;
        const displayLabel = CATALOG_MAP.get(opt.key) || opt.label;
        return (
          <button
            key={opt.key}
            type="button"
            title={displayLabel}
            onClick={() => onSelect(opt.key)}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg border transition-all',
              large ? 'py-2 px-1' : 'py-1.5 px-1',
              selected === opt.key
                ? 'ring-2 ring-primary border-primary bg-primary/10'
                : 'border-border hover:bg-muted/50'
            )}
          >
            <Icon className={large ? 'w-5 h-5' : 'w-4 h-4'} />
            <span className={cn(
              'text-muted-foreground leading-tight truncate w-full text-center',
              large ? 'text-[9px]' : 'text-[8px]'
            )}>
              {displayLabel.length > 8 ? displayLabel.substring(0, 7) + '…' : displayLabel}
            </span>
          </button>
        );
      })}
      {filtered.length === 0 && (
        <p className="col-span-full text-xs text-muted-foreground text-center py-4">
          Sin resultados
        </p>
      )}
      {filtered.length > (large ? 200 : 60) && (
        <p className="col-span-full text-[10px] text-muted-foreground text-center py-1">
          {filtered.length - (large ? 200 : 60)} más — usa el buscador para filtrar
        </p>
      )}
    </div>
  );
}

export function IconPickerGrid({ selected, onSelect }: IconPickerGridProps) {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSearch, setDialogSearch] = useState('');

  const selectedEntry = ALL_ICONS.find(i => i.key === selected);
  const selectedLabel = CATALOG_MAP.get(selected) || selectedEntry?.label || selected;
  const SelectedIcon = selectedEntry?.Component;

  return (
    <div className="space-y-2">
      {/* Selected + gallery button */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary bg-primary/5 text-sm flex-1 min-w-0">
          {SelectedIcon && <SelectedIcon className="w-4 h-4 shrink-0" />}
          <span className="truncate text-xs">{selectedLabel}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1 shrink-0"
          onClick={() => { setDialogOpen(true); setDialogSearch(''); }}
        >
          <Maximize2 className="w-3 h-3" /> {ALL_ICONS.length} iconos
        </Button>
      </div>

      {/* Full gallery dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Seleccionar icono ({ALL_ICONS.length} disponibles)</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={dialogSearch}
              onChange={e => setDialogSearch(e.target.value)}
              placeholder="Buscar icono..."
              className="h-9 text-sm pl-9"
              autoFocus
            />
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <IconGrid
              search={dialogSearch}
              selected={selected}
              onSelect={(key) => { onSelect(key); setDialogOpen(false); }}
              large
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
