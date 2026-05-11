/**
 * Geocode lazy para village entries sin coords.
 * Usa Nominatim con "name, country" — gratuito, sin key.
 */

const NOMINATIM_UA = 'vandits-village-catalogs/1.0 (+https://vandits.lovable.app)';

const memo = new Map<string, { lat: number; lng: number } | null>();

export async function geocodeName(
  name: string,
  countryCode: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const key = `${name}|${countryCode ?? ''}`.toLowerCase();
  if (memo.has(key)) return memo.get(key)!;
  try {
    const params = new URLSearchParams({
      format: 'json',
      q: name,
      limit: '1',
      'accept-language': 'es',
    });
    if (countryCode && countryCode !== '*') params.set('countrycodes', countryCode.toLowerCase());
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': NOMINATIM_UA },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      memo.set(key, null);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      memo.set(key, null);
      return null;
    }
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      memo.set(key, null);
      return null;
    }
    const out = { lat, lng };
    memo.set(key, out);
    return out;
  } catch {
    memo.set(key, null);
    return null;
  }
}
