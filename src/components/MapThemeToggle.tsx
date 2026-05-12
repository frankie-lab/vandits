import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type MapTheme = 'light' | 'dark';

interface MapThemeToggleProps {
 theme: MapTheme;
 onThemeChange: (theme: MapTheme) => void;
 className?: string;
}

export const MAP_TILE_LAYERS: Record<MapTheme, { url: string; attribution: string; name: string; icon: React.ReactNode }> = {
 light: {
 url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
 attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
 name: 'Claro',
 icon: <Sun className="w-4 h-4" />,
 },
 dark: {
 url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
 attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
 name: 'Oscuro',
 icon: <Moon className="w-4 h-4" />,
 },
};

const getButtonStyles = (theme: MapTheme) => {
 switch (theme) {
 case 'dark':
 return 'bg-foreground hover:bg-foreground/90 text-amber-400';
 default:
 return '';
 }
};

export function MapThemeToggle({ theme, onThemeChange, className }: MapThemeToggleProps) {
  const nextTheme: MapTheme = theme === 'dark' ? 'light' : 'dark';

 return (
 <Button
  type="button"
 variant="secondary"
 size="icon"
  onClick={() => onThemeChange(nextTheme)}
  aria-label={`Cambiar mapa a ${MAP_TILE_LAYERS[nextTheme].name.toLowerCase()}`}
  title={`Cambiar mapa a ${MAP_TILE_LAYERS[nextTheme].name.toLowerCase()}`}
 className={cn(
 "w-9 h-9 rounded-full shadow-md",
 getButtonStyles(theme),
 className
 )}
 >
  {MAP_TILE_LAYERS[nextTheme].icon}
 </Button>
 );
}
