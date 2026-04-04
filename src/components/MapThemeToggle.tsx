import React from 'react';
import { Moon, Sun, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const THEME_ORDER: MapTheme[] = ['light', 'dark'];

const getButtonStyles = (theme: MapTheme) => {
 switch (theme) {
 case 'dark':
 return 'bg-gray-800 hover:bg-gray-700 text-yellow-400';
 default:
 return '';
 }
};

export function MapThemeToggle({ theme, onThemeChange, className }: MapThemeToggleProps) {
 return (
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="secondary"
 size="icon"
 className={cn(
 "w-9 h-9 rounded-full shadow-md",
 getButtonStyles(theme),
 className
 )}
 >
 <Layers className="w-4 h-4" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="min-w-[140px]">
 {THEME_ORDER.map((t) => (
 <DropdownMenuItem
 key={t}
 onClick={() => onThemeChange(t)}
 className={cn(
 "flex items-center gap-2 cursor-pointer",
 theme === t && "bg-accent"
 )}
 >
 {MAP_TILE_LAYERS[t].icon}
 <span>{MAP_TILE_LAYERS[t].name}</span>
 </DropdownMenuItem>
 ))}
 </DropdownMenuContent>
 </DropdownMenu>
 );
}
