import React, { useMemo, useState } from 'react';
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
  Satellite,
  Lock,
  CircleDot,
  MapPin,
  Flag,
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

const GENERIC_WAYPOINT_RE = /(^|\b)(inicio|fin|start|end)(\b|$)/i;
const COORD_MATCH_THRESHOLD = 0.005; // ~500m

type RouteWaypointLike = Route['waypoints'][number];

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

function formatCoordinates(latitude?: number, longitude?: number): string {
  return `${latitude?.toFixed(4) ?? '?'}°, ${longitude?.toFixed(4) ?? '?'}°`;
}

function isGenericWaypointName(name?: string): boolean {
  return !name || GENERIC_WAYPOINT_RE.test(name);
}

function coordDelta(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.abs(lat1 - lat2) + Math.abs(lng1 - lng2);
}

function resolveLabel(
  lat: number,
  lng: number,
  fallbackName: string | undefined,
  parentWaypoints: RouteWaypointLike[],
): string {
  // Try to find a named parent waypoint near this coordinate
  let bestDelta = Number.POSITIVE_INFINITY;
  let bestName: string | undefined;
  for (const pw of parentWaypoints) {
    const d = coordDelta(lat, lng, pw.latitude, pw.longitude);
    if (d < bestDelta) {
      bestDelta = d;
      bestName = pw.name;
    }
  }
  if (bestDelta < COORD_MATCH_THRESHOLD && bestName && !isGenericWaypointName(bestName)) {
    return bestName;
  }
  if (fallbackName && !isGenericWaypointName(fallbackName)) return fallbackName;
  return formatCoordinates(lat, lng);
}

/** A node in the unified timeline */
interface TimelineNode {
  kind: 'point';
  label: string;
  lat: number;
  lng: number;
  isOrigin: boolean;
  isDestination: boolean;
  isCatalog: boolean;
  nearbyParentWaypoints: RouteWaypointLike[];
}

interface TimelineSegment {
  kind: 'segment';
  route: Route;
  startLabel: string;
  endLabel: string;
}

type TimelineItem = TimelineNode | TimelineSegment;

/**
 * Build a unified timeline by chaining child routes geographically:
 * The end of one segment → start of the next.
 * Parent waypoints (catalog points) near each junction are attached to that node.
 */
function buildUnifiedTimeline(
  children: Route[],
  parentWaypoints: RouteWaypointLike[],
): TimelineItem[] {
  if (children.length === 0) return [];

  // Each child has start/end waypoints
  interface ChildEdge {
    route: Route;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
  }

  const edges: ChildEdge[] = children.map((r) => {
    const s = r.waypoints[0];
    const e = r.waypoints[r.waypoints.length - 1];
    return {
      route: r,
      startLat: s?.latitude ?? 0,
      startLng: s?.longitude ?? 0,
      endLat: e?.latitude ?? 0,
      endLng: e?.longitude ?? 0,
    };
  });

  // Chain segments: pick the first one, then greedily find the next whose start is closest to the current end
  const used = new Set<number>();
  const ordered: ChildEdge[] = [];

  // Start with segment whose start is closest to the first parent waypoint (origin), or just first
  let firstIdx = 0;
  if (parentWaypoints.length > 0) {
    const origin = parentWaypoints[0];
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < edges.length; i++) {
      const d = coordDelta(edges[i].startLat, edges[i].startLng, origin.latitude, origin.longitude);
      if (d < bestDelta) {
        bestDelta = d;
        firstIdx = i;
      }
    }
  }

  used.add(firstIdx);
  ordered.push(edges[firstIdx]);

  while (ordered.length < edges.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = -1;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let i = 0; i < edges.length; i++) {
      if (used.has(i)) continue;
      const d = coordDelta(last.endLat, last.endLng, edges[i].startLat, edges[i].startLng);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    used.add(bestIdx);
    ordered.push(edges[bestIdx]);
  }

  // Collect all junction coordinates (unique start/end nodes)
  interface JunctionNode {
    lat: number;
    lng: number;
    nearbyParentWps: RouteWaypointLike[];
  }

  const junctions: JunctionNode[] = [];
  const addJunction = (lat: number, lng: number) => {
    // Deduplicate by proximity
    for (const j of junctions) {
      if (coordDelta(j.lat, j.lng, lat, lng) < COORD_MATCH_THRESHOLD) return;
    }
    // Find nearby parent waypoints
    const nearby = parentWaypoints.filter(
      (pw) => coordDelta(pw.latitude, pw.longitude, lat, lng) < COORD_MATCH_THRESHOLD,
    );
    junctions.push({ lat, lng, nearbyParentWps: nearby });
  };

  for (const edge of ordered) {
    addJunction(edge.startLat, edge.startLng);
    addJunction(edge.endLat, edge.endLng);
  }

  // Find parent waypoints NOT near any junction (standalone catalog points along the route)
  const assignedParentIds = new Set<string>();
  for (const j of junctions) {
    for (const pw of j.nearbyParentWps) {
      if (pw.id) assignedParentIds.add(pw.id);
    }
  }

  // Build timeline
  const timeline: TimelineItem[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const edge = ordered[i];
    const startLabel = resolveLabel(edge.startLat, edge.startLng, undefined, parentWaypoints);
    const endLabel = resolveLabel(edge.endLat, edge.endLng, undefined, parentWaypoints);

    // Start point node (only for first segment, or if gap from previous end)
    if (i === 0) {
      const nearbyStart = parentWaypoints.filter(
        (pw) => coordDelta(pw.latitude, pw.longitude, edge.startLat, edge.startLng) < COORD_MATCH_THRESHOLD,
      );
      timeline.push({
        kind: 'point',
        label: startLabel,
        lat: edge.startLat,
        lng: edge.startLng,
        isOrigin: true,
        isDestination: false,
        isCatalog: nearbyStart.some((pw) => !!pw.locationId),
        nearbyParentWaypoints: nearbyStart,
      });
    }

    // Segment
    timeline.push({
      kind: 'segment',
      route: edge.route,
      startLabel,
      endLabel,
    });

    // End point node
    const isLast = i === ordered.length - 1;
    const nearbyEnd = parentWaypoints.filter(
      (pw) => coordDelta(pw.latitude, pw.longitude, edge.endLat, edge.endLng) < COORD_MATCH_THRESHOLD,
    );
    timeline.push({
      kind: 'point',
      label: endLabel,
      lat: edge.endLat,
      lng: edge.endLng,
      isOrigin: false,
      isDestination: isLast,
      isCatalog: nearbyEnd.some((pw) => !!pw.locationId),
      nearbyParentWaypoints: nearbyEnd,
    });
  }

  return timeline;
}

