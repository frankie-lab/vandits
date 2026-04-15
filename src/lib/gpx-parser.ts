import { GeoLocation, KMLDocument, ImportedRoute } from '@/types/location';

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

 return waypoints;
}

function parseGPXRoutes(xmlDoc: Document, fallbackName: string): ImportedRoute[] {
 const routes: ImportedRoute[] = [];

 const trackElements = xmlDoc.querySelectorAll('trk');
 trackElements.forEach((trk, trkIndex) => {
  const trackName = trk.querySelector('name')?.textContent?.trim() || `${fallbackName} ${trkIndex + 1}`;
  const coords: [number, number][] = [];

  trk.querySelectorAll('trkseg trkpt').forEach(trkpt => {
   const lat = parseFloat(trkpt.getAttribute('lat') || '');
   const lon = parseFloat(trkpt.getAttribute('lon') || '');
   if (!isNaN(lat) && !isNaN(lon)) coords.push([lat, lon]);
  });

  if (coords.length > 1) {
   routes.push({
    id: crypto.randomUUID(),
    name: trackName,
    coordinates: coords,
   });
  }
 });

 const routeElements = xmlDoc.querySelectorAll('rte');
 routeElements.forEach((rte, rteIndex) => {
  const routeName = rte.querySelector('name')?.textContent?.trim() || `${fallbackName} ${routes.length + rteIndex + 1}`;
  const coords: [number, number][] = [];

  rte.querySelectorAll('rtept').forEach(rtept => {
   const lat = parseFloat(rtept.getAttribute('lat') || '');
   const lon = parseFloat(rtept.getAttribute('lon') || '');
   if (!isNaN(lat) && !isNaN(lon)) coords.push([lat, lon]);
  });

  if (coords.length > 1) {
   routes.push({
    id: crypto.randomUUID(),
    name: routeName,
    coordinates: coords,
   });
  }
 });

 return routes;
}

export function parseGPX(content: string, fileName: string): KMLDocument {
 const parser = new DOMParser();
 const xmlDoc = parser.parseFromString(content, 'text/xml');

 const parseError = xmlDoc.querySelector('parsererror');
 if (parseError) {
  throw new Error('Error al parsear el archivo GPX: formato inválido');
 }

 const metadataName = xmlDoc.querySelector('metadata > name')?.textContent?.trim();
 const documentName = metadataName || fileName.replace(/\.gpx$/i, '');

 const waypoints = parseGPXWaypoints(xmlDoc);
 const routes = parseGPXRoutes(xmlDoc, documentName);

 if (waypoints.length === 0 && routes.length === 0) {
  throw new Error('El archivo GPX no contiene puntos ni rutas válidas');
 }

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
  routes: routes.length > 0 ? routes : undefined,
  uploadedAt: new Date(),
 };
}

export function isValidGPX(content: string): boolean {
 try {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, 'text/xml');
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) return false;

  const gpxRoot = xmlDoc.querySelector('gpx');
  return !!gpxRoot;
 } catch {
  return false;
 }
}
