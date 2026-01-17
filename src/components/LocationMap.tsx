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
import { Maximize2, MapPin, Flame, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MapThemeToggle, MapTheme, MAP_TILE_LAYERS } from './MapThemeToggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
// Azul = Pendiente de nuevo criterio (enriquecido pero no cumple criterio actual)
// Naranja = Desconocido (sin ficha IA pero tiene descripción original)
// Rojo = Importado sin actualizar (sin ficha IA ni descripción)
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

  // 3. Naranja - Desconocido (tiene descripción original pero sin ficha IA)
  if (location.description && location.description.trim().length > 0) {
    return {
      color: 'hsl(25, 95%, 53%)',
      gradient: 'linear-gradient(135deg, hsl(25, 95%, 58%), hsl(25, 95%, 45%))',
      status: 'unknown',
    };
  }

  // 4. Rojo - Importado sin actualizar (sin ficha IA ni descripción)
  return {
    color: 'hsl(0, 72%, 51%)',
    gradient: 'linear-gradient(135deg, hsl(0, 72%, 56%), hsl(0, 84%, 45%))',
    status: 'new',
  };
};

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
    unknown: 'rgba(249, 115, 22, 0.5)',
    new: 'rgba(239, 68, 68, 0.4)',
  };
  const glowColor = glowColors[criteriaStatus.status];
  
  // Animation style for recently enriched or focused
  const animationStyle = isRecentlyEnriched 
    ? 'animation: enriched-celebrate 2s ease-out;'
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

