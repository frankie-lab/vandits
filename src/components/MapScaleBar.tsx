import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';

interface MapScaleBarProps {
  map: L.Map | null;
  units?: 'metric' | 'imperial' | 'auto';
}

// Countries that use imperial system
const IMPERIAL_COUNTRIES = ['US', 'LR', 'MM', 'GB', 'UK'];

// Nice scale values in meters
const METRIC_SCALES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
// Nice scale values in feet
const IMPERIAL_SCALES = [3, 6, 15, 30, 60, 150, 300, 600, 1500, 3000, 6000, 15000, 30000, 60000, 150000, 300000, 600000, 1500000, 3000000, 6000000];

function formatMetricDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatImperialDistance(feet: number): string {
  if (feet >= 5280) {
    const miles = feet / 5280;
    return `${miles >= 10 ? Math.round(miles) : miles.toFixed(1)} mi`;
  }
  return `${Math.round(feet)} ft`;
}

function detectUserCountry(): Promise<string> {
  return new Promise((resolve) => {
    // Try to detect from browser locale first
    const locale = navigator.language || (navigator as any).userLanguage || 'en-US';
    const countryCode = locale.split('-')[1]?.toUpperCase() || 'US';
    resolve(countryCode);
  });
}

export function MapScaleBar({ map, units = 'metric' }: MapScaleBarProps) {
  const [scaleWidth, setScaleWidth] = useState(100);
  const [scaleLabel, setScaleLabel] = useState('100 m');
  const [effectiveUnits, setEffectiveUnits] = useState<'metric' | 'imperial'>(units === 'imperial' ? 'imperial' : 'metric');
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect country for auto mode
  useEffect(() => {
    if (units === 'auto') {
      detectUserCountry().then((country) => {
        setEffectiveUnits(IMPERIAL_COUNTRIES.includes(country) ? 'imperial' : 'metric');
      });
    } else {
      setEffectiveUnits(units);
    }
  }, [units]);

  // Update scale when map moves
  useEffect(() => {
    if (!map) return;

    const updateScale = () => {
      // Guard against map not being fully initialized
      if (!map.getContainer() || !map.getPane('mapPane')) return;
      
      try {
        const maxWidth = 600; // Maximum scale bar width in pixels
        const center = map.getCenter();
        
        // Calculate meters per pixel at current zoom and latitude
        const metersPerPixel = 40075016.686 * Math.abs(Math.cos(center.lat * Math.PI / 180)) / Math.pow(2, map.getZoom() + 8);
        
        if (effectiveUnits === 'metric') {
          // Find the best metric scale
          const maxMeters = metersPerPixel * maxWidth;
          let bestScale = METRIC_SCALES[0];
          for (const scale of METRIC_SCALES) {
            if (scale <= maxMeters) {
              bestScale = scale;
            } else {
              break;
            }
          }
          
          const width = bestScale / metersPerPixel;
          setScaleWidth(Math.round(width));
          setScaleLabel(formatMetricDistance(bestScale));
        } else {
          // Convert to feet (1 meter = 3.28084 feet)
          const feetPerPixel = metersPerPixel * 3.28084;
          const maxFeet = feetPerPixel * maxWidth;
          
          let bestScale = IMPERIAL_SCALES[0];
          for (const scale of IMPERIAL_SCALES) {
            if (scale <= maxFeet) {
              bestScale = scale;
            } else {
              break;
            }
          }
          
          const width = bestScale / feetPerPixel;
          setScaleWidth(Math.round(width));
          setScaleLabel(formatImperialDistance(bestScale));
        }
      } catch (e) {
        // Map not ready yet, ignore
      }
    };

    updateScale();
    map.on('zoomend moveend', updateScale);

    return () => {
      map.off('zoomend moveend', updateScale);
    };
  }, [map, effectiveUnits]);

  if (!map) return null;

  // Calculate segment count and width
  const segmentCount = 4;
  const segmentWidth = scaleWidth / segmentCount;

  return (
    <div 
      ref={containerRef}
      className="absolute bottom-6 left-4 z-[1000] pointer-events-none select-none"
    >
      {/* Label */}
      <div 
        className="text-[11px] font-medium text-foreground mb-0.5 drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
        style={{ width: scaleWidth }}
      >
        {scaleLabel}
      </div>
      
      {/* Scale bar with alternating segments - Google Maps style */}
      <div 
        className="h-2 flex rounded-sm overflow-hidden shadow-sm"
        style={{ width: scaleWidth }}
      >
        {Array.from({ length: segmentCount }).map((_, i) => (
          <div
            key={i}
            className={`h-full ${i % 2 === 0 ? 'bg-slate-800 dark:bg-white' : 'bg-white dark:bg-slate-800'}`}
            style={{ width: segmentWidth }}
          />
        ))}
      </div>
      
      {/* Bottom border line */}
      <div 
        className="h-[1px] bg-slate-800 dark:bg-white"
        style={{ width: scaleWidth }}
      />
    </div>
  );
}
