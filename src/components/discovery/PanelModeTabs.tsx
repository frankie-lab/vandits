import React from 'react';
import { Compass, HeartPulse, CheckSquare } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type PanelMode = 'explore' | 'maintain' | 'select';

interface Props {
  value: PanelMode;
  onChange: (mode: PanelMode) => void;
  exploreActive?: boolean;
  maintainActive?: boolean;
  selectActive?: boolean;
}

const dot = (color: string) =>
  cn('inline-block w-1.5 h-1.5 rounded-full ml-1', color);

/**
 * PanelModeTabs (PR-4A)
 *
 * Single source of truth for panel intent: Explorar / Mantener / Seleccionar.
 * Filters describe the universe; CTAs execute actions — never mixed.
 */
export function PanelModeTabs({
  value,
  onChange,
  exploreActive,
  maintainActive,
  selectActive,
}: Props) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as PanelMode)} className="w-full">
      <TabsList className="grid w-full grid-cols-3 h-9">
        <TabsTrigger value="explore" className="text-xs gap-1">
          <Compass className="w-3.5 h-3.5" />
          Explorar
          {exploreActive && <span className={dot('bg-primary')} />}
        </TabsTrigger>
        <TabsTrigger value="maintain" className="text-xs gap-1">
          <HeartPulse className="w-3.5 h-3.5" />
          Mantener
          {maintainActive && <span className={dot('bg-pink-500')} />}
        </TabsTrigger>
        <TabsTrigger value="select" className="text-xs gap-1">
          <CheckSquare className="w-3.5 h-3.5" />
          Seleccionar
          {selectActive && <span className={dot('bg-emerald-500')} />}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
