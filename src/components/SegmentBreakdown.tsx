import React, { useState } from 'react';
import { Car, Footprints, Plane, Ship, Clock, MapPin, ArrowRight, ExternalLink, Ticket, Navigation, Sparkles, Calendar, Route, Shuffle, ChevronDown, ChevronUp, AlertTriangle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface RouteSegment {
  transportMode: string;
  distance: number;
  duration: number;
  geometry?: any;
  originAirport?: { name: string; iata: string };
  destinationAirport?: { name: string; iata: string };
  originPort?: { name: string; lat: number; lng: number };
  destinationPort?: { name: string; lat: number; lng: number };
}

interface FlightLeg {
  origin: { iata: string | null; name: string | null; city: string | null };
  destination: { iata: string | null; name: string | null; city: string | null };
  departing_at?: string | null;
  arriving_at?: string | null;
  duration?: string | null;
  marketing_carrier?: { name: string | null; iata: string | null };
  flight_number?: string | null;
}

interface CandidateAirport {
  name: string;
  iata: string;
  latitude: number;
  longitude: number;
}

/** Describes a segment's endpoints for AI features */
export interface SegmentEndpoints {
  segmentIndex: number;
  from: { name: string; latitude: number; longitude: number };
  to: { name: string; latitude: number; longitude: number };
  distanceKm: number;
  durationHours: number;
  transportMode: string;
}

interface SegmentBreakdownProps {
  segments: RouteSegment[];
  totalDistance: number;
  totalDuration: number;
  originName?: string;
  destinationName?: string;
  originCoords?: { latitude: number; longitude: number };
  destinationCoords?: { latitude: number; longitude: number };
  resolvedFlightLegs?: FlightLeg[] | null;
  resolvedDestAirport?: CandidateAirport | null;
  /** Called when the user clicks an AI action on a specific segment */
  onSegmentAction?: (action: 'advisor' | 'planner' | 'stops' | 'optimize', endpoints: SegmentEndpoints) => void;
  /** Min hours to show planner action (default 4) */
  plannerMinHours?: number;
  /** Max hours to show planner action (default 48) */
  plannerMaxHours?: number;
  /** Min km to show stops/optimize actions (default 50) */
  stopsMinKm?: number;
  /** Max km to show stops/optimize actions (default 1000) */
  stopsMaxKm?: number;
  /** Index of the segment currently showing an inline AI panel */
  activeSegmentIndex?: number | null;
  /** Render function for the inline AI panel content */
  renderActivePanel?: () => React.ReactNode;
  /** Called when user clicks + between waypoints to add a waypoint at that position */
  onAddWaypoint?: (afterWaypointIndex: number) => void;
  /** Indices in the segments array where pair boundaries fall (last segment index of each pair except the last pair) */
  pairBoundaryIndices?: number[];
}

const MODE_CONFIG: Record<string, { icon: typeof Car; label: string; colorClass: string; bgClass: string; borderClass: string }> = {
  driving: { icon: Car, label: 'Coche', colorClass: 'text-blue-500', bgClass: 'bg-blue-50/50 dark:bg-blue-950/20', borderClass: 'border-blue-200 dark:border-blue-800' },
  walking: { icon: Footprints, label: 'A pie', colorClass: 'text-green-500', bgClass: 'bg-green-50/50 dark:bg-green-950/20', borderClass: 'border-green-200 dark:border-green-800' },
  flight: { icon: Plane, label: 'Vuelo', colorClass: 'text-purple-500', bgClass: 'bg-purple-50/50 dark:bg-purple-950/20', borderClass: 'border-purple-200 dark:border-purple-800' },
  ferry: { icon: Ship, label: 'Ferry', colorClass: 'text-cyan-500', bgClass: 'bg-cyan-50/50 dark:bg-cyan-950/20', borderClass: 'border-cyan-200 dark:border-cyan-800' },
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

function formatDurationISO(iso: string | null): string {
  if (!iso) return '';
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}h` : '';
  const m = match[2] ? `${match[2]}m` : '';
  return `${h} ${m}`.trim();
}

function getFerryBookingLinks(originPort?: string, destPort?: string) {
  const origin = encodeURIComponent(originPort || '');
  const dest = encodeURIComponent(destPort || '');
  return [
    { provider: 'Direct Ferries', url: `https://www.directferries.es/rutas-ferry.htm?origin=${origin}&destination=${dest}` },
    { provider: 'Ferryhopper', url: `https://www.ferryhopper.com/es/search?from=${origin}&to=${dest}` },
    { provider: 'AFerry', url: `https://www.aferry.es/results?from=${origin}&to=${dest}` },
  ];
}

