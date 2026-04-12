import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, Ship, Car, Loader2, MapPin, ArrowRight, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Train, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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

// --- Booking link generators ---

function extractCityName(hubName: string): string {
  // Remove common suffixes like "Airport", "Aeropuerto", etc.
  return hubName
    .replace(/\b(airport|aeropuerto|internacional|international|terminal|puerto|port|de|del)\b/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

interface BookingLink {
  provider: string;
  url: string;
  icon: React.ReactNode;
  color: string;
}

function getFlightBookingLinks(originHub: string, destHub: string): BookingLink[] {
  const from = encodeURIComponent(extractCityName(originHub));
  const to = encodeURIComponent(extractCityName(destHub));
  const date = getDateStr();

  return [
    {
      provider: 'Skyscanner',
      url: `https://www.skyscanner.es/transporte/vuelos/${from}/${to}/${date.replace(/-/g, '')}/?adultsv2=1`,
      icon: <Plane className="w-3 h-3" />,
      color: 'text-sky-600',
    },
    {
      provider: 'Kiwi.com',
      url: `https://www.kiwi.com/es/search/results/${from}/${to}/${date}`,
      icon: <Plane className="w-3 h-3" />,
      color: 'text-green-600',
    },
    {
      provider: 'Google Flights',
      url: `https://www.google.com/travel/flights?q=vuelos+de+${from}+a+${to}`,
      icon: <Plane className="w-3 h-3" />,
      color: 'text-blue-600',
    },
  ];
}

function getFerryBookingLinks(originHub: string, destHub: string): BookingLink[] {
  const from = encodeURIComponent(extractCityName(originHub));
  const to = encodeURIComponent(extractCityName(destHub));

  return [
    {
      provider: 'DirectFerries',
      url: `https://www.directferries.es/rutas_de_ferry.htm?from=${from}&to=${to}`,
      icon: <Ship className="w-3 h-3" />,
      color: 'text-cyan-600',
    },
    {
      provider: 'Omio',
      url: `https://www.omio.es/search?from=${from}&to=${to}&mode=ferry`,
      icon: <Ship className="w-3 h-3" />,
      color: 'text-indigo-600',
    },
  ];
}

function getTrainBookingLinks(originName: string, destName: string): BookingLink[] {
  const from = encodeURIComponent(originName);
  const to = encodeURIComponent(destName);

  return [
    {
      provider: 'Omio',
      url: `https://www.omio.es/search?from=${from}&to=${to}&mode=train`,
      icon: <Train className="w-3 h-3" />,
      color: 'text-indigo-600',
    },
    {
      provider: 'Trainline',
      url: `https://www.thetrainline.com/es/search/${from}/${to}`,
      icon: <Train className="w-3 h-3" />,
      color: 'text-emerald-600',
    },
  ];
}

// --- Component ---

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

    if (route.originHub.distanceFromPoint > 2) {
      segments.push({
        name: route.originHub.name,
        lat: route.originHub.lat,
        lng: route.originHub.lng,
        transportMode: 'driving',
      });
    }

    segments.push({
      name: route.destinationHub.name,
      lat: route.destinationHub.lat,
      lng: route.destinationHub.lng,
      transportMode: route.type === 'flight' ? 'flight' : 'ferry',
    });

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

        <ScrollArea className="max-h-72">
          <div className="space-y-3">
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
                    originName={originName}
                    destinationName={destinationName}
                  />
                ))}
              </div>
            )}

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
                    originName={originName}
                    destinationName={destinationName}
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

interface FlightOffer {
  id: string;
  price: { amount: number; currency: string };
  airline: { name: string; iata: string; logo: string | null };
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string };
  duration: string | null;
  stops: number;
}

