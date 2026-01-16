import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { motion } from 'framer-motion';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icon
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

function MapBounds({ locations }: { locations: GeoLocation[] }) {
  const map = useMap();
  
  React.useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(
        locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [locations, map]);
  
  return null;
}

export function LocationMap() {
  const { selectedLocations, toggleLocationSelection, getFilteredLocations } = useLocationsStore();
  const locations = getFilteredLocations();
  
  const center = useMemo(() => {
    if (locations.length === 0) return [20, 0] as [number, number];
    
    const sumLat = locations.reduce((sum, loc) => sum + loc.coordinates.lat, 0);
    const sumLng = locations.reduce((sum, loc) => sum + loc.coordinates.lng, 0);
    
    return [sumLat / locations.length, sumLng / locations.length] as [number, number];
  }, [locations]);

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
      <MapContainer
        center={center}
        zoom={3}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <MapBounds locations={locations} />
        
        {locations.map((location) => (
          <Marker
            key={location.id}
            position={[location.coordinates.lat, location.coordinates.lng]}
            icon={createCustomIcon(selectedLocations.has(location.id))}
            eventHandlers={{
              click: () => toggleLocationSelection(location.id),
            }}
          >
            <Popup>
              <div className="min-w-[200px] p-1">
                <h3 className="font-display font-semibold text-foreground mb-1">
                  {location.name}
                </h3>
                {location.description && (
                  <p className="text-sm text-muted-foreground mb-2">{location.description}</p>
                )}
                <div className="text-xs space-y-1 text-muted-foreground">
                  <p>📍 {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}</p>
                  {location.continent && <p>🌍 {location.continent}</p>}
                  {location.country && <p>🏳️ {location.country}</p>}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </motion.div>
  );
}
