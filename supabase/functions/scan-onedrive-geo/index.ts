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
  folderPath: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Auth client to verify user
  const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Service client to write to DB (bypasses RLS)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { folderId, recursive } = await req.json();

    const headers = {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': ONEDRIVE_API_KEY,
    };

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'];
    const geoPhotos: GeoPhoto[] = [];
    let totalScanned = 0;

    async function scanFolder(folderIdToScan: string | null, folderPath: string): Promise<void> {
      const basePath = folderIdToScan
        ? `me/drive/items/${folderIdToScan}/children`
        : 'me/drive/root/children';

      let url: string | null = `${GATEWAY_URL}/${basePath}?$top=200&$select=name,id,file,image,photo,location,thumbnails,folder&$expand=thumbnails`;

      while (url) {
        console.log(`Scanning: ${url.substring(0, 120)}...`);
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const err = await response.text();
          console.error(`OneDrive API error [${response.status}]: ${err}`);
          break;
        }
        const data = await response.json();
        const items = data.value || [];
        console.log(`Got ${items.length} items in page`);

        const subfolders: { id: string; name: string }[] = [];

        for (const item of items) {
          if (recursive && item.folder) {
            subfolders.push({ id: item.id, name: item.name });
            continue;
          }

          if (!item.file) continue;
          const name = (item.name || '').toLowerCase();
          const isImage = imageExtensions.some(ext => name.endsWith(ext)) ||
            (item.file.mimeType && item.file.mimeType.startsWith('image/'));
          if (!isImage) continue;

          totalScanned++;

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
              folderPath: folderPath || '/',
              cameraMake: item.photo?.cameraMake || null,
              cameraModel: item.photo?.cameraModel || null,
            });
          }
        }

        const rawNextLink: string | undefined = data['@odata.nextLink'];
        if (rawNextLink) {
          const skipTokenMatch = rawNextLink.match(/\$skiptoken=([^&]+)/i);
          if (skipTokenMatch) {
            url = `${GATEWAY_URL}/${basePath}?$top=200&$select=name,id,file,image,photo,location,thumbnails,folder&$expand=thumbnails&$skiptoken=${skipTokenMatch[1]}`;
          } else {
            const replaced = rawNextLink.replace(/https:\/\/graph\.microsoft\.com\/v1\.0\//, `${GATEWAY_URL}/`);
            url = replaced !== rawNextLink ? replaced : null;
          }
        } else {
          url = null;
        }

        for (const sub of subfolders) {
          await scanFolder(sub.id, `${folderPath}/${sub.name}`);
        }
      }
    }

    await scanFolder(folderId || null, '');

    console.log(`Scan complete: ${totalScanned} images scanned, ${geoPhotos.length} with GPS`);

    // Persist to DB — upsert all geo photos
    if (geoPhotos.length > 0) {
      const BATCH_SIZE = 100;
      let savedCount = 0;
      for (let i = 0; i < geoPhotos.length; i += BATCH_SIZE) {
        const batch = geoPhotos.slice(i, i + BATCH_SIZE).map(p => ({
          user_id: user.id,
          onedrive_id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
          altitude: p.altitude,
          taken_at: p.takenDateTime,
          folder_path: p.folderPath,
          camera_make: p.cameraMake,
          camera_model: p.cameraModel,
          thumbnail_url: p.thumbnailUrl,
        }));

        const { error: upsertError } = await supabaseAdmin
          .from('onedrive_photo_index')
          .upsert(batch, { onConflict: 'user_id,onedrive_id' });

        if (upsertError) {
          console.error('Upsert error:', upsertError);
        } else {
          savedCount += batch.length;
        }
      }
      console.log(`Persisted ${savedCount} photos to index`);
    }

    return new Response(JSON.stringify({
      totalScanned,
      geoCount: geoPhotos.length,
      persisted: true,
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
