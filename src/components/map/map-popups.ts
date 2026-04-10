/**
 * Map Popups — HTML generation for location popup content.
 * Extracted from LocationMap.tsx for maintainability.
 */

import { GeoLocation } from '@/types/location';
import { CURATOR_ICON_PATHS, CriteriaStatus } from './map-constants';
import {
  getCriteriaColor,
  calculateVisitRelevance,
  formatTimeAgo,
  parseLocalizacionToLinks,
} from './map-utils';
import { supabase } from '@/integrations/supabase/client';

// ─── Card Config Cache ──────────────────────────────────────────────────────
interface PopupCardConfig {
  field_order: string[];
  enabledFields: Set<string>;
  include_tags: boolean;
  include_web: boolean;
  include_contact: boolean;
  include_interest_index: boolean;
  include_image: boolean;
  show_sources: boolean;
}

let cachedCardConfig: PopupCardConfig | null = null;
let configLoadPromise: Promise<PopupCardConfig> | null = null;

const DEFAULT_POPUP_CONFIG: PopupCardConfig = {
  field_order: ['nombre_lugar','clasificacion','localizacion','descripcion','punto_destacado','observacion','etiquetas','datos_geograficos','datos_clave','fuentes','indice_interes'],
  enabledFields: new Set(['nombre_lugar','clasificacion','localizacion','descripcion','punto_destacado','observacion','etiquetas','datos_geograficos','datos_clave','fuentes','indice_interes']),
  include_tags: true,
  include_web: true,
  include_contact: true,
  include_interest_index: true,
  include_image: true,
  show_sources: true,
};

export async function loadCardConfig(): Promise<PopupCardConfig> {
  if (cachedCardConfig) return cachedCardConfig;
  if (configLoadPromise) return configLoadPromise;

  configLoadPromise = (async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'enrichment_card_config')
        .maybeSingle();

      if (data?.value) {
        const v = data.value as any;
        const fields = v.fields || [];
        const enabledFields = new Set<string>(
          fields.filter((f: any) => f.enabled !== false).map((f: any) => f.key)
        );
        // If no fields configured, enable all
        if (enabledFields.size === 0) {
          DEFAULT_POPUP_CONFIG.enabledFields.forEach(f => enabledFields.add(f));
        }
        cachedCardConfig = {
          field_order: v.config?.field_order || DEFAULT_POPUP_CONFIG.field_order,
          enabledFields,
          include_tags: v.config?.include_tags ?? true,
          include_web: v.config?.include_web ?? true,
          include_contact: v.config?.include_contact ?? true,
          include_interest_index: v.config?.include_interest_index ?? true,
          include_image: v.config?.include_image ?? true,
          show_sources: v.config?.show_sources ?? true,
        };
      } else {
        cachedCardConfig = DEFAULT_POPUP_CONFIG;
      }
    } catch {
      cachedCardConfig = DEFAULT_POPUP_CONFIG;
    }
    return cachedCardConfig!;
  })();

  return configLoadPromise;
}

export function getCardConfig(): PopupCardConfig {
  return cachedCardConfig || DEFAULT_POPUP_CONFIG;
}

