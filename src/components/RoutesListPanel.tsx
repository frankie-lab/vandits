import React from 'react';
import {
 Route as RouteIcon,
 Trash2,
 Eye,
 EyeOff,
 Pencil,
 Footprints,
 Car,
 Plane,
 Ship,
 Clock,
 Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRoutes, Route } from '@/hooks/use-routes';

const TRANSPORT_ICONS: Record<string, React.ElementType> = {
 walking: Footprints,
 driving: Car,
 flight: Plane,
 ferry: Ship,
};

const TRANSPORT_COLORS: Record<string, string> = {
 walking: 'text-green-600',
 driving: 'text-blue-600',
 flight: 'text-purple-600',
 ferry: 'text-cyan-600',
};

function formatDuration(seconds: number): string {
 if (seconds < 60) return `${Math.round(seconds)}s`;
 if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
 const hours = Math.floor(seconds / 3600);
 const mins = Math.round((seconds % 3600) / 60);
 return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function formatDistance(meters: number): string {
 if (meters < 1000) return `${Math.round(meters)} m`;
 return `${(meters / 1000).toFixed(1)} km`;
}

interface RoutesListPanelProps {
 onEditRoute: (route: Route) => void;
 onCreateNew: () => void;
 visibleRouteIds: Set<string>;
 onToggleVisibility: (route: Route) => void;
}

export function RoutesListPanel({ onEditRoute, onCreateNew, visibleRouteIds, onToggleVisibility }: RoutesListPanelProps) {
 const { routes, loading, deleteRoute } = useRoutes();

 if (loading) {
 return (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
 </div>
 );
 }

 return (
 <div className="space-y-3 p-3">
 <Button size="sm" className="w-full" onClick={onCreateNew}>
 <RouteIcon className="w-4 h-4 mr-2" />
 Nuevo itinerario
 </Button>

 {routes.length === 0 ? (
 <div className="text-center py-8 text-muted-foreground">
 <RouteIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
 <p className="text-sm">No hay itinerarios guardados</p>
 <p className="text-xs mt-1">Crea tu primer itinerario conectando ubicaciones</p>
 </div>
 ) : (
 <ScrollArea className="max-h-[60vh]">
 <div className="space-y-2">
 {routes.map(route => {
 const uniqueModes = [...new Set(route.waypoints.map(wp => wp.transportMode))];
 const isVisible = visibleRouteIds.has(route.id);
 return (
 <div
 key={route.id}
 className={`p-3 rounded-lg border transition-colors ${
 isVisible
 ? 'border-primary/40 bg-primary/5'
 : 'border-border bg-muted/30 hover:bg-muted/50'
 }`}
 >
 <div className="flex items-start justify-between mb-2">
 <div className="min-w-0 flex-1">
 <h4 className="font-medium text-sm truncate">{route.name}</h4>
 {route.description && (
 <p className="text-xs text-muted-foreground truncate mt-0.5">{route.description}</p>
 )}
 </div>
 <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
 {route.waypoints.length} pts
 </Badge>
 </div>

 <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
 {route.totalDistance && (
 <span className="flex items-center gap-1">
 <RouteIcon className="w-3 h-3" />
 {formatDistance(route.totalDistance)}
 </span>
 )}
 {route.totalDuration && (
 <span className="flex items-center gap-1">
 <Clock className="w-3 h-3" />
 {formatDuration(route.totalDuration)}
 </span>
 )}
 <div className="flex items-center gap-0.5">
 {uniqueModes.map(mode => {
 const Icon = TRANSPORT_ICONS[mode] || Car;
 return <Icon key={mode} className={`w-3 h-3 ${TRANSPORT_COLORS[mode] || ''}`} />;
 })}
 </div>
 </div>

 <div className="flex gap-1.5">
 <Button
 variant={isVisible ? "default" : "secondary"}
 size="sm"
 className="flex-1 h-7 text-xs"
 onClick={() => onToggleVisibility(route)}
 >
 {isVisible ? (
 <>
 <EyeOff className="w-3 h-3 mr-1" />
 Ocultar
 </>
 ) : (
 <>
 <Eye className="w-3 h-3 mr-1" />
 Ver en mapa
 </>
 )}
 </Button>
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-xs"
 onClick={() => onEditRoute(route)}
 >
 <Pencil className="w-3 h-3" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs text-destructive hover:text-destructive"
 onClick={() => deleteRoute(route.id)}
 >
 <Trash2 className="w-3 h-3" />
 </Button>
 </div>
 </div>
 );
 })}
 </div>
 </ScrollArea>
 )}
 </div>
 );
}
