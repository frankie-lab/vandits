import React, { useMemo, useEffect, useRef } from 'react';
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

const createCustomIcon = (isSelected: boolean) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        border-radius: 50% 50% 50% 0;
        background: ${isSelected ? 'hsl(165, 60%, 45%)' : 'hsl(199, 89%, 48%)'};
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        border: 2px solid white;
      ">
        <div style="
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          transform: rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
};

export function LocationMap() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  
  const { selectedLocations, toggleLocationSelection, getFilteredLocations } = useLocationsStore();
  const locations = getFilteredLocations();

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
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
    markersRef.current = [];

    if (locations.length === 0) return;

    // Add new markers
    locations.forEach((location) => {
      const isSelected = selectedLocations.has(location.id);
      const marker = L.marker(
        [location.coordinates.lat, location.coordinates.lng],
        { icon: createCustomIcon(isSelected) }
      );

      marker.bindPopup(`
        <div style="min-width: 200px; padding: 4px;">
          <h3 style="font-weight: 600; margin-bottom: 4px;">${location.name}</h3>
          ${location.description ? `<p style="color: #666; font-size: 14px; margin-bottom: 8px;">${location.description}</p>` : ''}
          <div style="font-size: 12px; color: #888;">
            <p>📍 ${location.coordinates.lat.toFixed(4)}, ${location.coordinates.lng.toFixed(4)}</p>
            ${location.continent ? `<p>🌍 ${location.continent}</p>` : ''}
            ${location.country ? `<p>🏳️ ${location.country}</p>` : ''}
          </div>
        </div>
      `);

      marker.on('click', () => {
        toggleLocationSelection(location.id);
      });

      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });

    // Fit bounds
    if (locations.length > 0) {
      const bounds = L.latLngBounds(
        locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [locations, selectedLocations, toggleLocationSelection]);

  // Update marker icons when selection changes
  useEffect(() => {
    markersRef.current.forEach((marker, index) => {
      const location = locations[index];
      if (location) {
        const isSelected = selectedLocations.has(location.id);
        marker.setIcon(createCustomIcon(isSelected));
      }
    });
  }, [selectedLocations, locations]);

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
      className="h-full w-full rounded-lg overflow-hidden shadow-large"
    >
      <div ref={mapContainerRef} className="h-full w-full" />
    </motion.div>
  );
}