// Invalidate cache when config changes
export function invalidateCardConfig() {
  cachedCardConfig = null;
  configLoadPromise = null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PopupOwnership {
  isOwn: boolean;
  isFollowing?: boolean;
  ownerName?: string;
  curatorId?: string;
  curatorIcon?: string;
  curatorColor?: string;
  curatorAvatar?: string;
}

// ─── Image Section ───────────────────────────────────────────────────────────

export function buildImageSection(
  location: GeoLocation,
  enriched: any,
  ownership: PopupOwnership,
): string {
  // For curator points: prioritize enriched image, then curator avatar, then icon
  if (ownership.curatorId) {
    const curatorIcon = ownership.curatorIcon || 'map-pin';
    const curatorColor = ownership.curatorColor || '#14b8a6';
    const iconPath = CURATOR_ICON_PATHS[curatorIcon] || CURATOR_ICON_PATHS['map-pin'];

    // Priority: 1) AI enriched image 2) Curator avatar 3) Icon only
    const imageUrl = enriched?.imagen || ownership.curatorAvatar;

    if (imageUrl) {
      return `<div style="margin: 0 -12px 0 -12px; position: relative;">
<div style="width: 100%; height: 160px; position: relative; overflow: hidden;">
<img src="${imageUrl}" alt="${enriched?.imagen ? 'Ubicación' : 'Curador'}" style="width: 100%; height: 100%; object-fit: cover;" />
<!-- Curator icon overlay in corner -->
<div style="
position: absolute;
bottom: 8px;
right: 8px;
width: 40px;
height: 40px;
background: rgba(255,255,255,0.95);
border-radius: 50%;
display: flex;
align-items: center;
justify-content: center;
box-shadow: 0 2px 8px rgba(0,0,0,0.2);
border: 2px solid ${curatorColor};
">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="${iconPath}" 
fill="none" 
stroke="${curatorColor}" 
stroke-width="2" 
stroke-linecap="round" 
stroke-linejoin="round"/>
</svg>
</div>
</div>
</div>`;
    } else {
      return `<div style="margin: 0 -12px 0 -12px; position: relative;">
<div style="width: 100%; height: 120px; background: linear-gradient(135deg, ${curatorColor}20, ${curatorColor}40); display: flex; align-items: center; justify-content: center;">
<div style="
width: 64px;
height: 64px;
background: rgba(255,255,255,0.95);
border-radius: 50%;
display: flex;
align-items: center;
justify-content: center;
box-shadow: 0 4px 12px rgba(0,0,0,0.15);
border: 3px solid ${curatorColor};
">
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="${iconPath}" 
fill="none" 
stroke="${curatorColor}" 
stroke-width="2" 
stroke-linecap="round" 
stroke-linejoin="round"/>
</svg>
</div>
</div>
</div>`;
    }
  }

  // Regular locations: user/followed logic
  const userImageUrl = location.customData?.user_image_url as string | undefined;
  const userImageVisibility = (location.customData?.user_image_visibility as string) || 'private';
  const aiImage = enriched?.imagen;

  const canSeeUserImage = userImageUrl && (
    ownership.isOwn ||
    userImageVisibility === 'public' ||
    (userImageVisibility === 'followers' && ownership.isFollowing)
  );

  const displayImage = canSeeUserImage ? userImageUrl : aiImage;
  const fallbackImage = aiImage || '';
  const locationName = enriched?.nombre_lugar || location.name;

  let imageHtml = '';
  if (displayImage) {
    imageHtml = `<img src="${displayImage}" alt="${locationName}" style="width: 100%; height: 160px; object-fit: cover;" onerror="this.src='${fallbackImage}'" />`;
  } else {
    imageHtml = `<div style="width: 100%; height: 100px; background: linear-gradient(135deg, #f3f4f6, #e5e7eb); display: flex; align-items: center; justify-content: center;">
<span style="color: #9ca3af; font-size: 12px;">Sin imagen</span>
</div>`;
  }

  let buttonHtml = '';
  if (ownership.isOwn) {
    const hasUserImage = !!userImageUrl;
    buttonHtml = `
<div style="position: absolute; bottom: 12px; right: 16px; display: flex; gap: 8px;">
${hasUserImage ? `
<button 
class="popup-action-btn" 
data-action="delete-photo" 
data-location-id="${location.id}"
style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; background: none; color: white; border: none; cursor: pointer; transition: all 0.15s; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));"
onmouseover="this.style.transform='scale(1.15)'"
onmouseout="this.style.transform='scale(1)'"
title="Eliminar mi foto"
>
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<path d="M3 6h18"/>
<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
</svg>
</button>
` : ''}
<button 
class="popup-action-btn" 
data-action="upload-photo" 
data-location-id="${location.id}"
data-location-name="${locationName}"
style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; background: none; color: white; border: none; cursor: pointer; transition: all 0.15s; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));"
onmouseover="this.style.transform='scale(1.15)'"
onmouseout="this.style.transform='scale(1)'"
title="${hasUserImage ? 'Cambiar foto' : 'Añadir foto'}"
>
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
<circle cx="12" cy="13" r="4"/>
</svg>
</button>
</div>`;
  }

  return `<div style="margin: 0 -12px 0 -12px; position: relative;">
${imageHtml}
${buttonHtml}
</div>`;
}

// ─── Popup Content ───────────────────────────────────────────────────────────

