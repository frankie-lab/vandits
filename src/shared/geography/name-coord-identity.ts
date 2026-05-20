/**
 * Canonical name ↔ coordinate identity gate (R9).
 *
 * Single source of truth used by both client and edge functions
 * (mirrored at `supabase/functions/_shared/name-coord-identity.ts`).
 *
 * Contract: see `docs/contracts/enrichment-coord-coherence-contract.md` (R9).
 *
 * Pre-LLM gate: confirms that the declared POI `name` is compatible with
 * `(lat, lng)` BEFORE invoking the LLM. Coords being valid (R1) and
 * reverse-geocode resolving (R3) are necessary but not sufficient.
 *
 * Output statuses (exhaustive):
 *   - `ok`                            → continue to LLM
 *   - `name_coordinate_mismatch`      → block (no LLM); name not near coords
 *   - `name_found_elsewhere`          → block (no LLM); name lives far away
 *   - `identity_lookup_unavailable`   → block (no LLM); HARD lookup failure
 */

export type IdentityStatus =
  | 'ok'
  | 'name_coordinate_mismatch'
  | 'name_found_elsewhere'
  | 'identity_lookup_unavailable';

export interface NearbyCandidate {
  name: string;
  latitude: number;
  longitude: number;
  distance_m?: number;
  place_type?: string | null;
}

export interface RemoteCandidate {
  name: string;
  lat: number;
  lng: number;
  distanceKm?: number;
  source?: string;
  country?: string;
  region?: string;
  locality?: string;
}

export interface IdentityResult {
  status: IdentityStatus;
  matched?: NearbyCandidate;
  nearby?: NearbyCandidate[];
  candidates?: RemoteCandidate[];
  reason?: string;
}

export interface AssertIdentityOptions {
  name: string;
  lat: number;
  lng: number;
  supabaseUrl: string;
  serviceKey: string;
  nearbyRadiusMeters?: number;
  farThresholdMeters?: number;
  matchThreshold?: number;
  /** Test-only override: replace the default `search-nearby-osm` call. */
  searchNearby?: (lat: number, lng: number, radiusMeters: number) => Promise<NearbyCandidate[]>;
  /** Test-only override: replace the default `search-candidates` call. */
  searchCandidates?: (name: string, near: { lat: number; lng: number }) => Promise<RemoteCandidate[]>;
}

const DEFAULT_NEARBY_RADIUS_M = 1000;
const DEFAULT_FAR_THRESHOLD_M = 1000;
const DEFAULT_MATCH_THRESHOLD = 0.82;

const GENERIC_STOPLIST = new Set([
  'hotel', 'restaurante', 'restaurant', 'bar', 'cafe', 'café',
  'parking', 'mirador', 'iglesia', 'capilla', 'ermita',
  'playa', 'monte', 'rio', 'río', 'lago', 'fuente',
  'plaza', 'calle', 'avenida', 'camino', 'sendero',
  'sin nombre', 'unnamed', 'no name', 'poi', 'punto',
  'faro', 'puerto', 'estacion', 'estación',
]);

const ARTICLE_PREFIXES = /^(el|la|los|las|o|a|os|as|the|le|les|l'|d')\s+/i;
const GENERIC_PREFIXES = /^(hotel|restaurante|restaurant|iglesia de|iglesia|playa de|playa|faro de|faro|mirador de|mirador|plaza de|plaza|calle|avenida|capilla de|capilla|ermita de|ermita|fuente de|fuente|puerto de|puerto|monte|rio|río|lago de|lago)\s+/i;

export function normalizeName(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (let i = 0; i < 2; i++) {
    s = s.replace(ARTICLE_PREFIXES, '');
    s = s.replace(GENERIC_PREFIXES, '');
  }
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

export function isGenericName(raw: string): boolean {
  if (!raw || raw.trim().length < 3) return true;
  const norm = normalizeName(raw);
  if (!norm || norm.length < 3) return true;
  if (GENERIC_STOPLIST.has(norm)) return true;
  const tokens = norm.split(' ');
  if (tokens.length === 1 && GENERIC_STOPLIST.has(tokens[0])) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length >= 6 && nb.includes(na)) return 0.95;
  if (nb.length >= 6 && na.includes(nb)) return 0.95;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(na, nb) / maxLen;
}

