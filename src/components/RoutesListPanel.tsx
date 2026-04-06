import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
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
  Navigation,
  Globe,
  ChevronDown,
  ChevronUp,
  CalendarDays,
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

const ROAD_PREF_LABELS: Record<string, { icon: React.ElementType; label: string }> = {
  fastest: { icon: Navigation, label: 'Rápida' },
  scenic: { icon: Globe, label: 'Paisajística' },
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

/** A single route card (used for both parent and child routes) */
function RouteCard({
  route,
  isVisible,
  onToggleVisibility,
  onEdit,
  onDelete,
  isChild = false,
}: {
  route: Route;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isChild?: boolean;
}) {
  const ModeIcon = TRANSPORT_ICONS[route.transportMode] || Car;
  const modeColor = TRANSPORT_COLORS[route.transportMode] || '';
  const roadPref = ROAD_PREF_LABELS[route.roadPreference];
  const originWp = route.waypoints[0];
  const destWp = route.waypoints[route.waypoints.length - 1];

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isChild ? 'p-2 ml-3 border-l-2' : 'p-3'
      } ${
        isVisible
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-muted/30 hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0 flex-1">
          <h4 className={`font-medium truncate ${isChild ? 'text-xs' : 'text-sm'}`}>
            {isChild ? (route.description || route.name) : route.name}
          </h4>
        </div>
      </div>

      {originWp && destWp && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
          <span className="truncate">{originWp.name}</span>
          <span>→</span>
          <span className="truncate">{destWp.name}</span>
        </div>
      )}

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
        <ModeIcon className={`w-3.5 h-3.5 ${modeColor}`} />
        {roadPref && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {roadPref.label}
          </Badge>
        )}
      </div>

      {/* Dates */}
      {!isChild && (
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-2.5 h-2.5" />
            Creado: {format(new Date(route.createdAt), 'dd/MM/yyyy')}
          </span>
          {route.updatedAt !== route.createdAt && (
            <span>
              Mod: {format(new Date(route.updatedAt), 'dd/MM/yyyy')}
            </span>
          )}
        </div>
      )}

      <div className="flex gap-1.5">
        <Button
          variant={isVisible ? 'default' : 'secondary'}
          size="sm"
          className={`flex-1 ${isChild ? 'h-6 text-[10px]' : 'h-7 text-xs'}`}
          onClick={onToggleVisibility}
        >
          {isVisible ? (
            <><EyeOff className="w-3 h-3 mr-1" />Ocultar</>
          ) : (
            <><Eye className="w-3 h-3 mr-1" />Ver en mapa</>
          )}
        </Button>
        <Button variant="outline" size="sm" className={`${isChild ? 'h-6' : 'h-7'} text-xs`} onClick={onEdit}>
          <Pencil className="w-3 h-3" />
        </Button>
        {!isChild && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Parent route with expandable children */
function ParentRouteGroup({
  parent,
  children,
  visibleRouteIds,
  onToggleVisibility,
  onEditRoute,
  onDeleteRoute,
}: {
  parent: Route;
  children: Route[];
  visibleRouteIds: Set<string>;
  onToggleVisibility: (route: Route) => void;
  onEditRoute: (route: Route) => void;
  onDeleteRoute: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isParentVisible = visibleRouteIds.has(parent.id);
  const originWp = parent.waypoints[0];
  const destWp = parent.waypoints[parent.waypoints.length - 1];
  const roadPref = ROAD_PREF_LABELS[parent.roadPreference];

  const sortedChildren = useMemo(
    () => [...children].sort((a, b) => (a.segmentPosition ?? 0) - (b.segmentPosition ?? 0)),
    [children],
  );

  return (
    <div className={`rounded-lg border transition-colors ${
      isParentVisible ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'
    }`}>
      {/* Parent header */}
      <div className="p-3">
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{parent.name}</h4>
            {parent.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{parent.description}</p>
            )}
          </div>
        </div>

        {originWp && destWp && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
            <span className="truncate">{originWp.name}</span>
            <span>→</span>
            <span className="truncate">{destWp.name}</span>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
          {parent.totalDistance && (
            <span className="flex items-center gap-1">
              <RouteIcon className="w-3 h-3" />
              {formatDistance(parent.totalDistance)}
            </span>
          )}
          {parent.totalDuration && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(parent.totalDuration)}
            </span>
          )}
          {/* Show mode icons for children */}
          <div className="flex items-center gap-0.5">
            {sortedChildren.map((child, i) => {
              const Icon = TRANSPORT_ICONS[child.transportMode] || Car;
              const color = TRANSPORT_COLORS[child.transportMode] || '';
              return <Icon key={i} className={`w-3 h-3 ${color}`} />;
            })}
          </div>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {sortedChildren.length} tramos
          </Badge>
          {roadPref && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              {roadPref.label}
            </Badge>
          )}
        </div>

        {/* Dates */}
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-2.5 h-2.5" />
            Creado: {format(new Date(parent.createdAt), 'dd/MM/yyyy')}
          </span>
          {parent.updatedAt !== parent.createdAt && (
            <span>
              Mod: {format(new Date(parent.updatedAt), 'dd/MM/yyyy')}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          <Button
            variant={isParentVisible ? 'default' : 'secondary'}
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => onToggleVisibility(parent)}
          >
            {isParentVisible ? (
              <><EyeOff className="w-3 h-3 mr-1" />Ocultar</>
            ) : (
              <><Eye className="w-3 h-3 mr-1" />Ver en mapa</>
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onEditRoute(parent)}>
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => onDeleteRoute(parent.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Children toggle */}
      {sortedChildren.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground border-t border-border/50 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>{expanded ? 'Ocultar tramos' : `Ver ${sortedChildren.length} tramos`}</span>
          </button>

          {expanded && (
            <div className="px-2 pb-2 space-y-1.5">
              {sortedChildren.map(child => (
                <RouteCard
                  key={child.id}
                  route={child}
                  isChild
                  isVisible={visibleRouteIds.has(child.id)}
                  onToggleVisibility={() => onToggleVisibility(child)}
                  onEdit={() => onEditRoute(child)}
                  onDelete={() => {}}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RoutesListPanel({ onEditRoute, onCreateNew, visibleRouteIds, onToggleVisibility }: RoutesListPanelProps) {
  const { routes, loading, deleteRoute } = useRoutes();

  // Group: separate parent/standalone routes from children
  const { topLevel, childrenByParent } = useMemo(() => {
    const childrenMap = new Map<string, Route[]>();
    const childIds = new Set<string>();

    for (const r of routes) {
      if (r.parentRouteId) {
        childIds.add(r.id);
        const arr = childrenMap.get(r.parentRouteId) || [];
        arr.push(r);
        childrenMap.set(r.parentRouteId, arr);
      }
    }

    const top = routes.filter(r => !childIds.has(r.id));
    return { topLevel: top, childrenByParent: childrenMap };
  }, [routes]);

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

      {topLevel.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <RouteIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay itinerarios guardados</p>
          <p className="text-xs mt-1">Crea tu primer itinerario con origen y destino</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-2">
            {topLevel.map(route => {
              const children = childrenByParent.get(route.id);

              if (children && children.length > 0) {
                return (
                  <ParentRouteGroup
                    key={route.id}
                    parent={route}
                    children={children}
                    visibleRouteIds={visibleRouteIds}
                    onToggleVisibility={onToggleVisibility}
                    onEditRoute={onEditRoute}
                    onDeleteRoute={deleteRoute}
                  />
                );
              }

              return (
                <RouteCard
                  key={route.id}
                  route={route}
                  isVisible={visibleRouteIds.has(route.id)}
                  onToggleVisibility={() => onToggleVisibility(route)}
                  onEdit={() => onEditRoute(route)}
                  onDelete={() => deleteRoute(route.id)}
                />
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}