function useDuffelOffers(originIata: string | null, destIata: string | null, enabled: boolean) {
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !originIata || !destIata) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const departureDate = new Date();
        departureDate.setDate(departureDate.getDate() + 7);
        const { data, error } = await supabase.functions.invoke('search-flights', {
          body: {
            origin_iata: originIata,
            destination_iata: destIata,
            departure_date: departureDate.toISOString().slice(0, 10),
            max_results: 3,
          },
        });
        if (!cancelled && !error && data?.offers) {
          setOffers(data.offers);
        }
      } catch (e) {
        console.error('Duffel search failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [originIata, destIata, enabled]);

  return { offers, loading };
}

function extractIata(hubName: string): string | null {
  const match = hubName.match(/\(([A-Z]{3})\)/);
  return match ? match[1] : null;
}

function formatDuration(iso: string | null): string {
  if (!iso) return '';
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}h` : '';
  const m = match[2] ? `${match[2]}m` : '';
  return `${h}${m}`.trim();
}

function IntermodalRouteCard({
  route,
  expanded,
  onToggle,
  onSelect,
  originName,
  destinationName,
}: {
  route: IntermodalRoute;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  originName: string;
  destinationName: string;
}) {
  const TypeIcon = route.type === 'flight' ? Plane : Ship;
  const typeColor = route.type === 'flight' ? 'text-purple-600' : 'text-cyan-600';

  const originIata = extractIata(route.originHub.name);
  const destIata = extractIata(route.destinationHub.name);
  const { offers, loading: offersLoading } = useDuffelOffers(
    originIata, destIata, expanded && route.type === 'flight'
  );

  const bookingLinks = route.type === 'flight'
    ? getFlightBookingLinks(route.originHub.name, route.destinationHub.name)
    : getFerryBookingLinks(route.originHub.name, route.destinationHub.name);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <TypeIcon className={`w-4 h-4 ${typeColor} shrink-0`} />
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="text-xs font-medium truncate">{route.label}</p>
          <p className="text-[10px] text-muted-foreground truncate">
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
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0">
                <Car className="w-3 h-3 shrink-0" />
                <span className="truncate">{route.originHub.distanceFromPoint} km hasta {route.originHub.name}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] min-w-0 flex-wrap">
                <TypeIcon className={`w-3 h-3 ${typeColor} shrink-0`} />
                <span className="font-medium truncate max-w-[40%]">{route.originHub.name}</span>
                <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                <span className="font-medium truncate max-w-[40%]">{route.destinationHub.name}</span>
                <Badge variant="secondary" className="text-[9px] ml-1 shrink-0">{route.directDistance} km</Badge>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0">
                <Car className="w-3 h-3 shrink-0" />
                <span className="truncate">{route.destinationHub.distanceFromPoint} km hasta destino</span>
              </div>

              {/* Duffel flight offers */}
              {route.type === 'flight' && (
                <div className="mt-1.5 space-y-1">
                  {offersLoading && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Buscando precios reales...</span>
                    </div>
                  )}
                  {offers.length > 0 && (
                    <>
                      <p className="text-[10px] font-medium text-muted-foreground">Precios (Duffel)</p>
                      {offers.map(offer => (
                        <div
                          key={offer.id}
                          className="flex items-center gap-2 p-1.5 rounded border border-border bg-muted/30 text-[10px]"
                        >
                          {offer.airline.logo && (
                            <img src={offer.airline.logo} alt={offer.airline.name} className="w-4 h-4 rounded" />
                          )}
                          <span className="font-medium truncate">{offer.airline.name}</span>
                          {offer.duration && (
                            <span className="text-muted-foreground">{formatDuration(offer.duration)}</span>
                          )}
                          {offer.stops > 0 && (
                            <Badge variant="outline" className="text-[8px] px-1">{offer.stops} escala{offer.stops > 1 ? 's' : ''}</Badge>
                          )}
                          <span className="ml-auto font-bold text-primary">
                            {offer.price.amount.toFixed(0)} {offer.price.currency}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-1.5 mt-1">
                <Button size="sm" className="flex-1 text-xs" onClick={onSelect}>
                  Usar esta opción
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-xs gap-1">
                      <Ticket className="w-3 h-3" />
                      Billetes
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-sm flex items-center gap-2">
                        <Ticket className="w-4 h-4" />
                        Buscar billetes
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        {route.originHub.name} → {route.destinationHub.name}
                      </p>
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-foreground">
                          {route.type === 'flight' ? 'Vuelos' : 'Ferries'}
                        </p>
                        {bookingLinks.map(link => (
                          <a
                            key={link.provider}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                          >
                            <span className={link.color}>{link.icon}</span>
                            <span className="text-xs font-medium flex-1">{link.provider}</span>
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </a>
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-foreground">Trenes</p>
                        {getTrainBookingLinks(originName, destinationName).map(link => (
                          <a
                            key={link.provider}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                          >
                            <span className={link.color}>{link.icon}</span>
                            <span className="text-xs font-medium flex-1">{link.provider}</span>
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </a>
                        ))}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
