import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
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
  CheckCircle2,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRoutes, Route } from '@/hooks/use-routes';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

  // Build timeline: interleave points and segments
  // For each segment, collect ALL parent waypoints that fall near the segment path
  const timeline: TimelineItem[] = [];
  const usedParentWpIds = new Set<string>();

  for (let i = 0; i < ordered.length; i++) {
    const edge = ordered[i];
    const startLabel = resolveLabel(edge.startLat, edge.startLng, undefined, parentWaypoints);
    const endLabel = resolveLabel(edge.endLat, edge.endLng, undefined, parentWaypoints);

    // Start point node (only for first segment)
    if (i === 0) {
      const nearbyStart = parentWaypoints.filter(
        (pw) => coordDelta(pw.latitude, pw.longitude, edge.startLat, edge.startLng) < COORD_MATCH_THRESHOLD,
      );
      nearbyStart.forEach(pw => { if (pw.id) usedParentWpIds.add(pw.id); });
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

    // Find intermediate parent waypoints along this segment (not at start/end)
    const intermediateWps = parentWaypoints.filter((pw) => {
      if (!pw.id || usedParentWpIds.has(pw.id)) return false;
      const dStart = coordDelta(pw.latitude, pw.longitude, edge.startLat, edge.startLng);
      const dEnd = coordDelta(pw.latitude, pw.longitude, edge.endLat, edge.endLng);
      if (dStart < COORD_MATCH_THRESHOLD || dEnd < COORD_MATCH_THRESHOLD) return false;
      // Check if point is roughly between start and end (within bounding box + margin)
      const minLat = Math.min(edge.startLat, edge.endLat) - COORD_MATCH_THRESHOLD;
      const maxLat = Math.max(edge.startLat, edge.endLat) + COORD_MATCH_THRESHOLD;
      const minLng = Math.min(edge.startLng, edge.endLng) - COORD_MATCH_THRESHOLD;
      const maxLng = Math.max(edge.startLng, edge.endLng) + COORD_MATCH_THRESHOLD;
      return pw.latitude >= minLat && pw.latitude <= maxLat && pw.longitude >= minLng && pw.longitude <= maxLng;
    });

    // Sort intermediates by distance from segment start
    intermediateWps.sort((a, b) => {
      const da = coordDelta(a.latitude, a.longitude, edge.startLat, edge.startLng);
      const db = coordDelta(b.latitude, b.longitude, edge.startLat, edge.startLng);
      return da - db;
    });

    // Add intermediate points before the segment card
    for (const wp of intermediateWps) {
      if (wp.id) usedParentWpIds.add(wp.id);
      const label = resolveLabel(wp.latitude, wp.longitude, wp.name, parentWaypoints);
      timeline.push({
        kind: 'point',
        label,
        lat: wp.latitude,
        lng: wp.longitude,
        isOrigin: false,
        isDestination: false,
        isCatalog: !!wp.locationId,
        nearbyParentWaypoints: [wp],
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
    nearbyEnd.forEach(pw => { if (pw.id) usedParentWpIds.add(pw.id); });
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

  // Add any remaining parent waypoints not matched to any segment
  for (const pw of parentWaypoints) {
    if (pw.id && usedParentWpIds.has(pw.id)) continue;
    const label = resolveLabel(pw.latitude, pw.longitude, pw.name, parentWaypoints);
    // Insert before the last item (destination) if possible
    const insertIdx = Math.max(0, timeline.length - 1);
    timeline.splice(insertIdx, 0, {
      kind: 'point',
      label,
      lat: pw.latitude,
      lng: pw.longitude,
      isOrigin: false,
      isDestination: false,
      isCatalog: !!pw.locationId,
      nearbyParentWaypoints: [pw],
    });
    if (pw.id) usedParentWpIds.add(pw.id);
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

/** Sortable timeline item wrapper */
function SortableTimelineItem({ id, children: content }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="relative">
      <div className="absolute left-[-28px] top-1/2 -translate-y-1/2 cursor-grab z-20" {...listeners}>
        <GripVertical className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground" />
      </div>
      {content}
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
  onReorderSegments,
}: {
  parent: Route;
  children: Route[];
  visibleRouteIds: Set<string>;
  onToggleVisibility: (route: Route) => void;
  onEditRoute: (route: Route) => void;
  onDeleteRoute: (id: string) => void;
  onFocusRoute?: (route: Route) => void;
  onReorderSegments?: (parentId: string, orderedChildIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [segmentStatus, setSegmentStatus] = useState<Record<string, 'ok' | 'warning'>>({});
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isImported = !!parent.sourceDocumentId;
  const isParentVisible = visibleRouteIds.has(parent.id);
  const roadPref = ROAD_PREF_LABELS[parent.roadPreference];

  // Listen for map route selection events
  const childIds = useMemo(() => new Set(children.map(c => c.id)), [children]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { routeId } = (e as CustomEvent).detail || {};
      if (!routeId || !childIds.has(routeId)) return;
      // Auto-expand and select this segment
      setExpanded(true);
      setSelectedSegmentId(routeId);
      // Scroll into view after render
      requestAnimationFrame(() => {
        segmentRefs.current[routeId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    };
    window.addEventListener('map-route-selected', handler);
    return () => window.removeEventListener('map-route-selected', handler);
  }, [childIds]);

  const orderedParentWaypoints = useMemo(
    () => [...parent.waypoints].sort((a, b) => a.position - b.position),
    [parent.waypoints],
  );

  const timeline = useMemo(
    () => buildUnifiedTimeline(children, orderedParentWaypoints),
    [children, orderedParentWaypoints],
  );

  const segmentCount = timeline.filter(t => t.kind === 'segment').length;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build sortable IDs for segments only
  const segmentIds = useMemo(() => 
    timeline.filter(t => t.kind === 'segment').map(t => (t as TimelineSegment).route.id),
    [timeline]
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = segmentIds.indexOf(active.id as string);
    const newIndex = segmentIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(segmentIds, oldIndex, newIndex);
    onReorderSegments?.(parent.id, reordered);
  }, [segmentIds, parent.id, onReorderSegments]);

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
            {children.map((child, index) => {
              const Icon = TRANSPORT_ICONS[child.transportMode] || Car;
              const color = TRANSPORT_COLORS[child.transportMode] || '';
              return <Icon key={`${child.id}-${index}`} className={`w-3 h-3 ${color}`} />;
            })}
          </div>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-normal">
            {segmentCount} tramos
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

      {timeline.length > 0 && (
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
            <span>{expanded ? 'Ocultar itinerario' : `Ver itinerario completo`}</span>
          </button>

          {expanded && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={segmentIds} strategy={verticalListSortingStrategy}>
              <div className="border-t border-border/40 px-2.5 pb-2.5 pt-2">
                <div className="relative pl-7">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[10px] top-0 bottom-0 w-px bg-border" />

                  {timeline.map((item, idx) => {
                  if (item.kind === 'point') {
                    const node = item as TimelineNode;
                    return (
                      <div key={`point-${idx}-${node.lat}-${node.lng}`} className="relative py-1">
                        <div className="absolute left-[-12px] z-10 bg-background">
                          {node.isOrigin ? (
                            <MapPin className="w-4 h-4 text-emerald-600" />
                          ) : node.isDestination ? (
                            <Flag className="w-4 h-4 text-red-500" />
                          ) : (
                            <CircleDot className="w-3.5 h-3.5 text-primary/70" />
                          )}
                        </div>
                        <div className="ml-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold text-foreground truncate">
                              {node.label}
                            </span>
                            {node.isCatalog && (
                              <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-primary/40 text-primary">
                                Catálogo
                              </Badge>
                            )}
                            {node.isOrigin && (
                              <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-emerald-500/40 text-emerald-600">
                                Origen
                              </Badge>
                            )}
                            {node.isDestination && (
                              <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-red-500/40 text-red-500">
                                Destino
                              </Badge>
                            )}
                          </div>
                          {/* Show nearby catalog points that are different from the node label */}
                          {node.nearbyParentWaypoints.length > 1 && (
                            <div className="mt-0.5 space-y-0">
                              {node.nearbyParentWaypoints
                                .filter(pw => pw.name !== node.label && !isGenericWaypointName(pw.name))
                                .map((pw, j) => (
                                  <p key={j} className="text-[9px] text-muted-foreground flex items-center gap-1">
                                    <CircleDot className="w-2.5 h-2.5 text-primary/50 shrink-0" />
                                    {pw.name}
                                    {pw.locationId && (
                                      <Badge variant="outline" className="text-[6px] px-0.5 py-0 h-3 font-normal">
                                        Catálogo
                                      </Badge>
                                    )}
                                  </p>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Segment
                  const seg = item as TimelineSegment;
                  const ModeIcon = TRANSPORT_ICONS[seg.route.transportMode] || Car;
                  const modeColor = TRANSPORT_COLORS[seg.route.transportMode] || '';
                  const isVisible = visibleRouteIds.has(seg.route.id);

                  const segStatus = segmentStatus[seg.route.id];
                  const isSelected = selectedSegmentId === seg.route.id;

                  return (
                    <SortableTimelineItem id={seg.route.id} key={`seg-${seg.route.id}`}>
                    <div
                      ref={(el) => { segmentRefs.current[seg.route.id] = el; }}
                      className="relative my-1 ml-1"
                    >
                      <div
                        className={`px-2 py-1.5 rounded-md border cursor-pointer flex items-center gap-1.5 transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                            : segStatus === 'warning'
                              ? 'border-amber-400/60 bg-amber-50/50'
                              : segStatus === 'ok'
                                ? 'border-emerald-400/60 bg-emerald-50/50'
                                : 'border-border/40 bg-muted/30 hover:bg-accent/40'
                        }`}
                        onClick={() => {
                          setSelectedSegmentId(prev => prev === seg.route.id ? null : seg.route.id);
                          if (onFocusRoute) onFocusRoute(seg.route);
                          // Emit event for map highlighting
                          window.dispatchEvent(new CustomEvent('itinerary-segment-selected', {
                            detail: { routeId: seg.route.id, selected: selectedSegmentId !== seg.route.id }
                          }));
                        }}
                      >
                        <ModeIcon className={`w-3.5 h-3.5 shrink-0 ${modeColor}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            {seg.route.totalDistance && (
                              <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 font-normal">
                                {formatDistance(seg.route.totalDistance)}
                              </Badge>
                            )}
                            {seg.route.totalDuration && (
                              <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 font-normal">
                                {formatDuration(seg.route.totalDuration)}
                              </Badge>
                            )}
                            {!!seg.route.sourceDocumentId && (
                              <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-amber-500/40 text-amber-600">
                                GPS
                              </Badge>
                            )}
                            {segStatus === 'warning' && (
                              <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-amber-500/40 text-amber-600">
                                ⚠️ Revisar
                              </Badge>
                            )}
                            {segStatus === 'ok' && (
                              <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-emerald-500/40 text-emerald-600">
                                ✓ OK
                              </Badge>
                            )}
                          </div>
                        </div>
                        {/* Validation toggle */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-5 w-5 p-0 rounded-full shrink-0 ${
                            segStatus === 'ok' ? 'text-emerald-600' : segStatus === 'warning' ? 'text-amber-500' : 'text-muted-foreground/40'
                          }`}
                          title={segStatus === 'ok' ? 'Marcado como correcto' : segStatus === 'warning' ? 'Marcado para revisión' : 'Validar tramo'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSegmentStatus(prev => {
                              const current = prev[seg.route.id];
                              const next = !current ? 'ok' : current === 'ok' ? 'warning' : undefined;
                              const copy = { ...prev };
                              if (next) copy[seg.route.id] = next;
                              else delete copy[seg.route.id];
                              return copy;
                            });
                          }}
                        >
                          {segStatus === 'ok' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : segStatus === 'warning' ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-5 w-5 p-0 rounded-full shrink-0 ${isVisible ? 'text-primary' : 'text-muted-foreground'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleVisibility(seg.route);
                          }}
                        >
                          {isVisible ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                        </Button>
                      </div>
                    </div>
                    </SortableTimelineItem>
                  );
                })}
                </div>
              </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}
    </div>
  );
}

export function RoutesListPanel({ onEditRoute, onCreateNew, visibleRouteIds, onToggleVisibility, onFocusRoute }: RoutesListPanelProps) {
  const { routes, loading, deleteRoute, reorderSegments } = useRoutes();

  const handleReorderSegments = useCallback(async (parentId: string, orderedChildIds: string[]) => {
    await reorderSegments(parentId, orderedChildIds);
  }, [reorderSegments]);

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