export function createPopupContent(
  location: GeoLocation,
  criteriaTimestamp: number = 0,
  ownership?: PopupOwnership,
  canEnrich: boolean = false,
): string {
  const locationUpdatedAt = location.updatedAt ? new Date(location.updatedAt).getTime() : 0;
  const canRegenerate = canEnrich && (!location.enrichedData || locationUpdatedAt < criteriaTimestamp);
  const enriched = location.enrichedData;
  const hasClassification = !!enriched?.clasificacion?.codigo;

  const isOwn = ownership?.isOwn ?? true;
  const ownerName = ownership?.ownerName;
  const isCuratorPoint = !!ownership?.curatorId;

  const statusInfo = getCriteriaColor(location, criteriaTimestamp);
  const statusLabels: Record<CriteriaStatus, string> = {
    current: 'Completado',
    previous: 'Pendiente actualizar',
    unknown: 'Sin ficha IA',
    new: 'Sin procesar',
  };

  const formatRegistrationDate = (date: Date | string): string => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const registrationDate = isOwn ? formatRegistrationDate(location.createdAt) : '';

  const ownershipBadgeHtml = `
<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
<div style="
display: inline-flex;
align-items: center;
gap: 4px;
padding: 2px 8px;
background: ${isOwn ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)' : 'linear-gradient(135deg, #fef3c7, #fde68a)'};
border-radius: 12px;
font-size: 10px;
font-weight: 500;
color: ${isOwn ? '#1e40af' : '#92400e'};
">
<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
${isOwn
    ? '<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>'
    : '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'
  }
</svg>
${isOwn ? 'Mi punto' : `De ${ownerName || 'seguido'}`}
</div>
${isOwn && registrationDate ? `
<div style="font-size: 9px; color: #6b7280; display: flex; align-items: center; gap: 3px;" title="Fecha en que añadiste este punto a tu red">
<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>
</svg>
Añadido ${registrationDate}
</div>
` : ''}
</div>
`;

  const statusBarHtml = `
<div style="
height: 6px;
background: ${statusInfo.gradient};
margin: 0 -12px 0 -12px;
border-radius: 8px 8px 0 0;
box-shadow: 0 2px 4px rgba(0,0,0,0.1);
"></div>
`;

  const progressBarHtml = `
<div id="popup-progress-${location.id}" style="display: none; margin-bottom: 12px;">
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
<span id="popup-progress-label-${location.id}" style="font-size: 11px; color: #6b7280;">Procesando...</span>
<span id="popup-progress-percent-${location.id}" style="font-size: 11px; font-weight: 500; color: #374151;">0%</span>
</div>
<div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
<div id="popup-progress-bar-${location.id}" style="height: 100%; width: 0%; background: linear-gradient(90deg, #8b5cf6, #7c3aed); border-radius: 3px; transition: width 0.3s ease;"></div>
</div>
</div>
`;

  const existingNotes = location.customData?.notes || '';
  const hasNotes = !!existingNotes || location.customData?.has_notes === 'true';
  const isVisited = location.customData?.visited === 'true';

  const visitRelevance = isVisited ? calculateVisitRelevance(
    location.customData?.visited_verified_at,
    location.customData?.oldest_geotagged_photo_date,
  ) : null;

  const canEditLocation = canEnrich;
  const canEditOwn = isOwn;
  const adminEditWarning = (canEditLocation && !isOwn && !isCuratorPoint) ? `
<div style="display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #f59e0b; border-radius: 6px; font-size: 10px; color: #92400e;">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
<path d="M12 9v4m0 4h.01M5.07 19H19a2 2 0 0 0 1.75-2.95L13.75 4a2 2 0 0 0-3.5 0L3.25 16.05A2 2 0 0 0 5.07 19z"/>
</svg>
<span><strong>Modo Admin:</strong> Puedes editar este punto de ${ownerName || 'otro usuario'}</span>
</div>
` : '';

  const actionButtonsHtml = `
${progressBarHtml}
${(canEditLocation && !isOwn && !isCuratorPoint) ? adminEditWarning : ''}
<div style="display: flex; gap: 4px; margin-top: 8px; padding-top: 8px; padding-bottom: 6px; border-top: 1px solid #e5e7eb;">
${isCuratorPoint ? `
<div style="flex: 2; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 10px; background: #f0fdf4; color: #166534; border: none; border-radius: 4px; font-size: 11px; font-weight: 500;">
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>
</svg>
Enriquecido ${location.updatedAt ? formatRegistrationDate(location.updatedAt) : ''}
</div>
` : `
${canEditLocation ? `
${enriched ? `
<!-- Enriched: date label + re-enrich button -->
<div style="flex: 2; display: flex; align-items: center; gap: 4px;">
<div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 8px; background: #f0fdf4; color: #166534; border-radius: 4px; font-size: 10px; font-weight: 500;">
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<polyline points="20 6 9 17 4 12"></polyline>
</svg>
Enriquecido ${location.updatedAt ? formatRegistrationDate(location.updatedAt) : ''}
</div>
<button 
class="popup-action-btn" 
data-action="enrich" 
data-location-id="${location.id}"
style="display: flex; align-items: center; justify-content: center; gap: 3px; padding: 6px 10px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap;"
onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)'"
onmouseout="this.style.transform='none';this.style.boxShadow='none'"
title="Regenerar ficha completa con IA"
>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
</svg>
Re-enriquecer
</button>
</div>
` : `
<!-- Not enriched: single enrich button -->
<button 
class="popup-action-btn" 
data-action="enrich" 
data-location-id="${location.id}"
style="flex: 2; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 10px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)'"
onmouseout="this.style.transform='none';this.style.boxShadow='none'"
title="Generar ficha completa con IA"
>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
</svg>
Enriquecer
</button>
`}
` : ''}
`}
${canEditOwn ? `
<button 
class="popup-action-btn" 
data-action="add-notes" 
data-location-id="${location.id}"
style="flex: ${canEditLocation ? '1' : '1'}; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 4px 6px; background: ${hasNotes ? '#fef3c7' : '#f3f4f6'}; color: ${hasNotes ? '#92400e' : '#374151'}; border: none; border-radius: 3px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.background='${hasNotes ? '#fde68a' : '#e5e7eb'}';this.style.transform='translateY(-1px)'"
onmouseout="this.style.background='${hasNotes ? '#fef3c7' : '#f3f4f6'}';this.style.transform='none'"
title="${hasNotes ? 'Editar notas' : 'Añadir notas'}"
>
<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
<polyline points="14 2 14 8 20 8"/>
<line x1="16" y1="13" x2="8" y2="13"/>
<line x1="16" y1="17" x2="8" y2="17"/>
<line x1="10" y1="9" x2="8" y2="9"/>
</svg>
Notas
</button>
<button 
class="popup-action-btn" 
data-action="delete-location" 
data-location-id="${location.id}"
data-location-name="${location.name}"
style="display: flex; align-items: center; justify-content: center; padding: 4px 8px; background: #fef2f2; color: #dc2626; border: none; border-radius: 3px; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.background='#fee2e2';this.style.transform='translateY(-1px)'"
onmouseout="this.style.background='#fef2f2';this.style.transform='none'"
title="Mover a la papelera"
>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
</svg>
</button>
` : ''}
</div>
`;

  const addToCollectionBtnHtml = (!isOwn && !isCuratorPoint) ? `
<button 
class="popup-action-btn" 
data-action="add-to-collection" 
data-location-id="${location.id}"
data-location-name="${location.name}"
style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.3);"
onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(22, 163, 74, 0.4)'"
onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(22, 163, 74, 0.3)'"
title="Añadir este punto a tu colección personal"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<path d="M12 5v14M5 12h14"/>
</svg>
Añadir a mi colección
</button>
` : '';

  // Si tiene ficha enriquecida, mostrarla
  if (enriched) {
    const localizacionLinks = parseLocalizacionToLinks(enriched.localizacion, location);
    const popupId = `popup-${location.id.slice(0, 8)}`;
    const cardCfg = getCardConfig();
    const ownershipInfo: PopupOwnership = {
      isOwn,
      ownerName,
      isFollowing: ownership?.isFollowing,
      curatorId: ownership?.curatorId,
      curatorIcon: ownership?.curatorIcon,
      curatorColor: ownership?.curatorColor,
      curatorAvatar: ownership?.curatorAvatar,
    };

    return `
<div id="${popupId}" style="min-width: 300px; max-width: 360px; font-family: 'Inter', system-ui, sans-serif; position: relative;">
${statusBarHtml}

<!-- Imagen con botón de cámara para propietarios -->
${buildImageSection(location, enriched, ownershipInfo)}

<div style="padding: 12px 16px 8px 16px;">
<!-- Nombre + Badge propiedad -->
<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
<h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a; line-height: 1.3; flex: 1;">
${enriched.nombre_lugar}
</h3>
${ownershipBadgeHtml}
</div>

<!-- Localización links -->
<p style="margin: 0 0 10px 0; font-size: 11px; line-height: 1.4; color: #6b7280;">
${localizacionLinks}
</p>

<!-- Botón para añadir a colección (solo para puntos de seguidos) -->
${addToCollectionBtnHtml}

<!-- Índice IA + Botones de interacción -->
<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 10px; padding: 8px; background: #f9fafb; border-radius: 8px;">
${!isCuratorPoint ? `
<!-- Warning de validación (oculto por defecto) -->
<div id="visit-validation-warning-${location.id}" style="display: none; width: 100%; padding: 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #fcd34d; border-radius: 8px; margin-bottom: 4px;">
<p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: #92400e;">No se puede validar la visita</p>
<p id="visit-distance-text-${location.id}" style="margin: 0 0 6px 0; font-size: 10px; color: #a16207;"></p>
<div style="font-size: 9px; color: #78350f; border-top: 1px solid #fcd34d; padding-top: 6px;">
<p style="margin: 0 0 3px 0; font-weight: 500;">Criterios de validación:</p>
<ul style="margin: 0; padding-left: 14px;">
<li>Estar a menos de 500m del lugar</li>
<li>Subir una foto con geolocalización (EXIF GPS)</li>
</ul>
</div>
</div>
` : ''}

<div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
${isCuratorPoint ? `
<!-- Rating ponderado para puntos de curador -->
<div 
class="weighted-rating-container" 
data-location-id="${location.id}" 
data-ai-rating="${enriched.indice_interes || 0}"
style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #86efac; border-radius: 12px;"
title="Rating ponderado: 50% IA + 50% Comunidad"
>
<span style="font-size: 10px; font-weight: 500; color: #166534;">Valoración</span>
<span class="weighted-rating-stars" style="display: inline-flex; gap: 1px;">
${[1, 2, 3, 4, 5].map(star => `<span style="font-size: 14px; line-height: 1; color: ${star <= (enriched.indice_interes || 0) ? '#16a34a' : '#d1d5db'};">${star <= (enriched.indice_interes || 0) ? '★' : '☆'}</span>`).join('')}
</span>
<span class="weighted-rating-value" style="font-size: 10px; font-weight: 600; color: #166534;">${enriched.indice_interes ? enriched.indice_interes.toFixed(1) : '-'}</span>
<span class="weighted-rating-breakdown" style="font-size: 9px; color: #6b7280; display: none;">(IA: ${enriched.indice_interes || '-'} | Com: -)</span>
</div>
` : `
${enriched.indice_interes ? `
<div style="display: inline-flex; align-items: center; gap: 2px; padding: 3px 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px;" title="${enriched.indice_interes_notas || 'Índice de interés IA'}">
${[1, 2, 3, 4, 5].map(star => `<span style="font-size: 14px; line-height: 1; color: ${star <= enriched.indice_interes ? '#b45309' : '#d1d5db'};">${star <= enriched.indice_interes ? '★' : '☆'}</span>`).join('')}
</div>
` : ''}
`}

${!isCuratorPoint ? `
${isVisited && visitRelevance ? `
<span 
style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: ${visitRelevance.bgColor}; color: ${visitRelevance.color}; border: 1px solid ${visitRelevance.borderColor}; border-radius: 10px; font-size: 9px; font-weight: 500;"
title="${visitRelevance.label} - Verificado ${visitRelevance.verificationType === 'photo' ? '📷' : '📍'} ${formatTimeAgo(visitRelevance.daysAgo)}"
>
${visitRelevance.label}
</span>
` : ''}
<button 
class="popup-action-btn" 
data-action="toggle-visited" 
data-location-id="${location.id}"
style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisited ? '#dcfce7' : (!isOwn ? '#eff6ff' : '#fff')}; color: ${isVisited ? '#166534' : (!isOwn ? '#1d4ed8' : '#6b7280')}; border: 1px solid ${isVisited ? '#86efac' : (!isOwn ? '#93c5fd' : '#e5e7eb')}; border-radius: 12px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
title="${isVisited ? 'Click para desmarcar' : (!isOwn ? 'Se añadirá a tu colección automáticamente' : 'Requiere estar a menos de 500m o subir foto con GPS')}"
>
<svg width="10" height="10" viewBox="0 0 24 24" fill="${isVisited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
<path d="M20 6 9 17l-5-5"/>
</svg>
${isVisited ? 'Visitado' : (!isOwn ? '+ Adoptar y Visitar' : 'Visitado')}
</button>

