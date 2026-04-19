import { KMLDocument } from '@/types/location';
import {
  ParsedGeoContent,
  ParsedPoint,
  ParsedRoute,
  getContinent,
  normalizeColor,
  parseFlexibleDate,
  pickTimestampFromCustomData,
  extractGeoMeta,
  stripGeoMetaAndDateKeys,
  toKMLDocument,
} from './parsers/shared';

/**
 * Parser para archivos GeoJSON
 * Estándar web para datos geográficos (Mapbox, Leaflet, APIs abiertas).
 *
 * Mejoras unificadas:
 *  - Lee properties.time / .timestamp / .when → timestamp
 *  - Vuelca TODAS las properties no estándar a customData
 *  - Color desde rgb (numérico), stroke, color → normalizado
 *  - Calcula continent para cada punto
 */

const STANDARD_PROP_KEYS = new Set([
  'name', 'Name', 'NAME', 'NOMBRE', 'title',
  'description', 'desc', 'Description', 'DESCRIPCION',
  'time', 'timestamp', 'when',
  'rgb', 'stroke', 'color',
]);

function propertiesToCustomData(properties: Record<string, any> | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!properties) return out;
  for (const [k, v] of Object.entries(properties)) {
    if (STANDARD_PROP_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      try {
        out[k] = JSON.stringify(v);
      } catch {
        // ignore
      }
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

function pickName(properties: Record<string, any> | null, fallback: string): string {
  return (
    properties?.name ||
    properties?.title ||
    properties?.Name ||
    properties?.NOMBRE ||
    fallback
  );
}

function pickDescription(properties: Record<string, any> | null): string | undefined {
  return properties?.description || properties?.desc || properties?.Description || properties?.DESCRIPCION;
}

function pickTimestamp(properties: Record<string, any> | null, customData: Record<string, string>): Date | undefined {
  const direct =
    properties?.time ?? properties?.timestamp ?? properties?.when;
  if (direct) {
    const parsed = parseFlexibleDate(String(direct));
    if (parsed) return parsed;
  }
  return pickTimestampFromCustomData(customData) || undefined;
}

function pickColor(properties: Record<string, any> | null): string | undefined {
  if (!properties) return undefined;
  if (typeof properties.rgb === 'number') {
    return normalizeColor(properties.rgb);
  }
  return normalizeColor(properties.stroke) || normalizeColor(properties.color);
}

function processGeometry(
  geometry: any,
  properties: Record<string, any> | null,
  points: ParsedPoint[],
  routes: ParsedRoute[]
): void {
  if (!geometry || !geometry.type) return;

  const customDataRaw = propertiesToCustomData(properties);
  const geoMeta = extractGeoMeta(customDataRaw);
  const customData = stripGeoMetaAndDateKeys(customDataRaw);
  const timestamp = pickTimestamp(properties, customDataRaw);
  const color = pickColor(properties);
  const description = pickDescription(properties);

  switch (geometry.type) {
    case 'Point': {
      const coords = geometry.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const [lng, lat, alt] = coords;
        if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
          points.push({
            id: crypto.randomUUID(),
            name: pickName(properties, `Punto ${points.length + 1}`),
            description,
            coordinates: { lat, lng, altitude: typeof alt === 'number' ? alt : undefined },
            timestamp,
            continent: getContinent(lat, lng),
            country: geoMeta.country,
            region: geoMeta.region,
            zone: geoMeta.zone,
            customData: Object.keys(customData).length > 0 ? customData : undefined,
          });
        }
      }
      break;
    }
    case 'MultiPoint': {
      const multi = geometry.coordinates;
      if (Array.isArray(multi)) {
        multi.forEach((coords: number[], idx: number) => {
          if (coords.length >= 2) {
            const [lng, lat, alt] = coords;
            if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
              points.push({
                id: crypto.randomUUID(),
                name: properties?.name ? `${properties.name} (${idx + 1})` : `Punto ${points.length + 1}`,
                description,
                coordinates: { lat, lng, altitude: typeof alt === 'number' ? alt : undefined },
                timestamp,
                continent: getContinent(lat, lng),
                country: geoMeta.country,
                region: geoMeta.region,
                zone: geoMeta.zone,
                customData: Object.keys(customData).length > 0 ? customData : undefined,
              });
            }
          }
        });
      }
      break;
    }
    case 'GeometryCollection': {
      if (Array.isArray(geometry.geometries)) {
        geometry.geometries.forEach((g: any) => processGeometry(g, properties, points, routes));
      }
      break;
    }
    case 'LineString': {
      const lineCoords = geometry.coordinates;
      if (Array.isArray(lineCoords) && lineCoords.length > 0) {
        const routeCoords: [number, number][] = [];
        lineCoords.forEach((c: number[]) => {
          if (Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])) {
            routeCoords.push([c[1], c[0]]);
          }
        });
        if (routeCoords.length > 1) {
          routes.push({
            id: crypto.randomUUID(),
            name: pickName(properties, `Ruta ${routes.length + 1}`),
            coordinates: routeCoords,
            color,
            date: timestamp,
            customData: Object.keys(customData).length > 0 ? customData : undefined,
          });
        }
      }
      break;
    }
    case 'MultiLineString': {
      const ml = geometry.coordinates;
      if (Array.isArray(ml) && ml.length > 0) {
        const all: number[][] = [];
        ml.forEach((line: number[][]) => {
          if (Array.isArray(line)) all.push(...line);
        });
        if (all.length > 0) {
          processGeometry({ type: 'LineString', coordinates: all }, properties, points, routes);
        }
      }
      break;
    }
    case 'Polygon': {
      const ring = geometry.coordinates?.[0];
      if (Array.isArray(ring) && ring.length > 0) {
        let sumLng = 0, sumLat = 0;
        ring.forEach((c: number[]) => { sumLng += c[0]; sumLat += c[1]; });
        const lng = sumLng / ring.length;
        const lat = sumLat / ring.length;
        if (!isNaN(lng) && !isNaN(lat)) {
          points.push({
            id: crypto.randomUUID(),
            name: pickName(properties, `Polygon ${points.length + 1}`),
            description,
            coordinates: { lat, lng },
            timestamp,
            continent: getContinent(lat, lng),
            country: geoMeta.country,
            region: geoMeta.region,
            zone: geoMeta.zone,
            customData: Object.keys(customData).length > 0 ? customData : undefined,
          });
        }
      }
      break;
    }
    case 'MultiPolygon': {
      const mp = geometry.coordinates;
      if (Array.isArray(mp) && mp.length > 0) {
        const firstRing = mp[0]?.[0];
        if (Array.isArray(firstRing) && firstRing.length > 0) {
          let sumLng = 0, sumLat = 0;
          firstRing.forEach((c: number[]) => { sumLng += c[0]; sumLat += c[1]; });
          const lng = sumLng / firstRing.length;
          const lat = sumLat / firstRing.length;
          if (!isNaN(lng) && !isNaN(lat)) {
            points.push({
              id: crypto.randomUUID(),
              name: pickName(properties, `MultiPolygon ${points.length + 1}`),
              description,
              coordinates: { lat, lng },
              timestamp,
              continent: getContinent(lat, lng),
              country: geoMeta.country,
              region: geoMeta.region,
              zone: geoMeta.zone,
              customData: Object.keys(customData).length > 0 ? customData : undefined,
            });
          }
        }
      }
      break;
    }
  }
}