export function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function defaultSearchNearby(
  supabaseUrl: string, serviceKey: string,
  lat: number, lng: number, radiusMeters: number,
): Promise<NearbyCandidate[]> {
  const res = await fetch(`${supabaseUrl}/functions/v1/search-nearby-osm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ latitude: lat, longitude: lng, radiusMeters, limit: 40 }),
  });
  if (!res.ok) throw new Error(`search-nearby-osm ${res.status}`);
  const json = await res.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  return results.map((r: Record<string, unknown>) => ({
    name: String(r.name ?? ''),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    distance_m: typeof r.distance_m === 'number' ? r.distance_m : undefined,
    place_type: (r.place_type as string | null) ?? null,
  }));
}

async function defaultSearchCandidates(
  supabaseUrl: string, serviceKey: string,
  name: string, near: { lat: number; lng: number },
): Promise<RemoteCandidate[]> {
  const res = await fetch(`${supabaseUrl}/functions/v1/search-candidates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ term: name, near, limit: 15 }),
  });
  if (!res.ok) throw new Error(`search-candidates ${res.status}`);
  const json = await res.json();
  const cands = Array.isArray(json?.candidates) ? json.candidates : [];
  return cands.map((c: Record<string, unknown>) => ({
    name: String(c.name ?? ''),
    lat: Number(c.lat),
    lng: Number(c.lng),
    distanceKm: typeof c.distanceKm === 'number' ? c.distanceKm : undefined,
    source: (c.source as string) ?? undefined,
    country: (c.country as string) ?? undefined,
    region: (c.region as string) ?? undefined,
    locality: (c.locality as string) ?? undefined,
  }));
}

/**
 * R9 — assert that `name` is compatible with `(lat, lng)`.
 *
 * Hard-block policy: if BOTH lookups fail/timeout, returns
 * `identity_lookup_unavailable` (caller MUST NOT call the LLM).
 */
export async function assertNameCoordinateIdentity(
  opts: AssertIdentityOptions,
): Promise<IdentityResult> {
  const {
    name, lat, lng, supabaseUrl, serviceKey,
    nearbyRadiusMeters = DEFAULT_NEARBY_RADIUS_M,
    farThresholdMeters = DEFAULT_FAR_THRESHOLD_M,
    matchThreshold = DEFAULT_MATCH_THRESHOLD,
    searchNearby, searchCandidates,
  } = opts;

  const runNearby = searchNearby
    ?? ((la, ln, r) => defaultSearchNearby(supabaseUrl, serviceKey, la, ln, r));
  const generic = isGenericName(name);
  const runCandidates = generic
    ? null
    : (searchCandidates
        ?? ((nm, nr) => defaultSearchCandidates(supabaseUrl, serviceKey, nm, nr)));

  const nearbyP = runNearby(lat, lng, nearbyRadiusMeters)
    .then((r) => ({ ok: true as const, value: r }))
    .catch((e) => ({ ok: false as const, error: e }));
  const candidatesP = runCandidates
    ? runCandidates(name, { lat, lng })
        .then((r) => ({ ok: true as const, value: r }))
        .catch((e) => ({ ok: false as const, error: e }))
    : Promise.resolve({ ok: true as const, value: [] as RemoteCandidate[] });

  const [nearbyR, candidatesR] = await Promise.all([nearbyP, candidatesP]);

  // HARD BLOCK: both lookups failed.
  if (!nearbyR.ok && !candidatesR.ok) {
    return { status: 'identity_lookup_unavailable', reason: 'both_lookups_failed' };
  }
  // Generic name: only signal is nearby. If it failed we cannot judge.
  if (generic && !nearbyR.ok) {
    return { status: 'identity_lookup_unavailable', reason: 'nearby_lookup_failed_generic_name' };
  }

  const nearbyList: NearbyCandidate[] = nearbyR.ok ? nearbyR.value : [];
  const candidatesList: RemoteCandidate[] = candidatesR.ok ? candidatesR.value : [];

  let best: { c: NearbyCandidate; score: number } | null = null;
  for (const c of nearbyList) {
    const s = similarity(name, c.name);
    if (!best || s > best.score) best = { c, score: s };
  }
  if (best && best.score >= matchThreshold) {
    return { status: 'ok', matched: best.c };
  }

  if (generic && nearbyList.length === 0) {
    return { status: 'ok' };
  }

  if (candidatesList.length > 0) {
    const withDist = candidatesList.map((c) => ({
      c,
      meters: typeof c.distanceKm === 'number'
        ? c.distanceKm * 1000
        : haversineMeters(lat, lng, c.lat, c.lng),
    }));
    const allFar = withDist.every((x) => x.meters > farThresholdMeters);
    if (allFar) {
      const top = withDist
        .sort((a, b) => a.meters - b.meters)
        .slice(0, 5)
        .map((x) => x.c);
      return { status: 'name_found_elsewhere', candidates: top };
    }
  }

  return {
    status: 'name_coordinate_mismatch',
    nearby: nearbyList.slice(0, 5),
  };
}
