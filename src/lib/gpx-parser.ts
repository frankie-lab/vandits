import { GeoLocation, KMLDocument } from '@/types/location';

/**
 * Parser para archivos GPX (GPS Exchange Format)
 * Usado por: Garmin, Strava, Wikiloc, AllTrails, Komoot, Outdooractive
 */

interface GPXWaypoint {
  name: string;
  description?: string;
  lat: number;
  lng: number;
  elevation?: number;
}

function parseGPXWaypoints(xmlDoc: Document): GPXWaypoint[] {
  const waypoints: GPXWaypoint[] = [];
  
  // Parse <wpt> elements (waypoints)
  const wptElements = xmlDoc.querySelectorAll('wpt');
  wptElements.forEach(wpt => {
    const lat = parseFloat(wpt.getAttribute('lat') || '');
    const lon = parseFloat(wpt.getAttribute('lon') || '');
    
    if (!isNaN(lat) && !isNaN(lon)) {
      const nameEl = wpt.querySelector('name');
      const descEl = wpt.querySelector('desc') || wpt.querySelector('cmt');
      const eleEl = wpt.querySelector('ele');
      
      waypoints.push({
        name: nameEl?.textContent?.trim() || `Punto ${waypoints.length + 1}`,
        description: descEl?.textContent?.trim(),
        lat,
        lng: lon,
        elevation: eleEl ? parseFloat(eleEl.textContent || '') : undefined,
      });
    }
  });
  
  // Parse <trkpt> elements from tracks (track points)
  // Only extract named points or significant points
  const trkptElements = xmlDoc.querySelectorAll('trkpt');
  trkptElements.forEach(trkpt => {
    const nameEl = trkpt.querySelector('name');
    // Only include track points that have names (significant points)
    if (nameEl?.textContent?.trim()) {
      const lat = parseFloat(trkpt.getAttribute('lat') || '');
      const lon = parseFloat(trkpt.getAttribute('lon') || '');
      
      if (!isNaN(lat) && !isNaN(lon)) {
        const descEl = trkpt.querySelector('desc') || trkpt.querySelector('cmt');
        const eleEl = trkpt.querySelector('ele');
        
        waypoints.push({
          name: nameEl.textContent.trim(),
          description: descEl?.textContent?.trim(),
          lat,
          lng: lon,
          elevation: eleEl ? parseFloat(eleEl.textContent || '') : undefined,
        });
      }
    }
  });
  
  // Parse <rtept> elements from routes (route points)
  const rteptElements = xmlDoc.querySelectorAll('rtept');
  rteptElements.forEach(rtept => {
    const lat = parseFloat(rtept.getAttribute('lat') || '');
    const lon = parseFloat(rtept.getAttribute('lon') || '');
    
    if (!isNaN(lat) && !isNaN(lon)) {
      const nameEl = rtept.querySelector('name');
      const descEl = rtept.querySelector('desc') || rtept.querySelector('cmt');
      const eleEl = rtept.querySelector('ele');
      
      waypoints.push({
        name: nameEl?.textContent?.trim() || `Punto de ruta ${waypoints.length + 1}`,
        description: descEl?.textContent?.trim(),
        lat,
        lng: lon,
        elevation: eleEl ? parseFloat(eleEl.textContent || '') : undefined,
      });
    }
  });
  
  return waypoints;
}

export function parseGPX(content: string, fileName: string): KMLDocument {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, 'text/xml');
  
  // Check for parsing errors
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Error al parsear el archivo GPX: formato inválido');
  }
  
  const waypoints = parseGPXWaypoints(xmlDoc);
  
  if (waypoints.length === 0) {
    throw new Error('El archivo GPX no contiene puntos de interés (waypoints)');
  }
  
  // Get metadata
  const metadataName = xmlDoc.querySelector('metadata > name')?.textContent?.trim();
  const documentName = metadataName || fileName.replace(/\.gpx$/i, '');
  
  const locations: GeoLocation[] = waypoints.map(wp => ({
    id: crypto.randomUUID(),
    name: wp.name,
    description: wp.description,
    coordinates: {
      lat: wp.lat,
      lng: wp.lng,
      altitude: wp.elevation,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  
  return {
    id: crypto.randomUUID(),
    name: documentName,
    fileName,
    locations,
    uploadedAt: new Date(),
  };
}

export function isValidGPX(content: string): boolean {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, 'text/xml');
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) return false;
    
    // Check for GPX root element
    const gpxRoot = xmlDoc.querySelector('gpx');
    return !!gpxRoot;
  } catch {
    return false;
  }
}
