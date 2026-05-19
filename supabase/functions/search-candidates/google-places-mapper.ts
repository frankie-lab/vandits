/**
 * Pure mapper from Google Places API New (Text Search v1) `places[i]`
 * to internal Candidate shape. Extracted from index.ts so it is unit-testable.
 *
 * Contract:
 *   - `placeId` SOLO se popula cuando `p.id` es string no vacío.
 *   - `provider` siempre 'google' cuando el item proviene de google-places.
 *   - Si `p.websiteUri` falta, se construye URL canónica con `place_id:{id}`.
 */
export interface GooglePlaceLike {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  websiteUri?: string;
}

export interface GooglePlaceCandidate {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  url?: string;
  source: 'google-places';
  placeId?: string;
  provider: 'google';
}

export function mapGooglePlace(
  p: GooglePlaceLike,
  fallbackName: string,
): GooglePlaceCandidate | null {
  const lat = p?.location?.latitude;
  const lng = p?.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const id = typeof p.id === 'string' && p.id.length > 0 ? p.id : undefined;
  return {
    name: p.displayName?.text || fallbackName,
    lat,
    lng,
    country: p.formattedAddress,
    url: p.websiteUri || (id ? `https://www.google.com/maps/place/?q=place_id:${id}` : undefined),
    source: 'google-places',
    placeId: id,
    provider: 'google',
  };
}
