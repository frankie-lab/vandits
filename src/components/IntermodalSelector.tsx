import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, Ship, Car, Loader2, MapPin, ArrowRight, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface IntermodalOption {
  type: 'airport' | 'ferry_terminal';
  name: string;
  lat: number;
  lng: number;
  distanceFromPoint: number;
  nearPoint: 'origin' | 'destination';
}

interface IntermodalRoute {
  id: string;
  type: 'flight' | 'ferry';
  label: string;
  originHub: IntermodalOption;
  destinationHub: IntermodalOption;
  directDistance: number;
  totalOverhead: number;
}

interface IntermodalResult {
  needsIntermodal: boolean;
  directDistance: number;
  roadDistance: number;
  roadRouteFailed: boolean;
  options: IntermodalRoute[];
}

interface IntermodalSegment {
  name: string;
  lat: number;
  lng: number;
  transportMode: 'driving' | 'walking' | 'flight' | 'ferry';
}

interface IntermodalSelectorProps {
  originName: string;
  originLat: number;
  originLng: number;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  onSelect: (segments: IntermodalSegment[]) => void;
  onSkip: () => void;
}

export function IntermodalSelector({
  originName,
  originLat,
  originLng,
  destinationName,
  destinationLat,
  destinationLng,
  onSelect,
  onSkip,
}: IntermodalSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<IntermodalResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('find-intermodal-options', {
          body: {
            origin: { lat: originLat, lng: originLng, name: originName },
            destination: { lat: destinationLat, lng: destinationLng, name: destinationName },
          },
        });
        if (error) throw error;
        setResult(data);
        if (!data?.needsIntermodal) {
          onSkip();
        }
      } catch (e: any) {
        console.error('Intermodal search failed:', e);
        onSkip();
      } finally {
        setLoading(false);
      }
    })();
  }, [originLat, originLng, destinationLat, destinationLng]);

  const handleSelect = useCallback((route: IntermodalRoute) => {
    const segments: IntermodalSegment[] = [];

    // Driving to origin hub (if not very close)
    if (route.originHub.distanceFromPoint > 2) {
      segments.push({
        name: route.originHub.name,
        lat: route.originHub.lat,
        lng: route.originHub.lng,
        transportMode: 'driving',
      });
    }

    // The intermodal segment itself
    segments.push({
      name: route.destinationHub.name,
      lat: route.destinationHub.lat,
      lng: route.destinationHub.lng,
      transportMode: route.type === 'flight' ? 'flight' : 'ferry',
    });

    // Driving from destination hub to final destination (if not very close)
    if (route.destinationHub.distanceFromPoint > 2) {
      segments.push({
        name: destinationName,
        lat: destinationLat,
        lng: destinationLng,
        transportMode: 'driving',
      });
    }

    onSelect(segments);
  }, [destinationName, destinationLat, destinationLng, onSelect]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 justify-center text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Buscando opciones de transporte...</span>
      </div>
    );
  }

  if (!result?.needsIntermodal || result.options.length === 0) {
    return null;
  }

  const flightOptions = result.options.filter(o => o.type === 'flight');
  const ferryOptions = result.options.filter(o => o.type === 'ferry');

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="border-t border-border overflow-hidden"
    >
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-foreground">
              Tramo intermodal detectado
            </p>
            <p className="text-[11px] text-muted-foreground">
              {originName} → {destinationName} ({result.directDistance} km en línea recta)
              {result.roadRouteFailed 
                ? ' — No hay ruta terrestre directa'
                : ` — Ruta terrestre: ${result.roadDistance} km`
              }
            </p>
          </div>
        </div>

        <ScrollArea className="max-h-60">
          <div className="space-y-3">
            {/* Flight options */}
            {flightOptions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 px-1">
                  <Plane className="w-3 h-3" /> Vuelos ({flightOptions.length})
                </p>
                {flightOptions.map(route => (
                  <IntermodalRouteCard
                    key={route.id}
                    route={route}
                    expanded={expandedId === route.id}
                    onToggle={() => setExpandedId(expandedId === route.id ? null : route.id)}
                    onSelect={() => handleSelect(route)}
                  />
                ))}
              </div>
            )}

            {/* Ferry options */}
            {ferryOptions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 px-1">
                  <Ship className="w-3 h-3" /> Ferry ({ferryOptions.length})
                </p>
                {ferryOptions.map(route => (
                  <IntermodalRouteCard
                    key={route.id}
                    route={route}
                    expanded={expandedId === route.id}
                    onToggle={() => setExpandedId(expandedId === route.id ? null : route.id)}
                    onSelect={() => handleSelect(route)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onSkip}>
          Mantener ruta directa sin transbordo
        </Button>
      </div>
    </motion.div>
  );
}

function IntermodalRouteCard({
  route,
  expanded,
  onToggle,
  onSelect,
}: {
  route: IntermodalRoute;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const TypeIcon = route.type === 'flight' ? Plane : Ship;
  const typeColor = route.type === 'flight' ? 'text-purple-600' : 'text-cyan-600';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <TypeIcon className={`w-4 h-4 ${typeColor} shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{route.label}</p>
          <p className="text-[10px] text-muted-foreground">
            {route.directDistance} km · desvío: +{route.totalOverhead} km
          </p>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-1.5">
              {/* Sub-segments preview */}
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Car className="w-3 h-3" />
                <span>{route.originHub.distanceFromPoint} km hasta {route.originHub.name}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <TypeIcon className={`w-3 h-3 ${typeColor}`} />
                <span className="font-medium">{route.originHub.name}</span>
                <ArrowRight className="w-2.5 h-2.5" />
                <span className="font-medium">{route.destinationHub.name}</span>
                <Badge variant="secondary" className="text-[9px] ml-1">{route.directDistance} km</Badge>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Car className="w-3 h-3" />
                <span>{route.destinationHub.distanceFromPoint} km hasta destino</span>
              </div>

              <Button size="sm" className="w-full text-xs mt-1" onClick={onSelect}>
                Usar esta opción
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