${(visitRelevance || canEditLocation) ? `
<div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal${!visitRelevance && canEditLocation ? ' (Admin)' : ''}">
${[1, 2, 3, 4, 5].map(star => `
<button 
class="popup-action-btn" 
data-action="set-rating" 
data-location-id="${location.id}"
data-rating="${star}"
style="background: none; border: none; padding: 0; cursor: pointer; font-size: 14px; line-height: 1; transition: transform 0.1s; color: ${parseInt(location.customData?.user_rating || '0') >= star ? '#f59e0b' : '#d1d5db'};"
title="Valorar ${star} estrella${star > 1 ? 's' : ''}"
>${parseInt(location.customData?.user_rating || '0') >= star ? '★' : '☆'}</button>
`).join('')}
${location.customData?.user_rating ? `
<button 
class="popup-action-btn" 
data-action="clear-rating" 
data-location-id="${location.id}"
style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
title="Quitar valoración"
>✕</button>
` : ''}
</div>
` : ''}
` : ''}
</div>
</div>

<!-- Punto destacado -->
${cardCfg.enabledFields.has('punto_destacado') && enriched.punto_destacado ? `
<div style="clear: both; display: block; margin: 0 0 12px 0; background: hsl(var(--primary) / 0.05); border-left: 3px solid hsl(var(--primary)); padding: 8px 12px; border-radius: 0 6px 6px 0;">
<p style="margin: 0; font-size: 12px; font-weight: 600; color: #1f2937; line-height: 1.45;">
${enriched.punto_destacado}
</p>
</div>
` : ''}

<!-- Descripción -->
${cardCfg.enabledFields.has('descripcion') ? `
<div style="clear: both; display: block; margin: 0 0 4px 0;">
<div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 4px;">Descripción</div>
<div style="max-height: 160px; overflow-y: auto; overflow-x: hidden;">
<p style="margin: 0; font-size: 12px; color: #374151; line-height: 1.6;">
${enriched.descripcion}
</p>
</div>
<span style="font-size: 9px; color: #9ca3af;">${enriched.descripcion?.length || 0} caracteres</span>
</div>
` : ''}

<!-- Observación -->
${cardCfg.enabledFields.has('observacion') && enriched.observacion ? `
<div style="clear: both; display: block; margin: 0 0 12px 0; background: #f4f4f5; padding: 8px 12px; border-radius: 6px;">
<div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 3px;">Observación</div>
<p style="margin: 0; font-size: 11px; color: #52525b; line-height: 1.5;">
${enriched.observacion}
</p>
</div>
` : ''}

<!-- Web referencia -->
${cardCfg.include_web && enriched.datos_clave?.web_referencia ? `
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
<div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #f0f9ff; border-radius: 8px;">
<span style="font-size: 11px; color: #6b7280; flex-shrink: 0;">Web:</span>
<a href="${enriched.datos_clave.web_referencia.startsWith('http') ? enriched.datos_clave.web_referencia : 'https://' + enriched.datos_clave.web_referencia}" target="_blank" style="color: #0369a1; font-size: 11px; word-break: break-all; text-decoration: none; flex: 1;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
${enriched.datos_clave.web_referencia}
</a>
</div>
` : ''}

<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />

<!-- Etiquetas geográficas -->
${cardCfg.include_tags && enriched.etiquetas_geograficas?.length ? `
<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
${enriched.etiquetas_geograficas.map((tag: string) => `
<span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #e0f2fe; color: #0369a1; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'">
#${tag.replace('#', '').replace(/\s+/g, '')}
</span>
`).join('')}
</div>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
` : ''}

<!-- Clasificación tags -->
${cardCfg.enabledFields.has('clasificacion') && !isCuratorPoint && enriched.clasificacion?.codigo ? `
<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
${enriched.clasificacion.categoria_principal ? `<span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">#${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '').replace(/\s+/g, '')}</span>` : ''}
${enriched.clasificacion.subcategoria ? `<span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">#${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '').replace(/\s+/g, '')}</span>` : ''}
${enriched.clasificacion.tipo_especifico ? `<span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">#${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '').replace(/\s+/g, '')}</span>` : ''}
</div>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
` : ''}

<!-- Hashtags temáticos -->
${cardCfg.include_tags && !isCuratorPoint && enriched.etiquetas?.length ? `
<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
${enriched.etiquetas.filter((tag: string) => !enriched.etiquetas_geograficas?.some((gt: string) => gt.toLowerCase() === tag.toLowerCase())).map((tag: string) => `
<span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #f3e8ff; color: #7c3aed; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">
#${tag.replace('#', '').replace(/\s+/g, '')}
</span>
`).join('')}
</div>
` : ''}

<!-- Descripción original KML -->
${!isCuratorPoint && location.description ? `
<div style="border-top: 1px solid #e5e7eb; margin-top: 4px;">
<button class="popup-toggle-original" data-popup-id="${popupId}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 0; background: none; border: none; cursor: pointer; color: #6b7280; font-size: 12px; font-weight: 500;">
<span>📄 Descripción original</span>
<svg class="toggle-arrow-original" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
</button>
<div class="original-content" data-popup-id="${popupId}" style="display: none;">
<div style="background: #f9fafb; border-radius: 8px; padding: 10px; font-size: 12px; color: #4b5563; line-height: 1.5; max-height: 150px; overflow-y: auto; white-space: pre-wrap;">
${location.description}
</div>
</div>
</div>
` : ''}

<!-- Validación Comunitaria (solo para curadores) -->
${isCuratorPoint ? `
<div style="border-top: 1px solid #e5e7eb; margin-top: 4px;">
<button class="popup-toggle-community" data-popup-id="${popupId}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 0; background: none; border: none; cursor: pointer; color: #6b7280; font-size: 12px; font-weight: 500;">
<span>Validación comunitaria</span>
<svg class="toggle-arrow-community" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
</button>
<div class="community-content" data-popup-id="${popupId}" data-location-id="${location.id}" data-curator-id="${ownership?.curatorId || ''}" style="display: none;">
<div class="community-reviews-container" data-location-id="${location.id}" style="margin-bottom: 10px;">
<div style="display: flex; align-items: center; justify-content: center; padding: 16px; color: #9ca3af; font-size: 11px;">
<svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
Cargando...
</div>
</div>
<div class="community-form-container" data-location-id="${location.id}" style="display: none;">
<div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px;">
<p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 600; color: #166534;">¡Estás cerca! Valida este lugar</p>
<div style="margin-bottom: 8px;">
<label style="font-size: 10px; color: #6b7280; display: block; margin-bottom: 4px;">Tu valoración:</label>
<div class="community-rating-input" data-location-id="${location.id}" style="display: flex; gap: 2px;">
${[1, 2, 3, 4, 5].map(star => `<button class="community-rating-star" data-rating="${star}" style="background: none; border: none; padding: 0; cursor: pointer; font-size: 18px; color: #d1d5db;">☆</button>`).join('')}
</div>
</div>
<div style="margin-bottom: 8px;">
<label style="font-size: 10px; color: #6b7280; display: block; margin-bottom: 4px;">Comentario (opcional):</label>
<textarea class="community-comment-input" data-location-id="${location.id}" placeholder="¿Qué te pareció este lugar?" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 11px; resize: none; min-height: 50px; font-family: inherit;"></textarea>
</div>
<button class="popup-action-btn community-submit-btn" data-action="submit-community-review" data-location-id="${location.id}" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='none'">
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
Confirmar y enviar
</button>
</div>
</div>
<div class="community-distance-warning" data-location-id="${location.id}" style="display: none;">
<div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px; font-size: 10px; color: #92400e;">
<p style="margin: 0 0 4px 0; font-weight: 600;">Acércate para validar</p>
<p class="distance-text" style="margin: 0;">Debes estar a menos de <span class="required-distance">500</span>m de este lugar para poder validarlo.</p>
</div>
</div>
</div>
</div>
` : ''}

<!-- Datos geográficos (diseño idéntico al admin) -->
${cardCfg.enabledFields.has('datos_geograficos') && enriched.datos_geograficos ? (() => {
  const geoLabels: Record<string, string> = {
    continente: 'Continente', pais: 'País', admin_nivel_1: 'Región', admin_nivel_2: 'Provincia',
    admin_nivel_3: 'Comarca', localidad: 'Localidad', sublocalidad: 'Sublocalidad',
    lugar_interes: 'Lugar de interés', direccion_postal: 'Dirección postal',
  };
  const geoEntries = Object.entries(enriched.datos_geograficos).filter(([, v]) => v);
  if (geoEntries.length === 0) return '';
  const half = Math.ceil(geoEntries.length / 2);
  const col1 = geoEntries.slice(0, half);
  const col2 = geoEntries.slice(half);
  const renderCol = (entries: [string, any][]) => entries.map(([k, v]) => 
    '<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 3px 8px;">' +
      '<span style="font-size: 9px; color: #9ca3af; line-height: 1.3;">' + (geoLabels[k] || k.replace(/_/g, ' ')) + '</span>' +
      '<span style="font-size: 10px; color: #1f2937; font-weight: 500; text-align: right; margin-left: 4px; line-height: 1.3;">' + v + '</span>' +
    '</div>'
  ).join('');
  return '<div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-top: 8px;">' +
    '<div style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #f4f4f5; border-bottom: 1px solid #e5e7eb;">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="4"/><path d="m15 9-6 6"/></svg>' +
      '<span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Datos geográficos</span>' +
    '</div>' +
    '<div style="display: grid; grid-template-columns: 1fr 1fr;">' +
      '<div style="border-right: 1px solid #e5e7eb;">' + renderCol(col1) + '</div>' +
      '<div>' + renderCol(col2) + '</div>' +
    '</div>' +
  '</div>';
})() : ''}

<!-- Datos clave (diseño idéntico al admin) -->
${cardCfg.enabledFields.has('datos_clave') && enriched.datos_clave ? (() => {
  const SVG_ICONS: Record<string, string> = {
    tipo: '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>',
    dimension_principal: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
    acceso: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    estado_proteccion: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    coordenadas: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    web_referencia: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  };
  const items = [
    { key: 'tipo', label: 'Tipo', value: enriched.datos_clave.tipo },
    { key: 'dimension_principal', label: 'Dimensión', value: enriched.datos_clave.dimension_principal },
    { key: 'acceso', label: 'Acceso', value: enriched.datos_clave.acceso },
    { key: 'estado_proteccion', label: 'Protección', value: enriched.datos_clave.estado_proteccion },
    { key: 'coordenadas', label: 'Coordenadas', value: enriched.datos_clave.coordenadas, mono: true },
    ...(cardCfg.include_web && enriched.datos_clave.web_referencia ? [{ key: 'web_referencia', label: 'Web', value: enriched.datos_clave.web_referencia, isLink: true }] : []),
  ].filter(item => item.value);
  if (items.length === 0) return '';
  const contactHtml = cardCfg.include_contact && (enriched.datos_clave as any).datos_contacto ? (() => {
    const c = (enriched.datos_clave as any).datos_contacto;
    const parts: string[] = [];
    if (c.telefono) parts.push('<div style="display:flex;align-items:center;gap:4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span style="font-size:9px;color:#9ca3af;">' + c.telefono + '</span></div>');
    if (c.horario) parts.push('<div style="display:flex;align-items:center;gap:4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span style="font-size:9px;color:#9ca3af;">' + c.horario + '</span></div>');
    if (c.precio) parts.push('<div style="display:flex;align-items:center;gap:4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span style="font-size:9px;color:#9ca3af;">' + c.precio + '</span></div>');
    if (parts.length === 0) return '';
    return '<div style="border-top: 1px solid #e5e7eb; background: #f9fafb; padding: 6px 8px;"><div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">' + parts.join('') + '</div></div>';
  })() : '';
  return '<div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-top: 8px;">' +
    '<div style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #f4f4f5; border-bottom: 1px solid #e5e7eb;">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>' +
      '<span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Datos clave</span>' +
    '</div>' +
    '<div>' +
      items.map(item => 
        '<div style="display: flex; align-items: flex-start; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #f4f4f5;">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">' + (SVG_ICONS[item.key] || '') + '</svg>' +
          '<span style="font-size: 9px; color: #9ca3af; flex-shrink: 0; width: 56px; line-height: 1.3;">' + item.label + '</span>' +
          ('isLink' in item && item.isLink
            ? '<a href="' + (String(item.value).startsWith('http') ? item.value : 'https://' + item.value) + '" target="_blank" style="font-size: 10px; color: #0369a1; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">' + item.value + '</a>'
            : '<span style="font-size: 10px; color: #1f2937; font-weight: 500; text-align: right; flex: 1; line-height: 1.3;' + ('mono' in item && item.mono ? ' font-family: monospace; font-size: 9px;' : '') + '">' + item.value + '</span>'
          ) +
        '</div>'
      ).join('') +
    '</div>' +
    (contactHtml || '') +
  '</div>';
})() : ''}

<!-- Fuentes -->
${cardCfg.show_sources && enriched.fuentes && Array.isArray(enriched.fuentes) && enriched.fuentes.length > 0 ? `
<div style="margin-top: 8px;">
<div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 4px;">Fuentes</div>
<ul style="margin: 0; padding: 0; list-style: none;">
${enriched.fuentes.map((f: string) => {
      const urlMatch = f.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        const url = urlMatch[1];
        const domain = url.replace(/^https?:\/\//, '').split('/')[0];
        return `<li style="margin-bottom: 3px; font-size: 10px; color: #9ca3af;"><span>• </span><a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #9ca3af; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${domain}</a></li>`;
      }
      return `<li style="margin-bottom: 3px; font-size: 10px; color: #9ca3af;">• ${f}</li>`;
    }).join('')}
