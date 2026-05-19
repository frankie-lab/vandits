/**
 * adopt-candidate-payload — pure helper that builds the DB update payload
 * when the user explicitly adopts a candidate in <UnenrichedRecoveryBlock>.
 *
 * Política (Fase A — PR-SHARE-EXT-MAPS-3):
 *   - Siempre actualiza name + lat + lng + updated_at.
 *   - SOLO escribe `external_refs.maps.google` cuando el candidato cumple
 *     `provider === 'google'` y tiene `placeId` no vacío.
 *   - Cualquier otro candidato (wikipedia, wikidata, nominatim, photon,
 *     geonames, village-catalog) NO toca `external_refs`.
 *   - Hace merge no destructivo del `external_refs` previo del POI.
 *   - NUNCA invocado desde `enrich-location`/`batch-enrich`/scrapers/backfill.
 */
import type { CoherenceCandidate } from './enrichment-error-kind';

export interface AdoptPayloadInput {
  prevExternalRefs?: Record<string, unknown> | null;
  candidate: Pick<CoherenceCandidate, 'name' | 'lat' | 'lng' | 'placeId' | 'provider'>;
  now?: Date;
}

export interface AdoptPayloadResult {
  update: Record<string, unknown>;
  wroteGooglePlaceId: boolean;
}

export function buildAdoptUpdatePayload(input: AdoptPayloadInput): AdoptPayloadResult {
  const { candidate, prevExternalRefs } = input;
  const nowIso = (input.now ?? new Date()).toISOString();

  const writeGooglePlaceId =
    candidate.provider === 'google' &&
    typeof candidate.placeId === 'string' &&
    candidate.placeId.length > 0;

  const update: Record<string, unknown> = {
    name: (candidate.name ?? '').trim(),
    latitude: candidate.lat,
    longitude: candidate.lng,
    updated_at: nowIso,
  };

  if (writeGooglePlaceId) {
    const prev = (prevExternalRefs ?? {}) as Record<string, unknown>;
    const prevMaps = (prev.maps ?? {}) as Record<string, unknown>;
    const prevGoogle = (prevMaps.google ?? {}) as Record<string, unknown>;
    update.external_refs = {
      ...prev,
      maps: {
        ...prevMaps,
        google: {
          ...prevGoogle,
          placeId: candidate.placeId,
          source: 'places-api-new-text-search',
          resolvedAt: nowIso,
        },
      },
    };
  }

  return { update, wroteGooglePlaceId: writeGooglePlaceId };
}