interface RoutesListPanelProps {
  onEditRoute: (route: Route) => void;
  onCreateNew: () => void;
  visibleRouteIds: Set<string>;
  onToggleVisibility: (route: Route) => void;
  onFocusRoute?: (route: Route) => void;
}

function RouteCard({
  route,
  isVisible,
  onToggleVisibility,
  onEdit,
  onDelete,
  onFocus,
  isChild = false,
}: {
  route: Route;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFocus?: () => void;
  isChild?: boolean;
}) {
  const isImported = !!route.sourceDocumentId;
  const ModeIcon = TRANSPORT_ICONS[route.transportMode] || Car;
  const modeColor = TRANSPORT_COLORS[route.transportMode] || '';
  const roadPref = ROAD_PREF_LABELS[route.roadPreference];
  const orderedWaypoints = useMemo(
    () => [...route.waypoints].sort((a, b) => a.position - b.position),
    [route.waypoints],
  );
  const originWp = orderedWaypoints[0];
  const destWp = orderedWaypoints[orderedWaypoints.length - 1];
  const originLabel = originWp ? resolveLabel(originWp.latitude, originWp.longitude, originWp.name, orderedWaypoints) : '';
  const destLabel = destWp ? resolveLabel(destWp.latitude, destWp.longitude, destWp.name, orderedWaypoints) : '';

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        isChild ? 'px-2.5 py-2 ml-4 border-l-2' : 'px-3 py-2.5'
      } ${
        isVisible
          ? 'border-primary/30 bg-primary/5 shadow-sm'
          : 'border-border/60 bg-card hover:bg-accent/30 hover:border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onFocus || onEdit}>
          <h4 className={`font-bold truncate leading-tight ${isChild ? 'text-xs' : 'text-sm'}`}>
            {isChild ? (route.description || route.name) : route.name}
          </h4>
          {originWp && destWp && (
            <p className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">
              {originLabel} → {destLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={`${isChild ? 'h-5 w-5' : 'h-6 w-6'} p-0 rounded-full ${isVisible ? 'text-primary' : 'text-muted-foreground'}`}
            onClick={onToggleVisibility}
          >
            {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </Button>
          {!isImported && (
            <Button variant="ghost" size="sm" className={`${isChild ? 'h-5 w-5' : 'h-6 w-6'} p-0 rounded-full text-muted-foreground hover:text-foreground`} onClick={onEdit}>
              <Pencil className="w-3 h-3" />
            </Button>
          )}
          {isImported && (
            <span className={`${isChild ? 'h-5 w-5' : 'h-6 w-6'} flex items-center justify-center text-muted-foreground/50`} title="Ruta GPS importada (solo lectura)">
              <Lock className="w-3 h-3" />
            </span>
          )}
          {!isChild && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {isImported && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal gap-0.5 border-amber-500/40 text-amber-600">
            <Satellite className="w-2.5 h-2.5" />
            GPS
          </Badge>
        )}
        {route.totalDistance && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal gap-0.5">
            <RouteIcon className="w-2.5 h-2.5" />
            {formatDistance(route.totalDistance)}
          </Badge>
        )}
        {route.totalDuration && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {formatDuration(route.totalDuration)}
          </Badge>
        )}
        <ModeIcon className={`w-3.5 h-3.5 ${modeColor}`} />
        {roadPref && (
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-normal">
            {roadPref.label}
          </Badge>
        )}
      </div>

      {!isChild && (
        <div className="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground/70">
          <span className="flex items-center gap-0.5">
            <CalendarDays className="w-2.5 h-2.5" />
            {format(new Date(route.createdAt), 'dd/MM/yy')}
          </span>
          {route.updatedAt !== route.createdAt && (
            <span className="flex items-center gap-0.5">
              <Pencil className="w-2 h-2" />
              {format(new Date(route.updatedAt), 'dd/MM/yy')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ParentRouteGroup({
  parent,
  children,
  visibleRouteIds,
  onToggleVisibility,
  onEditRoute,
  onDeleteRoute,
  onFocusRoute,
}: {
  parent: Route;
  children: Route[];
  visibleRouteIds: Set<string>;
  onToggleVisibility: (route: Route) => void;
  onEditRoute: (route: Route) => void;
  onDeleteRoute: (id: string) => void;
  onFocusRoute?: (route: Route) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isImported = !!parent.sourceDocumentId;
  const isParentVisible = visibleRouteIds.has(parent.id);
  const roadPref = ROAD_PREF_LABELS[parent.roadPreference];

  const orderedParentWaypoints = useMemo(
    () => [...parent.waypoints].sort((a, b) => a.position - b.position),
    [parent.waypoints],
  );

  const timeline = useMemo(
    () => buildUnifiedTimeline(children, orderedParentWaypoints),
    [children, orderedParentWaypoints],
  );

  const segmentCount = timeline.filter(t => t.kind === 'segment').length;

  const originWp = orderedParentWaypoints[0];
  const destWp = orderedParentWaypoints[orderedParentWaypoints.length - 1];
  const originLabel = originWp ? resolveLabel(originWp.latitude, originWp.longitude, originWp.name, orderedParentWaypoints) : '';
  const destLabel = destWp ? resolveLabel(destWp.latitude, destWp.longitude, destWp.name, orderedParentWaypoints) : '';

  return (
    <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${
      isParentVisible ? 'border-primary/30 bg-primary/5 shadow-sm' : 'border-border/60 bg-card hover:border-border'
    }`}>
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onFocusRoute ? onFocusRoute(parent) : (!isImported && onEditRoute(parent))}>
            <h4 className="font-bold text-sm truncate leading-tight">{parent.name}</h4>
            {originWp && destWp && (
              <p className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">
                {originLabel} → {destLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 w-6 p-0 rounded-full ${isParentVisible ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => onToggleVisibility(parent)}
            >
              {isParentVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
            {!isImported ? (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-foreground" onClick={() => onEditRoute(parent)}>
                <Pencil className="w-3 h-3" />
              </Button>
            ) : (
              <span className="h-6 w-6 flex items-center justify-center text-muted-foreground/50" title="Ruta GPS importada (solo lectura)">
                <Lock className="w-3 h-3" />
              </span>
            )}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-destructive" onClick={() => onDeleteRoute(parent.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {parent.totalDistance && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal gap-0.5">
              <RouteIcon className="w-2.5 h-2.5" />
              {formatDistance(parent.totalDistance)}
            </Badge>
          )}
          {parent.totalDuration && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {formatDuration(parent.totalDuration)}
            </Badge>
          )}
          <div className="flex items-center gap-0.5">
            {childSummaries.map(({ route }, index) => {
              const Icon = TRANSPORT_ICONS[route.transportMode] || Car;
              const color = TRANSPORT_COLORS[route.transportMode] || '';
              return <Icon key={`${route.id}-${index}`} className={`w-3 h-3 ${color}`} />;
            })}
          </div>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-normal">
            {childSummaries.length} tramos
          </Badge>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-normal">
            {orderedParentWaypoints.length} puntos
          </Badge>
          {roadPref && (
            <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-normal">
              {roadPref.label}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground/70">
          <span className="flex items-center gap-0.5">
            <CalendarDays className="w-2.5 h-2.5" />
            {format(new Date(parent.createdAt), 'dd/MM/yy')}
          </span>
          {parent.updatedAt !== parent.createdAt && (
            <span className="flex items-center gap-0.5">
              <Pencil className="w-2 h-2" />
              {format(new Date(parent.updatedAt), 'dd/MM/yy')}
            </span>
          )}
        </div>
      </div>

      {childSummaries.length > 0 && (
        <>
          <button
            onClick={() => {
              const willExpand = !expanded;
              setExpanded(willExpand);
              if (willExpand && onFocusRoute) {
                onFocusRoute(parent);
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 border-t border-border/40 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>{expanded ? 'Ocultar detalle del itinerario' : `Ver ${childSummaries.length} tramos y ${orderedParentWaypoints.length} puntos`}</span>
          </button>

          {expanded && (
            <div className="border-t border-border/40 px-2.5 pb-2.5 pt-2 space-y-3">
              {orderedParentWaypoints.length > 0 && (
                <div className="space-y-1.5">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Puntos del itinerario
                  </p>
                  <div className="rounded-lg border border-border/40 bg-background/60 px-2 py-1.5">
                    {orderedParentWaypoints.map((waypoint, index) => {
                      const isStart = index === 0;
                      const isEnd = index === orderedParentWaypoints.length - 1;
                      const label = resolveWaypointLabel(waypoint, orderedParentWaypoints);
                      const pointKind = waypoint.locationId ? 'Catálogo' : 'Waypoint';

                      return (
                        <div key={`${waypoint.position}-${waypoint.latitude}-${waypoint.longitude}-${waypoint.name}`} className="relative pl-5 py-1.5">
                          {!isEnd && <div className="absolute left-[8px] top-5 bottom-0 w-px bg-border" />}
                          <div className="absolute left-0 top-2 z-10">
                            {isStart ? (
                              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                            ) : isEnd ? (
                              <Flag className="w-3.5 h-3.5 text-red-500" />
                            ) : (
                              <CircleDot className="w-3.5 h-3.5 text-primary/70" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <span className="text-[10px] font-medium text-foreground/80 truncate">
                                {label}
                              </span>
                              <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal">
                                {pointKind}
                              </Badge>
                              <span className="text-[9px] text-muted-foreground">#{index + 1}</span>
                            </div>
                            <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                              {formatCoordinates(waypoint.latitude, waypoint.longitude)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tramos de ruta
                </p>
                <div className="space-y-2">
                  {childSummaries.map(({ route, startLabel, endLabel }, index) => {
                    const ModeIcon = TRANSPORT_ICONS[route.transportMode] || Car;
                    const modeColor = TRANSPORT_COLORS[route.transportMode] || '';
                    const isVisible = visibleRouteIds.has(route.id);

                    return (
                      <div
                        key={route.id}
                        className="rounded-md border border-border/40 bg-muted/30 hover:bg-accent/40 transition-colors"
                      >
                        <div
                          className="flex items-start gap-2 px-2 py-1.5 cursor-pointer"
                          onClick={onFocusRoute ? () => onFocusRoute(route) : undefined}
                        >
                          <ModeIcon className={`w-3 h-3 shrink-0 mt-0.5 ${modeColor}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                              Tramo {index + 1}
                            </p>
                            <p className="text-[10px] font-medium text-foreground/80 truncate mt-0.5">
                              {startLabel} → {endLabel}
                            </p>
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              {route.totalDistance && (
                                <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 font-normal">
                                  {formatDistance(route.totalDistance)}
                                </Badge>
                              )}
                              {route.totalDuration && (
                                <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 font-normal">
                                  {formatDuration(route.totalDuration)}
                                </Badge>
                              )}
                              {!!route.sourceDocumentId && (
                                <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-amber-500/40 text-amber-600">
                                  GPS
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-5 w-5 p-0 rounded-full ${isVisible ? 'text-primary' : 'text-muted-foreground'}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleVisibility(route);
                            }}
                          >
                            {isVisible ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RoutesListPanel({ onEditRoute, onCreateNew, visibleRouteIds, onToggleVisibility, onFocusRoute }: RoutesListPanelProps) {
  const { routes, loading, deleteRoute } = useRoutes();

  const catalogRoutes = routes;

  const { topLevel, childrenByParent } = useMemo(() => {
    const childrenMap = new Map<string, Route[]>();
    const childIds = new Set<string>();

    for (const route of catalogRoutes) {
      if (route.parentRouteId) {
        childIds.add(route.id);
        const existing = childrenMap.get(route.parentRouteId) || [];
        existing.push(route);
        childrenMap.set(route.parentRouteId, existing);
      }
    }

    return {
      topLevel: catalogRoutes.filter((route) => !childIds.has(route.id)),
      childrenByParent: childrenMap,
    };
  }, [catalogRoutes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-3 gap-3">
      <Button size="sm" className="w-full shrink-0" onClick={onCreateNew}>
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
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-2 pr-1">
            {topLevel.map((route) => {
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
                    onFocusRoute={onFocusRoute}
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
                  onFocus={onFocusRoute ? () => onFocusRoute(route) : undefined}
                />
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
