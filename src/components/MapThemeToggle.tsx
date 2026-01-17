import React from 'react';
import { Moon, Sun, Mountain, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type MapTheme = 'light' | 'dark' | 'terrain' | 'satellite';

interface MapThemeToggleProps {
  theme: MapTheme;
  onThemeChange: (theme: MapTheme) => void;
  className?: string;
}

export const MAP_TILE_LAYERS: Record<MapTheme, { url: string; attribution: string; name: string }> = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    name: 'Claro',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    name: 'Oscuro',
  },
  terrain: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    name: 'Relieve',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    name: 'Satélite',
  },
};

const THEME_ORDER: MapTheme[] = ['terrain', 'light', 'dark', 'satellite'];

const getIcon = (theme: MapTheme) => {
  switch (theme) {
    case 'terrain':
      return <Mountain className="w-4 h-4" />;
    case 'dark':
      return <Moon className="w-4 h-4" />;
    case 'satellite':
      return <Map className="w-4 h-4" />;
    default:
      return <Sun className="w-4 h-4" />;
  }
};

const getButtonStyles = (theme: MapTheme) => {
  switch (theme) {
    case 'dark':
      return 'bg-gray-800 hover:bg-gray-700 text-yellow-400';
    case 'terrain':
      return 'bg-emerald-600 hover:bg-emerald-700 text-white';
    case 'satellite':
      return 'bg-blue-600 hover:bg-blue-700 text-white';
    default:
      return '';
  }
};

export function MapThemeToggle({ theme, onThemeChange, className }: MapThemeToggleProps) {
  const cycleTheme = () => {
    const currentIndex = THEME_ORDER.indexOf(theme);
    const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
    onThemeChange(THEME_ORDER[nextIndex]);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          onClick={cycleTheme}
          className={cn(
            "w-9 h-9 rounded-full shadow-md",
            getButtonStyles(theme),
            className
          )}
        >
          {getIcon(theme)}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {MAP_TILE_LAYERS[theme].name} → Click para cambiar
      </TooltipContent>
    </Tooltip>
  );
}
