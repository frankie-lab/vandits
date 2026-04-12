import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { renderLineIcon, ICON_CATALOG } from '@/lib/icon-utils';
import { cn } from '@/lib/utils';

interface IconPickerGridProps {
  selected: string;
  onSelect: (iconKey: string) => void;
  columns?: number;
}

export function IconPickerGrid({ selected, onSelect, columns = 6 }: IconPickerGridProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return ICON_CATALOG;
    const q = search.toLowerCase();
    return ICON_CATALOG.filter(i => i.label.toLowerCase().includes(q) || i.key.includes(q));
  }, [search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar icono..."
          className="h-7 text-xs pl-7"
        />
      </div>
      <ScrollArea className="max-h-[200px]">
        <div className="grid grid-cols-6 gap-1">
          {filtered.map(opt => (
            <button
              key={opt.key}
              type="button"
              title={opt.label}
              onClick={() => onSelect(opt.key)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg border transition-all',
                selected === opt.key
                  ? 'ring-2 ring-primary border-primary bg-primary/10'
                  : 'border-border hover:bg-muted/50'
              )}
            >
              {renderLineIcon(opt.key, { className: 'w-4 h-4' })}
              <span className="text-[8px] text-muted-foreground leading-tight truncate w-full text-center">
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
      </ScrollArea>
    </div>
  );
}
