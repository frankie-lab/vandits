import { KMLDocument } from '@/types/location';
import {
  ParsedGeoContent,
  ParsedPoint,
  ParsedRoute,
  cleanText,
  getContinent,
  normalizeColor,
  parseFlexibleDate,
  toKMLDocument,
} from './parsers/shared';

/**
 * Parser para archivos GPX (GPS Exchange Format)
 * Usado por: Garmin, Strava, Wikiloc, AllTrails, Komoot, Outdooractive
 *
 * Ahora extrae todo lo que el formato ofrece:
 *  - <wpt>/<trkpt>/<rtept> con <time> → timestamp
 *  - <metadata><time> → documentDate
 *  - <extensions> (Garmin/Strava) → customData
 *  - <gpxx:DisplayColor> y <line><color> → color de ruta
 *  - getContinent() para cada punto
 */

function readExtensions(parent: Element | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!parent) return out;
  const ext = parent.querySelector(':scope > extensions');
  if (!ext) return out;
  // Recursively collect leaf text nodes as key=local-name → value
  const walk = (el: Element) => {
    const children = Array.from(el.children);
    if (children.length === 0) {
      const text = el.textContent?.trim();
      if (text) {
        const key = el.localName || el.tagName.split(':').pop() || el.tagName;
        out[key] = text;
      }
    } else {
      children.forEach((c) => walk(c));
    }
  };
  walk(ext);
  return out;
}

function readExtensionColor(parent: Element | null): string | undefined {
  if (!parent) return undefined;
  const ext = parent.querySelector(':scope > extensions');
  if (!ext) return undefined;
  // Try common Garmin / Strava / generic line color tags
  const candidates = [
    ext.querySelector('DisplayColor'),
    ext.querySelector('color'),
    ext.querySelector('line color'),
  ];
  for (const el of candidates) {
    const txt = el?.textContent?.trim();
    if (txt) {
      // Garmin DisplayColor is sometimes a colour name (e.g. "Red"); try hex first
      const hex = normalizeColor(txt);
      if (hex) return hex;
      const named = NAMED_COLORS[txt.toLowerCase()];
      if (named) return named;
    }
  }
  return undefined;
}

const NAMED_COLORS: Record<string, string> = {
  red: '#ff0000', blue: '#0000ff', green: '#00ff00', yellow: '#ffff00',
  cyan: '#00ffff', magenta: '#ff00ff', black: '#000000', white: '#ffffff',
  orange: '#ffa500', purple: '#800080',
};

function pickTime(el: Element | null): Date | undefined {
  const t = el?.querySelector(':scope > time')?.textContent?.trim();
  if (!t) return undefined;
  return parseFlexibleDate(t) || undefined;
}

export function parseGPXToContent(content: string, fileName: string): ParsedGeoContent {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, 'text/xml');
  if (xmlDoc.querySelector('parsererror')) {
    throw new Error('Error al parsear el archivo GPX: formato inválido');
  }

  const metadataEl = xmlDoc.querySelector('gpx > metadata');
  const documentDate = pickTime(metadataEl);
  const documentName =
    cleanText(metadataEl?.querySelector(':scope > name')?.textContent) ||
    fileName.replace(/\.gpx$/i, '');
  const documentCustomData = readExtensions(metadataEl);

  const points: ParsedPoint[] = [];
  const routes: ParsedRoute[] = [];

  // Waypoints (<wpt>)
  xmlDoc.querySelectorAll('gpx > wpt').forEach((wpt, idx) => {
    const lat = parseFloat(wpt.getAttribute('lat') || '');
    const lng = parseFloat(wpt.getAttribute('lon') || '');
    if (isNaN(lat) || isNaN(lng)) return;

    const name = cleanText(wpt.querySelector(':scope > name')?.textContent) || `Punto ${idx + 1}`;
    const description = cleanText(
      wpt.querySelector(':scope > desc')?.textContent ||
      wpt.querySelector(':scope > cmt')?.textContent
    );
    const elevation = parseFloat(wpt.querySelector(':scope > ele')?.textContent || '');
    const timestamp = pickTime(wpt);
    const customData = readExtensions(wpt);

    points.push({
      id: crypto.randomUUID(),
      name,
      description,
      coordinates: { lat, lng, altitude: !isNaN(elevation) ? elevation : undefined },
      timestamp,
      continent: getContinent(lat, lng),
      customData: Object.keys(customData).length > 0 ? customData : undefined,
    });
  });

  // Tracks (<trk>)
  xmlDoc.querySelectorAll('gpx > trk').forEach((trk, trkIndex) => {
    const trackName =
      cleanText(trk.querySelector(':scope > name')?.textContent) ||
      `${documentName} ${trkIndex + 1}`;
    const coords: [number, number][] = [];
    let firstTime: Date | undefined;

    trk.querySelectorAll('trkseg > trkpt').forEach((trkpt) => {
      const lat = parseFloat(trkpt.getAttribute('lat') || '');
      const lng = parseFloat(trkpt.getAttribute('lon') || '');
      if (isNaN(lat) || isNaN(lng)) return;
      coords.push([lat, lng]);
      if (!firstTime) {
        const t = pickTime(trkpt);
        if (t) firstTime = t;
      }
    });

    if (coords.length > 1) {
      const customData = readExtensions(trk);
      routes.push({
        id: crypto.randomUUID(),
        name: trackName,
        coordinates: coords,
        color: readExtensionColor(trk),
        date: firstTime || documentDate,
        customData: Object.keys(customData).length > 0 ? customData : undefined,
      });
    }
  });

  // Routes (<rte>)
  xmlDoc.querySelectorAll('gpx > rte').forEach((rte, rteIndex) => {
    const routeName =
      cleanText(rte.querySelector(':scope > name')?.textContent) ||
      `${documentName} ${routes.length + rteIndex + 1}`;
    const coords: [number, number][] = [];
    let firstTime: Date | undefined;

    rte.querySelectorAll(':scope > rtept').forEach((rtept) => {
      const lat = parseFloat(rtept.getAttribute('lat') || '');
      const lng = parseFloat(rtept.getAttribute('lon') || '');
      if (isNaN(lat) || isNaN(lng)) return;
      coords.push([lat, lng]);
      if (!firstTime) {
        const t = pickTime(rtept);
        if (t) firstTime = t;
      }
    });

    if (coords.length > 1) {
      const customData = readExtensions(rte);
      routes.push({
        id: crypto.randomUUID(),
        name: routeName,
        coordinates: coords,
        color: readExtensionColor(rte),
        date: firstTime || documentDate,
        customData: Object.keys(customData).length > 0 ? customData : undefined,
      });
    }
  });

  if (points.length === 0 && routes.length === 0) {
    throw new Error('El archivo GPX no contiene puntos ni rutas válidas');
  }

  return {
    documentName,
    fileName,
    documentDate,
    points,
    routes,
    documentCustomData: Object.keys(documentCustomData).length > 0 ? documentCustomData : undefined,
  };
}

export function parseGPX(content: string, fileName: string): KMLDocument {
  const parsed = parseGPXToContent(content, fileName);
  return toKMLDocument(parsed);
}

export function isValidGPX(content: string): boolean {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, 'text/xml');
    if (xmlDoc.querySelector('parsererror')) return false;
    return !!xmlDoc.querySelector('gpx');
  } catch {
    return false;
  }
}
