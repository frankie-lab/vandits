/**
 * wiki-name-search — búsqueda manual multi-fuente de candidatos por nombre.
 *
 * Nombre histórico ("wiki-...") por compatibilidad. Internamente delega en la edge
 * function `search-candidates`, que consulta en paralelo:
 *   - Wikipedia ES / EN
 *   - Wikidata
 *   - Nominatim / OSM
 *   - GeoNames (si hay GEONAMES_USERNAME)
 *
 * Y deduplica por proximidad (<150m). Si `near` está definido, los candidatos
 * vienen ordenados por distancia ascendente.
 *
 * Usado por <UnenrichedRecoveryBlock>. Ver mem://logic/enrichment/per-poi-recovery-block.
 */

import { supabase } from '@/integrations/supabase/client';
import type { CoherenceCandidate } from './enrichment-error-kind';

export async function searchWikiCandidates(
  term: string,
  near?: { lat: number; lng: number },
  limit = 8,
): Promise<CoherenceCandidate[]> {
  const cleaned = term.trim();
  if (!cleaned) return [];

  try {
    const { data, error } = await supabase.functions.invoke('search-candidates', {
      body: { term: cleaned, near, limit },
    });
    if (error) {
      console.warn('[search-candidates] error', error);
      return [];
    }
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    return candidates.map((c: any) => ({
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      distanceKm: typeof c.distanceKm === 'number' ? c.distanceKm : undefined,
      url: c.url,
      locality: c.locality,
      region: c.region,
      country: c.country,
    }));
  } catch (err) {
    console.warn('[search-candidates] threw', err);
    return [];
  }
}
