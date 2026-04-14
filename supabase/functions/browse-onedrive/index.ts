import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/microsoft_onedrive';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  try {
    const { action, folderId, nextLink } = await req.json();
    const headers = {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': ONEDRIVE_API_KEY,
    };

    if (action === 'list-folders') {
      // List folders at root or inside a specific folder
      const path = folderId
        ? `me/drive/items/${folderId}/children`
        : 'me/drive/root/children';
      const url = nextLink || `${GATEWAY_URL}/${path}?$filter=folder ne null&$top=50&$orderby=name&$select=name,id,folder,parentReference`;
      
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OneDrive API error [${response.status}]: ${err}`);
      }
      const data = await response.json();
      
      return new Response(JSON.stringify({
        folders: (data.value || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          childCount: item.folder?.childCount || 0,
        })),
        nextLink: data['@odata.nextLink'] || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list-photos') {
      // List image files in a folder (or root)
      let url: string;
      if (nextLink) {
        // Handle pagination: extract skiptoken from nextLink and reconstruct through gateway
        const skipTokenMatch = nextLink.match(/\$skiptoken=([^&]+)/i);
        const basePath = folderId
          ? `me/drive/items/${folderId}/children`
          : 'me/drive/root/children';
        url = skipTokenMatch
          ? `${GATEWAY_URL}/${basePath}?$top=200&$orderby=lastModifiedDateTime desc&$select=name,id,file,image,photo,location,thumbnails,lastModifiedDateTime,size,@microsoft.graph.downloadUrl&$expand=thumbnails&$skiptoken=${skipTokenMatch[1]}`
          : nextLink;
      } else {
        const path = folderId
          ? `me/drive/items/${folderId}/children`
          : 'me/drive/root/children';
        url = `${GATEWAY_URL}/${path}?$top=200&$orderby=lastModifiedDateTime desc&$select=name,id,file,image,photo,location,thumbnails,lastModifiedDateTime,size,@microsoft.graph.downloadUrl&$expand=thumbnails`;
      }
      
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OneDrive API error [${response.status}]: ${err}`);
      }
      const data = await response.json();
      
      // Filter to only image files
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'];
      const photos = (data.value || [])
        .filter((item: any) => {
          if (!item.file) return false;
          const name = (item.name || '').toLowerCase();
          return imageExtensions.some(ext => name.endsWith(ext)) ||
            (item.file.mimeType && item.file.mimeType.startsWith('image/'));
        })
        .map((item: any) => {
          const thumbs = item.thumbnails?.[0] || {};
          const loc = item.location || null;
          const photo = item.photo || null;
          return {
            id: item.id,
            name: item.name,
            downloadUrl: item['@microsoft.graph.downloadUrl'] || null,
            thumbnailUrl: thumbs.medium?.url || thumbs.small?.url || null,
            largeThumbnailUrl: thumbs.large?.url || null,
            width: item.image?.width || null,
            height: item.image?.height || null,
            size: item.size || null,
            lastModified: item.lastModifiedDateTime || null,
            location: loc ? {
              latitude: loc.latitude ?? null,
              longitude: loc.longitude ?? null,
              altitude: loc.altitude ?? null,
            } : null,
            camera: photo ? {
              cameraMake: photo.cameraMake || null,
              cameraModel: photo.cameraModel || null,
              takenDateTime: photo.takenDateTime || null,
              focalLength: photo.focalLength || null,
              fNumber: photo.fNumber || null,
              iso: photo.iso || null,
              exposureNumerator: photo.exposureNumerator || null,
              exposureDenominator: photo.exposureDenominator || null,
            } : null,
          };
        });
      
      return new Response(JSON.stringify({
        photos,
        nextLink: data['@odata.nextLink'] || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a temporary download URL for a specific file
    if (action === 'get-download-url') {
      const id = folderId; // reuse folderId as fileId for simplicity
      const response = await fetch(`${GATEWAY_URL}/me/drive/items/${id}?$select=@microsoft.graph.downloadUrl,name`, { headers });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OneDrive API error [${response.status}]: ${err}`);
      }
      const data = await response.json();
      return new Response(JSON.stringify({
        downloadUrl: data['@microsoft.graph.downloadUrl'],
        name: data.name,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a fresh thumbnail URL for a specific file
    if (action === 'get-thumbnail') {
      const id = folderId; // reuse folderId as fileId
      const response = await fetch(`${GATEWAY_URL}/me/drive/items/${id}/thumbnails/0?$select=small,medium,large`, { headers });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OneDrive API error [${response.status}]: ${err}`);
      }
      const data = await response.json();
      return new Response(JSON.stringify({
        small: data.small?.url || null,
        medium: data.medium?.url || null,
        large: data.large?.url || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('OneDrive browse error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
