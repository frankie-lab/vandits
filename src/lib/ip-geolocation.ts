// Centralized IP-based geolocation helper.
// Tries several CORS-friendly providers in order until one returns valid coords.
// Returns null if all fail.

export type IpGeoResult = {
  lat: number;
  lng: number;
  accuracy: number; // meters (approximate)
  source: 'ip';
  provider: string;
  city?: string;
  country?: string;
};

type Provider = {
  name: string;
  url: string;
  parse: (data: any) => { lat: number; lng: number; city?: string; country?: string } | null;
};

const PROVIDERS: Provider[] = [
  {
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    parse: (d) =>
      typeof d?.latitude === 'number' && typeof d?.longitude === 'number'
        ? { lat: d.latitude, lng: d.longitude, city: d.city, country: d.country_name }
        : null,
  },
  {
    name: 'geojs.io',
    url: 'https://get.geojs.io/v1/ip/geo.json',
    parse: (d) => {
      const lat = parseFloat(d?.latitude);
      const lng = parseFloat(d?.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng, city: d.city, country: d.country }
        : null;
    },
  },
  {
    name: 'ipwho.is',
    url: 'https://ipwho.is/',
    parse: (d) =>
      d?.success && typeof d?.latitude === 'number' && typeof d?.longitude === 'number'
        ? { lat: d.latitude, lng: d.longitude, city: d.city, country: d.country }
        : null,
  },
];

export async function fetchIpGeolocation(timeoutMs = 5000): Promise<IpGeoResult | null> {
  for (const provider of PROVIDERS) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(provider.url, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!response.ok) {
        console.warn(`[ip-geo] ${provider.name} HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const parsed = provider.parse(data);
      if (parsed) {
        console.log(`[ip-geo] resolved via ${provider.name}:`, parsed);
        return {
          ...parsed,
          accuracy: 25000,
          source: 'ip',
          provider: provider.name,
        };
      }
      console.warn(`[ip-geo] ${provider.name} returned no usable coords`, data);
    } catch (error) {
      console.warn(`[ip-geo] ${provider.name} failed:`, error);
    }
  }
  return null;
}
