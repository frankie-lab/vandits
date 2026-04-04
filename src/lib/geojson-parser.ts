import { GeoLocation, KMLDocument } from '@/types/location';

/**
 * Parser para archivos GeoJSON
 * Estándar web para datos geográficos
 * Usado por: Mapbox, Leaflet, APIs de datos abiertos
 */

interface GeoJSONPoint {
 type: 'Point';
 coordinates: [number, number] | [number, number, number]; // [lng, lat] or [lng, lat, alt]
}

interface GeoJSONFeature {
 type: 'Feature';
 geometry: GeoJSONPoint | { type: string; coordinates: any };
 properties: Record<string, any> | null;
}

interface GeoJSONFeatureCollection {
 type: 'FeatureCollection';
 features: GeoJSONFeature[];
}

type GeoJSON = GeoJSONFeatureCollection | GeoJSONFeature | GeoJSONPoint;

function extractPointsFromGeometry(geometry: any, properties: Record<string, any> | null, points: GeoLocation[]): void {
 if (!geometry || !geometry.type) return;
 
 switch (geometry.type) {
 case 'Point': {
 const coords = geometry.coordinates;
 if (Array.isArray(coords) && coords.length >= 2) {
 const [lng, lat, alt] = coords;
 if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
 points.push({
 id: crypto.randomUUID(),
 name: properties?.name || properties?.title || properties?.Name || properties?.NOMBRE || `Punto ${points.length + 1}`,
 description: properties?.description || properties?.desc || properties?.Description || properties?.DESCRIPCION,
 coordinates: {
 lat,
 lng,
 altitude: typeof alt === 'number' ? alt : undefined,
 },
 createdAt: new Date(),
 updatedAt: new Date(),
 });
 }
 }
 break;
 }
 case 'MultiPoint': {
 const multiCoords = geometry.coordinates;
 if (Array.isArray(multiCoords)) {
 multiCoords.forEach((coords: number[], index: number) => {
 if (coords.length >= 2) {
 const [lng, lat, alt] = coords;
 if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
 points.push({
 id: crypto.randomUUID(),
 name: properties?.name ? `${properties.name} (${index + 1})` : `Punto ${points.length + 1}`,
 description: properties?.description,
 coordinates: {
 lat,
 lng,
 altitude: typeof alt === 'number' ? alt : undefined,
 },
 createdAt: new Date(),
 updatedAt: new Date(),
 });
 }
 }
 });
 }
 break;
 }
 case 'GeometryCollection': {
 const geometries = geometry.geometries;
 if (Array.isArray(geometries)) {
 geometries.forEach((geom: any) => {
 extractPointsFromGeometry(geom, properties, points);
 });
 }
 break;
 }
    // For LineString, Polygon, etc., extract centroid or first point as reference
 case 'LineString':
 case 'MultiLineString':
 case 'Polygon':
 case 'MultiPolygon': {
      // Extract first coordinate as representative point for non-point geometries
 let coords: number[] | undefined;
 
 if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
        // Get midpoint of line
 const midIndex = Math.floor(geometry.coordinates.length / 2);
 coords = geometry.coordinates[midIndex];
 } else if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
        // Get centroid approximation (first ring, first point)
 const ring = geometry.coordinates[0];
 if (Array.isArray(ring) && ring.length > 0) {
          // Calculate centroid
 let sumLng = 0, sumLat = 0;
 ring.forEach((c: number[]) => {
 sumLng += c[0];
 sumLat += c[1];
 });
 coords = [sumLng / ring.length, sumLat / ring.length];
 }
 }
 
 if (coords && coords.length >= 2) {
 const [lng, lat] = coords;
 if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
 points.push({
 id: crypto.randomUUID(),
 name: properties?.name || properties?.title || `${geometry.type} ${points.length + 1}`,
 description: properties?.description,
 coordinates: { lat, lng },
 createdAt: new Date(),
 updatedAt: new Date(),
 });
 }
 }
 break;
 }
 }
}

export function parseGeoJSON(content: string, fileName: string): KMLDocument {
 let data: GeoJSON;
 
 try {
 data = JSON.parse(content);
 } catch (e) {
 throw new Error('Error al parsear el archivo GeoJSON: JSON inválido');
 }
 
 const locations: GeoLocation[] = [];
 
 if (data.type === 'FeatureCollection') {
 const fc = data as GeoJSONFeatureCollection;
 fc.features.forEach(feature => {
 if (feature.type === 'Feature' && feature.geometry) {
 extractPointsFromGeometry(feature.geometry, feature.properties, locations);
 }
 });
 } else if (data.type === 'Feature') {
 const feature = data as GeoJSONFeature;
 if (feature.geometry) {
 extractPointsFromGeometry(feature.geometry, feature.properties, locations);
 }
 } else if (data.type === 'Point') {
 extractPointsFromGeometry(data, null, locations);
 }
 
 if (locations.length === 0) {
 throw new Error('El archivo GeoJSON no contiene puntos con coordenadas válidas');
 }
 
 const documentName = fileName.replace(/\.(geojson|json)$/i, '');
 
 return {
 id: crypto.randomUUID(),
 name: documentName,
 fileName,
 locations,
 uploadedAt: new Date(),
 };
}

export function isValidGeoJSON(content: string): boolean {
 try {
 const data = JSON.parse(content);
 return data.type === 'FeatureCollection' || data.type === 'Feature' || data.type === 'Point' || data.type === 'GeometryCollection';
 } catch {
 return false;
 }
}
