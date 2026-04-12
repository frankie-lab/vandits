import React, { useState, useMemo } from 'react';
import { Search, Maximize2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { renderLineIcon, ICON_CATALOG } from '@/lib/icon-utils';
import { cn } from '@/lib/utils';

interface IconPickerGridProps {
  selected: string;
  onSelect: (iconKey: string) => void;
}

function IconGrid({ search, selected, onSelect, cols = 'grid-cols-6', large = false }: {
  search: string;
  selected: string;
  onSelect: (key: string) => void;
  cols?: string;
  large?: boolean;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return ICON_CATALOG;
    const q = search.toLowerCase();
    return ICON_CATALOG.filter(i => i.label.toLowerCase().includes(q) || i.key.includes(q));
  }, [search]);

  return (
    <div className={cn('grid gap-1.5', cols)}>
      {filtered.map(opt => (
        <button
          key={opt.key}
          type="button"
          title={opt.label}
          onClick={() => onSelect(opt.key)}
          className={cn(
            'flex flex-col items-center gap-0.5 rounded-lg border transition-all',
            large ? 'py-2.5 px-1.5' : 'py-1.5 px-1',
            selected === opt.key
              ? 'ring-2 ring-primary border-primary bg-primary/10'
              : 'border-border hover:bg-muted/50'
          )}
        >
          {renderLineIcon(opt.key, { className: large ? 'w-5 h-5' : 'w-4 h-4' })}
          <span className={cn(
            'text-muted-foreground leading-tight truncate w-full text-center',
            large ? 'text-[10px]' : 'text-[8px]'
          )}>
            {opt.label}
          </span>
        </button>
      ))}
      {filtered.length === 0 && (
        <p className="col-span-full text-xs text-muted-foreground text-center py-4">
          Sin resultados
        </p>
      )}
    </div>
  );
}

export function IconPickerGrid({ selected, onSelect }: IconPickerGridProps) {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSearch, setDialogSearch] = useState('');

  const selectedLabel = ICON_CATALOG.find(i => i.key === selected)?.label || selected;

  return (
    <div className="space-y-2">
      {/* Compact: show selected + open full gallery */}
      <div className="flex items-center gap-2">
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary bg-primary/5 text-sm flex-1 min-w-0'
        )}>
          {renderLineIcon(selected, { className: 'w-4 h-4 shrink-0' })}
          <span className="truncate text-xs">{selectedLabel}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1 shrink-0"
          onClick={() => { setDialogOpen(true); setDialogSearch(''); }}
        >
          <Maximize2 className="w-3 h-3" /> Galería
        </Button>
      </div>

      {/* Inline compact grid with search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar icono..."
          className="h-7 text-xs pl-7"
        />
      </div>
      <ScrollArea className="max-h-[180px]">
        <IconGrid search={search} selected={selected} onSelect={onSelect} />
      </ScrollArea>

      {/* Full gallery dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Seleccionar icono</DialogTitle>
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
          <ScrollArea className="max-h-[50vh]">
            <IconGrid
              search={dialogSearch}
              selected={selected}
              onSelect={(key) => { onSelect(key); setDialogOpen(false); }}
              cols="grid-cols-7"
              large
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
