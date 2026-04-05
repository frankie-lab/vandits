import React, { useState, useEffect } from 'react';
import { Plane, Car, Clock, MapPin, ExternalLink, Loader2, ArrowRight, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface FlightOffer {
  id: string;
  price: { amount: number; currency: string };
  airline: { name: string; iata: string; logo: string | null };
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string };
  duration: string | null;
  stops: number;
  legs?: FlightLeg[];
}

interface FlightLeg {
  origin: { iata: string | null; name: string | null; latitude: number | null; longitude: number | null; city: string | null };
  destination: { iata: string | null; name: string | null; latitude: number | null; longitude: number | null; city: string | null };
  departing_at: string | null;
  arriving_at: string | null;
  duration: string | null;
  marketing_carrier: { name: string | null; iata: string | null; logo: string | null };
  flight_number: string | null;
}

interface FlightSegmentDetailsProps {
  segments: any[];
  onFlightLegsResolved?: (legs: FlightLeg[]) => void;
}

function formatDurationISO(iso: string | null): string {
  if (!iso) return '';
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}h` : '';
  const m = match[2] ? `${match[2]}m` : '';
  return `${h} ${m}`.trim();
}

function formatTime(isoTime: string | null): string {
  if (!isoTime) return '';
  try {
    return new Date(isoTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getDateStr(daysFromNow = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function getBookingLinks(originIata: string, destIata: string) {
  const date = getDateStr();
  return [
    { provider: 'Skyscanner', url: `https://www.skyscanner.es/transporte/vuelos/${originIata}/${destIata}/${date.replace(/-/g, '')}/?adultsv2=1`, color: 'text-sky-600' },
    { provider: 'Kiwi.com', url: `https://www.kiwi.com/es/search/results/${originIata}/${destIata}/${date}`, color: 'text-green-600' },
    { provider: 'Google Flights', url: `https://www.google.com/travel/flights?q=flights+${originIata}+to+${destIata}`, color: 'text-blue-600' },
  ];
}

export function FlightSegmentDetails({ segments, onFlightLegsResolved }: FlightSegmentDetailsProps) {
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  // Find flight segment with airport metadata
  const flightSeg = segments.find((s: any) => s.transportMode === 'flight');
  const drivingSegs = segments.filter((s: any) => s.transportMode === 'driving');

  const originAirport = flightSeg?.originAirport;
  const destAirport = flightSeg?.destinationAirport;

  // Fetch Duffel offers
  useEffect(() => {
    if (!originAirport?.iata || !destAirport?.iata) return;
    let cancelled = false;
    (async () => {
      setLoadingOffers(true);
      try {
        const departureDate = new Date();
        departureDate.setDate(departureDate.getDate() + 7);
        const { data, error } = await supabase.functions.invoke('search-flights', {
          body: {
            origin_iata: originAirport.iata,
            destination_iata: destAirport.iata,
            departure_date: departureDate.toISOString().slice(0, 10),
            max_results: 3,
          },
        });
        if (!cancelled && !error && data?.offers) {
          setOffers(data.offers);
          // Auto-select cheapest offer and emit legs for map
          const best = data.offers[0];
          if (best?.legs?.length > 0 && onFlightLegsResolved) {
            onFlightLegsResolved(best.legs);
          }
        }
      } catch (e) {
        console.error('Duffel fetch failed:', e);
      } finally {
        if (!cancelled) setLoadingOffers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [originAirport?.iata, destAirport?.iata]);

  if (!flightSeg) return null;

  const flightDistKm = (flightSeg.distance / 1000).toFixed(0);
  const flightDurMin = Math.round(flightSeg.duration / 60);
  const flightDurH = Math.floor(flightDurMin / 60);
  const flightDurM = flightDurMin % 60;

  const driveToAirport = drivingSegs[0];
  const driveFromAirport = drivingSegs[1] || drivingSegs[0];
  const driveToKm = driveToAirport ? (driveToAirport.distance / 1000).toFixed(1) : null;
  const driveToMin = driveToAirport ? Math.round(driveToAirport.duration / 60) : null;
  const driveFromKm = drivingSegs.length > 1 ? (driveFromAirport.distance / 1000).toFixed(1) : null;
  const driveFromMin = drivingSegs.length > 1 ? Math.round(driveFromAirport.duration / 60) : null;

  const bookingLinks = originAirport?.iata && destAirport?.iata
    ? getBookingLinks(originAirport.iata, destAirport.iata)
    : [];

  return (
    <div className="space-y-2 px-1">
      {/* Segment 1: Drive to airport */}
      {driveToKm && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>
            {driveToKm} km · {driveToMin} min hasta
          </span>
          <span className="font-medium text-foreground truncate">
            {originAirport?.name || 'Aeropuerto'}
          </span>
          {originAirport?.iata && (
            <Badge variant="outline" className="text-[9px] px-1 shrink-0">{originAirport.iata}</Badge>
          )}
        </div>
      )}

      {/* Segment 2: Flight */}
      <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 text-purple-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-xs font-medium">
              <span className="truncate">{originAirport?.name || 'Salida'}</span>
              {originAirport?.iata && <Badge variant="secondary" className="text-[9px] px-1">{originAirport.iata}</Badge>}
              <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{destAirport?.name || 'Llegada'}</span>
              {destAirport?.iata && <Badge variant="secondary" className="text-[9px] px-1">{destAirport.iata}</Badge>}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {flightDistKm} km · {flightDurH}h {flightDurM}m (estimado)
            </p>
          </div>
        </div>

        {/* Duffel offers */}
        {loadingOffers && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Buscando precios reales...</span>
          </div>
        )}
        {offers.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground">Ofertas disponibles</p>
            {offers.map(offer => (
              <div key={offer.id} className="flex items-center gap-2 p-1.5 rounded border border-border bg-background text-[10px]">
                {offer.airline.logo && (
                  <img src={offer.airline.logo} alt={offer.airline.name} className="w-4 h-4 rounded" />
                )}
                <span className="font-medium truncate">{offer.airline.name}</span>
                {offer.departure.time && (
                  <span className="text-muted-foreground">
                    {formatTime(offer.departure.time)} → {formatTime(offer.arrival.time)}
                  </span>
                )}
                {offer.duration && (
                  <span className="text-muted-foreground">{formatDurationISO(offer.duration)}</span>
                )}
                {offer.stops > 0 && (
                  <Badge variant="outline" className="text-[8px] px-1">
                    {offer.stops} escala{offer.stops > 1 ? 's' : ''}
                  </Badge>
                )}
                {offer.legs && offer.legs.length > 1 && (
                  <span className="text-[8px] text-muted-foreground">
                    vía {offer.legs.slice(0, -1).map(l => l.destination.iata || l.destination.city).join(', ')}
                  </span>
                )}
                <span className="ml-auto font-bold text-primary whitespace-nowrap">
                  {offer.price.amount.toFixed(0)} {offer.price.currency}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Booking links */}
        {bookingLinks.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {bookingLinks.map(link => (
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

      {/* Segment 3: Drive from airport */}
      {driveFromKm && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>
            {driveFromKm} km · {driveFromMin} min desde
          </span>
          <span className="font-medium text-foreground truncate">
            {destAirport?.name || 'Aeropuerto'}
          </span>
          {destAirport?.iata && (
            <Badge variant="outline" className="text-[9px] px-1 shrink-0">{destAirport.iata}</Badge>
          )}
        </div>
      )}
    </div>
  );
}
