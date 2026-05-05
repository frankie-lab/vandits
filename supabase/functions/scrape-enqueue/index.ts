// Enqueue a background scraping job
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function detectSource(urlStr: string): { source: string; ok: boolean } {
  try {
    const u = new URL(urlStr);
    if (u.hostname.endsWith('atlasobscura.com')) return { source: 'atlas_obscura', ok: true };
    return { source: 'generic_jsonld', ok: true };
  } catch { return { source: 'unknown', ok: false }; }
}

const PRESETS = {
  slow: { rate_per_tick: 2, min_tick_seconds: 90, max_tick_seconds: 240, pause_after_min: 25, pause_after_max: 50, pause_duration_min_minutes: 10, pause_duration_max_minutes: 30 },
  normal: { rate_per_tick: 3, min_tick_seconds: 60, max_tick_seconds: 180, pause_after_min: 25, pause_after_max: 75, pause_duration_min_minutes: 5, pause_duration_max_minutes: 20 },
  fast: { rate_per_tick: 5, min_tick_seconds: 45, max_tick_seconds: 120, pause_after_min: 50, pause_after_max: 120, pause_duration_min_minutes: 3, pause_duration_max_minutes: 10 },
} as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claims } = await supabase.auth.getClaims(token);
  if (!claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const userId = claims.claims.sub;

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  const preset = (body?.preset ?? 'normal') as keyof typeof PRESETS;
  const maxItems = body?.maxItems ? Math.max(1, Math.min(10000, Number(body.maxItems))) : null;

  const det = detectSource(url);
  if (!det.ok) return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const cfg = PRESETS[preset] ?? PRESETS.normal;

  const { data, error } = await supabase.from('scrape_jobs').insert({
    user_id: userId,
    source: det.source,
    seed_url: url,
    status: 'running',
    max_items: maxItems,
    items_until_pause: Math.floor((cfg.pause_after_min + cfg.pause_after_max) / 2),
    next_tick_at: new Date().toISOString(),
    ...cfg,
  }).select('*').single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true, job: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