/** Resolve coords for a segment endpoint based on its position and neighbors */
function resolveSegmentCoords(
  seg: RouteSegment,
  idx: number,
  segments: RouteSegment[],
  originCoords?: { latitude: number; longitude: number },
  destinationCoords?: { latitude: number; longitude: number },
): { fromCoords: { latitude: number; longitude: number } | null; toCoords: { latitude: number; longitude: number } | null } {
  let fromCoords: { latitude: number; longitude: number } | null = null;
  let toCoords: { latitude: number; longitude: number } | null = null;

  // From coords
  if (idx === 0 && originCoords) {
    fromCoords = originCoords;
  } else {
    const prev = segments[idx - 1];
    if (prev?.transportMode === 'ferry' && prev.destinationPort) {
      fromCoords = { latitude: prev.destinationPort.lat, longitude: prev.destinationPort.lng };
    } else if (prev?.transportMode === 'flight' && prev.destinationAirport) {
      // Try geometry last coord
      const geomCoords = prev.geometry?.coordinates;
      if (geomCoords?.length) {
        const last = geomCoords[geomCoords.length - 1];
        fromCoords = { latitude: last[1], longitude: last[0] };
      }
    } else if (seg.geometry?.coordinates?.length) {
      const first = seg.geometry.coordinates[0];
      fromCoords = { latitude: first[1], longitude: first[0] };
    }
  }

  // To coords
  if (idx === segments.length - 1 && destinationCoords) {
    toCoords = destinationCoords;
  } else {
    const next = segments[idx + 1];
    if (next?.transportMode === 'ferry' && next.originPort) {
      toCoords = { latitude: next.originPort.lat, longitude: next.originPort.lng };
    } else if (next?.transportMode === 'flight' && next.originAirport) {
      const geomCoords = next.geometry?.coordinates;
      if (geomCoords?.length) {
        const first = geomCoords[0];
        toCoords = { latitude: first[1], longitude: first[0] };
      }
    } else if (seg.geometry?.coordinates?.length) {
      const last = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
      toCoords = { latitude: last[1], longitude: last[0] };
    }
  }

  return { fromCoords, toCoords };
}

