// Server-side fetcher for remote KML/KMZ resources referenced from a KMZ <NetworkLink>.
// Avoids browser CORS and returns the content as base64 + content-type so the client
// can decide whether to parse it as text (KML) or binary (KMZ).
import { corsHeaders } from '@supabase/supabase-js/cors';

interface FetchRequest {
  url: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as FetchRequest;
    const url = body?.url;
    if (!url || typeof url !== 'string' || !isHttpUrl(url)) {
      return new Response(
        JSON.stringify({ error: 'A valid http(s) URL is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const upstream = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Vandits-KML-Resolver/1.0' },
    });
    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Remote responded ${upstream.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = await upstream.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    return new Response(
      JSON.stringify({ contentType, base64, byteLength: buffer.byteLength }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
