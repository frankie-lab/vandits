import React, { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import 'leaflet.heat';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { motion } from 'framer-motion';
import { Maximize2, MapPin, Flame, CircleDot, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MapThemeToggle, MapTheme, MAP_TILE_LAYERS } from './MapThemeToggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MapCenterSettings, useMapCenterConfig, MapCenterConfig } from './MapCenterSettings';
import { toast } from 'sonner';
import { playEnrichmentComplete } from '@/lib/sounds';

// Extend L namespace for heat layer
declare module 'leaflet' {
  function heatLayer(latlngs: Array<[number, number, number?]>, options?: {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: { [key: number]: string };
  }): L.Layer;
}

type ViewMode = 'heatmap' | 'markers';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Escala cromática según estado de enriquecimiento/criterio
// Verde = Estado final (cumple criterios actuales) - NO requiere actualización
// Azul = Pendiente de nuevo criterio (enriquecido pero criterios han cambiado)
// Gris = Importado (tiene descripción original pero sin ficha IA)
// Naranja = Vacío/Duplicado (sin ficha IA ni descripción)
type CriteriaStatus = 'current' | 'previous' | 'unknown' | 'new';

// Timestamp de criterios para determinar "verde" vs "azul"
const CRITERIA_STORAGE_KEY = 'geodata-enrichment-criteria';

function loadCriteriaTimestamp(): number {
  try {
    const stored = localStorage.getItem(CRITERIA_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed._updatedAt || 0;
    }
  } catch (e) {}
  return 0;
}

// Determina si la ficha cumple el criterio actual (basado en fecha de actualización)
function meetsEnrichmentCriteria(location: GeoLocation, criteriaTimestamp: number): boolean {
  if (!location.enrichedData?.descripcion) return false;
  
  // Si no hay timestamp guardado, todas las fichas con enrichedData son "current"
  if (criteriaTimestamp === 0) return true;
  
  // Comparar fecha de actualización de la location con fecha de criterios
  const locationUpdatedAt = location.updatedAt instanceof Date 
    ? location.updatedAt.getTime() 
    : new Date(location.updatedAt).getTime();
  
  return locationUpdatedAt >= criteriaTimestamp;
}

const getCriteriaColor = (
  location: GeoLocation,
  criteriaTimestamp: number
): { color: string; gradient: string; status: CriteriaStatus } => {
  // 1. Verde - Estado final (cumple todos los criterios actuales)
  if (location.enrichedData?.descripcion) {
    if (meetsEnrichmentCriteria(location, criteriaTimestamp)) {
      return {
        color: 'hsl(142, 76%, 36%)',
        gradient: 'linear-gradient(135deg, hsl(142, 76%, 42%), hsl(142, 71%, 32%))',
        status: 'current',
      };
    }

    // 2. Azul - Pendiente de nuevo criterio (enriquecido pero no cumple)
    return {
      color: 'hsl(217, 91%, 60%)',
      gradient: 'linear-gradient(135deg, hsl(217, 91%, 65%), hsl(217, 91%, 50%))',
      status: 'previous',
    };
  }

  // 3. Gris - Importado (tiene descripción original pero sin ficha IA)
  if (location.description && location.description.trim().length > 0) {
    return {
      color: 'hsl(220, 9%, 46%)',
      gradient: 'linear-gradient(135deg, hsl(220, 9%, 56%), hsl(220, 9%, 40%))',
      status: 'unknown',
    };
  }

  // 4. Naranja - Vacío (sin ficha IA ni descripción)
  return {
    color: 'hsl(24, 95%, 53%)',
    gradient: 'linear-gradient(135deg, hsl(24, 95%, 58%), hsl(24, 95%, 45%))',
    status: 'new',
  };
};

// Inline function to calculate visit relevance grade
// Avoids circular imports and keeps popup generation self-contained
interface VisitRelevanceInfo {
  grade: 'oro' | 'plata' | 'bronce' | 'reciente';
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  daysAgo: number;
  verificationType: 'checkin' | 'photo';
}

function calculateVisitRelevanceInline(
  visitedVerifiedAt?: string,
  oldestPhotoDate?: string
): VisitRelevanceInfo | null {
  if (!visitedVerifiedAt && !oldestPhotoDate) return null;

  const checkinDate = visitedVerifiedAt ? new Date(visitedVerifiedAt) : null;
  const photoDate = oldestPhotoDate ? new Date(oldestPhotoDate) : null;

  let verificationDate: Date;
  let verificationType: 'checkin' | 'photo';

  if (checkinDate && photoDate) {
    if (checkinDate <= photoDate) {
      verificationDate = checkinDate;
      verificationType = 'checkin';
    } else {
      verificationDate = photoDate;
      verificationType = 'photo';
    }
  } else if (checkinDate) {
    verificationDate = checkinDate;
    verificationType = 'checkin';
  } else if (photoDate) {
    verificationDate = photoDate;
    verificationType = 'photo';
  } else {
    return null;
  }

  const now = new Date();
  const diffMs = now.getTime() - verificationDate.getTime();
  const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Classification by age
  if (daysAgo >= 1095) {
    // > 3 years = Gold
    return {
      grade: 'oro',
      label: '🥇 Veterano',
      color: '#b45309',
      bgColor: 'linear-gradient(135deg, #fef3c7, #fcd34d)',
      borderColor: '#f59e0b',
      daysAgo,
      verificationType,
    };
  } else if (daysAgo >= 365) {
    // 1-3 years = Silver
    return {
      grade: 'plata',
      label: '🥈 Consolidado',
      color: '#475569',
      bgColor: 'linear-gradient(135deg, #f1f5f9, #cbd5e1)',
      borderColor: '#94a3b8',
      daysAgo,
      verificationType,
    };
  } else if (daysAgo >= 90) {
    // 3 months - 1 year = Bronze
    return {
      grade: 'bronce',
      label: '🥉 Confirmado',
      color: '#9a3412',
      bgColor: 'linear-gradient(135deg, #fed7aa, #fdba74)',
      borderColor: '#fb923c',
      daysAgo,
      verificationType,
    };
  } else {
    // < 3 months = Recent
    return {
      grade: 'reciente',
      label: '🆕 Reciente',
      color: '#166534',
      bgColor: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
      borderColor: '#86efac',
      daysAgo,
      verificationType,
    };
  }
}

function formatTimeAgoInline(daysAgo: number): string {
  if (daysAgo >= 365) {
    const years = Math.floor(daysAgo / 365);
    return `hace ${years} año${years > 1 ? 's' : ''}`;
  } else if (daysAgo >= 30) {
    const months = Math.floor(daysAgo / 30);
    return `hace ${months} mes${months > 1 ? 'es' : ''}`;
  } else if (daysAgo >= 7) {
    const weeks = Math.floor(daysAgo / 7);
    return `hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
  } else if (daysAgo > 0) {
    return `hace ${daysAgo} día${daysAgo > 1 ? 's' : ''}`;
  } else {
    return 'hoy';
  }
}

const createCustomIcon = (
  isSelected: boolean,
  isFocused: boolean,
  isEnriched: boolean = false,
  location?: GeoLocation,
  criteriaTimestamp: number = 0,
  isRecentlyEnriched: boolean = false
) => {
  // Pin sizes - larger when focused/selected/recently enriched
  const pinHeight = isRecentlyEnriched ? 44 : isFocused ? 40 : isSelected ? 36 : 28;
  const pinWidth = pinHeight * 0.7;
  const dotSize = pinHeight * 0.25;

  // Get color based on criteria status
  const criteriaStatus = location
    ? getCriteriaColor(location, criteriaTimestamp)
    : {
        color: 'hsl(0, 72%, 51%)',
        gradient: 'linear-gradient(135deg, hsl(0, 72%, 56%), hsl(0, 84%, 45%))',
        status: 'new' as CriteriaStatus,
      };

  // Adjust brightness for selection/focus
  let gradient = criteriaStatus.gradient;
  if (isFocused) {
    gradient = criteriaStatus.gradient.replace('42%', '52%').replace('36%', '46%').replace('56%', '66%').replace('65%', '75%');
  } else if (isSelected) {
    gradient = criteriaStatus.gradient.replace('42%', '48%').replace('36%', '40%').replace('56%', '62%').replace('65%', '70%');
  }
  
  // Glow effect colors by status
  const glowColors: Record<CriteriaStatus, string> = {
    current: 'rgba(34, 197, 94, 0.5)',
    previous: 'rgba(59, 130, 246, 0.5)',
    unknown: 'rgba(107, 114, 128, 0.4)',
    new: 'rgba(239, 68, 68, 0.4)',
  };
  const glowColor = glowColors[criteriaStatus.status];
  
  // Animation style for recently enriched or focused
  const animationStyle = isRecentlyEnriched 
    ? 'animation: enriched-celebrate 3.5s ease-out;'
    : isFocused 
      ? 'animation: pulse 1s ease-in-out infinite;' 
      : '';
  
  // Shadow based on state
  const shadow = isFocused || isSelected || isRecentlyEnriched 
    ? `drop-shadow(0 3px 6px rgba(0,0,0,0.4)) drop-shadow(0 0 ${isRecentlyEnriched ? '10px' : '6px'} ${glowColor})`
    : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';

  // Classic pin/teardrop shape using SVG
  return L.divIcon({
    className: `custom-marker${isRecentlyEnriched ? ' recently-enriched' : ''}`,
    html: `
      <div style="
        width: ${pinWidth}px;
        height: ${pinHeight}px;
        position: relative;
        filter: ${shadow};
        ${animationStyle}
      ">
        <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="pinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${criteriaStatus.color.replace('36%', '50%').replace('51%', '60%').replace('53%', '62%').replace('60%', '70%')}" />
              <stop offset="100%" style="stop-color:${criteriaStatus.color}" />
            </linearGradient>
          </defs>
          <!-- Pin shape - teardrop -->
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" 
                fill="url(#pinGrad-${location?.id || 'default'})" 
                stroke="white" 
                stroke-width="1.5"/>
          <!-- Inner circle -->
          <circle cx="12" cy="12" r="${dotSize}" fill="white" fill-opacity="0.95"/>
        </svg>
      </div>
    `,
    iconSize: [pinWidth, pinHeight],
    iconAnchor: [pinWidth / 2, pinHeight],
    popupAnchor: [0, -pinHeight + 4],
  });
};

// Helper para crear links de filtro
function createFilterLink(value: string, type: 'zone' | 'region' | 'country' | 'continent'): string {
  return `<a href="#" class="filter-link" data-filter-type="${type}" data-filter-value="${value}" style="color: #6b7280; text-decoration: none; transition: color 0.15s;" onmouseover="this.style.color='#0ea5e9';this.style.textDecoration='underline'" onmouseout="this.style.color='#6b7280';this.style.textDecoration='none'">${value}</a>`;
}

// Parsear localización en partes clicables
function parseLocalizacionToLinks(localizacion: string, location: GeoLocation): string {
  // Si tenemos datos estructurados, usarlos
  const parts: string[] = [];
  
  if (location.zone) parts.push(createFilterLink(location.zone, 'zone'));
  if (location.region) parts.push(createFilterLink(location.region, 'region'));
  if (location.country) parts.push(createFilterLink(location.country, 'country'));
  if (location.continent) parts.push(createFilterLink(location.continent, 'continent'));
  
  if (parts.length > 0) {
    return parts.join(', ');
  }
  
  // Fallback: usar la localización tal cual
  return localizacion;
}

// Helper function to build image section with visibility logic
function buildImageSection(
  location: GeoLocation,
  enriched: any,
  ownership: { isOwn: boolean; isFollowing?: boolean; ownerName?: string }
): string {
  const userImageUrl = location.customData?.user_image_url as string | undefined;
  const userImageVisibility = (location.customData?.user_image_visibility as string) || 'private';
  const aiImage = enriched?.imagen;
  
  // La foto del usuario solo se muestra si:
  // 1. Es el propietario (ownership.isOwn)
  // 2. Es pública (visibility === 'public')
  // 3. Es para seguidores (visibility === 'followers') y el viewer es seguidor
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
      <div style="position: absolute; bottom: 8px; right: 8px; display: flex; gap: 6px;">
        ${hasUserImage ? `
          <button 
            class="popup-action-btn" 
            data-action="delete-photo" 
            data-location-id="${location.id}"
            style="display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: rgba(220,38,38,0.85); color: white; border: none; border-radius: 16px; font-size: 10px; font-weight: 500; cursor: pointer; backdrop-filter: blur(4px); transition: all 0.15s;"
            onmouseover="this.style.background='rgba(185,28,28,0.95)'"
            onmouseout="this.style.background='rgba(220,38,38,0.85)'"
            title="Eliminar mi foto y mostrar imagen IA"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
            Quitar
          </button>
        ` : ''}
        <button 
          class="popup-action-btn" 
          data-action="upload-photo" 
          data-location-id="${location.id}"
          data-location-name="${locationName}"
          style="display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 16px; font-size: 10px; font-weight: 500; cursor: pointer; backdrop-filter: blur(4px); transition: all 0.15s;"
          onmouseover="this.style.background='rgba(0,0,0,0.85)'"
          onmouseout="this.style.background='rgba(0,0,0,0.7)'"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          ${hasUserImage ? 'Cambiar' : 'Añadir foto'}
        </button>
      </div>`;
  }
  
  return `<div style="margin: 0 -12px 0 -12px; position: relative;">
    ${imageHtml}
    ${buttonHtml}
  </div>`;
}


function createPopupContent(
  location: GeoLocation, 
  criteriaTimestamp: number = 0,
  ownership?: { isOwn: boolean; isFollowing?: boolean; ownerName?: string }
): string {
  // Check if regeneration is allowed (only if criteria changed since last update)
  const locationUpdatedAt = location.updatedAt ? new Date(location.updatedAt).getTime() : 0;
  const canRegenerate = !location.enrichedData || locationUpdatedAt < criteriaTimestamp;
  const enriched = location.enrichedData;
  const hasClassification = !!enriched?.clasificacion?.codigo;
  
  // Ownership indicator
  const isOwn = ownership?.isOwn ?? true;
  const ownerName = ownership?.ownerName;
  
  // Get status color for the status bar
  const statusInfo = getCriteriaColor(location, criteriaTimestamp);
  const statusLabels: Record<CriteriaStatus, string> = {
    current: 'Completado',
    previous: 'Pendiente actualizar',
    unknown: 'Sin ficha IA',
    new: 'Sin procesar',
  };
  
  // Ownership badge HTML con fecha de registro
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
  
  // Status bar HTML - colored line at the top
  const statusBarHtml = `
    <div style="
      height: 6px;
      background: ${statusInfo.gradient};
      margin: 0 -12px 0 -12px;
      border-radius: 8px 8px 0 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    "></div>
  `;
  
  // Progress bar container (hidden by default, shown via JS when action starts)
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
  
  // Get existing notes and visited status from customData
  // Support both legacy (notes in customData) and new system (has_notes flag)
  const existingNotes = location.customData?.notes || '';
  const hasNotes = !!existingNotes || location.customData?.has_notes === 'true';
  const isVisited = location.customData?.visited === 'true';
  
  // Calculate visit relevance grade based on oldest verification date
  const visitRelevance = isVisited ? calculateVisitRelevanceInline(
    location.customData?.visited_verified_at,
    location.customData?.oldest_geotagged_photo_date
  ) : null;

  // Action buttons HTML - minimal size with bottom spacing
  const actionButtonsHtml = `
    ${progressBarHtml}
    <div style="display: flex; gap: 4px; margin-top: 8px; padding-top: 8px; padding-bottom: 6px; border-top: 1px solid #e5e7eb;">
      <button 
        class="popup-action-btn" 
        data-action="quick-classify" 
        data-location-id="${location.id}"
        ${hasClassification ? 'disabled' : ''}
        style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 4px 6px; background: ${hasClassification ? '#f0fdf4' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)'}; color: ${hasClassification ? '#166534' : 'white'}; border: none; border-radius: 3px; font-size: 10px; font-weight: 500; cursor: ${hasClassification ? 'default' : 'pointer'}; transition: all 0.15s; opacity: ${hasClassification ? '0.8' : '1'};"
        ${!hasClassification ? `onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'"` : ''}
      >
        ${hasClassification ? `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Clasificado
        ` : `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/>
            <path d="M13.5 6.5l4 4"/>
          </svg>
          Clasificar
        `}
      </button>
      <button 
        class="popup-action-btn" 
        data-action="regenerate" 
        data-location-id="${location.id}"
        ${!canRegenerate ? 'disabled' : ''}
        style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 4px 6px; background: ${canRegenerate ? '#f3f4f6' : '#f0fdf4'}; color: ${canRegenerate ? '#374151' : '#166534'}; border: none; border-radius: 3px; font-size: 10px; font-weight: 500; cursor: ${canRegenerate ? 'pointer' : 'default'}; transition: all 0.15s; opacity: ${canRegenerate ? '1' : '0.8'};"
        ${canRegenerate ? `onmouseover="this.style.background='#e5e7eb';this.style.transform='translateY(-1px)'" onmouseout="this.style.background='#f3f4f6';this.style.transform='none'"` : ''}
        title="${!canRegenerate ? 'Ficha actualizada según criterios actuales' : (enriched ? 'Regenerar ficha completa' : 'Generar ficha IA')}"
      >
        ${!canRegenerate ? `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Actualizado
        ` : `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M21 21v-5h-5"/>
          </svg>
          ${enriched ? 'Regenerar' : 'Generar IA'}
        `}
      </button>
      <button 
        class="popup-action-btn" 
        data-action="add-notes" 
        data-location-id="${location.id}"
        style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 4px 6px; background: ${hasNotes ? '#fef3c7' : '#f3f4f6'}; color: ${hasNotes ? '#92400e' : '#374151'}; border: none; border-radius: 3px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
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
    </div>
  `;
  
  // Si tiene ficha enriquecida, mostrarla sin tabs
  if (enriched) {
    const localizacionLinks = parseLocalizacionToLinks(enriched.localizacion, location);
    const popupId = `popup-${location.id.slice(0, 8)}`;

    const ownershipInfo = {
      isOwn,
      ownerName,
      isFollowing: ownership?.isFollowing,
    };

    // No inline scripts - usamos event delegation

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
          
          <!-- Botones de interacción: Visitado + Índice IA + Mi valoración - TODO EN UNA LÍNEA -->
          <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 10px; padding: 8px; background: #f9fafb; border-radius: 8px;">
            <!-- Warning de validación (oculto por defecto) -->
            <div id="visit-validation-warning-${location.id}" style="display: none; width: 100%; padding: 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #fcd34d; border-radius: 8px; margin-bottom: 4px;">
              <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: #92400e;">⚠️ No se puede validar la visita</p>
              <p id="visit-distance-text-${location.id}" style="margin: 0 0 6px 0; font-size: 10px; color: #a16207;"></p>
              <div style="font-size: 9px; color: #78350f; border-top: 1px solid #fcd34d; padding-top: 6px;">
                <p style="margin: 0 0 3px 0; font-weight: 500;">Criterios de validación:</p>
                <ul style="margin: 0; padding-left: 14px;">
                  <li>Estar a menos de 500m del lugar</li>
                  <li>Subir una foto con geolocalización (EXIF GPS)</li>
                </ul>
              </div>
            </div>
            
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
              ${isVisited && visitRelevance ? `
                <span 
                  style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: ${visitRelevance.bgColor}; color: ${visitRelevance.color}; border: 1px solid ${visitRelevance.borderColor}; border-radius: 10px; font-size: 9px; font-weight: 500;"
                  title="${visitRelevance.label} - Verificado ${visitRelevance.verificationType === 'photo' ? '📷' : '📍'} ${formatTimeAgoInline(visitRelevance.daysAgo)}"
                >
                  ${visitRelevance.label}
                </span>
              ` : ''}
              <button 
                class="popup-action-btn" 
                data-action="toggle-visited" 
                data-location-id="${location.id}"
                style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisited ? '#dcfce7' : '#fff'}; color: ${isVisited ? '#166534' : '#6b7280'}; border: 1px solid ${isVisited ? '#86efac' : '#e5e7eb'}; border-radius: 12px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
                title="${isVisited ? 'Click para desmarcar' : 'Requiere estar a menos de 500m o subir foto con GPS'}"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="${isVisited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
                ${isVisited ? 'Visitado' : 'Visitado'}
              </button>
              
              ${enriched.indice_interes ? `
                <div style="display: inline-flex; align-items: center; gap: 2px; padding: 3px 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px;" title="${enriched.indice_interes_notas || 'Índice de interés IA'}">
                  <span style="font-size: 11px; color: #b45309;">${'★'.repeat(enriched.indice_interes)}${'☆'.repeat(5 - enriched.indice_interes)}</span>
                </div>
              ` : ''}
              
              ${isVisited ? `
                <div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal">
                  ${[1,2,3,4,5].map(star => `
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
          
          <!-- Punto destacado - H3 sin fondo -->
          <div style="clear: both; display: block; margin: 0 0 12px 0;">
            <h3 style="margin: 0; font-size: 13px; color: #1f2937; font-weight: 600; line-height: 1.45;">
              ${enriched.punto_destacado}
            </h3>
          </div>
          
          <!-- Descripción - P normal en contenedor con scroll -->
          <div style="clear: both; display: block; margin: 0 0 12px 0; max-height: 160px; overflow-y: auto; overflow-x: hidden;">
            <p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.6;">
              ${enriched.descripcion}
            </p>
          </div>
          
          <!-- Observación (si existe) - P italic sin fondo -->
          ${enriched.observacion ? `
            <div style="clear: both; display: block; margin: 0 0 12px 0;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; font-style: italic; line-height: 1.5;">
                ${enriched.observacion}
              </p>
            </div>
          ` : ''}
          
          <!-- Web referencia (antes de etiquetas) -->
          ${enriched.datos_clave?.web_referencia ? `
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #f0f9ff; border-radius: 8px;">
              <span style="font-size: 11px; color: #6b7280; flex-shrink: 0;">🌐 Web:</span>
              <a href="${enriched.datos_clave.web_referencia.startsWith('http') ? enriched.datos_clave.web_referencia : 'https://' + enriched.datos_clave.web_referencia}" target="_blank" style="color: #0369a1; font-size: 11px; word-break: break-all; text-decoration: none; flex: 1;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
                ${enriched.datos_clave.web_referencia}
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
          ` : ''}
          
          <!-- Separador antes de etiquetas -->
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
          
          <!-- Etiquetas geográficas -->
          ${enriched.etiquetas_geograficas?.length ? `
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
              ${enriched.etiquetas_geograficas.map(tag => `
                <span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #e0f2fe; color: #0369a1; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'">
                  #${tag.replace('#', '').replace(/\s+/g, '')}
                </span>
              `).join('')}
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
          ` : ''}
          
          <!-- Clasificación tags -->
          ${enriched.clasificacion?.codigo ? `
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
              ${enriched.clasificacion.categoria_principal ? `
                <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                  #${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '').replace(/\s+/g, '')}
                </span>
              ` : ''}
              ${enriched.clasificacion.subcategoria ? `
                <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                  #${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '').replace(/\s+/g, '')}
                </span>
              ` : ''}
              ${enriched.clasificacion.tipo_especifico ? `
                <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                  #${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '').replace(/\s+/g, '')}
                </span>
              ` : ''}
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
          ` : ''}
          
          <!-- Hashtags temáticos -->
          ${enriched.etiquetas?.length ? `
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
              ${enriched.etiquetas.filter(tag => !enriched.etiquetas_geograficas?.some(gt => gt.toLowerCase() === tag.toLowerCase())).map(tag => `
                <span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #f3e8ff; color: #7c3aed; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">
                  #${tag.replace('#', '').replace(/\s+/g, '')}
                </span>
              `).join('')}
            </div>
          ` : ''}
          
          <!-- Sección colapsable: Descripción original KML -->
          ${location.description ? `
          <div style="border-top: 1px solid #e5e7eb; margin-top: 4px;">
            <button class="popup-toggle-original" data-popup-id="${popupId}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 0; background: none; border: none; cursor: pointer; color: #6b7280; font-size: 12px; font-weight: 500;">
              <span>📄 Descripción original</span>
              <svg class="toggle-arrow-original" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            
            <div class="original-content" data-popup-id="${popupId}" style="display: none;">
              <div style="background: #f9fafb; border-radius: 8px; padding: 10px; font-size: 12px; color: #4b5563; line-height: 1.5; max-height: 150px; overflow-y: auto; white-space: pre-wrap;">
                ${location.description}
              </div>
            </div>
          </div>
          ` : ''}
          
          <!-- Sección colapsable: Datos clave + Fuentes -->
          <div style="border-top: 1px solid #e5e7eb; margin-top: 4px;">
            <button class="popup-toggle-tech" data-popup-id="${popupId}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 0; background: none; border: none; cursor: pointer; color: #6b7280; font-size: 12px; font-weight: 500;">
              <span>📋 Datos técnicos</span>
              <svg class="toggle-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            
            <div class="tech-content" data-popup-id="${popupId}" style="display: none;">
              <!-- Datos clave table -->
              ${enriched.datos_clave ? `
              <div style="background: #f9fafb; border-radius: 8px; padding: 10px; margin-bottom: 10px; font-size: 12px;">
                <div style="display: grid; gap: 6px;">
                  ${enriched.datos_clave.tipo ? `
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #6b7280;">Tipo</span>
                    <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.datos_clave.tipo}" style="color: #1f2937; font-weight: 500; cursor: pointer;">${enriched.datos_clave.tipo}</span>
                  </div>
                  ` : ''}
                  ${enriched.datos_clave.dimension_principal ? `
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: #6b7280;">Dimensión</span>
                      <span style="color: #1f2937; font-weight: 500;">${enriched.datos_clave.dimension_principal}</span>
                    </div>
                  ` : ''}
                  ${enriched.datos_clave.acceso ? `
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: #6b7280;">Acceso</span>
                      <span style="color: #1f2937; font-weight: 500; text-align: right; max-width: 55%;">${enriched.datos_clave.acceso}</span>
                    </div>
                  ` : ''}
                  ${enriched.datos_clave.estado_proteccion ? `
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: #6b7280;">Protección</span>
                      <span style="color: #1f2937; font-weight: 500; text-align: right; max-width: 55%;">${enriched.datos_clave.estado_proteccion}</span>
                    </div>
                  ` : ''}
                  ${enriched.datos_clave.coordenadas ? `
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #6b7280;">Coordenadas</span>
                    <span style="color: #1f2937; font-family: monospace; font-size: 10px;">${enriched.datos_clave.coordenadas}</span>
                  </div>
                  ` : ''}
                </div>
              </div>
              ` : ''}
              
              <!-- Fuentes -->
              ${enriched.fuentes && Array.isArray(enriched.fuentes) && enriched.fuentes.length > 0 ? `
              <div style="font-size: 10px; color: #9ca3af;">
                <div style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; font-weight: 500;">Fuentes</div>
                <div style="max-height: 60px; overflow-y: auto; background: #fafafa; padding: 6px 8px; border-radius: 6px;">
                  ${enriched.fuentes.map(f => `<div style="margin-bottom: 2px;">• ${f}</div>`).join('')}
                </div>
              </div>
              ` : ''}
            </div>
          </div>
          
          <!-- Botones de acción siempre visibles al pie -->
          ${actionButtonsHtml}
        </div>
      </div>
    `;
  }
  
  // Fallback: mostrar datos originales
  // Build ownership info for image section
  const ownershipInfo = {
    isOwn,
    ownerName,
    isFollowing: ownership?.isFollowing,
  };
  
  // Filter out user_image_url and user_image_visibility from custom data display
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
      
      <!-- Imagen con botón de cámara para propietarios (también en popup sin ficha IA) -->
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
        
        <!-- Botón Visitado + Rating (también en popup sin ficha IA) -->
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
              style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisited ? '#dcfce7' : '#fff'}; color: ${isVisited ? '#166534' : '#6b7280'}; border: 1px solid ${isVisited ? '#86efac' : '#e5e7eb'}; border-radius: 12px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
              title="${isVisited ? 'Click para desmarcar' : 'Marcar como visitado'}"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="${isVisited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              Visitado
            </button>
            
            ${isVisited ? `
              <div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal">
                ${[1,2,3,4,5].map(star => `
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

export function LocationMap() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const locationsRef = useRef<Map<string, GeoLocation>>(new Map());
  const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const homeMarkerRef = useRef<L.Marker | null>(null);
  const userLocationMarkerRef = useRef<L.Marker | null>(null);
  const userLocationCircleRef = useRef<L.Circle | null>(null);
  const prevLocationsCountRef = useRef<number>(0);
  const prevFilterKeyRef = useRef<string>('');
  const [showZoomButton, setShowZoomButton] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('markers');
  const heatLayerRef = useRef<L.Layer | null>(null);
  const [mapTheme, setMapTheme] = useState<MapTheme>('light');
  const [showCenterSettings, setShowCenterSettings] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  
  // Map center config from database/localStorage
  const { config: mapCenterConfig, loading: mapCenterLoading } = useMapCenterConfig();
  
  // Track recently enriched locations for animation
  const [recentlyEnrichedIds, setRecentlyEnrichedIds] = useState<Set<string>>(new Set());
  // Track previous enrichment state: store description length to detect actual content changes
  const previousEnrichmentStateRef = useRef<Map<string, number>>(new Map());

  // Force marker refresh when the "Criterios de Actualización" change
  const [criteriaVersion, setCriteriaVersion] = useState(0);
  
  // Force update counter for realtime and store updates
  const [forceUpdateCount, setForceUpdateCount] = useState(0);
  
  // Map center config version to trigger re-centering
  const [centerConfigVersion, setCenterConfigVersion] = useState(0);

  useEffect(() => {
    const handleCriteriaChanged = () => setCriteriaVersion((v) => v + 1);
    const handleRealtimeUpdate = () => setForceUpdateCount((v) => v + 1);
    
    // Listen for toolbar map control events
    const handleViewModeChange = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode;
      if (mode === 'markers' || mode === 'heatmap') {
        setViewMode(mode);
      }
    };
    
    const handleGoHome = () => {
      if (mapRef.current && mapCenterConfig?.homeLocation) {
        mapRef.current.setView(
          [mapCenterConfig.homeLocation.lat, mapCenterConfig.homeLocation.lng],
          12,
          { animate: true }
        );
        toast.success(`Centrando en ${mapCenterConfig.homeLocation.name || 'ubicación base'}`);
      } else if (mapRef.current && locations.length > 0) {
        // Fallback: zoom to all locations
        const bounds = L.latLngBounds(locations.map(l => [l.coordinates.lat, l.coordinates.lng]));
        mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });
      }
    };
    
    const handleSetTheme = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: MapTheme }>;
      if (customEvent.detail?.theme) {
        setMapTheme(customEvent.detail.theme);
      }
    };
    
    const handleFitBounds = (e: Event) => {
      const customEvent = e as CustomEvent<{ 
        bounds: [[number, number], [number, number]];
        padding?: [number, number];
        maxZoom?: number;
      }>;
      if (customEvent.detail?.bounds && mapRef.current) {
        const { bounds, padding = [50, 50], maxZoom = 18 } = customEvent.detail;
        const latLngBounds = L.latLngBounds(
          [bounds[0][0], bounds[0][1]],
          [bounds[1][0], bounds[1][1]]
        );
        mapRef.current.fitBounds(latLngBounds, { 
          padding, 
          maxZoom,
          animate: true 
        });
      }
    };
    
    window.addEventListener('enrichment-criteria-changed', handleCriteriaChanged);
    window.addEventListener('location-realtime-update', handleRealtimeUpdate);
    window.addEventListener('store-updated', handleRealtimeUpdate);
    window.addEventListener('map-view-mode', handleViewModeChange);
    window.addEventListener('map-go-home', handleGoHome);
    window.addEventListener('map-set-theme', handleSetTheme);
    window.addEventListener('map-fit-bounds', handleFitBounds);
    
    return () => {
      window.removeEventListener('enrichment-criteria-changed', handleCriteriaChanged);
      window.removeEventListener('location-realtime-update', handleRealtimeUpdate);
      window.removeEventListener('store-updated', handleRealtimeUpdate);
      window.removeEventListener('map-view-mode', handleViewModeChange);
      window.removeEventListener('map-go-home', handleGoHome);
      window.removeEventListener('map-set-theme', handleSetTheme);
      window.removeEventListener('map-fit-bounds', handleFitBounds);
    };
  }, [mapCenterConfig]);

  const criteriaTimestamp = React.useMemo(() => loadCriteriaTimestamp(), [criteriaVersion]);
  const criteriaKey = React.useMemo(() => String(criteriaTimestamp), [criteriaTimestamp]);

  const { 
    selectedLocations, 
    toggleLocationSelection, 
    getFilteredLocations,
    focusedLocationId,
    setFocusedLocation,
    setFilters,
    filters,
    selectedDocument,
    getLocationOwnership,
    documents, // Subscribe directly to documents for reactivity
  } = useLocationsStore();
  
  // Get current user ID for ownership detection
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    import('@/integrations/supabase/client').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setCurrentUserId(session?.user?.id || null);
      });
    });
  }, []);
  
  const locations = getFilteredLocations();
  // Compute allLocations from documents (reactive) instead of calling getAllLocations()
  const allLocations = React.useMemo(() => 
    documents.flatMap(doc => doc.locations), 
    [documents]
  );
  const totalLocations = allLocations.length;

  // Generate a key from current filters to detect changes
  const filterKey = JSON.stringify({
    continent: filters.continent,
    country: filters.country,
    region: filters.region,
    zone: filters.zone,
    tag: filters.tag,
    placeType: filters.placeType,
    onlyEnriched: filters.onlyEnriched,
    searchTerm: filters.searchTerm,
  });

  // Generate a key that changes when enrichment data OR criteria change
  // Use selectedDocument.locations to ensure we detect changes from the store
  // Also include forceUpdateCount to trigger updates from realtime/store events
  const enrichmentKey = React.useMemo(() => {
    if (!selectedDocument) return `${criteriaKey}-${forceUpdateCount}`;

    return selectedDocument.locations.reduce((acc, loc) => {
      const ed = loc.enrichedData;
      const cd = loc.customData;
      const signature = ed
        ? [
            ed.descripcion?.length || 0,
            ed.imagen ? 1 : 0,
            ed.datos_clave?.web_referencia ? 1 : 0,
            ed.etiquetas?.length || 0,
            ed.datos_clave?.tipo ? 1 : 0,
            ed.datos_clave?.acceso ? 1 : 0,
            ed.datos_clave?.estado_proteccion ? 1 : 0,
            ed.clasificacion?.codigo || 'nc',
            loc.continent ? 1 : 0,
            loc.country ? 1 : 0,
            loc.region ? 1 : 0,
            // Include customData for visited/rating updates
            cd?.visited || '0',
            cd?.user_rating || '0',
          ].join(':')
        : `orig:${loc.description?.length || 0}:${cd?.visited || '0'}:${cd?.user_rating || '0'}`;

      return acc + loc.id.slice(0, 4) + signature;
    }, `${criteriaKey}-${selectedDocument.locations.length}-${forceUpdateCount}-`);
  }, [selectedDocument?.locations, criteriaKey, selectedDocument, forceUpdateCount]);

  // Zoom to bounds function - fits all points in view
  // zoomOffset: 0 = fit all, 1 = one level closer (outer points outside view)
  const zoomToBounds = useCallback((immediate: boolean = false, zoomOffset: number = 0) => {
    if (!mapRef.current || locations.length === 0) return;
    
    const bounds = L.latLngBounds(
      locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
    );
    
    if (immediate) {
      // Immediate fit without animation (for initial load)
      mapRef.current.fitBounds(bounds, { 
        padding: [50, 50], 
        maxZoom: 16,
      });
      
      // Apply zoom offset after fitting
      if (zoomOffset > 0) {
        const currentZoom = mapRef.current.getZoom();
        mapRef.current.setZoom(currentZoom + zoomOffset);
      }
    } else {
      // Animated fly for user interactions
      mapRef.current.flyToBounds(bounds, { 
        padding: [50, 50], 
        maxZoom: 16,
        duration: 0.8 
      });
    }
    
    setShowZoomButton(false);
  }, [locations]);

  // Apply map center based on user configuration
  const applyMapCenter = useCallback((immediate: boolean = true, config?: MapCenterConfig) => {
    if (!mapRef.current) return;
    
    const centerConfig = config || mapCenterConfig;
    console.log('Applying map center config:', centerConfig);
    
    if (centerConfig.mode === 'home' && centerConfig.homeLocation) {
      // Center on home location
      const { lat, lng } = centerConfig.homeLocation;
      if (immediate) {
        mapRef.current.setView([lat, lng], 12);
      } else {
        mapRef.current.flyTo([lat, lng], 12, { duration: 0.8 });
      }
      // Then zoom to show points with offset
      if (locations.length > 0) {
        setTimeout(() => zoomToBounds(immediate, 1), immediate ? 50 : 800);
      }
    } else if (centerConfig.mode === 'geolocation') {
      // Use GPS location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            if (immediate) {
              mapRef.current?.setView([latitude, longitude], 12);
            } else {
              mapRef.current?.flyTo([latitude, longitude], 12, { duration: 0.8 });
            }
            // Then zoom to show points with offset
            if (locations.length > 0) {
              setTimeout(() => zoomToBounds(immediate, 1), immediate ? 50 : 800);
            }
          },
          (error) => {
            console.error('Geolocation error:', error);
            toast.error('No se pudo obtener tu ubicación GPS');
            // Fallback to auto
            if (locations.length > 0) {
              zoomToBounds(immediate, 1);
            }
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        // Fallback to auto
        if (locations.length > 0) {
          zoomToBounds(immediate, 1);
        }
      }
    } else {
      // Auto mode - zoom to show all points
      if (locations.length > 0) {
        zoomToBounds(immediate, 1);
      }
    }
  }, [locations, zoomToBounds, mapCenterConfig]);

  // Create home marker icon
  const createHomeMarkerIcon = useCallback(() => {
    return L.divIcon({
      className: 'home-marker-icon',
      html: `
        <div style="
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, hsl(142, 76%, 36%), hsl(142, 71%, 28%));
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }, []);

  // Create user location marker icon (pulsing blue dot)
  const createUserLocationIcon = useCallback(() => {
    return L.divIcon({
      className: 'user-location-icon',
      html: `
        <div style="position: relative;">
          <div style="
            width: 16px;
            height: 16px;
            background: #3b82f6;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 6px rgba(59, 130, 246, 0.5);
            animation: userLocationPulse 2s ease-in-out infinite;
          "></div>
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 40px;
            height: 40px;
            background: rgba(59, 130, 246, 0.2);
            border-radius: 50%;
            animation: userLocationRipple 2s ease-out infinite;
          "></div>
        </div>
      `,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }, []);

  // Get user's current location
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.log('Geolocation error:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Update user location marker
  useEffect(() => {
    if (!mapRef.current || !userLocation) return;

    // Remove existing markers
    if (userLocationMarkerRef.current) {
      mapRef.current.removeLayer(userLocationMarkerRef.current);
    }
    if (userLocationCircleRef.current) {
      mapRef.current.removeLayer(userLocationCircleRef.current);
    }

    // Add accuracy circle
    const accuracyCircle = L.circle([userLocation.lat, userLocation.lng], {
      radius: Math.min(userLocation.accuracy, 500), // Cap at 500m
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      weight: 1,
      opacity: 0.3,
    });
    accuracyCircle.addTo(mapRef.current);
    userLocationCircleRef.current = accuracyCircle;

    // Add marker
    const marker = L.marker([userLocation.lat, userLocation.lng], {
      icon: createUserLocationIcon(),
      zIndexOffset: 3000, // Above home marker
    });

    marker.bindPopup(`
      <div style="text-align: center; padding: 8px;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #3b82f6;">
          📍 Tu ubicación
        </div>
        <div style="font-size: 11px; color: #6b7280;">
          ${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}
        </div>
        <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">
          Precisión: ±${Math.round(userLocation.accuracy)}m
        </div>
      </div>
    `);

    marker.addTo(mapRef.current);
    userLocationMarkerRef.current = marker;
  }, [userLocation, createUserLocationIcon]);

  // Update home marker when config changes
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove existing home marker
    if (homeMarkerRef.current) {
      mapRef.current.removeLayer(homeMarkerRef.current);
      homeMarkerRef.current = null;
    }

    // Add new home marker if home mode is set
    if (mapCenterConfig.mode === 'home' && mapCenterConfig.homeLocation) {
      const { lat, lng, name } = mapCenterConfig.homeLocation;
      const homeMarker = L.marker([lat, lng], {
        icon: createHomeMarkerIcon(),
        zIndexOffset: 2000, // Above other markers
      });

      homeMarker.bindPopup(`
        <div style="text-align: center; padding: 8px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
            🏠 ${name || 'Mi casa'}
          </div>
          <div style="font-size: 12px; color: #6b7280;">
            ${lat.toFixed(6)}, ${lng.toFixed(6)}
          </div>
        </div>
      `);

      homeMarker.addTo(mapRef.current);
      homeMarkerRef.current = homeMarker;
    }
  }, [mapCenterConfig, createHomeMarkerIcon]);

  // Auto-zoom when filters change OR on initial load
  // Ref to track if initial zoom has happened
  const initialZoomDoneRef = useRef(false);
  
  useEffect(() => {
    // Wait for map center config to load before applying initial center
    if (!mapRef.current || locations.length === 0 || mapCenterLoading) return;
    
    const filterChanged = prevFilterKeyRef.current !== filterKey;
    const isInitialLoad = !initialZoomDoneRef.current;
    
    // Auto-zoom on initial load OR when filters change
    if (isInitialLoad) {
      // Initial load - apply map center configuration
      setTimeout(() => {
        applyMapCenter(true, mapCenterConfig);
        initialZoomDoneRef.current = true;
      }, 100);
    } else if (filterChanged) {
      // Filter change (including search) - animated transition to fit all filtered results
      setTimeout(() => {
        zoomToBounds(false, 0);
      }, 150);
    }
    
    prevFilterKeyRef.current = filterKey;
    prevLocationsCountRef.current = locations.length;
  }, [filterKey, locations.length, zoomToBounds, applyMapCenter, mapCenterLoading, mapCenterConfig]);
  
  // Re-apply center when config changes (user saved new settings)
  useEffect(() => {
    if (centerConfigVersion > 0 && mapRef.current && !mapCenterLoading) {
      // Reload config and apply
      applyMapCenter(false);
    }
  }, [centerConfigVersion, applyMapCenter, mapCenterLoading]);

  // Show zoom button when user pans away
  useEffect(() => {
    if (!mapRef.current) return;
    
    const checkBounds = () => {
      if (!mapRef.current || locations.length === 0) return;
      
      const mapBounds = mapRef.current.getBounds();
      const locationsInView = locations.filter(loc => 
        mapBounds.contains([loc.coordinates.lat, loc.coordinates.lng])
      );
      
      // Show button if less than 50% of locations are in view
      setShowZoomButton(locationsInView.length < locations.length * 0.5);
    };
    
    mapRef.current.on('moveend', checkBounds);
    
    return () => {
      mapRef.current?.off('moveend', checkBounds);
    };
  }, [locations]);

  // Handle filter link clicks from popups
  useEffect(() => {
    const handleFilterClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('filter-link')) {
        e.preventDefault();
        e.stopPropagation();
        
        const filterType = target.dataset.filterType as 'zone' | 'region' | 'country' | 'continent' | 'searchTerm' | 'tag';
        const filterValue = target.dataset.filterValue;
        
        if (filterType && filterValue) {
          if (filterType === 'searchTerm') {
            // When clicking on a hashtag/classification, clear ALL other filters to prevent zero results
            setFilters({ 
              searchTerm: filterValue,
              // Clear all other filters
              continent: undefined,
              country: undefined,
              region: undefined,
              zone: undefined,
              tag: undefined,
              classificationCode: undefined,
              placeType: undefined,
            });
          } else if (filterType === 'tag') {
            // Clear all geography and other filters when filtering by tag (inverse filter)
            setFilters({ 
              tag: filterValue,
              continent: undefined,
              country: undefined,
              region: undefined,
              zone: undefined,
              searchTerm: undefined,
              classificationCode: undefined,
            });
          } else if (filterType === 'continent') {
            // Clear children when setting continent
            setFilters({ ...filters, continent: filterValue, country: undefined, region: undefined, zone: undefined });
          } else if (filterType === 'country') {
            // Clear children when setting country
            setFilters({ ...filters, country: filterValue, region: undefined, zone: undefined });
          } else if (filterType === 'region') {
            // Clear children when setting region
            setFilters({ ...filters, region: filterValue, zone: undefined });
          } else {
            setFilters({ ...filters, [filterType]: filterValue });
          }
        }
      }
    };

    document.addEventListener('click', handleFilterClick);
    return () => document.removeEventListener('click', handleFilterClick);
  }, [setFilters, filters]);

  // Handle popup action button clicks
  useEffect(() => {
    const handleActionClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('.popup-action-btn') as HTMLElement | null;
      
      if (button) {
        e.preventDefault();
        e.stopPropagation();
        
        const action = button.dataset.action;
        const locationId = button.dataset.locationId;
        const rating = button.dataset.rating;
        const locationName = button.dataset.locationName;
        
        if (action && locationId) {
          // Dispatch custom event that will be handled by the app
          window.dispatchEvent(new CustomEvent('popup-action', {
            detail: { action, locationId, rating, locationName }
          }));
        }
      }
      
      // Handle tech toggle button
      const toggleBtn = target.closest('.popup-toggle-tech') as HTMLElement | null;
      if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        
        const popupId = toggleBtn.dataset.popupId;
        if (popupId) {
          const content = document.querySelector(`.tech-content[data-popup-id="${popupId}"]`) as HTMLElement;
          const arrow = toggleBtn.querySelector('.toggle-arrow') as HTMLElement;
          
          if (content) {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            if (arrow) {
              arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            }
          }
        }
      }
      
      // Handle original description toggle button
      const toggleOriginalBtn = target.closest('.popup-toggle-original') as HTMLElement | null;
      if (toggleOriginalBtn) {
        e.preventDefault();
        e.stopPropagation();
        
        const popupId = toggleOriginalBtn.dataset.popupId;
        if (popupId) {
          const content = document.querySelector(`.original-content[data-popup-id="${popupId}"]`) as HTMLElement;
          const arrow = toggleOriginalBtn.querySelector('.toggle-arrow-original') as HTMLElement;
          
          if (content) {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            if (arrow) {
              arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            }
          }
        }
      }
    };

    document.addEventListener('click', handleActionClick);
    return () => document.removeEventListener('click', handleActionClick);
  }, []);

  // Handle notes-updated event to refresh popup
  useEffect(() => {
    const handleNotesUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ locationId: string; notes: string; visibility: string }>;
      const { locationId } = customEvent.detail;
      
      // Find the marker and refresh its popup
      const marker = markersRef.current.get(locationId);
      const location = locationsRef.current.get(locationId);
      
      if (marker && location) {
        // Update the location's customData locally for immediate UI feedback
        const updatedLocation = {
          ...location,
          customData: {
            ...location.customData,
            has_notes: 'true',
          }
        };
        locationsRef.current.set(locationId, updatedLocation);
        
        // Regenerate popup content with ownership info
        const ownership = getLocationOwnership(locationId, currentUserId);
        marker.setPopupContent(createPopupContent(updatedLocation, criteriaTimestamp, ownership));
        
        // Reopen popup if it was open
        if (marker.isPopupOpen()) {
          marker.openPopup();
        }
      }
    };

    window.addEventListener('notes-updated', handleNotesUpdated);
    return () => window.removeEventListener('notes-updated', handleNotesUpdated);
  }, [criteriaTimestamp, getLocationOwnership, currentUserId]);

  // Handle photo-updated event to refresh popup after photo upload/delete
  useEffect(() => {
    const handlePhotoUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ locationId: string; imageUrl: string | null; visibility: string | null }>;
      const { locationId, imageUrl, visibility } = customEvent.detail;
      
      // Find the marker and refresh its popup
      const marker = markersRef.current.get(locationId);
      const location = locationsRef.current.get(locationId);
      
      if (marker && location) {
        // Update the location's customData locally for immediate UI feedback
        const updatedCustomData = { ...location.customData };
        if (imageUrl) {
          updatedCustomData.user_image_url = imageUrl;
          updatedCustomData.user_image_visibility = visibility || 'private';
        } else {
          delete updatedCustomData.user_image_url;
          delete updatedCustomData.user_image_visibility;
        }
        
        const updatedLocation = {
          ...location,
          customData: Object.keys(updatedCustomData).length ? updatedCustomData : undefined,
        };
        locationsRef.current.set(locationId, updatedLocation);
        
        // Regenerate popup content with ownership info
        const ownership = getLocationOwnership(locationId, currentUserId);
        marker.setPopupContent(createPopupContent(updatedLocation, criteriaTimestamp, ownership));
        
        // Reopen popup if it was open
        if (marker.isPopupOpen()) {
          marker.openPopup();
        }
      }
    };

    window.addEventListener('photo-updated', handlePhotoUpdated);
    return () => window.removeEventListener('photo-updated', handlePhotoUpdated);
  }, [criteriaTimestamp, getLocationOwnership, currentUserId]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Define world bounds to prevent map from repeating
    const worldBounds = L.latLngBounds(
      L.latLng(-85, -180), // Southwest corner
      L.latLng(85, 180)    // Northeast corner
    );

    mapRef.current = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2, // Prevent zooming out too far
      maxBounds: worldBounds,
      maxBoundsViscosity: 1.0, // Completely restrict panning outside bounds
      scrollWheelZoom: true,
      worldCopyJump: false, // Prevent world from wrapping
    });

    // Add tile layer
    const tileConfig = MAP_TILE_LAYERS[mapTheme];
    tileLayerRef.current = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: 19,
      noWrap: true, // Prevent tiles from repeating
    }).addTo(mapRef.current);

    // Initialize marker cluster group
    markerClusterRef.current = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count > 50) size = 'large';
        else if (count > 10) size = 'medium';
        
        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: `marker-cluster marker-cluster-${size}`,
          iconSize: L.point(40, 40),
        });
      },
    });

    // Cluster layer not added by default anymore

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update tile layer when theme changes
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    
    const tileConfig = MAP_TILE_LAYERS[mapTheme];
    tileLayerRef.current.setUrl(tileConfig.url);
  }, [mapTheme]);

  // Track pending popup to open after marker updates
  const pendingPopupRef = useRef<string | null>(null);

  // Only recreate markers when location list changes (add/remove), not on enrichment updates
  const locationIds = React.useMemo(() => locations.map(l => l.id).sort().join(','), [locations]);
  
  useEffect(() => {
    if (!mapRef.current || !markerClusterRef.current) return;

    // Clear existing markers from map
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();
    locationsRef.current.clear();

    if (locations.length === 0) return;

    const markersToAdd: L.Marker[] = [];

    // Add new markers
    locations.forEach((location) => {
      const isSelected = selectedLocations.has(location.id);
      const isFocused = focusedLocationId === location.id;
      const isEnriched = !!location.enrichedData;

      const marker = L.marker([location.coordinates.lat, location.coordinates.lng], {
        icon: createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp),
      });

      // Create popup with content including ownership info
      const ownership = getLocationOwnership(location.id, currentUserId);
      const popupContent = createPopupContent(location, criteriaTimestamp, ownership);
      marker.bindPopup(popupContent, {
        maxWidth: 380,
        minWidth: 280,
        className: 'custom-popup',
        closeButton: true,
        autoPan: true,
        autoPanPadding: L.point(50, 50),
      });

      marker.on('click', function (this: L.Marker) {
        this.openPopup();
        
        // Wait for popup to render, then pan to center it vertically
        setTimeout(() => {
          const map = mapRef.current;
          if (!map) return;
          
          const popup = this.getPopup();
          if (!popup || !popup.isOpen()) return;
          
          // Get popup element and its actual height
          const popupElement = popup.getElement();
          if (!popupElement) return;
          
          const popupRect = popupElement.getBoundingClientRect();
          const popupHeight = popupRect.height;
          
          // Get map container dimensions
          const container = map.getContainer();
          const containerRect = container.getBoundingClientRect();
          const viewportHeight = containerRect.height;
          
          // Get marker position in container coordinates
          const markerLatLng = this.getLatLng();
          const markerPoint = map.latLngToContainerPoint(markerLatLng);
          
          // The popup appears ABOVE the marker
          // We want the popup to be vertically centered in the viewport
          // So the marker should be positioned at: viewportCenter + popupHeight/2
          const idealMarkerY = (viewportHeight / 2) + (popupHeight / 2);
          
          // Calculate how much to pan
          const offsetY = markerPoint.y - idealMarkerY;
          
          // Only pan if the offset is significant
          if (Math.abs(offsetY) > 30) {
            map.panBy([0, offsetY], { animate: true, duration: 0.35 });
          }
        }, 100);
      });

      marker.on('dblclick', () => {
        toggleLocationSelection(location.id);
      });

      marker.on('popupclose', () => {
        if (focusedLocationId === location.id) {
          setFocusedLocation(null);
        }
      });

      markersRef.current.set(location.id, marker);
      locationsRef.current.set(location.id, location);
      
      // Add marker to map (will be hidden in heatmap mode)
      marker.addTo(mapRef.current!);
    });

    // Fit bounds only on initial load
    if (locations.length > 0 && prevLocationsCountRef.current === 0) {
      const bounds = L.latLngBounds(
        locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { 
        padding: [50, 50], 
        maxZoom: 12 
      });
    }
  }, [locationIds, toggleLocationSelection, setFocusedLocation, viewMode]);

  // Handle view mode changes (heatmap/markers)
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Handle heatmap layer
    if (viewMode === 'heatmap') {
      // Remove old heat layer if exists
      if (heatLayerRef.current && mapRef.current.hasLayer(heatLayerRef.current)) {
        mapRef.current.removeLayer(heatLayerRef.current);
      }
      
      // Calculate dynamic intensity based on point density
      const pointCount = locations.length;
      
      // For few points, use higher individual intensity
      // For many points, let clustering create natural hotspots
      const baseIntensity = pointCount <= 1 ? 1.0 : 
                           pointCount <= 10 ? 0.8 : 
                           pointCount <= 50 ? 0.6 : 
                           pointCount <= 200 ? 0.4 : 0.3;
      
      // Dynamic radius: larger for fewer points, smaller for many
      const dynamicRadius = pointCount <= 1 ? 50 : 
                           pointCount <= 10 ? 40 : 
                           pointCount <= 50 ? 30 : 
                           pointCount <= 200 ? 25 : 20;
      
      // Dynamic blur: more blur for fewer points for smoother appearance
      const dynamicBlur = pointCount <= 1 ? 30 : 
                         pointCount <= 10 ? 25 : 
                         pointCount <= 50 ? 20 : 15;
      
      // Create heat data from locations with dynamic intensity
      const heatData: [number, number, number][] = locations.map(loc => [
        loc.coordinates.lat,
        loc.coordinates.lng,
        baseIntensity
      ]);
      
      // Normalize max based on expected clustering
      const dynamicMax = pointCount <= 1 ? 0.5 : 
                        pointCount <= 10 ? 0.6 : 
                        pointCount <= 50 ? 0.8 : 1.0;
      
      // Create new heat layer with optimized settings
      heatLayerRef.current = L.heatLayer(heatData, {
        radius: dynamicRadius,
        blur: dynamicBlur,
        maxZoom: 18,
        max: dynamicMax,
        minOpacity: 0.4, // Ensure minimum visibility
        gradient: {
          0.0: '#60a5fa',  // Lighter blue for better visibility
          0.2: '#22c55e', 
          0.4: '#84cc16',
          0.6: '#eab308',
          0.8: '#f97316',
          1.0: '#dc2626'
        }
      });
      
      heatLayerRef.current.addTo(mapRef.current);
      
      // Hide markers in heatmap mode but keep them for popup interactions
      markersRef.current.forEach(marker => {
        const icon = marker.getIcon() as L.DivIcon;
        if (icon.options.className) {
          marker.setOpacity(0);
        }
      });
    } else {
      // Remove heat layer
      if (heatLayerRef.current && mapRef.current.hasLayer(heatLayerRef.current)) {
        mapRef.current.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      
      // Show markers again
      markersRef.current.forEach(marker => {
        marker.setOpacity(1);
      });
    }
  }, [viewMode, locations]);

  // Update popup content and icons when enrichment data changes (without recreating markers)
  useEffect(() => {
    if (!mapRef.current) return;
    
    locations.forEach(location => {
      const marker = markersRef.current.get(location.id);
      if (!marker) return;
      
      // Verify location has valid data before updating popup
      if (!location || !location.id) return;
      
      // Update the stored location reference
      locationsRef.current.set(location.id, location);
      
      // Update popup content - with safety check and ownership info
      try {
        const ownership = getLocationOwnership(location.id, currentUserId);
        const popupContent = createPopupContent(location, criteriaTimestamp, ownership);
        marker.setPopupContent(popupContent);
      } catch (e) {
        console.warn('Error updating popup content for location:', location.id, e);
      }
      
      // Update icon
      const isSelected = selectedLocations.has(location.id);
      const isFocused = focusedLocationId === location.id;
      const isEnriched = !!location.enrichedData;
      const isRecentlyEnriched = recentlyEnrichedIds.has(location.id);
      marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched));
    });
    
    // Open pending popup if any
    if (pendingPopupRef.current) {
      const marker = markersRef.current.get(pendingPopupRef.current);
      if (marker) {
        marker.openPopup();
      }
      pendingPopupRef.current = null;
    }
  }, [enrichmentKey, selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, getLocationOwnership, currentUserId]);

  // Initialize the previous enrichment state on first load (to avoid false positives)
  const isInitializedRef = useRef(false);
  
  useEffect(() => {
    // On first render, populate the ref with current enrichment states without triggering animations
    if (!isInitializedRef.current && allLocations.length > 0) {
      allLocations.forEach(loc => {
        // Store description length: 0 = not enriched, >0 = enriched
        previousEnrichmentStateRef.current.set(loc.id, loc.enrichedData?.descripcion?.length || 0);
      });
      isInitializedRef.current = true;
      console.log('Initialized enrichment state tracking for', allLocations.length, 'locations');
    }
  }, [allLocations]); // Use allLocations instead of just length to detect reference changes

  // Detect newly enriched locations and trigger animation + open popup
  useEffect(() => {
    // Skip if not initialized yet
    if (!isInitializedRef.current) return;
    
    console.log('🔍 Checking for enrichment changes, allLocations count:', allLocations.length);
    
    const newlyEnriched: string[] = [];
    
    // Use allLocations (not filtered) to detect any enrichment changes
    allLocations.forEach(loc => {
      const prevDescLength = previousEnrichmentStateRef.current.get(loc.id) ?? -1;
      const currentDescLength = loc.enrichedData?.descripcion?.length || 0;
      
      // If this location wasn't tracked before (-1), add it now
      if (prevDescLength === -1) {
        previousEnrichmentStateRef.current.set(loc.id, currentDescLength);
        console.log('📌 New location tracked:', loc.name, 'desc length:', currentDescLength);
        return; // Don't trigger animation for newly tracked locations
      }
      
      // Detect NEW enrichment (from 0 to >0) OR significant content update
      const wasNotEnriched = prevDescLength === 0;
      const isNowEnriched = currentDescLength > 0;
      const hasSignificantChange = currentDescLength > prevDescLength + 50; // More than 50 chars added
      
      if ((wasNotEnriched && isNowEnriched) || hasSignificantChange) {
        newlyEnriched.push(loc.id);
        console.log('🎉 Newly enriched location detected:', loc.name, loc.id, 
          'prev:', prevDescLength, 'current:', currentDescLength);
      }
      
      // Update previous state
      previousEnrichmentStateRef.current.set(loc.id, currentDescLength);
    });
    
    if (newlyEnriched.length > 0) {
      console.log('🎊 Triggering celebration for:', newlyEnriched.length, 'locations');
      
      // Play celebration sound
      playEnrichmentComplete();
      
      // Show toast for each enriched location
      newlyEnriched.forEach(id => {
        const loc = allLocations.find(l => l.id === id);
        if (loc) {
          toast.success(`✨ ${loc.name}`, {
            description: 'Enriquecimiento completado',
            duration: 3000,
          });
        }
      });
      
      setRecentlyEnrichedIds(prev => {
        const next = new Set(prev);
        newlyEnriched.forEach(id => next.add(id));
        return next;
      });
      
      // Open popup for the most recently enriched location and pan to it
      const lastEnrichedId = newlyEnriched[newlyEnriched.length - 1];
      const location = allLocations.find(l => l.id === lastEnrichedId);
      
      if (location && mapRef.current) {
        // Pan to the location
        mapRef.current.setView(
          [location.coordinates.lat, location.coordinates.lng],
          Math.max(mapRef.current.getZoom(), 10),
          { animate: true, duration: 0.5 }
        );
        
        // Open popup directly after a short delay to allow marker icon update
        setTimeout(() => {
          const marker = markersRef.current.get(lastEnrichedId);
          if (marker) {
            marker.openPopup();
            console.log('📍 Opened popup for enriched location:', location.name);
          }
        }, 600); // Wait for pan animation + marker update
      }
      
      // Clear the animation after 4 seconds (matching longer animation)
      setTimeout(() => {
        setRecentlyEnrichedIds(prev => {
          const next = new Set(prev);
          newlyEnriched.forEach(id => next.delete(id));
          return next;
        });
      }, 4000);
    }
  }, [allLocations, enrichmentKey]);

  // Update marker icons when selection or focus changes
  useEffect(() => {
    markersRef.current.forEach((marker, locationId) => {
      const location = locationsRef.current.get(locationId);
      const isSelected = selectedLocations.has(locationId);
      const isFocused = focusedLocationId === locationId;
      const isEnriched = !!location?.enrichedData;
      const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
      marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched));
    });
  }, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds]);

  // Handle focused location - pan and open popup
  useEffect(() => {
    if (!focusedLocationId || !mapRef.current) return;

    const marker = markersRef.current.get(focusedLocationId);
    const location = locationsRef.current.get(focusedLocationId);
    
    if (marker && location) {
      // Pan to the location
      mapRef.current.setView(
        [location.coordinates.lat, location.coordinates.lng],
        Math.max(mapRef.current.getZoom(), 10),
        { animate: true, duration: 0.5 }
      );
      
      // Open the popup after a short delay to allow panning
      setTimeout(() => {
        marker.openPopup();
      }, 300);
    }
  }, [focusedLocationId]);

  // Show empty state message overlaying the map, not replacing it
  const showEmptyState = locations.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full w-full overflow-hidden relative"
    >
      <div ref={mapContainerRef} className="h-full w-full" />
      
      {/* Floating zoom button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: showZoomButton ? 1 : 0, 
          scale: showZoomButton ? 1 : 0.8,
          pointerEvents: showZoomButton ? 'auto' : 'none'
        }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[999]"
      >
        <Button
          onClick={() => zoomToBounds(false)}
          className="bg-white hover:bg-gray-50 text-gray-700 shadow-lg border gap-2"
          size="sm"
        >
          <Maximize2 className="w-4 h-4" />
          Ver {locations.length} ubicaciones
        </Button>
      </motion.div>

      {/* Map theme toggle - minimal, top right */}
      <div className="absolute top-4 right-4 z-[999]">
        <MapThemeToggle 
          theme={mapTheme} 
          onThemeChange={setMapTheme} 
        />
      </div>
      
      {/* Map Center Settings Dialog */}
      <MapCenterSettings
        open={showCenterSettings}
        onOpenChange={setShowCenterSettings}
        onSaved={() => setCenterConfigVersion(v => v + 1)}
      />

      {/* Legend and stats - single line bottom right */}
      <div className="absolute bottom-4 right-4 z-[999]">
        <div className={cn(
          "backdrop-blur-sm rounded-full px-4 py-2 shadow-md text-xs flex items-center gap-4",
          mapTheme === 'dark' ? 'bg-gray-900/95' : 'bg-white/95'
        )}>
          {/* Location count */}
          <div className="flex items-center gap-1.5 pr-3 border-r border-border/50">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold">{locations.length}</span>
            {locations.length !== totalLocations && (
              <span className={mapTheme === 'dark' ? 'text-gray-400' : 'text-muted-foreground'}>/ {totalLocations}</span>
            )}
          </div>
          
          {/* Legend items */}
          <div className="flex items-center gap-1.5">
            <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#22c55e" stroke="white" strokeWidth="2"/>
              <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
            </svg>
            <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Final</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#3b82f6" stroke="white" strokeWidth="2"/>
              <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
            </svg>
            <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Pendiente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#9ca3af" stroke="white" strokeWidth="2"/>
              <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
            </svg>
            <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Importado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#f97316" stroke="white" strokeWidth="2"/>
              <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
            </svg>
            <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Vacío</span>
          </div>
        </div>
      </div>

      {/* Empty state overlay */}
      {showEmptyState && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-[500]">
          <p className="text-muted-foreground bg-background/80 backdrop-blur-sm px-4 py-2 rounded-lg shadow">
            No hay ubicaciones para mostrar
          </p>
        </div>
      )}

      <style>{`
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
          padding: 0;
          overflow: hidden;
        }
        .custom-popup .leaflet-popup-content {
          margin: 0;
        }
        .custom-popup .leaflet-popup-close-button {
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          font-size: 18px;
          color: #6b7280;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .custom-popup .leaflet-popup-close-button:hover {
          color: #1a1a1a;
          background: #f3f4f6;
        }
        .custom-popup .leaflet-popup-tip {
          box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes enriched-celebrate {
          0% { 
            transform: scale(1);
            filter: drop-shadow(0 0 0 rgba(34, 197, 94, 0));
          }
          5% { 
            transform: scale(2.2);
            filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.9));
          }
          15% { 
            transform: scale(1.6);
            filter: drop-shadow(0 0 30px rgba(34, 197, 94, 0.7));
          }
          25% { 
            transform: scale(1.9);
            filter: drop-shadow(0 0 25px rgba(34, 197, 94, 0.6));
          }
          40% { 
            transform: scale(1.5);
            filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.5));
          }
          55% { 
            transform: scale(1.7);
            filter: drop-shadow(0 0 15px rgba(34, 197, 94, 0.4));
          }
          70% { 
            transform: scale(1.3);
            filter: drop-shadow(0 0 10px rgba(34, 197, 94, 0.3));
          }
          85% { 
            transform: scale(1.15);
            filter: drop-shadow(0 0 5px rgba(34, 197, 94, 0.15));
          }
          100% { 
            transform: scale(1);
            filter: drop-shadow(0 0 0 rgba(34, 197, 94, 0));
          }
        }
        .recently-enriched {
          z-index: 9999 !important;
        }
      `}</style>
    </motion.div>
  );
}
