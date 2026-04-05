import React from 'react';
import { Ship, Clock, ExternalLink, Ticket, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FerrySegmentDetailsProps {
  segments: any[];
  originName?: string;
  destinationName?: string;
}

function getBookingLinks(originName: string, destName: string) {
  const origin = encodeURIComponent(originName);
  const dest = encodeURIComponent(destName);
  return [
    {
      provider: 'Direct Ferries',
      url: `https://www.directferries.es/rutas-ferry.htm?origin=${origin}&destination=${dest}`,
      color: 'text-blue-600',
    },
    {
      provider: 'Ferryhopper',
      url: `https://www.ferryhopper.com/es/search?from=${origin}&to=${dest}`,
      color: 'text-teal-600',
    },
    {
      provider: 'AFerry',
      url: `https://www.aferry.es/results?from=${origin}&to=${dest}`,
      color: 'text-orange-600',
    },
  ];
}

export function FerrySegmentDetails({ segments, originName, destinationName }: FerrySegmentDetailsProps) {
  const ferrySeg = segments.find((s: any) => s.transportMode === 'ferry');
  if (!ferrySeg) return null;

  const distKm = (ferrySeg.distance / 1000).toFixed(0);
  const durMin = Math.round(ferrySeg.duration / 60);
  const durH = Math.floor(durMin / 60);
  const durM = durMin % 60;

  const fromName = originName || 'Origen';
  const toName = destinationName || 'Destino';
  const bookingLinks = getBookingLinks(fromName, toName);

  return (
    <div className="space-y-2 px-1">
      <div className="rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/20 p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Ship className="w-4 h-4 text-cyan-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="truncate">{fromName}</span>
              <span className="text-muted-foreground">→</span>
              <span className="truncate">{toName}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">
                {distKm} km · ~{durH}h {durM > 0 ? `${durM}m` : ''} (estimado)
              </p>
            </div>
          </div>
        </div>

        {/* Booking deep-links */}
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">Buscar ferrys y precios</p>
          <div className="flex flex-wrap gap-1">
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
        </div>
      </div>
    </div>
  );
}