</ul>
</div>
` : ''}

${locationUpdatedAt > 0 ? `
<div style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: #9ca3af; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e5e7eb;">
<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>
</svg>
<span>Ficha IA actualizada: ${new Date(locationUpdatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
</div>
` : ''}

<!-- Botones de acción -->
${actionButtonsHtml}
</div>
</div>
`;
  }

  // Fallback: mostrar datos originales
  const ownershipInfo: PopupOwnership = {
    isOwn,
    ownerName,
    isFollowing: ownership?.isFollowing,
    curatorId: ownership?.curatorId,
    curatorIcon: ownership?.curatorIcon,
    curatorColor: ownership?.curatorColor,
    curatorAvatar: ownership?.curatorAvatar,
  };

  const filteredCustomData = Object.entries(location.customData || {})
    .filter(([key]) => !['user_image_url', 'user_image_visibility', 'has_notes', 'notes', 'visited', 'user_rating'].includes(key));

  const customDataHtml = filteredCustomData
    .slice(0, 6)
    .map(([key, value]) => `
<div style="display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
<span style="color: #666; font-size: 12px; min-width: 80px; font-weight: 500;">${key}</span>
<span style="color: #333; font-size: 12px; flex: 1;">${value}</span>
</div>
`).join('');

  const moreDataCount = filteredCustomData.length - 6;

  return `
<div style="min-width: 280px; max-width: 350px; font-family: 'Inter', system-ui, sans-serif;">
${statusBarHtml}

${buildImageSection(location, null, ownershipInfo)}

<div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
<h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a; line-height: 1.3; flex: 1;">
${location.name}
</h3>
${ownershipBadgeHtml}
</div>
<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
${location.continent ? `<span class="filter-link" data-filter-type="continent" data-filter-value="${location.continent}" style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'">${location.continent}</span>` : ''}
${location.country ? `<span class="filter-link" data-filter-type="country" data-filter-value="${location.country}" style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bbf7d0'" onmouseout="this.style.background='#dcfce7'">${location.country}</span>` : ''}
${location.region ? `<span class="filter-link" data-filter-type="region" data-filter-value="${location.region}" style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#fde68a'" onmouseout="this.style.background='#fef3c7'">${location.region}</span>` : ''}
${location.zone ? `<span class="filter-link" data-filter-type="zone" data-filter-value="${location.zone}" style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">${location.zone}</span>` : ''}
</div>

${(!isOwn && !isCuratorPoint) ? `
<button 
class="popup-action-btn" 
data-action="add-to-collection" 
data-location-id="${location.id}"
data-location-name="${location.name}"
style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-top: 12px; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.3);"
onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(22, 163, 74, 0.4)'"
onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(22, 163, 74, 0.3)'"
title="Añadir este punto a tu colección personal"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<path d="M12 5v14M5 12h14"/>
</svg>
Añadir a mi colección
</button>
` : ''}

${!isCuratorPoint ? `
<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 8px;">
<div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
${isVisited && visitRelevance ? `
<span 
style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: ${visitRelevance.bgColor}; color: ${visitRelevance.color}; border: 1px solid ${visitRelevance.borderColor}; border-radius: 10px; font-size: 9px; font-weight: 500;"
title="${visitRelevance.label}"
>
${visitRelevance.label}
</span>
` : ''}
<button 
class="popup-action-btn" 
data-action="toggle-visited" 
data-location-id="${location.id}"
style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisited ? '#dcfce7' : (!isOwn ? '#eff6ff' : '#fff')}; color: ${isVisited ? '#166534' : (!isOwn ? '#1d4ed8' : '#6b7280')}; border: 1px solid ${isVisited ? '#86efac' : (!isOwn ? '#93c5fd' : '#e5e7eb')}; border-radius: 12px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
title="${isVisited ? 'Click para desmarcar' : (!isOwn ? 'Se añadirá a tu colección automáticamente' : 'Marcar como visitado')}"
>
<svg width="10" height="10" viewBox="0 0 24 24" fill="${isVisited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
<path d="M20 6 9 17l-5-5"/>
</svg>
${isVisited ? 'Visitado' : (!isOwn ? '+ Adoptar y Visitar' : 'Visitado')}
</button>

${(visitRelevance || canEditLocation) ? `
<div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal${!visitRelevance && canEditLocation ? ' (Admin)' : ''}">
${[1, 2, 3, 4, 5].map(star => `
<button 
class="popup-action-btn" 
data-action="set-rating" 
data-location-id="${location.id}"
data-rating="${star}"
style="background: none; border: none; padding: 0; cursor: pointer; font-size: 14px; transition: transform 0.1s; color: ${parseInt(location.customData?.user_rating || '0') >= star ? '#f59e0b' : '#d1d5db'};"
title="Valorar ${star} estrella${star > 1 ? 's' : ''}"
>${parseInt(location.customData?.user_rating || '0') >= star ? '★' : '☆'}</button>
`).join('')}
${location.customData?.user_rating ? `
<button 
class="popup-action-btn" 
data-action="clear-rating" 
data-location-id="${location.id}"
style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
title="Quitar valoración"
>✕</button>
` : ''}
</div>
` : ''}
</div>
</div>
` : ''}
</div>

${location.description ? `
<div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; background: #fafafa;">
<p style="margin: 0; font-size: 13px; color: #4b5563; line-height: 1.5; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">
${location.description}
</p>
</div>
` : ''}

<div style="padding: 12px 16px;">
<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
<circle cx="12" cy="10" r="3"></circle>
</svg>
<span style="font-size: 12px; color: #6b7280;">
${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lng.toFixed(6)}
</span>
</div>

${customDataHtml ? `
<div style="margin-top: 12px;">
<div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
Datos adicionales
</div>
${customDataHtml}
${moreDataCount > 0 ? `<div style="font-size: 11px; color: #9ca3af; padding-top: 8px;">+${moreDataCount} campos más</div>` : ''}
</div>
` : ''}

${actionButtonsHtml}
</div>
</div>
`;
}
