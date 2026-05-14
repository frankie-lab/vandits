/**
 * GlobalNearbyContextHost — listener global para el evento `open-nearby-context`.
 *
 * Contexto:
 *  - El popup de un POI (UnenrichedRecoveryBlock + map-popups.ts) emite
 *    `window.dispatchEvent(new CustomEvent('open-nearby-context', { detail }))`.
 *  - DocumentFocusView ya escucha el evento cuando el usuario está dentro de
 *    un documento (focus mode). Pero en el mapa global nadie lo escuchaba,
 *    por lo que el botón "Contexto cercano" no hacía nada.
 *
 * Este host se monta en `DiscoveryOrchestrator` (mapa global) y abre el
 * `NearbyPanel` en un Sheet lateral cuando se dispara el evento.
 *
 * Anti-doble-apertura:
 *  - Si existe `[data-document-focus-panel="true"]` en el DOM, asumimos que
 *    DocumentFocusView ya está manejando el evento y abortamos. Es un guard
 *    temporal aceptable hasta que se reorganice el árbol para que el host
 *    global solo se monte fuera de focus mode.
 *
 * Ver: PR-NEARBY-GLOBAL-HOST.
 */
import { useEffect, useState, useCallback } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity/hooks/use-auth';
import { NearbyPanel } from './PointContextActions';

interface LocationRow {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  is_approved: boolean;
  enrichment_status: string | null;
  enriched_data: any;
  place_type: string | null;
  continent: string | null;
  country: string | null;
  region: string | null;
}

interface MismatchPayload {
  providedName: string;
  nameLocation?: { lat: number; lng: number; title: string; url: string; distanceKm: number };
}

export function GlobalNearbyContextHost() {
  const { user } = useAuth();
  const [location, setLocation] = useState<LocationRow | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<MismatchPayload | null>(null);

  const close = useCallback(() => {
    setLocation(null);
    setMismatch(null);
    setDocId(null);
  }, []);

  useEffect(() => {
    const handler = async (e: Event) => {
      // Guard: si DocumentFocusView está montado, deja que él lo maneje.
      if (typeof document !== 'undefined' &&
          document.querySelector('[data-document-focus-panel="true"]')) {
        return;
      }

      const detail = (e as CustomEvent).detail || {};
      const { locationId, reason, providedName, nameLocation } = detail;
      if (!locationId) return;

      const { data, error } = await supabase
        .from('locations')
        .select('id, name, description, latitude, longitude, is_approved, enrichment_status, enriched_data, place_type, continent, country, region, document_id')
        .eq('id', locationId)
        .maybeSingle();

      if (error || !data) return;

      const { document_id, ...row } = data as any;
      setLocation(row as LocationRow);
      setDocId(document_id ?? null);
      if (reason === 'name-coordinate-mismatch') {
        setMismatch({ providedName, nameLocation });
      } else {
        setMismatch(null);
      }
    };

    window.addEventListener('open-nearby-context', handler as EventListener);
    return () => window.removeEventListener('open-nearby-context', handler as EventListener);
  }, []);

  if (!user || !location) return null;

  return (
    <Sheet open={!!location} onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-hidden flex flex-col">
        <NearbyPanel
          location={location}
          docId={docId}
          userId={user.id}
          mismatch={mismatch}
          onClose={close}
          onLocationUpdated={(updated) => setLocation(updated)}
          onLocationMerged={() => close()}
        />
      </SheetContent>
    </Sheet>
  );
}
