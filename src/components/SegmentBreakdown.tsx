import React from 'react';
import { Car, Footprints, Plane, Ship, Clock, MapPin, ArrowRight, ExternalLink, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface RouteSegment {
  transportMode: string;
  distance: number;
  duration: number;
  originAirport?: { name: string; iata: string };
  destinationAirport?: { name: string; iata: string };
  originPort?: { name: string; lat: number; lng: number };
  destinationPort?: { name: string; lat: number; lng: number };
}

interface SegmentBreakdownProps {
  segments: RouteSegment[];
  totalDistance: number;
  totalDuration: number;
  originName?: string;
  destinationName?: string;
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

function getSegmentLabel(seg: RouteSegment, idx: number, total: number, originName?: string, destinationName?: string): { from: string; to: string } {
  const mode = seg.transportMode;

  if (mode === 'flight') {
    return {
      from: seg.originAirport?.name || 'Aeropuerto',
      to: seg.destinationAirport?.name || 'Aeropuerto',
    };
  }
  if (mode === 'ferry') {
    return {
      from: seg.originPort?.name || 'Puerto',
      to: seg.destinationPort?.name || 'Puerto',
    };
  }

  // Driving/walking: infer from position
  if (total === 1) {
    return { from: originName || 'Origen', to: destinationName || 'Destino' };
  }
  if (idx === 0) {
    // First segment — drive to hub
    const nextSeg = total > 1 ? null : null; // will be determined by context
    return {
      from: originName || 'Origen',
      to: getHubName(seg, idx, total),
    };
  }
  if (idx === total - 1) {
    // Last segment — drive from hub
    return {
      from: getHubName(seg, idx, total),
      to: destinationName || 'Destino',
    };
  }
  return { from: '—', to: '—' };
}

function getHubName(seg: RouteSegment, idx: number, total: number): string {
  // For driving segments adjacent to flight/ferry, we use hub names
  return 'Hub';
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

export function SegmentBreakdown({ segments, totalDistance, totalDuration, originName, destinationName }: SegmentBreakdownProps) {
  if (!segments?.length) return null;

  const isMultiModal = new Set(segments.map(s => s.transportMode)).size > 1;

  // Enrich labels: compute from/to for each segment based on context
  const enrichedSegments = segments.map((seg, idx) => {
    const mode = seg.transportMode;
    let from = '';
    let to = '';

    if (mode === 'flight') {
      from = seg.originAirport?.name || 'Aeropuerto';
      to = seg.destinationAirport?.name || 'Aeropuerto';
    } else if (mode === 'ferry') {
      from = seg.originPort?.name || 'Puerto';
      to = seg.destinationPort?.name || 'Puerto';
    } else {
      // Driving/walking: infer from neighbours
      if (idx === 0) {
        from = originName || 'Origen';
        // Next segment is the hub
        const next = segments[idx + 1];
        if (next?.transportMode === 'flight') {
          to = next.originAirport?.name || 'Aeropuerto';
        } else if (next?.transportMode === 'ferry') {
          to = next.originPort?.name || 'Puerto';
        } else {
          to = destinationName || 'Destino';
        }
      } else if (idx === segments.length - 1) {
        // Prev segment is the hub
        const prev = segments[idx - 1];
        if (prev?.transportMode === 'flight') {
          from = prev.destinationAirport?.name || 'Aeropuerto';
        } else if (prev?.transportMode === 'ferry') {
          from = prev.destinationPort?.name || 'Puerto';
        } else {
          from = originName || 'Origen';
        }
        to = destinationName || 'Destino';
      } else {
        from = '—';
        to = '—';
      }
    }

    return { ...seg, from, to };
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
        const iataTo = seg.transportMode === 'flight' ? seg.destinationAirport?.iata : undefined;

        return (
          <div key={idx} className="px-1">
            {/* Connector dot */}
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-6 flex justify-center">
                <div className={`w-2 h-2 rounded-full ${config.colorClass.replace('text-', 'bg-')}`} />
              </div>
            </div>

            {/* Segment card */}
            <div className={`rounded-lg border ${config.borderClass} ${config.bgClass} p-2 ml-8 space-y-1`}>
              <div className="flex items-center gap-1.5">
                <ModeIcon className={`w-3.5 h-3.5 ${config.colorClass} shrink-0`} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{config.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {formatDistance(seg.distance)} · {formatDuration(seg.duration)}
                </span>
              </div>

              <div className="flex items-center gap-1 text-xs">
                <span className="truncate font-medium">{seg.from}</span>
                {iataFrom && <Badge variant="secondary" className="text-[8px] px-1 py-0">{iataFrom}</Badge>}
                <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{seg.to}</span>
                {iataTo && <Badge variant="secondary" className="text-[8px] px-1 py-0">{iataTo}</Badge>}
              </div>

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
            </div>

            {/* Connector line to next */}
            {idx < enrichedSegments.length - 1 && (
              <div className="flex items-center gap-2">
                <div className="w-6 flex justify-center">
                  <div className="w-0.5 h-3 bg-border" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
