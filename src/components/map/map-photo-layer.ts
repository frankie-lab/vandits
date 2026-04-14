/**
 * map-photo-layer — Renders OneDrive geolocated photos as thumbnail markers on the map.
 * Loads from the persistent `onedrive_photo_index` table.
 */
import L from 'leaflet';
import { supabase } from '@/integrations/supabase/client';
import { getMarkerSizeConfig, type MarkerSizeEntry } from './useMarkerSizeConfig';
import { getLucideSvgString } from '@/lib/icon-utils';

export interface PhotoIndexEntry {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  thumbnail_url: string | null;
  taken_at: string | null;
  folder_path: string | null;
}

const PHOTO_LAYER_EVENT = 'photo-layer-toggle';
const PHOTO_LAYER_STORAGE_KEY = 'vandits-photo-layer-visible';

let photoLayerGroup: L.LayerGroup | null = null;
let photosLoaded = false;
let cachedPhotos: PhotoIndexEntry[] = [];

function createPhotoIcon(thumbnailUrl: string | null, name: string): L.DivIcon {
  const cfg = getMarkerSizeConfig();
  const entry: MarkerSizeEntry = cfg.photo_thumbnail || { base_normal: 44, base_selected: 52, base_focused: 56, base_recent: 44, hover_size: null, marker_shape: 'square', fill_color: '#6366f1', fill_color_light: '#818cf8' };
  const size = entry.base_normal;
  const radius = entry.marker_shape === 'square' ? '8px' : '50%';
  const imgSrc = thumbnailUrl || '';
  const fallback = name.charAt(0).toUpperCase();

  return L.divIcon({
    className: 'photo-marker-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
    html: imgSrc
      ? `<div class="photo-marker-thumb" style="
          width:${size}px;height:${size}px;border-radius:${radius};overflow:hidden;
          border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          background:#1a1a1a;
        ">
          <img src="${imgSrc}" alt="${name}" 
            style="width:100%;height:100%;object-fit:cover;" 
            onerror="this.style.display='none';this.nextSibling.style.display='flex';"
          />
          <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;
            background:${entry.fill_color};color:white;font-weight:700;font-size:16px;">
            ${fallback}
          </div>
        </div>`
      : `<div style="
          width:${size}px;height:${size}px;border-radius:${radius};overflow:hidden;
          border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          background:${entry.fill_color};display:flex;align-items:center;justify-content:center;
          color:white;font-weight:700;font-size:16px;
        ">${getLucideSvgString('camera', { size: Math.round(size * 0.45), color: 'white', strokeWidth: 2 })}</div>`,
  });
}

function createPhotoPopup(photo: PhotoIndexEntry): string {
  const dateStr = photo.taken_at
    ? new Date(photo.taken_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Fecha desconocida';
  const folder = photo.folder_path || 'Sin carpeta';
  const imgHtml = photo.thumbnail_url
    ? `<img src="${photo.thumbnail_url}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px 8px 0 0;" />`
    : '';

  return `
    <div style="min-width:220px;max-width:300px;">
      ${imgHtml}
      <div style="padding:10px 12px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:4px;word-break:break-word;">${photo.name}</div>
        <div style="font-size:11px;color:#6b7280;">📅 ${dateStr}</div>
        <div style="font-size:11px;color:#6b7280;">📁 ${folder}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px;">
          ${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}
        </div>
      </div>
    </div>
  `;
}

async function loadPhotos(): Promise<PhotoIndexEntry[]> {
  if (photosLoaded && cachedPhotos.length > 0) return cachedPhotos;

  const { data, error } = await supabase
    .from('onedrive_photo_index')
    .select('id, name, latitude, longitude, thumbnail_url, taken_at, folder_path')
    .order('taken_at', { ascending: false });

  if (error) {
    console.error('Error loading photo index:', error);
    return [];
  }

  cachedPhotos = (data || []) as PhotoIndexEntry[];
  photosLoaded = true;
  return cachedPhotos;
}

export function isPhotoLayerVisible(): boolean {
  try {
    return localStorage.getItem(PHOTO_LAYER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setPhotoLayerVisible(visible: boolean) {
  localStorage.setItem(PHOTO_LAYER_STORAGE_KEY, String(visible));
  window.dispatchEvent(new CustomEvent(PHOTO_LAYER_EVENT, { detail: { visible } }));
}

export function togglePhotoLayer() {
  setPhotoLayerVisible(!isPhotoLayerVisible());
}

export async function initPhotoLayer(map: L.Map) {
  if (!photoLayerGroup) {
    photoLayerGroup = L.layerGroup();
  }

  if (isPhotoLayerVisible()) {
    await showPhotoMarkers(map);
  }

  // Listen for toggle events
  const handler = async (e: Event) => {
    const visible = (e as CustomEvent).detail?.visible;
    if (visible) {
      await showPhotoMarkers(map);
    } else {
      hidePhotoMarkers(map);
    }
  };

  window.addEventListener(PHOTO_LAYER_EVENT, handler);

  return () => {
    window.removeEventListener(PHOTO_LAYER_EVENT, handler);
    hidePhotoMarkers(map);
    photoLayerGroup = null;
    photosLoaded = false;
    cachedPhotos = [];
  };
}

async function showPhotoMarkers(map: L.Map) {
  if (!photoLayerGroup) {
    photoLayerGroup = L.layerGroup();
  }

  photoLayerGroup.clearLayers();

  const photos = await loadPhotos();

  photos.forEach(photo => {
    const marker = L.marker([photo.latitude, photo.longitude], {
      icon: createPhotoIcon(photo.thumbnail_url, photo.name),
      zIndexOffset: -100, // Below location markers
    });

    marker.bindPopup(createPhotoPopup(photo), {
      maxWidth: 320,
      minWidth: 220,
      className: 'custom-popup',
    });

    photoLayerGroup!.addLayer(marker);
  });

  if (!map.hasLayer(photoLayerGroup)) {
    photoLayerGroup.addTo(map);
  }
}

function hidePhotoMarkers(map: L.Map) {
  if (photoLayerGroup && map.hasLayer(photoLayerGroup)) {
    map.removeLayer(photoLayerGroup);
  }
}

/** Force reload from DB (after audit) */
export function invalidatePhotoCache() {
  photosLoaded = false;
  cachedPhotos = [];
}

export { PHOTO_LAYER_EVENT };