/** Per-segment action buttons for land segments */
function SegmentActions({
  segmentIndex,
  from,
  to,
  distanceKm,
  durationHours,
  transportMode,
  onAction,
  plannerMinHours = 4,
  plannerMaxHours = 48,
  stopsMinKm = 50,
  stopsMaxKm = 1000,
}: {
  segmentIndex: number;
  from: { name: string; latitude: number; longitude: number };
  to: { name: string; latitude: number; longitude: number };
  distanceKm: number;
  durationHours: number;
  transportMode: string;
  onAction: (action: 'advisor' | 'planner' | 'stops' | 'optimize', endpoints: SegmentEndpoints) => void;
  plannerMinHours?: number;
  plannerMaxHours?: number;
  stopsMinKm?: number;
  stopsMaxKm?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const endpoints: SegmentEndpoints = { segmentIndex, from, to, distanceKm, durationHours, transportMode };

  const exceedsMaxHours = (transportMode === 'driving' || transportMode === 'walking') && durationHours > (plannerMaxHours ?? 48);
  const showPlanner = durationHours >= (plannerMinHours ?? 4) && durationHours <= (plannerMaxHours ?? 48);
  const showStops = distanceKm >= (stopsMinKm ?? 50) && distanceKm <= (stopsMaxKm ?? 1000);

  return (
    <div className="pt-1 space-y-1">
      {exceedsMaxHours && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[10px]">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>
            Tramo de {Math.round(durationHours)}h — supera el máximo de {plannerMaxHours}h. 
            <button
              className="ml-1 underline font-medium hover:text-amber-900 dark:hover:text-amber-100"
              onClick={() => onAction('planner', endpoints)}
            >
              Dividir en jornadas
            </button>
          </span>
        </div>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="w-2.5 h-2.5" />
        <span>Acciones IA para este tramo</span>
        {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
      </button>

      {expanded && (
        <div className="flex flex-wrap gap-1 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-5 text-[9px] gap-1 px-1.5"
            onClick={() => onAction('advisor', endpoints)}
          >
            <Sparkles className="w-2.5 h-2.5" />
            Consejo IA
          </Button>

          {(showPlanner || exceedsMaxHours) && (
            <Button
              variant={exceedsMaxHours ? "default" : "outline"}
              size="sm"
              className={`h-5 text-[9px] gap-1 px-1.5 ${exceedsMaxHours ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
              onClick={() => onAction('planner', endpoints)}
            >
              <Calendar className="w-2.5 h-2.5" />
              {exceedsMaxHours ? 'Dividir en jornadas' : 'Jornadas'}
            </Button>
          )}

          {showStops && (
            <Button
              variant="outline"
              size="sm"
              className="h-5 text-[9px] gap-1 px-1.5"
              onClick={() => onAction('stops', endpoints)}
            >
              <MapPin className="w-2.5 h-2.5" />
              Paradas
            </Button>
          )}

          {showStops && (
            <Button
              variant="outline"
              size="sm"
              className="h-5 text-[9px] gap-1 px-1.5"
              onClick={() => onAction('optimize', endpoints)}
            >
              <Shuffle className="w-2.5 h-2.5" />
              Optimizar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function SegmentBreakdown({ segments, totalDistance, totalDuration, originName, destinationName, originCoords, destinationCoords, resolvedFlightLegs, resolvedDestAirport, onSegmentAction, plannerMinHours = 4, plannerMaxHours = 48, stopsMinKm = 50, stopsMaxKm = 1000, activeSegmentIndex, renderActivePanel, onAddWaypoint, pairBoundaryIndices }: SegmentBreakdownProps) {
  if (!segments?.length) return null;

  const isMultiModal = new Set(segments.map(s => s.transportMode)).size > 1;

  // Enrich labels
  const enrichedSegments = segments.map((seg, idx) => {
    const mode = seg.transportMode;
    let from = '';
    let to = '';
    const effectiveDestAirport = resolvedDestAirport
      ? { name: resolvedDestAirport.name, iata: resolvedDestAirport.iata }
      : seg.destinationAirport;

    if (mode === 'flight') {
      from = seg.originAirport?.name || 'Aeropuerto';
      to = effectiveDestAirport?.name || 'Aeropuerto';
    } else if (mode === 'ferry') {
      if (seg.originPort?.name && seg.destinationPort?.name) {
        from = seg.originPort.name;
        to = seg.destinationPort.name;
      } else {
        from = 'Cruce marítimo';
        to = '';
      }
    } else {
      // Driving/walking segments
      if (idx === 0) {
        from = originName || 'Origen';
      } else {
        const prev = segments[idx - 1];
        if (prev?.transportMode === 'flight') {
          const effAirport = resolvedDestAirport
            ? { name: resolvedDestAirport.name, iata: resolvedDestAirport.iata }
            : prev.destinationAirport;
          from = effAirport?.name || 'Aeropuerto';
        } else if (prev?.transportMode === 'ferry') {
          from = prev.destinationPort?.name || 'Puerto';
        } else {
          from = '—';
        }
      }

      if (idx === segments.length - 1) {
        to = destinationName || 'Destino';
        if (from && to && from.toLowerCase() === to.toLowerCase()) {
          to = destinationName || 'Destino';
          from = from;
        }
      } else {
        const next = segments[idx + 1];
        if (next?.transportMode === 'flight') {
          to = next.originAirport?.name || 'Aeropuerto';
        } else if (next?.transportMode === 'ferry') {
          to = next.originPort?.name || 'Puerto';
        } else {
          to = '—';
        }
      }
    }

    return { ...seg, from, to, effectiveDestAirport };
  });

  return (
    <div className="space-y-1">
      {/* Total summary */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-6 flex justify-center">
          <div className="w-0.5 h-4 bg-border" />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatDistance(totalDistance)} · {formatDuration(totalDuration)}
          {isMultiModal && (
            <span className="ml-1.5 text-primary font-medium">
              · {segments.length} tramos
            </span>
          )}
        </span>
      </div>

      {/* Per-segment breakdown */}
      {enrichedSegments.map((seg, idx) => {
        const config = MODE_CONFIG[seg.transportMode] || MODE_CONFIG.driving;
        const ModeIcon = config.icon;
        const iataFrom = seg.transportMode === 'flight' ? seg.originAirport?.iata : undefined;
        const iataTo = seg.transportMode === 'flight' ? (seg.effectiveDestAirport?.iata || seg.destinationAirport?.iata) : undefined;

        // Determine if this is a land segment that should have AI actions
        const isLandSegment = seg.transportMode === 'driving' || seg.transportMode === 'walking';
        const showActions = isLandSegment && onSegmentAction;

        // Resolve coordinates for this segment's endpoints
        const { fromCoords, toCoords } = resolveSegmentCoords(
          seg, idx, segments, originCoords, destinationCoords
        );

        return (
          <div key={idx} className="px-1">
            {/* Connector dot */}
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-6 flex justify-center">
                <div className={`w-2 h-2 rounded-full ${config.colorClass.replace('text-', 'bg-')}`} />
              </div>
            </div>

            {/* Segment card — clickable to zoom on map */}
            <div
              className={`rounded-lg border ${config.borderClass} ${config.bgClass} p-2 ml-8 space-y-1 overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary/30 transition-shadow`}
              onClick={() => {
                if (seg.geometry?.coordinates?.length > 1) {
                  const lats = seg.geometry.coordinates.map((c: number[]) => c[1]);
                  const lngs = seg.geometry.coordinates.map((c: number[]) => c[0]);
                  const bounds: [[number, number], [number, number]] = [
                    [Math.min(...lats), Math.min(...lngs)],
                    [Math.max(...lats), Math.max(...lngs)],
                  ];
                  window.dispatchEvent(new CustomEvent('map-fit-bounds', { detail: { bounds, padding: [80, 80], maxZoom: 14 } }));
                }
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <ModeIcon className={`w-3.5 h-3.5 ${config.colorClass} shrink-0`} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">{config.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0 whitespace-nowrap">
                  {formatDistance(seg.distance)} · {formatDuration(seg.duration)}
                </span>
              </div>

              <div className="flex items-center gap-1 text-xs min-w-0">
                <span className="truncate font-medium min-w-0">{seg.from}</span>
                {iataFrom && <Badge variant="secondary" className="text-[8px] px-1 py-0 shrink-0">{iataFrom}</Badge>}
                <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium min-w-0">{seg.to}</span>
                {iataTo && <Badge variant="secondary" className="text-[8px] px-1 py-0 shrink-0">{iataTo}</Badge>}
              </div>

              {/* Show resolved flight legs (stopovers) */}
              {seg.transportMode === 'flight' && resolvedFlightLegs && resolvedFlightLegs.length > 1 && (
                <div className="space-y-0.5 pt-0.5 border-t border-border/50 mt-1">
                  <span className="text-[9px] text-muted-foreground font-medium">
                    {resolvedFlightLegs.length} tramos · {resolvedFlightLegs.length - 1} escala{resolvedFlightLegs.length > 2 ? 's' : ''}
                  </span>
                  {resolvedFlightLegs.map((leg, legIdx) => (
                    <div key={legIdx} className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                      <Navigation className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                      <Badge variant="outline" className="text-[8px] px-1 py-0">{leg.origin.iata}</Badge>
                      <ArrowRight className="w-2 h-2" />
                      <Badge variant="outline" className="text-[8px] px-1 py-0">{leg.destination.iata}</Badge>
                      {leg.duration && <span className="opacity-70">{formatDurationISO(leg.duration)}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Ferry booking links */}
              {seg.transportMode === 'ferry' && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {getFerryBookingLinks(seg.originPort?.name, seg.destinationPort?.name).map(link => (
                    <a
                      key={link.provider}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-background text-[9px] font-medium hover:bg-muted transition-colors"
                    >
                      <Ticket className="w-2.5 h-2.5" />
                      {link.provider}
                      <ExternalLink className="w-2 h-2 opacity-50" />
                    </a>
                  ))}
                </div>
              )}

              {/* Per-segment AI actions (land segments only, multimodal routes) */}
              {showActions && fromCoords && toCoords && (
                <SegmentActions
                  segmentIndex={idx}
                  from={{ name: seg.from, ...fromCoords }}
                  to={{ name: seg.to, ...toCoords }}
                  distanceKm={seg.distance / 1000}
                  durationHours={seg.duration / 3600}
                  transportMode={seg.transportMode}
                  onAction={onSegmentAction}
                  plannerMinHours={plannerMinHours}
                  plannerMaxHours={plannerMaxHours}
                  stopsMinKm={stopsMinKm}
                  stopsMaxKm={stopsMaxKm}
                />
              )}
            </div>

            {/* Inline AI panel for this segment */}
            {activeSegmentIndex === idx && renderActivePanel && (
              <div className="ml-8 mt-1 min-w-0 overflow-hidden">
                {renderActivePanel()}
              </div>
            )}

            {/* Connector line + add waypoint button only for real waypoint boundaries */}
            {idx < enrichedSegments.length - 1 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 flex justify-center">
                    <div className="w-0.5 h-3 bg-border" />
                  </div>
                </div>
                {onAddWaypoint && pairBoundaryIndices && pairBoundaryIndices.includes(idx) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddWaypoint(pairBoundaryIndices.indexOf(idx)); }}
                    className="mr-1 flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Añadir punto intermedio"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
