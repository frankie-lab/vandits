import React, { useState, useEffect } from 'react';
import { Plane, Car, Clock, MapPin, ExternalLink, Loader2, ArrowRight, Ticket, Navigation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

export interface FlightLeg {
  origin: { iata: string | null; name: string | null; latitude: number | null; longitude: number | null; city: string | null };
  destination: { iata: string | null; name: string | null; latitude: number | null; longitude: number | null; city: string | null };
  departing_at: string | null;
  arriving_at: string | null;
  duration: string | null;
  marketing_carrier: { name: string | null; iata: string | null; logo: string | null };
  flight_number: string | null;
}

interface CandidateAirport {
  name: string;
  iata: string;
  latitude: number;
  longitude: number;
}

interface FlightSegmentDetailsProps {
  segments: any[];
  onFlightLegsResolved?: (legs: FlightLeg[], resolvedDestAirport?: CandidateAirport) => void;
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
    { provider: 'Skyscanner', url: `https://www.skyscanner.es/transporte/vuelos/${originIata}/${destIata}/${date.replace(/-/g, '')}/?adultsv2=1` },
    { provider: 'Kiwi.com', url: `https://www.kiwi.com/es/search/results/${originIata}/${destIata}/${date}` },
    { provider: 'Google Flights', url: `https://www.google.com/travel/flights?q=flights+${originIata}+to+${destIata}` },
  ];
}

export function FlightSegmentDetails({ segments, onFlightLegsResolved }: FlightSegmentDetailsProps) {
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [resolvedDestAirport, setResolvedDestAirport] = useState<CandidateAirport | null>(null);

  const flightSeg = segments.find((s: any) => s.transportMode === 'flight');
  const originAirport = flightSeg?.originAirport;
  const destAirport = resolvedDestAirport || flightSeg?.destinationAirport;
  const candidateDestAirports: CandidateAirport[] = flightSeg?.candidateDestAirports || [];

  // Try candidate airports sequentially until we find offers
  useEffect(() => {
    if (!originAirport?.iata) return;
    // Use candidates if available, otherwise fall back to the single destination airport
    const airportsToTry = candidateDestAirports.length > 0
      ? candidateDestAirports
      : (flightSeg?.destinationAirport?.iata ? [flightSeg.destinationAirport] : []);
    if (airportsToTry.length === 0) return;
    let cancelled = false;

    (async () => {
      setLoadingOffers(true);
      const departureDate = getDateStr();

      for (const candidate of airportsToTry) {
        if (cancelled) break;
        if (!candidate.iata) continue;

        try {
          const { data, error } = await supabase.functions.invoke('search-flights', {
            body: {
              origin_iata: originAirport.iata,
              destination_iata: candidate.iata,
              departure_date: departureDate,
              max_results: 3,
            },
          });

          if (!cancelled && !error && data?.offers?.length > 0) {
            setOffers(data.offers);
            setResolvedDestAirport(candidate);
            const best = data.offers[0];
            if (best?.legs?.length > 0 && onFlightLegsResolved) {
              onFlightLegsResolved(best.legs, candidate);
            }
            break; // Found offers, stop searching
          }
        } catch (e) {
          console.error(`Duffel fetch failed for ${candidate.iata}:`, e);
        }
      }

      if (!cancelled) setLoadingOffers(false);
    })();

    return () => { cancelled = true; };
  }, [originAirport?.iata, JSON.stringify(candidateDestAirports.map(a => a.iata))]);

  if (!flightSeg) return null;

  const bookingLinks = originAirport?.iata && destAirport?.iata
    ? getBookingLinks(originAirport.iata, destAirport.iata)
    : [];

  return (
    <div className="space-y-1.5 px-1">
      {/* Duffel offers */}
      {loadingOffers && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-8">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Buscando vuelos reales...</span>
        </div>
      )}

      {offers.length > 0 && (
        <div className="ml-8 space-y-1 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Ofertas disponibles</p>
          {offers.map(offer => (
            <div key={offer.id} className="space-y-1">
              <div className="flex items-center gap-2 p-1.5 rounded border border-border bg-background text-[10px]">
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
                <span className="ml-auto font-bold text-primary whitespace-nowrap">
                  {offer.price.amount.toFixed(0)} {offer.price.currency}
                </span>
              </div>

              {/* Show legs for multi-stop flights */}
              {offer.legs && offer.legs.length > 1 && (
                <div className="ml-2 space-y-0.5">
                  {offer.legs.map((leg, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                      <Navigation className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                      <span className="font-medium">{leg.origin.iata}</span>
                      <ArrowRight className="w-2 h-2" />
                      <span className="font-medium">{leg.destination.iata}</span>
                      {leg.marketing_carrier?.iata && leg.flight_number && (
                        <span className="opacity-70">{leg.marketing_carrier.iata}{leg.flight_number}</span>
                      )}
                      {leg.duration && <span className="opacity-70">{formatDurationISO(leg.duration)}</span>}
                      {leg.departing_at && <span className="opacity-70">{formatTime(leg.departing_at)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No offers found - show airport info + booking links */}
      {!loadingOffers && offers.length === 0 && originAirport?.iata && destAirport?.iata && (
        <div className="ml-8 space-y-1.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Plane className="w-3 h-3 text-purple-500" />
            <span className="font-medium">{originAirport.iata}</span>
            <ArrowRight className="w-2.5 h-2.5" />
            <span className="font-medium">{destAirport.iata}</span>
            <span className="opacity-70 ml-1">· No hay ofertas directas disponibles</span>
          </div>
          <p className="text-[9px] text-muted-foreground">
            Puede requerir escala. Busca opciones en:
          </p>
        </div>
      )}

      {/* Booking links - always shown when we have airport codes */}
      {!loadingOffers && originAirport?.iata && destAirport?.iata && bookingLinks.length > 0 && (
        <div className="ml-8 flex flex-wrap gap-1">
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
  );
}
