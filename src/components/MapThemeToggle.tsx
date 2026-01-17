import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type MapTheme = 'light' | 'dark';

interface MapThemeToggleProps {
  theme: MapTheme;
  onToggle: () => void;
  className?: string;
}

export const MAP_TILE_LAYERS: Record<MapTheme, { url: string; attribution: string }> = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
};

export function MapThemeToggle({ theme, onToggle, className }: MapThemeToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          onClick={onToggle}
          className={cn(
            "w-9 h-9 rounded-full shadow-md",
            theme === 'dark' && "bg-gray-800 hover:bg-gray-700 text-yellow-400",
            className
          )}
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
      </TooltipContent>
    </Tooltip>
  );
}
