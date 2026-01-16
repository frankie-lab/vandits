import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { motion } from 'framer-motion';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createCustomIcon = (isSelected: boolean, isFocused: boolean) => {
  const size = isFocused ? 36 : isSelected ? 32 : 24;
  const innerSize = isFocused ? 12 : isSelected ? 10 : 8;
  const color = isFocused 
    ? 'hsl(350, 80%, 55%)' 
    : isSelected 
      ? 'hsl(165, 60%, 45%)' 
      : 'hsl(199, 89%, 48%)';
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50% 50% 50% 0;
        background: ${color};
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 12px rgba(0,0,0,0.35);
        border: 3px solid white;
        transition: all 0.2s ease;
        ${isFocused ? 'animation: pulse 1s ease-in-out infinite;' : ''}
      ">
        <div style="
          width: ${innerSize}px;
          height: ${innerSize}px;
          background: white;
          border-radius: 50%;
          transform: rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

function createPopupContent(location: GeoLocation): string {
  const enriched = location.enrichedData;
  
  // Si tiene ficha enriquecida, mostrarla completa
  if (enriched) {
    return `
      <div style="min-width: 300px; max-width: 380px; font-family: 'Inter', system-ui, sans-serif;">
        ${enriched.imagen ? `
          <div style="margin: -12px -12px 12px -12px;">
            <img src="${enriched.imagen}" alt="${enriched.nombre_lugar}" style="width: 100%; height: 160px; object-fit: cover;" />
          </div>
        ` : ''}
        
        <div style="padding: 0 4px;">
          <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 600; color: #1a1a1a; line-height: 1.3;">
            ${enriched.nombre_lugar}
          </h3>
          <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280; line-height: 1.4;">
            ${enriched.localizacion}
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
          
          ${enriched.etiquetas && enriched.etiquetas.length > 0 ? `
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px;">
              ${enriched.etiquetas.map(tag => `
                <span style="background: #f0fdf4; color: #166534; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                  ${tag}
                </span>
              `).join('')}
            </div>
          ` : ''}
          
          <div style="background: #f9fafb; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px;">
            <div style="display: grid; gap: 6px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #6b7280;">Tipo</span>
                <span style="color: #1f2937; font-weight: 500;">${enriched.datos_clave.tipo}</span>
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
          ${location.continent ? `<span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;">${location.continent}</span>` : ''}
          ${location.country ? `<span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;">${location.country}</span>` : ''}
          ${location.region ? `<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;">${location.region}</span>` : ''}
          ${location.zone ? `<span style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;">${location.zone}</span>` : ''}
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
  
  const { 
    selectedLocations, 
    toggleLocationSelection, 
    getFilteredLocations,
    focusedLocationId,
    setFocusedLocation,
  } = useLocationsStore();
  
  const locations = getFilteredLocations();

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
      
      const marker = L.marker(
        [location.coordinates.lat, location.coordinates.lng],
        { icon: createCustomIcon(isSelected, isFocused) }
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

    // Fit bounds
    if (locations.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(
        locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [locations, toggleLocationSelection, setFocusedLocation]);

  // Update marker icons when selection or focus changes
  useEffect(() => {
    markersRef.current.forEach((marker, locationId) => {
      const isSelected = selectedLocations.has(locationId);
      const isFocused = focusedLocationId === locationId;
      marker.setIcon(createCustomIcon(isSelected, isFocused));
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
      className="h-full w-full rounded-lg overflow-hidden shadow-large relative"
    >
      <div ref={mapContainerRef} className="h-full w-full" />
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