function createPopupContent(location: GeoLocation, criteriaTimestamp: number = 0): string {
  // Check if regeneration is allowed (only if criteria changed since last update)
  const locationUpdatedAt = location.updatedAt ? new Date(location.updatedAt).getTime() : 0;
  const canRegenerate = !location.enrichedData || locationUpdatedAt < criteriaTimestamp;
  const enriched = location.enrichedData;
  const hasClassification = !!enriched?.clasificacion?.codigo;
  
  // Get status color for the status bar
  const statusInfo = getCriteriaColor(location, criteriaTimestamp);
  const statusLabels: Record<CriteriaStatus, string> = {
    current: 'Completado',
    previous: 'Pendiente actualizar',
    unknown: 'Sin ficha IA',
    new: 'Sin procesar',
  };
  
  // Status bar HTML - colored line at the top
  const statusBarHtml = `
    <div style="
      height: 6px;
      background: ${statusInfo.gradient};
      margin: -12px -12px 12px -12px;
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
  
  // Action buttons HTML - equal size for both buttons
  const actionButtonsHtml = `
    ${progressBarHtml}
    <div style="display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
      <button 
        class="popup-action-btn" 
        data-action="quick-classify" 
        data-location-id="${location.id}"
        ${hasClassification ? 'disabled' : ''}
        style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 12px; background: ${hasClassification ? '#f0fdf4' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)'}; color: ${hasClassification ? '#166534' : 'white'}; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: ${hasClassification ? 'default' : 'pointer'}; transition: all 0.15s; opacity: ${hasClassification ? '0.8' : '1'};"
        ${!hasClassification ? `onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'"` : ''}
      >
        ${hasClassification ? `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Clasificado
        ` : `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
        style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 12px; background: ${canRegenerate ? '#f3f4f6' : '#f0fdf4'}; color: ${canRegenerate ? '#374151' : '#166534'}; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: ${canRegenerate ? 'pointer' : 'default'}; transition: all 0.15s; opacity: ${canRegenerate ? '1' : '0.8'};"
        ${canRegenerate ? `onmouseover="this.style.background='#e5e7eb';this.style.transform='translateY(-1px)'" onmouseout="this.style.background='#f3f4f6';this.style.transform='none'"` : ''}
        title="${!canRegenerate ? 'Ficha actualizada según criterios actuales' : (enriched ? 'Regenerar ficha completa' : 'Generar ficha IA')}"
      >
        ${!canRegenerate ? `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Actualizado
        ` : `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M21 21v-5h-5"/>
          </svg>
          ${enriched ? 'Regenerar' : 'Generar IA'}
        `}
      </button>
    </div>
  `;
  
  // Si tiene ficha enriquecida, mostrarla completa
  if (enriched) {
    const localizacionLinks = parseLocalizacionToLinks(enriched.localizacion, location);
    
    return `
      <div style="min-width: 300px; max-width: 380px; font-family: 'Inter', system-ui, sans-serif; position: relative;">
        ${enriched.imagen ? `
          <div style="margin: -12px -12px 0 -12px; position: relative;">
            <img src="${enriched.imagen}" alt="${enriched.nombre_lugar}" style="width: 100%; height: 160px; object-fit: cover;" onerror="this.parentElement.style.display='none'" />
            <div style="
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              height: 8px;
              background: ${statusInfo.gradient};
              box-shadow: 0 -2px 8px rgba(0,0,0,0.15);
            "></div>
          </div>
        ` : statusBarHtml}
        
        <div style="padding: 0 4px;">
          <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 600; color: #1a1a1a; line-height: 1.3;">
            ${enriched.nombre_lugar}
          </h3>
          <p style="margin: 0 0 12px 0; font-size: 12px; line-height: 1.4;">
            ${localizacionLinks}
          </p>
          
          <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-left: 3px solid #0ea5e9; padding: 8px 10px; border-radius: 0 6px 6px 0; margin-bottom: 12px;">
            <p style="margin: 0; font-size: 12px; color: #0369a1; font-weight: 500;">
              ★ ${enriched.punto_destacado}
            </p>
          </div>
          
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #374151; line-height: 1.5;">
            ${enriched.descripcion}
          </p>
          
          ${enriched.clasificacion?.codigo ? `
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px;">
              ${enriched.clasificacion.categoria_principal ? `
                <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 2px 8px; border-radius: 12px; font-size: 10px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                  #${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '').replace(/\s+/g, '')}
                </span>
              ` : ''}
              ${enriched.clasificacion.subcategoria ? `
                <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 2px 8px; border-radius: 12px; font-size: 10px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                  #${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '').replace(/\s+/g, '')}
                </span>
              ` : ''}
              ${enriched.clasificacion.tipo_especifico ? `
                <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 2px 8px; border-radius: 12px; font-size: 10px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                  #${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '').replace(/\s+/g, '')}
                </span>
              ` : ''}
            </div>
          ` : ''}
          
          ${enriched.observacion ? `
            <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280; font-style: italic;">
              ${enriched.observacion}
            </p>
          ` : ''}
          
          ${enriched.etiquetas_geograficas && enriched.etiquetas_geograficas.length > 0 ? `
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
              ${enriched.etiquetas_geograficas.map(tag => `
                <span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'">
                  📍 ${tag}
                </span>
              `).join('')}
            </div>
          ` : ''}
          
          ${enriched.etiquetas && enriched.etiquetas.length > 0 ? `
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
              ${enriched.etiquetas.filter(tag => !enriched.etiquetas_geograficas?.some(gt => gt.toLowerCase() === tag.toLowerCase())).map(tag => `
                <span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">
                  ${tag}
                </span>
              `).join('')}
            </div>
          ` : ''}
          
          ${enriched.datos_clave ? `
          <div style="background: #f9fafb; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px;">
            <div style="display: grid; gap: 6px;">
              ${enriched.datos_clave.tipo ? `
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #6b7280;">Tipo</span>
                <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.datos_clave.tipo}" style="color: #1f2937; font-weight: 500; cursor: pointer;" onmouseover="this.style.color='#0ea5e9'" onmouseout="this.style.color='#1f2937'">${enriched.datos_clave.tipo}</span>
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
                  <span style="color: #1f2937; font-weight: 500; text-align: right; max-width: 60%;">${enriched.datos_clave.acceso}</span>
                </div>
              ` : ''}
              ${enriched.datos_clave.estado_proteccion ? `
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #6b7280;">Protección</span>
                  <span style="color: #1f2937; font-weight: 500; text-align: right; max-width: 60%;">${enriched.datos_clave.estado_proteccion}</span>
                </div>
              ` : ''}
              ${enriched.datos_clave.coordenadas ? `
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #6b7280;">Coordenadas</span>
                <span style="color: #1f2937; font-family: monospace; font-size: 11px;">${enriched.datos_clave.coordenadas}</span>
              </div>
              ` : ''}
              ${enriched.datos_clave.web_referencia ? `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <span style="color: #6b7280; flex-shrink: 0;">Web</span>
                  <a href="${enriched.datos_clave.web_referencia.startsWith('http') ? enriched.datos_clave.web_referencia : 'https://' + enriched.datos_clave.web_referencia}" target="_blank" style="color: #0ea5e9; font-size: 11px; text-align: right; max-width: 65%; word-break: break-all; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${enriched.datos_clave.web_referencia}</a>
                </div>
              ` : ''}
            </div>
          </div>
          ` : ''}
          
          <div style="font-size: 10px; color: #9ca3af;">
            <div style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Fuentes</div>
            ${enriched.fuentes.map(f => `<div>• ${f}</div>`).join('')}
          </div>
          
          ${actionButtonsHtml}
        </div>
      </div>
    `;
  }
  
  // Fallback: mostrar datos originales
  const customDataHtml = Object.entries(location.customData || {})
    .slice(0, 6)
    .map(([key, value]) => `
      <div style="display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="color: #666; font-size: 12px; min-width: 80px; font-weight: 500;">${key}</span>
        <span style="color: #333; font-size: 12px; flex: 1;">${value}</span>
      </div>
    `).join('');

  const moreDataCount = Object.keys(location.customData || {}).length - 6;

  return `
    <div style="min-width: 280px; max-width: 350px; font-family: 'Inter', system-ui, sans-serif;">
      ${statusBarHtml}
      <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
        <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #1a1a1a; line-height: 1.3;">
          ${location.name}
        </h3>
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
          ${location.continent ? `<span class="filter-link" data-filter-type="continent" data-filter-value="${location.continent}" style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'">${location.continent}</span>` : ''}
          ${location.country ? `<span class="filter-link" data-filter-type="country" data-filter-value="${location.country}" style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bbf7d0'" onmouseout="this.style.background='#dcfce7'">${location.country}</span>` : ''}
          ${location.region ? `<span class="filter-link" data-filter-type="region" data-filter-value="${location.region}" style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#fde68a'" onmouseout="this.style.background='#fef3c7'">${location.region}</span>` : ''}
          ${location.zone ? `<span class="filter-link" data-filter-type="zone" data-filter-value="${location.zone}" style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">${location.zone}</span>` : ''}
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
  const prevLocationsCountRef = useRef<number>(0);
  const prevFilterKeyRef = useRef<string>('');
  const [showZoomButton, setShowZoomButton] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('markers');
  const heatLayerRef = useRef<L.Layer | null>(null);
  const [mapTheme, setMapTheme] = useState<MapTheme>('light');
  
  // Track recently enriched locations for animation
  const [recentlyEnrichedIds, setRecentlyEnrichedIds] = useState<Set<string>>(new Set());
  const previousEnrichmentStateRef = useRef<Map<string, boolean>>(new Map());

  // Force marker refresh when the "Criterios de Actualización" change
  const [criteriaVersion, setCriteriaVersion] = useState(0);
  
  // Force update counter for realtime and store updates
  const [forceUpdateCount, setForceUpdateCount] = useState(0);

  useEffect(() => {
    const handleCriteriaChanged = () => setCriteriaVersion((v) => v + 1);
    const handleRealtimeUpdate = () => setForceUpdateCount((v) => v + 1);
    
    window.addEventListener('enrichment-criteria-changed', handleCriteriaChanged);
    window.addEventListener('location-realtime-update', handleRealtimeUpdate);
    window.addEventListener('store-updated', handleRealtimeUpdate);
    
    return () => {
      window.removeEventListener('enrichment-criteria-changed', handleCriteriaChanged);
      window.removeEventListener('location-realtime-update', handleRealtimeUpdate);
      window.removeEventListener('store-updated', handleRealtimeUpdate);
    };
  }, []);

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
  } = useLocationsStore();
  
  const locations = getFilteredLocations();
  const totalLocations = selectedDocument?.locations.length || 0;

  // Generate a key from current filters to detect changes
  const filterKey = JSON.stringify({
    continent: filters.continent,
    country: filters.country,
    region: filters.region,
    zone: filters.zone,
    tag: filters.tag,
    placeType: filters.placeType,
    onlyEnriched: filters.onlyEnriched,
  });

  // Generate a key that changes when enrichment data OR criteria change
  // Use selectedDocument.locations to ensure we detect changes from the store
  // Also include forceUpdateCount to trigger updates from realtime/store events
  const enrichmentKey = React.useMemo(() => {
    if (!selectedDocument) return `${criteriaKey}-${forceUpdateCount}`;

    return selectedDocument.locations.reduce((acc, loc) => {
      const ed = loc.enrichedData;
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
          ].join(':')
        : `orig:${loc.description?.length || 0}`;

      return acc + loc.id.slice(0, 4) + signature;
    }, `${criteriaKey}-${selectedDocument.locations.length}-${forceUpdateCount}-`);
  }, [selectedDocument?.locations, criteriaKey, selectedDocument, forceUpdateCount]);

  // Zoom to bounds function
  const zoomToBounds = useCallback(() => {
    if (!mapRef.current || locations.length === 0) return;
    
    const bounds = L.latLngBounds(
      locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
    );
    
    mapRef.current.flyToBounds(bounds, { 
      padding: [50, 50], 
      maxZoom: 12,
      duration: 0.8 
    });
    
    setShowZoomButton(false);
  }, [locations]);

  // Auto-zoom when filters change OR on initial load
  useEffect(() => {
    if (!mapRef.current || locations.length === 0) return;
    
    const filterChanged = prevFilterKeyRef.current !== filterKey;
    const isInitialLoad = prevFilterKeyRef.current === '' && prevLocationsCountRef.current === 0;
    const countChanged = Math.abs(prevLocationsCountRef.current - locations.length) > 0;
    
    // Auto-zoom on initial load OR when filters change
    if (isInitialLoad || (filterChanged && countChanged)) {
      // Small delay to let markers render first
      setTimeout(() => {
        zoomToBounds();
      }, 150);
    }
    
    prevFilterKeyRef.current = filterKey;
    prevLocationsCountRef.current = locations.length;
  }, [filterKey, locations.length, zoomToBounds]);

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
        
        if (action && locationId) {
          // Dispatch custom event that will be handled by the app
          window.dispatchEvent(new CustomEvent('popup-action', {
            detail: { action, locationId }
          }));
        }
      }
    };

    document.addEventListener('click', handleActionClick);
    return () => document.removeEventListener('click', handleActionClick);
  }, []);

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

      // Create popup with content
      const popupContent = createPopupContent(location, criteriaTimestamp);
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
      
      // Create heat data from locations
      const heatData: [number, number, number][] = locations.map(loc => [
        loc.coordinates.lat,
        loc.coordinates.lng,
        1 // intensity
      ]);
      
      // Create new heat layer
      heatLayerRef.current = L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        max: 1.0,
        gradient: {
          0.0: '#3b82f6',
          0.25: '#22c55e', 
          0.5: '#eab308',
          0.75: '#f97316',
          1.0: '#ef4444'
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
      
      // Update popup content - with safety check
      try {
        const popupContent = createPopupContent(location, criteriaTimestamp);
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
  }, [enrichmentKey, selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds]);

  // Detect newly enriched locations and trigger animation + open popup
  useEffect(() => {
    const newlyEnriched: string[] = [];
    
    locations.forEach(loc => {
      const wasEnriched = previousEnrichmentStateRef.current.get(loc.id);
      const isNowEnriched = !!loc.enrichedData?.descripcion;
      
      // If it wasn't enriched before but is now, add to newly enriched
      if (!wasEnriched && isNowEnriched) {
        newlyEnriched.push(loc.id);
      }
      
      // Update previous state
      previousEnrichmentStateRef.current.set(loc.id, isNowEnriched);
    });
    
    if (newlyEnriched.length > 0) {
      setRecentlyEnrichedIds(prev => {
        const next = new Set(prev);
        newlyEnriched.forEach(id => next.add(id));
        return next;
      });
      
      // Open popup for the most recently enriched location and pan to it
      const lastEnrichedId = newlyEnriched[newlyEnriched.length - 1];
      const location = locations.find(l => l.id === lastEnrichedId);
      
      if (location && mapRef.current) {
        // Pan to the location
        mapRef.current.setView(
          [location.coordinates.lat, location.coordinates.lng],
          Math.max(mapRef.current.getZoom(), 10),
          { animate: true, duration: 0.5 }
        );
        
        // Set pending popup to open after icon update
        pendingPopupRef.current = lastEnrichedId;
      }
      
      // Clear the animation after 2.5 seconds
      setTimeout(() => {
        setRecentlyEnrichedIds(prev => {
          const next = new Set(prev);
          newlyEnriched.forEach(id => next.delete(id));
          return next;
        });
      }, 2500);
    }
  }, [locations]);

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
          onClick={zoomToBounds}
          className="bg-white hover:bg-gray-50 text-gray-700 shadow-lg border gap-2"
          size="sm"
        >
          <Maximize2 className="w-4 h-4" />
          Ver {locations.length} ubicaciones
        </Button>
      </motion.div>

      {/* Map controls - top right */}
      <div className="absolute top-4 right-4 z-[999] flex flex-col gap-2">
        <MapThemeToggle 
          theme={mapTheme} 
          onThemeChange={setMapTheme} 
        />
        {/* View mode toggle buttons */}
        <div className="flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setViewMode('markers')}
                className={cn(
                  "w-9 h-9 rounded-full shadow-md",
                  viewMode === 'markers' && "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                <CircleDot className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Marcadores</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setViewMode('heatmap')}
                className={cn(
                  "w-9 h-9 rounded-full shadow-md",
                  viewMode === 'heatmap' && "bg-orange-500 text-white hover:bg-orange-600"
                )}
              >
                <Flame className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Mapa de calor</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Legend and stats - positioned bottom right */}
      <div className="absolute bottom-4 right-4 z-[999] flex flex-col items-end gap-2">
        {/* Color legend */}
        <div className={cn(
          "backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-xs",
          mapTheme === 'dark' ? 'bg-gray-900/95 text-gray-200' : 'bg-white/95 text-gray-700'
        )}>
          <div className={cn(
            "font-medium mb-1.5 text-[10px] uppercase tracking-wide",
            mapTheme === 'dark' ? 'text-gray-400' : 'text-gray-700'
          )}>Estado</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <svg width="12" height="16" viewBox="0 0 24 36" className="drop-shadow-sm">
                <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#22c55e" stroke="white" strokeWidth="2"/>
                <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
              </svg>
              <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Final</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="12" height="16" viewBox="0 0 24 36" className="drop-shadow-sm">
                <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#3b82f6" stroke="white" strokeWidth="2"/>
                <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
              </svg>
              <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Pendiente</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="12" height="16" viewBox="0 0 24 36" className="drop-shadow-sm">
                <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#f97316" stroke="white" strokeWidth="2"/>
                <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
              </svg>
              <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Desconocido</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="12" height="16" viewBox="0 0 24 36" className="drop-shadow-sm">
                <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#ef4444" stroke="white" strokeWidth="2"/>
                <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
              </svg>
              <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Importado</span>
            </div>
          </div>
        </div>
        
        {/* Location count badge */}
        <div className={cn(
          "backdrop-blur-sm rounded-full px-3 py-1.5 shadow-md flex items-center gap-2 text-sm",
          mapTheme === 'dark' ? 'bg-gray-900/95 text-gray-200' : 'bg-white/95'
        )}>
          <MapPin className="w-4 h-4 text-primary" />
          <span className="font-medium">{locations.length}</span>
          {locations.length !== totalLocations && (
            <span className={mapTheme === 'dark' ? 'text-gray-400' : 'text-muted-foreground'}>/ {totalLocations}</span>
          )}
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
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
          }
          10% { 
            transform: scale(1.8);
          }
          20% { 
            transform: scale(1.4);
            box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.4);
          }
          40% { 
            transform: scale(1.6);
            box-shadow: 0 0 0 16px rgba(34, 197, 94, 0.2);
          }
          60% { 
            transform: scale(1.3);
            box-shadow: 0 0 0 24px rgba(34, 197, 94, 0);
          }
          80% { 
            transform: scale(1.1);
          }
          100% { 
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
        }
        .recently-enriched {
          z-index: 9999 !important;
        }
      `}</style>
    </motion.div>
  );
}
