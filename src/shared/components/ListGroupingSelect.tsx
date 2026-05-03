/**
 * ListGroupingSelect — Compact "Agrupar por" selector.
 *
 * Used in headers of point lists (document tabs, catalog list, etc.).
 * Persists choice via useListGrouping hook (per-user, per-device).
 *
 * Strict rule (mem://style/visual-icon-standards): no emojis, Lucide icons.
 */
import { Layers } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useListGrouping } from '@/shared/preferences/use-list-grouping';
import {
  GROUPING_MODE_LABELS,
  type GroupingMode,
} from '@/shared/geography/hierarchy';
import { cn } from '@/lib/utils';

interface ListGroupingSelectProps {
  className?: string;
}

const MODES: GroupingMode[] = ['geography', 'category', 'status'];

export function ListGroupingSelect({ className }: ListGroupingSelectProps) {
  const [mode, setMode] = useListGrouping();
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
      <Select value={mode} onValueChange={(v) => setMode(v as GroupingMode)}>
        <SelectTrigger
          className="h-7 text-[11px] px-2 gap-1 border-muted-foreground/20 w-[130px]"
          aria-label="Agrupar por"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODES.map((m) => (
            <SelectItem key={m} value={m} className="text-xs">
              {GROUPING_MODE_LABELS[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