export function parseGeoJSONToContent(content: string, fileName: string): ParsedGeoContent {
  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Error al parsear el archivo GeoJSON: JSON inválido');
  }

  const points: ParsedPoint[] = [];
  const routes: ParsedRoute[] = [];

  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (item?.type === 'Feature' && item.geometry) {
        processGeometry(item.geometry, item.properties, points, routes);
      }
    });
  } else if (data.type === 'FeatureCollection') {
    data.features.forEach((feature: any) => {
      if (feature.type === 'Feature' && feature.geometry) {
        processGeometry(feature.geometry, feature.properties, points, routes);
      }
    });
  } else if (data.type === 'Feature') {
    if (data.geometry) processGeometry(data.geometry, data.properties, points, routes);
  } else if (data.type === 'Point') {
    processGeometry(data, null, points, routes);
  }

  if (points.length === 0 && routes.length === 0) {
    throw new Error('El archivo GeoJSON no contiene puntos ni rutas con coordenadas válidas');
  }

  return {
    documentName: fileName.replace(/\.(geojson|json)$/i, ''),
    fileName,
    points,
    routes,
  };
}

export function parseGeoJSON(content: string, fileName: string): KMLDocument {
  const parsed = parseGeoJSONToContent(content, fileName);
  return toKMLDocument(parsed);
}

export function isValidGeoJSON(content: string): boolean {
  try {
    const data = JSON.parse(content);
    if (data?.type === 'FeatureCollection' || data?.type === 'Feature' || data?.type === 'Point' || data?.type === 'GeometryCollection') {
      return true;
    }
    if (Array.isArray(data) && data.length > 0 && data[0]?.type === 'Feature') return true;
    return false;
  } catch {
    return false;
  }
}
