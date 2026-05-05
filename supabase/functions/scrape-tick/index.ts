// Background scrape worker. Invoked every minute by pg_cron.
// Picks running jobs whose next_tick_at is due, processes a small batch
// with jitter and long pauses to look like human traffic.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const UA = 'Mozilla/5.0 (compatible; VanditsBot/1.0; +https://vandits.lovable.app)';
const FETCH_TIMEOUT_MS = 12_000;
const TICK_BUDGET_MS = 50_000;
const MAX_JOBS_PER_TICK = 5;

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

interface ScraperAdapter {
  source: string;
  matches(u: URL): boolean;
  detectKind(u: URL): 'list' | 'item' | null;
  fetchListPage(u: URL, page: number): Promise<{ itemUrls: string[]; hasMore: boolean }>;
  fetchItem(u: URL): Promise<ScrapedPlace | null>;
}

// ---------------- helpers ----------------

function rand(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function jitter(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function fetchText(url: string): Promise<{ html: string | null; status: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' },
      signal: ctrl.signal,
    });
    if (!res.ok) return { html: null, status: res.status };
    return { html: await res.text(), status: res.status };
  } catch {
    return { html: null, status: 0 };
  } finally { clearTimeout(t); }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* skip */ }
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
      if (types.some((t) => /Place|TouristAttraction|LocalBusiness|Landmark/i.test(t))) {
        return c as Record<string, any>;
      }
    }
  }
  return null;
}
function parsePlaceJsonLd(html: string, url: string): ScrapedPlace | null {
  const ld = findPlaceJsonLd(html);
  if (!ld) return null;
  const geo = ld.geo as Record<string, any> | undefined;
  const lat = Number(geo?.latitude);
  const lng = Number(geo?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const addr = ld.address as Record<string, any> | undefined;
  return {
    url,
    name: typeof ld.name === 'string' ? ld.name : 'Unnamed',
    description: typeof ld.description === 'string' ? ld.description : undefined,
    latitude: lat,
    longitude: lng,
    country: typeof addr?.addressCountry === 'string' ? addr.addressCountry : undefined,
    region: typeof addr?.addressRegion === 'string' ? addr.addressRegion : undefined,
    locality: typeof addr?.addressLocality === 'string' ? addr.addressLocality : undefined,
    image: typeof ld.image === 'string' ? ld.image : Array.isArray(ld.image) ? ld.image[0] : undefined,
  };
}

// ---------------- adapters ----------------

const atlasAdapter: ScraperAdapter = {
  source: 'atlas_obscura',
  matches: (u) => u.hostname.endsWith('atlasobscura.com'),
  detectKind(u) {
    if (/^\/places\/[^/]+\/?$/.test(u.pathname)) return 'item';
    if (/^\/things-to-do\//.test(u.pathname) || /^\/categories\//.test(u.pathname) || /^\/lists\//.test(u.pathname)) return 'list';
    return null;
  },
  async fetchListPage(u, page) {
    const url = page === 1 ? u.toString() : (() => {
      const x = new URL(u.toString());
      x.searchParams.set('page', String(page));
      return x.toString();
    })();
    const { html } = await fetchText(url);
    if (!html) return { itemUrls: [], hasMore: false };
    const set = new Set<string>();
    const re = /\/places\/([a-z0-9-]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (m[1] === 'new') continue;
      set.add(`https://www.atlasobscura.com/places/${m[1]}`);
    }
    return { itemUrls: [...set], hasMore: set.size > 0 };
  },
  async fetchItem(u) {
    const { html } = await fetchText(u.toString());
    if (!html) return null;
    const place = parsePlaceJsonLd(html, u.toString());
    if (!place) return null;
    // tags from category links
    const tags = new Set<string>();
    const re = /href="\/categories\/([a-z0-9-]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const human = '#' + m[1].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      tags.add(human);
    }
    place.tags = [...tags].slice(0, 12);
    return place;
  },
};

const genericJsonLdAdapter: ScraperAdapter = {
  source: 'generic_jsonld',
  matches: () => true,
  detectKind(u) {
    // Heuristic: treat as item if path looks specific (3+ segments). Not a list crawler.
    return u.pathname.split('/').filter(Boolean).length >= 1 ? 'item' : null;
  },
  async fetchListPage() { return { itemUrls: [], hasMore: false }; },
  async fetchItem(u) {
    const { html } = await fetchText(u.toString());
    if (!html) return null;
    return parsePlaceJsonLd(html, u.toString());
  },
};

const adapters: ScraperAdapter[] = [atlasAdapter, genericJsonLdAdapter];

function pickAdapter(seed: string): { adapter: ScraperAdapter; url: URL } | null {
  try {
    const u = new URL(seed);
    const a = adapters.find((x) => x.matches(u)) ?? genericJsonLdAdapter;
    return { adapter: a, url: u };
  } catch { return null; }
}

// ---------------- worker ----------------

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function ensureDocument(job: any): Promise<string> {
  if (job.document_id) return job.document_id;
  const name = `Web import — ${new URL(job.seed_url).hostname}`;
  const { data, error } = await supabase.from('documents').insert({
    user_id: job.user_id,
    name,
    source_type: 'web_import',
    status: 'draft',
    import_status: 'reviewing',
    metadata: { source: job.source, seed_url: job.seed_url, scrape_job_id: job.id },
  }).select('id').single();
  if (error) throw error;
  await supabase.from('scrape_jobs').update({ document_id: data.id }).eq('id', job.id);
  return data.id;
}

async function persistPlace(job: any, documentId: string, place: ScrapedPlace): Promise<string | null> {
  // Dedupe within job
  const { data: existing } = await supabase
    .from('locations')
    .select('id')
    .eq('owner_user_id', job.user_id)
    .gte('latitude', place.latitude - 0.003)
    .lte('latitude', place.latitude + 0.003)
    .gte('longitude', place.longitude - 0.003)
    .lte('longitude', place.longitude + 0.003)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return null;

  const { data, error } = await supabase.from('locations').insert({
    document_id: documentId,
    owner_user_id: job.user_id,
    name: place.name,
    description: place.description ?? null,
    latitude: place.latitude,
    longitude: place.longitude,
    country: place.country ?? null,
    region: place.region ?? null,
    is_approved: false,
    visibility: job.default_visibility ?? 'followers',
    custom_data: {
      source: job.source,
      source_url: place.url,
      image: place.image ?? null,
      tags: place.tags ?? [],
      locality: place.locality ?? null,
      auto_enrich: job.auto_enrich === true,
    },
  }).select('id').single();
  if (error) {
    console.error('insert location error', error);
    return null;
  }
  return data.id;
}

async function processJob(job: any, deadline: number): Promise<void> {
  const picked = pickAdapter(job.seed_url);
  if (!picked) {
    await supabase.from('scrape_jobs').update({ status: 'error', error_message: 'Invalid URL' }).eq('id', job.id);
    return;
  }
  const { adapter, url } = picked;

  // Seed first page if no pages and no items yet
  const { count: pagesCount } = await supabase.from('scrape_job_pages').select('id', { count: 'exact', head: true }).eq('job_id', job.id);
  const { count: itemsCount } = await supabase.from('scrape_job_items').select('id', { count: 'exact', head: true }).eq('job_id', job.id);
  if ((pagesCount ?? 0) === 0 && (itemsCount ?? 0) === 0) {
    const kind = adapter.detectKind(url);
    if (kind === 'list') {
      await supabase.from('scrape_job_pages').insert({ job_id: job.id, url: url.toString(), page_number: 1 });
    } else if (kind === 'item') {
      await supabase.from('scrape_job_items').insert({ job_id: job.id, url: url.toString() });
    } else {
      await supabase.from('scrape_jobs').update({ status: 'error', error_message: 'URL not recognized' }).eq('id', job.id);
      return;
    }
  }

  const documentId = await ensureDocument(job);

  // Step A: process one pending list page
  const { data: page } = await supabase
    .from('scrape_job_pages')
    .select('*')
    .eq('job_id', job.id)
    .eq('status', 'pending')
    .order('page_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (page) {
    if (Date.now() > deadline) return;
    const pageUrl = new URL(page.url);
    const { itemUrls, hasMore } = await adapter.fetchListPage(pageUrl, page.page_number);
    let newCount = 0;
    if (itemUrls.length) {
      const limit = job.max_items ? Math.max(0, job.max_items - (job.items_found ?? 0)) : Infinity;
      const slice = itemUrls.slice(0, isFinite(limit) ? limit : itemUrls.length);
      const rows = slice.map((u) => ({ job_id: job.id, url: u }));
      const { error } = await supabase.from('scrape_job_items').upsert(rows, { onConflict: 'job_id,url', ignoreDuplicates: true });
      if (!error) newCount = rows.length;
    }
    await supabase.from('scrape_job_pages').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', page.id);

    // Schedule next page if list might continue and within budget
    if (hasMore && itemUrls.length > 0 && (!job.max_items || (job.items_found ?? 0) + newCount < job.max_items)) {
      const nextNum = page.page_number + 1;
      if (nextNum <= 50) {
        const x = new URL(pageUrl.toString());
        x.searchParams.set('page', String(nextNum));
        await supabase.from('scrape_job_pages').insert({ job_id: job.id, url: x.toString(), page_number: nextNum }).select().maybeSingle();
      }
    }

    const nextTick = new Date(Date.now() + rand(job.min_tick_seconds, job.max_tick_seconds) * 1000).toISOString();
    await supabase.from('scrape_jobs').update({
      pages_seen: (job.pages_seen ?? 0) + 1,
      items_found: (job.items_found ?? 0) + newCount,
      last_tick_at: new Date().toISOString(),
      next_tick_at: nextTick,
    }).eq('id', job.id);
    return;
  }

  // Step B: process up to rate_per_tick items
  const { data: items } = await supabase
    .from('scrape_job_items')
    .select('*')
    .eq('job_id', job.id)
    .eq('status', 'pending')
    .limit(job.rate_per_tick);

  if (!items || items.length === 0) {
    // Job done
    await supabase.from('scrape_jobs').update({ status: 'done', last_tick_at: new Date().toISOString() }).eq('id', job.id);
    return;
  }

  let imported = 0;
  let skipped = 0;
  let itemsUntilPause = job.items_until_pause;
  let pausedUntil: string | null = null;
  let rateLimitHit = false;

  for (const it of items) {
    if (Date.now() > deadline) break;
    if (job.max_items && (job.items_imported ?? 0) + imported >= job.max_items) break;

    await jitter(rand(800, 2500));
    try {
      const place = await adapter.fetchItem(new URL(it.url));
      if (!place) {
        await supabase.from('scrape_job_items').update({
          status: 'skipped', processed_at: new Date().toISOString(), attempts: (it.attempts ?? 0) + 1, error: 'no place data',
        }).eq('id', it.id);
        skipped++;
        continue;
      }
      const locId = await persistPlace(job, documentId, place);
      await supabase.from('scrape_job_items').update({
        status: locId ? 'done' : 'skipped',
        location_id: locId,
        processed_at: new Date().toISOString(),
        attempts: (it.attempts ?? 0) + 1,
      }).eq('id', it.id);
      if (locId) imported++; else skipped++;

      itemsUntilPause -= 1;
      if (itemsUntilPause <= 0) {
        const pauseMin = rand(job.pause_duration_min_minutes, job.pause_duration_max_minutes);
        pausedUntil = new Date(Date.now() + pauseMin * 60_000).toISOString();
        itemsUntilPause = rand(job.pause_after_min, job.pause_after_max);
        break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = (it.attempts ?? 0) + 1;
      await supabase.from('scrape_job_items').update({
        status: attempts >= 3 ? 'error' : 'pending',
        attempts, error: msg,
      }).eq('id', it.id);
      if (/429|403/.test(msg)) { rateLimitHit = true; break; }
    }
  }

  if (rateLimitHit) {
    pausedUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  }

  const nextTick = new Date(Date.now() + rand(job.min_tick_seconds, job.max_tick_seconds) * 1000).toISOString();
  await supabase.from('scrape_jobs').update({
    items_imported: (job.items_imported ?? 0) + imported,
    items_skipped: (job.items_skipped ?? 0) + skipped,
    items_until_pause: itemsUntilPause,
    paused_until: pausedUntil ?? job.paused_until,
    next_tick_at: nextTick,
    last_tick_at: new Date().toISOString(),
  }).eq('id', job.id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const deadline = Date.now() + TICK_BUDGET_MS;
  const nowIso = new Date().toISOString();

  const { data: jobs, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('status', 'running')
    .lte('next_tick_at', nowIso)
    .or(`paused_until.is.null,paused_until.lte.${nowIso}`)
    .order('next_tick_at', { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  if (error) {
    console.error('fetch jobs', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  for (const job of jobs ?? []) {
    if (Date.now() > deadline) break;
    try {
      await processJob(job, deadline);
      processed++;
    } catch (e) {
      console.error('job error', job.id, e);
      await supabase.from('scrape_jobs').update({
        error_message: e instanceof Error ? e.message : String(e),
      }).eq('id', job.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, scanned: jobs?.length ?? 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
