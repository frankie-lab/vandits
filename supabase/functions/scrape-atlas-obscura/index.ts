// Atlas Obscura scraper
// Accepts a /things-to-do/<slug> listing URL or a /places/<slug> single URL
// and returns a normalized payload the frontend can feed into the existing
// import flow as a synthetic KMLDocument.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UA = 'Mozilla/5.0 (compatible; VanditsBot/1.0; +https://vandits.lovable.app)';
const PLACE_HOST = 'https://www.atlasobscura.com';
const FETCH_TIMEOUT_MS = 12_000;
const TOTAL_BUDGET_MS = 110_000;
const CONCURRENCY = 6;

type ScrapedPlace = {
  url: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  country?: string;
  region?: string;
  locality?: string;
  image?: string;
  tags?: string[];
};

type ScrapeResponse =
  | { ok: true; documentName: string; sourceUrl: string; places: ScrapedPlace[]; skipped: number }
  | { ok: false; error: string };

function isAtlasUrl(value: string): { kind: 'place' | 'list' | 'invalid'; url: URL | null } {
  try {
    const u = new URL(value);
    if (!u.hostname.endsWith('atlasobscura.com')) return { kind: 'invalid', url: null };
    if (/^\/places\/[^/]+\/?$/.test(u.pathname)) return { kind: 'place', url: u };
    if (/^\/things-to-do\/[^?#]+/.test(u.pathname)) return { kind: 'list', url: u };
    return { kind: 'invalid', url: null };
  } catch {
    return { kind: 'invalid', url: null };
  }
}

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    try { out.push(JSON.parse(raw)); } catch { /* skip */ }
  }
  return out;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function findPlaceJsonLd(html: string): Record<string, any> | null {
  for (const block of extractJsonLdBlocks(html)) {
    const candidates = Array.isArray(block) ? block : [block];
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const types = asArray((c as any)['@type']).map(String);
      if (types.includes('Place') || types.includes('TouristAttraction')) {
        return c as Record<string, any>;
      }
    }
  }
  return null;
}

function pickTagsFromHtml(html: string): string[] {
  const tags = new Set<string>();
  const re = /href="\/categories\/([a-z0-9-]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (slug.length < 2) continue;
    const human = '#' + slug.split('-').filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
    tags.add(human);
  }
  return [...tags].slice(0, 12);
}

function parsePlaceHtml(html: string, url: string): ScrapedPlace | null {
  const ld = findPlaceJsonLd(html);
  if (!ld) return null;
  const geo = ld.geo as Record<string, any> | undefined;
  const lat = Number(geo?.latitude);
  const lng = Number(geo?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const addr = ld.address as Record<string, any> | undefined;
  const country = typeof addr?.addressCountry === 'string' ? addr.addressCountry : undefined;
  const region = typeof addr?.addressRegion === 'string' ? addr.addressRegion : undefined;
  const locality = typeof addr?.addressLocality === 'string' ? addr.addressLocality : undefined;

  return {
    url,
    name: typeof ld.name === 'string' ? ld.name : 'Unnamed',
    description: typeof ld.description === 'string' ? ld.description : undefined,
    latitude: lat,
    longitude: lng,
    country: country || undefined,
    region: region || undefined,
    locality: locality || undefined,
    image: typeof ld.image === 'string' ? ld.image : undefined,
    tags: pickTagsFromHtml(html),
  };
}

function extractPlaceLinks(html: string): string[] {
  const out = new Set<string>();
  const re = /\/places\/([a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (slug === 'new') continue;
    out.add(`${PLACE_HOST}/places/${slug}`);
  }
  return [...out];
}

function deriveListingTitle(html: string, listUrl: URL): string {
  const t = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  if (t) return t.replace(/\s*\|\s*Atlas Obscura.*$/i, '').trim();
  return `Atlas Obscura — ${listUrl.pathname.replace(/^\/+/, '')}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function scrapeListing(listUrl: URL, maxItems: number, deadline: number): Promise<ScrapeResponse> {
  const seen = new Set<string>();
  // Walk pages until we have enough or pages stop yielding new links.
  let page = 1;
  while (seen.size < maxItems && page <= 10) {
    const url = page === 1 ? listUrl.toString() : (() => {
      const u = new URL(listUrl.toString());
      u.searchParams.set('page', String(page));
      return u.toString();
    })();
    const html = await fetchText(url);
    if (!html) break;
    if (page === 1) {
      // Capture title from first page later
      (listUrl as any)._firstHtml = html;
    }
    const before = seen.size;
    for (const link of extractPlaceLinks(html)) {
      seen.add(link);
      if (seen.size >= maxItems) break;
    }
    if (seen.size === before) break; // no new links → stop
    page++;
    if (Date.now() > deadline - 30_000) break;
  }

  const links = [...seen].slice(0, maxItems);
  const places: ScrapedPlace[] = [];
  let skipped = 0;

  await mapWithConcurrency(links, CONCURRENCY, async (link) => {
    if (Date.now() > deadline) { skipped++; return; }
    const html = await fetchText(link);
    if (!html) { skipped++; return; }
    const parsed = parsePlaceHtml(html, link);
    if (!parsed) { skipped++; return; }
    places.push(parsed);
  });

  const firstHtml = (listUrl as any)._firstHtml as string | undefined;
  const documentName = firstHtml ? deriveListingTitle(firstHtml, listUrl) : `Atlas Obscura — ${listUrl.pathname}`;

  return { ok: true, documentName, sourceUrl: listUrl.toString(), places, skipped };
}

async function scrapeSingle(placeUrl: URL): Promise<ScrapeResponse> {
  const html = await fetchText(placeUrl.toString());
  if (!html) return { ok: false, error: 'Could not fetch the Atlas Obscura page.' };
  const parsed = parsePlaceHtml(html, placeUrl.toString());
  if (!parsed) return { ok: false, error: 'No coordinates found on that page.' };
  return {
    ok: true,
    documentName: parsed.name,
    sourceUrl: placeUrl.toString(),
    places: [parsed],
    skipped: 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { url?: unknown; maxItems?: unknown };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  const maxItems = Math.max(1, Math.min(200, Number(body.maxItems) || 30));
  const detection = isAtlasUrl(rawUrl);
  if (detection.kind === 'invalid' || !detection.url) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'URL must be from atlasobscura.com (/places/... or /things-to-do/...).',
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const result = detection.kind === 'place'
    ? await scrapeSingle(detection.url)
    : await scrapeListing(detection.url, maxItems, deadline);

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 502,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
