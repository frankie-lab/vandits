import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/microsoft_onedrive';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeoPhoto {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  takenDateTime: string | null;
  thumbnailUrl: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ONEDRIVE_API_KEY = Deno.env.get('MICROSOFT_ONEDRIVE_API_KEY');
  if (!ONEDRIVE_API_KEY) {
    return new Response(JSON.stringify({ error: 'MICROSOFT_ONEDRIVE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { folderId, recursive } = await req.json();

    const headers = {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': ONEDRIVE_API_KEY,
    };

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'];
    const geoPhotos: GeoPhoto[] = [];
    let totalScanned = 0;

    // Scan a single folder, paginating through all results
    async function scanFolder(folderIdToScan: string | null): Promise<void> {
      const path = folderIdToScan
        ? `me/drive/items/${folderIdToScan}/children`
        : 'me/drive/root/children';

      let nextLink: string | null = `${GATEWAY_URL}/${path}?$top=200&$select=name,id,file,image,photo,location,thumbnails,folder&$expand=thumbnails`;

      while (nextLink) {
        const response = await fetch(nextLink, { headers });
        if (!response.ok) {
          const err = await response.text();
          console.error(`OneDrive API error [${response.status}]: ${err}`);
          break;
        }
        const data = await response.json();
        const items = data.value || [];

        for (const item of items) {
          // If recursive and it's a folder, scan it too
          if (recursive && item.folder) {
            await scanFolder(item.id);
            continue;
          }

          // Skip non-image files
          if (!item.file) continue;
          const name = (item.name || '').toLowerCase();
          const isImage = imageExtensions.some(ext => name.endsWith(ext)) ||
            (item.file.mimeType && item.file.mimeType.startsWith('image/'));
          if (!isImage) continue;

          totalScanned++;

          // Only collect geolocated photos
          const loc = item.location;
          if (loc && loc.latitude != null && loc.longitude != null) {
            const thumbs = item.thumbnails?.[0] || {};
            geoPhotos.push({
              id: item.id,
              name: item.name,
              latitude: loc.latitude,
              longitude: loc.longitude,
              altitude: loc.altitude ?? null,
              takenDateTime: item.photo?.takenDateTime || null,
              thumbnailUrl: thumbs.small?.url || thumbs.medium?.url || null,
            });
          }
        }

        nextLink = data['@odata.nextLink'] || null;
      }
    }

    await scanFolder(folderId || null);

    return new Response(JSON.stringify({
      totalScanned,
      geoPhotos,
      geoCount: geoPhotos.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Geo scan error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
