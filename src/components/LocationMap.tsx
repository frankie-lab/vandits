import React, { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { motion } from 'framer-motion';
import { Maximize2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createCustomIcon = (isSelected: boolean, isFocused: boolean, isEnriched: boolean = false) => {
  const size = isFocused ? 36 : isSelected ? 32 : 24;
  const innerSize = isFocused ? 12 : isSelected ? 10 : 8;
  
  // Enriched locations: gold/amber colors with star shape
  // Regular locations: blue tones with circle shape
  let color: string;
  let gradient: string;
  
  if (isEnriched) {
    color = isFocused 
      ? 'hsl(38, 92%, 50%)' 
      : isSelected 
        ? 'hsl(38, 85%, 55%)' 
        : 'hsl(43, 96%, 58%)';
    gradient = isFocused
      ? 'linear-gradient(135deg, hsl(38, 92%, 50%), hsl(25, 95%, 53%))'
      : isSelected
        ? 'linear-gradient(135deg, hsl(38, 85%, 55%), hsl(30, 90%, 50%))'
        : 'linear-gradient(135deg, hsl(43, 96%, 58%), hsl(38, 92%, 50%))';
  } else {
    color = isFocused 
      ? 'hsl(350, 80%, 55%)' 
      : isSelected 
        ? 'hsl(165, 60%, 45%)' 
        : 'hsl(199, 89%, 48%)';
    gradient = color;
  }
  
  // For enriched: star shape, for regular: teardrop/pin shape
  const shapeStyle = isEnriched 
    ? `border-radius: 4px; transform: rotate(0deg);`
    : `border-radius: 50% 50% 50% 0; transform: rotate(-45deg);`;
  
  const innerTransform = isEnriched ? '' : 'transform: rotate(45deg);';
  
  // Star SVG for enriched locations
  const innerContent = isEnriched 
    ? `<svg width="${innerSize + 4}" height="${innerSize + 4}" viewBox="0 0 24 24" fill="white" style="filter: drop-shadow(0 1px 1px rgba(0,0,0,0.2));">
        <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"/>
       </svg>`
    : `<div style="
        width: ${innerSize}px;
        height: ${innerSize}px;
        background: white;
        border-radius: 50%;
        ${innerTransform}
      "></div>`;
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        ${shapeStyle}
        background: ${gradient};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 12px rgba(0,0,0,0.35)${isEnriched ? ', 0 0 8px rgba(251, 191, 36, 0.5)' : ''};
        border: 3px solid white;
        transition: all 0.2s ease;
        ${isFocused ? 'animation: pulse 1s ease-in-out infinite;' : ''}
      ">
        ${innerContent}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
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

function createPopupContent(location: GeoLocation): string {
  const enriched = location.enrichedData;
  
  // Si tiene ficha enriquecida, mostrarla completa
  if (enriched) {
    const localizacionLinks = parseLocalizacionToLinks(enriched.localizacion, location);
    
    return `
      <div style="min-width: 300px; max-width: 380px; font-family: 'Inter', system-ui, sans-serif;">
        ${enriched.imagen ? `
          <div style="margin: -12px -12px 12px -12px;">
            <img src="${enriched.imagen}" alt="${enriched.nombre_lugar}" style="width: 100%; height: 160px; object-fit: cover;" onerror="this.style.display='none'" />
          </div>
        ` : ''}
        
        <div style="padding: 0 4px;">
          <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 600; color: #1a1a1a; line-height: 1.3;">
            ${enriched.nombre_lugar}
          </h3>
          <p style="margin: 0 0 12px 0; font-size: 12px; line-height: 1.4;">
            ${localizacionLinks}
          </p>
          
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #374151; line-height: 1.5;">
            ${enriched.descripcion}
          </p>
          
          <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-left: 3px solid #0ea5e9; padding: 8px 10px; border-radius: 0 6px 6px 0; margin-bottom: 12px;">
            <p style="margin: 0; font-size: 12px; color: #0369a1; font-weight: 500;">
              ★ ${enriched.punto_destacado}
            </p>
          </div>
          
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
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px;">
              ${enriched.etiquetas.filter(tag => !enriched.etiquetas_geograficas?.some(gt => gt.toLowerCase() === tag.toLowerCase())).map(tag => `
                <span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">
                  ${tag}
                </span>
              `).join('')}
            </div>
          ` : ''}
          
          <div style="background: #f9fafb; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px;">
            <div style="display: grid; gap: 6px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #6b7280;">Tipo</span>
                <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.datos_clave.tipo}" style="color: #1f2937; font-weight: 500; cursor: pointer;" onmouseover="this.style.color='#0ea5e9'" onmouseout="this.style.color='#1f2937'">${enriched.datos_clave.tipo}</span>
              </div>
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
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #6b7280;">Coordenadas</span>
                <span style="color: #1f2937; font-family: monospace; font-size: 11px;">${enriched.datos_clave.coordenadas}</span>
              </div>
              ${enriched.datos_clave.web_referencia ? `
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #6b7280;">Web</span>
                  <a href="${enriched.datos_clave.web_referencia.startsWith('http') ? enriched.datos_clave.web_referencia : 'https://' + enriched.datos_clave.web_referencia}" target="_blank" style="color: #0ea5e9; font-size: 11px;">Ver referencia</a>
                </div>
              ` : ''}
            </div>
          </div>
          
          <div style="font-size: 10px; color: #9ca3af;">
            <div style="text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Fuentes</div>
            ${enriched.fuentes.map(f => `<div>• ${f}</div>`).join('')}
          </div>
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
      </div>
    </div>
  `;
}

export function LocationMap() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const locationsRef = useRef<Map<string, GeoLocation>>(new Map());
  const prevLocationsCountRef = useRef<number>(0);
  const prevFilterKeyRef = useRef<string>('');
  const [showZoomButton, setShowZoomButton] = useState(false);
  
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

  // Auto-zoom when filters change significantly
  useEffect(() => {
    if (!mapRef.current || locations.length === 0) return;
    
    const filterChanged = prevFilterKeyRef.current !== filterKey;
    const countChanged = Math.abs(prevLocationsCountRef.current - locations.length) > 0;
    
    // Only auto-zoom if filters changed (not just selection)
    if (filterChanged && countChanged) {
      // Small delay to let markers render first
      setTimeout(() => {
        zoomToBounds();
      }, 100);
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
            setFilters({ ...filters, searchTerm: filterValue });
          } else if (filterType === 'tag') {
            // Clear all geography filters when filtering by tag (inverse filter)
            setFilters({ 
              ...filters, 
              tag: filterValue,
              continent: undefined,
              country: undefined,
              region: undefined,
              zone: undefined,
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

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when locations change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();
    locationsRef.current.clear();

    if (locations.length === 0) return;

    // Add new markers
    locations.forEach((location) => {
      const isSelected = selectedLocations.has(location.id);
      const isFocused = focusedLocationId === location.id;
      const isEnriched = !!location.enrichedData;
      
      const marker = L.marker(
        [location.coordinates.lat, location.coordinates.lng],
        { icon: createCustomIcon(isSelected, isFocused, isEnriched) }
      );

      // Create popup with content
      const popupContent = createPopupContent(location);
      marker.bindPopup(popupContent, {
        maxWidth: 380,
        minWidth: 280,
        className: 'custom-popup',
        closeButton: true,
        autoPan: true,
        autoPanPadding: L.point(50, 50),
      });

      marker.on('click', function(this: L.Marker) {
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

      marker.addTo(mapRef.current!);
      markersRef.current.set(location.id, marker);
      locationsRef.current.set(location.id, location);
    });

    // Initial fit bounds only on first load (auto-zoom handles filter changes)
    // This is now handled by the auto-zoom effect
  }, [locations, toggleLocationSelection, setFocusedLocation]);

  // Update marker icons when selection or focus changes
  useEffect(() => {
    markersRef.current.forEach((marker, locationId) => {
      const location = locationsRef.current.get(locationId);
      const isSelected = selectedLocations.has(locationId);
      const isFocused = focusedLocationId === locationId;
      const isEnriched = !!location?.enrichedData;
      marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched));
    });
  }, [selectedLocations, focusedLocationId]);

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

  if (locations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg">
        <p className="text-muted-foreground">No hay ubicaciones para mostrar</p>
      </div>
    );
  }

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

      {/* Location count badge - positioned bottom right to avoid toolbar */}
      <div className="absolute bottom-4 right-4 z-[999]">
        <div className="bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-md flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="font-medium">{locations.length}</span>
          {locations.length !== totalLocations && (
            <span className="text-muted-foreground">/ {totalLocations}</span>
          )}
        </div>
      </div>

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
          0%, 100% { transform: rotate(-45deg) scale(1); }
          50% { transform: rotate(-45deg) scale(1.1); }
        }
      `}</style>
    </motion.div>
  );
}
