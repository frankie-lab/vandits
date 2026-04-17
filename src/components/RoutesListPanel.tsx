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
  Home,
  Target,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useRoutes, Route } from '@/domains/routes';
import { useAuth } from '@/domains/identity';
import { supabase } from '@/integrations/supabase/client';
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
  id: string; // stable DnD ID
  label: string;
  lat: number;
  lng: number;
  isOrigin: boolean;
  isDestination: boolean;
  isCatalog: boolean;
  waypointId?: string; // reference to parent waypoint for reordering
  nearbyParentWaypoints: RouteWaypointLike[];
  specialRole?: 'origin' | 'meta' | 'end'; // manually assigned role
}

interface TimelineSegment {
  kind: 'segment';
  id: string; // stable DnD ID = route.id
  route: Route;
  startLabel: string;
  endLabel: string;
}

type TimelineItem = TimelineNode | TimelineSegment;

/**
 * Build a unified timeline respecting stored positions (segment_position / waypoint position).
 * Falls back to geographic chaining only when all positions are 0/undefined.
 */
function buildUnifiedTimeline(
  children: Route[],
  parentWaypoints: RouteWaypointLike[],
): TimelineItem[] {
  if (children.length === 0) return [];

  // Sort children by segment_position (persisted order from DB)
  const hasPositions = children.some(c => (c.segmentPosition ?? 0) > 0);

  let ordered: Route[];
  if (hasPositions) {
    ordered = [...children].sort((a, b) => (a.segmentPosition ?? 0) - (b.segmentPosition ?? 0));
  } else {
    // Fallback: geographic greedy chaining
    const edges = children.map((r) => {
      const s = r.waypoints[0];
      const e = r.waypoints[r.waypoints.length - 1];
      return { route: r, startLat: s?.latitude ?? 0, startLng: s?.longitude ?? 0, endLat: e?.latitude ?? 0, endLng: e?.longitude ?? 0 };
    });
    const used = new Set<number>();
    const chain: typeof edges = [];
    let firstIdx = 0;
    if (parentWaypoints.length > 0) {
      const origin = parentWaypoints[0];
      let bestDelta = Infinity;
      for (let i = 0; i < edges.length; i++) {
        const d = coordDelta(edges[i].startLat, edges[i].startLng, origin.latitude, origin.longitude);
        if (d < bestDelta) { bestDelta = d; firstIdx = i; }
      }
    }
    used.add(firstIdx);
    chain.push(edges[firstIdx]);
    while (chain.length < edges.length) {
      const last = chain[chain.length - 1];
      let bestIdx = -1, bestDelta = Infinity;
      for (let i = 0; i < edges.length; i++) {
        if (used.has(i)) continue;
        const d = coordDelta(last.endLat, last.endLng, edges[i].startLat, edges[i].startLng);
        if (d < bestDelta) { bestDelta = d; bestIdx = i; }
      }
      if (bestIdx < 0) break;
      used.add(bestIdx);
      chain.push(edges[bestIdx]);
    }
    ordered = chain.map(e => e.route);
  }

  // Build timeline: interleave points and segments
  const timeline: TimelineItem[] = [];
  const usedParentWpIds = new Set<string>();
  let pointCounter = 0;

  for (let i = 0; i < ordered.length; i++) {
    const route = ordered[i];
    const s = route.waypoints[0];
    const e = route.waypoints[route.waypoints.length - 1];
    const startLat = s?.latitude ?? 0, startLng = s?.longitude ?? 0;
    const endLat = e?.latitude ?? 0, endLng = e?.longitude ?? 0;
    const startLabel = resolveLabel(startLat, startLng, undefined, parentWaypoints);
    const endLabel = resolveLabel(endLat, endLng, undefined, parentWaypoints);

    // Start point (only first segment)
    if (i === 0) {
      const nearbyStart = parentWaypoints.filter(pw => coordDelta(pw.latitude, pw.longitude, startLat, startLng) < COORD_MATCH_THRESHOLD);
      nearbyStart.forEach(pw => { if (pw.id) usedParentWpIds.add(pw.id); });
      const wpId = nearbyStart.find(pw => pw.id)?.id;
      timeline.push({
        kind: 'point', id: wpId || `point-${pointCounter++}`, label: startLabel,
        lat: startLat, lng: startLng, isOrigin: true, isDestination: false,
        isCatalog: nearbyStart.some(pw => !!pw.locationId), waypointId: wpId,
        nearbyParentWaypoints: nearbyStart,
      });
    }

    // Intermediate parent waypoints: assign to the segment whose internal path passes closest
    const intermediateWps = parentWaypoints.filter(pw => {
      if (!pw.id || usedParentWpIds.has(pw.id)) return false;
      const dStart = coordDelta(pw.latitude, pw.longitude, startLat, startLng);
      const dEnd = coordDelta(pw.latitude, pw.longitude, endLat, endLng);
      if (dStart < COORD_MATCH_THRESHOLD || dEnd < COORD_MATCH_THRESHOLD) return false;

      // Find which segment this waypoint is closest to (by checking all internal waypoints)
      let bestSegIdx = -1;
      let bestDist = Infinity;
      for (let si = 0; si < ordered.length; si++) {
        for (const rwp of ordered[si].waypoints) {
          const d = coordDelta(pw.latitude, pw.longitude, rwp.latitude, rwp.longitude);
          if (d < bestDist) { bestDist = d; bestSegIdx = si; }
        }
      }
      return bestSegIdx === i;
    });
    intermediateWps.sort((a, b) => coordDelta(a.latitude, a.longitude, startLat, startLng) - coordDelta(b.latitude, b.longitude, startLat, startLng));

    for (const wp of intermediateWps) {
      if (wp.id) usedParentWpIds.add(wp.id);
      timeline.push({
        kind: 'point', id: wp.id || `point-${pointCounter++}`,
        label: resolveLabel(wp.latitude, wp.longitude, wp.name, parentWaypoints),
        lat: wp.latitude, lng: wp.longitude, isOrigin: false, isDestination: false,
        isCatalog: !!wp.locationId, waypointId: wp.id, nearbyParentWaypoints: [wp],
      });
    }

    // Segment
    timeline.push({ kind: 'segment', id: route.id, route, startLabel, endLabel });

    // End point
    const isLast = i === ordered.length - 1;
    const nearbyEnd = parentWaypoints.filter(pw => coordDelta(pw.latitude, pw.longitude, endLat, endLng) < COORD_MATCH_THRESHOLD);
    nearbyEnd.forEach(pw => { if (pw.id) usedParentWpIds.add(pw.id); });
    const endWpId = nearbyEnd.find(pw => pw.id)?.id;
    timeline.push({
      kind: 'point', id: endWpId || `point-${pointCounter++}`, label: endLabel,
      lat: endLat, lng: endLng, isOrigin: false, isDestination: isLast,
      isCatalog: nearbyEnd.some(pw => !!pw.locationId), waypointId: endWpId,
      nearbyParentWaypoints: nearbyEnd,
    });
  }

  // Remaining unmatched parent waypoints
  for (const pw of parentWaypoints) {
    if (pw.id && usedParentWpIds.has(pw.id)) continue;
    const insertIdx = Math.max(0, timeline.length - 1);
    timeline.splice(insertIdx, 0, {
      kind: 'point', id: pw.id || `point-${pointCounter++}`,
      label: resolveLabel(pw.latitude, pw.longitude, pw.name, parentWaypoints),
      lat: pw.latitude, lng: pw.longitude, isOrigin: false, isDestination: false,
      isCatalog: !!pw.locationId, waypointId: pw.id, nearbyParentWaypoints: [pw],
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
  expanded,
  onToggleExpanded,
}: {
  parent: Route;
  children: Route[];
  visibleRouteIds: Set<string>;
  onToggleVisibility: (route: Route) => void;
  onEditRoute: (route: Route) => void;
  onDeleteRoute: (id: string) => void;
  onFocusRoute?: (route: Route) => void;
  onReorderSegments?: (parentId: string, orderedChildIds: string[]) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [segmentStatus, setSegmentStatus] = useState<Record<string, 'ok' | 'warning'>>({});
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [highlightedPointId, setHighlightedPointId] = useState<string | null>(null);
  const [specialRoles, setSpecialRoles] = useState<Record<string, 'origin' | 'meta' | 'end'>>({});
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pointRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isImported = !!parent.sourceDocumentId;
  const isParentVisible = visibleRouteIds.has(parent.id);
  const roadPref = ROAD_PREF_LABELS[parent.roadPreference];
  const { updateRoutePreferences, reorderParentWaypoints } = useRoutes();
  const [localTimeline, setLocalTimeline] = useState<TimelineItem[] | null>(null);

  // Load special roles from route_preferences
  useEffect(() => {
    const prefs = (parent as any).routePreferences || {};
    const roles: Record<string, 'origin' | 'meta' | 'end'> = {};
    if (prefs.originWaypointId) roles[prefs.originWaypointId] = 'origin';
    if (prefs.metaWaypointId) roles[prefs.metaWaypointId] = 'meta';
    if (prefs.endWaypointId) roles[prefs.endWaypointId] = 'end';
    setSpecialRoles(roles);
  }, [parent]);

  // Listen for map route selection events
  const childIds = useMemo(() => new Set(children.map(c => c.id)), [children]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { routeId } = (e as CustomEvent).detail || {};
      if (!routeId || !childIds.has(routeId)) return;
      if (!expanded) onToggleExpanded();
      setSelectedSegmentId(routeId);
      requestAnimationFrame(() => {
        segmentRefs.current[routeId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    };
    window.addEventListener('map-route-selected', handler);
    return () => window.removeEventListener('map-route-selected', handler);
  }, [childIds]);

  // Listen for map marker click → highlight in sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const { lat, lng } = (e as CustomEvent).detail || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      // Find the closest point in the timeline
      const points = timeline.filter(t => t.kind === 'point') as TimelineNode[];
      let bestId: string | null = null;
      let bestDelta = Infinity;
      for (const p of points) {
        const d = coordDelta(p.lat, p.lng, lat, lng);
        if (d < bestDelta) { bestDelta = d; bestId = p.id; }
      }
      if (bestId && bestDelta < COORD_MATCH_THRESHOLD) {
        setHighlightedPointId(bestId);
        if (!expanded) onToggleExpanded();
        requestAnimationFrame(() => {
          pointRefs.current[bestId!]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        // Clear highlight after 2s
        setTimeout(() => setHighlightedPointId(null), 2000);
      }
    };
    window.addEventListener('itinerary-map-point-clicked', handler);
    return () => window.removeEventListener('itinerary-map-point-clicked', handler);
  }, []);

  const orderedParentWaypoints = useMemo(
    () => [...parent.waypoints].sort((a, b) => a.position - b.position),
    [parent.waypoints],
  );

  const computedTimeline = useMemo(
    () => buildUnifiedTimeline(children, orderedParentWaypoints),
    [children, orderedParentWaypoints],
  );

  // Use local (optimistic) timeline if available, otherwise computed
  const timeline = localTimeline ?? computedTimeline;

  // Reset local timeline when computed timeline changes (data loaded from DB)
  useEffect(() => {
    setLocalTimeline(null);
  }, [computedTimeline]);

  const segmentCount = timeline.filter(t => t.kind === 'segment').length;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build sortable IDs for ALL timeline items
  const allItemIds = useMemo(() => timeline.map(t => t.id), [timeline]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = allItemIds.indexOf(active.id as string);
    const newIndex = allItemIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic: reorder locally first so UI doesn't collapse
    const reordered = arrayMove([...timeline], oldIndex, newIndex);
    setLocalTimeline(reordered);

    // Extract new orderings
    const newSegmentIds = reordered.filter(t => t.kind === 'segment').map(t => (t as TimelineSegment).route.id);
    const newPointIds = reordered.filter(t => t.kind === 'point' && (t as TimelineNode).waypointId).map(t => (t as TimelineNode).waypointId!);

    // Persist both orderings in background
    if (newSegmentIds.length > 0) {
      onReorderSegments?.(parent.id, newSegmentIds);
    }
    if (newPointIds.length > 0) {
      reorderParentWaypoints(parent.id, newPointIds);
    }
  }, [allItemIds, timeline, parent.id, onReorderSegments, reorderParentWaypoints]);

  const handleAssignRole = useCallback(async (pointId: string, role: 'origin' | 'meta' | 'end' | null) => {
    const newRoles = { ...specialRoles };
    // Clear any existing assignment for this role
    for (const [id, r] of Object.entries(newRoles)) {
      if (r === role) delete newRoles[id];
    }
    if (role) {
      newRoles[pointId] = role;
    } else {
      delete newRoles[pointId];
    }
    setSpecialRoles(newRoles);

    // Persist to route_preferences
    const prefs: Record<string, string | null> = {
      originWaypointId: null,
      metaWaypointId: null,
      endWaypointId: null,
    };
    for (const [id, r] of Object.entries(newRoles)) {
      if (r === 'origin') prefs.originWaypointId = id;
      if (r === 'meta') prefs.metaWaypointId = id;
      if (r === 'end') prefs.endWaypointId = id;
    }
    await updateRoutePreferences(parent.id, prefs);
  }, [specialRoles, parent.id, updateRoutePreferences]);

  const handlePointClick = useCallback((node: TimelineNode) => {
    setHighlightedPointId(node.id);
    // Emit event to fly map to this point and highlight
    window.dispatchEvent(new CustomEvent('itinerary-point-selected', {
      detail: { lat: node.lat, lng: node.lng, waypointId: node.waypointId }
    }));
    setTimeout(() => setHighlightedPointId(null), 2000);
  }, []);

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
              onToggleExpanded();
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
              <SortableContext items={allItemIds} strategy={verticalListSortingStrategy}>
              <div className="border-t border-border/40 px-2.5 pb-2.5 pt-2">
                <div className="relative pl-7">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[10px] top-0 bottom-0 w-px bg-border" />

                  {timeline.map((item, idx) => {
                  if (item.kind === 'point') {
                    const node = item as TimelineNode;
                    const role = specialRoles[node.id] || (node.isOrigin ? 'origin' : node.isDestination ? 'end' : undefined);
                    const isHighlighted = highlightedPointId === node.id;

                    return (
                      <SortableTimelineItem id={node.id} key={`point-${node.id}`}>
                      <div
                        ref={(el) => { pointRefs.current[node.id] = el; }}
                        className={`relative py-1 cursor-pointer rounded transition-all ${
                          isHighlighted ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-accent/30'
                        }`}
                        onClick={() => handlePointClick(node)}
                      >
                        <div className="absolute left-[-12px] z-10 bg-background">
                          {role === 'origin' ? (
                            <Home className="w-4 h-4 text-emerald-600" />
                          ) : role === 'meta' ? (
                            <Target className="w-4 h-4 text-amber-500" />
                          ) : role === 'end' ? (
                            <Flag className="w-4 h-4 text-red-500" />
                          ) : node.isCatalog ? (
                            <MapPin className="w-3.5 h-3.5 text-primary/70" />
                          ) : (
                            <CircleDot className="w-3.5 h-3.5 text-muted-foreground/70" />
                          )}
                        </div>
                        <div className="ml-1 min-w-0 flex items-center gap-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-semibold text-foreground truncate">
                                {node.label}
                              </span>
                              {node.isCatalog && (
                                <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-primary/40 text-primary">
                                  Catálogo
                                </Badge>
                              )}
                              {role === 'origin' && (
                                <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-emerald-500/40 text-emerald-600">
                                  Origen
                                </Badge>
                              )}
                              {role === 'meta' && (
                                <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-amber-500/40 text-amber-500">
                                  Meta
                                </Badge>
                              )}
                              {role === 'end' && (
                                <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 font-normal border-red-500/40 text-red-500">
                                  Fin
                                </Badge>
                              )}
                            </div>
                          </div>
                          {/* Context menu for role assignment — always available (roles are on parent, not GPS route) */}
                          {(
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 rounded-full shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <MoreVertical className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[140px]">
                                <DropdownMenuItem onClick={() => handleAssignRole(node.id, role === 'origin' ? null : 'origin')}>
                                  <Home className="w-3.5 h-3.5 mr-2 text-emerald-600" />
                                  {role === 'origin' ? 'Quitar Origen' : 'Marcar como Origen'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAssignRole(node.id, role === 'meta' ? null : 'meta')}>
                                  <Target className="w-3.5 h-3.5 mr-2 text-amber-500" />
                                  {role === 'meta' ? 'Quitar Meta' : 'Marcar como Meta'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAssignRole(node.id, role === 'end' ? null : 'end')}>
                                  <Flag className="w-3.5 h-3.5 mr-2 text-red-500" />
                                  {role === 'end' ? 'Quitar Fin' : 'Marcar como Fin'}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        {/* Show nearby catalog points */}
                        {node.nearbyParentWaypoints.length > 1 && (
                          <div className="ml-1 mt-0.5 space-y-0">
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
                      </SortableTimelineItem>
                    );
                  }

                  // Segment
                  const seg = item as TimelineSegment;
                  // Compute segment number from timeline order
                  const segNumber = timeline.slice(0, idx + 1).filter(t => t.kind === 'segment').length;
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
                          window.dispatchEvent(new CustomEvent('itinerary-segment-selected', {
                            detail: { routeId: seg.route.id, selected: selectedSegmentId !== seg.route.id }
                          }));
                        }}
                      >
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          {segNumber}
                        </span>
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
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());

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
                    onReorderSegments={handleReorderSegments}
                    expanded={expandedRoutes.has(route.id)}
                    onToggleExpanded={() => setExpandedRoutes(prev => {
                      const next = new Set(prev);
                      if (next.has(route.id)) next.delete(route.id);
                      else next.add(route.id);
                      return next;
                    })}
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
