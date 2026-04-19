import { KMLDocument } from '@/types/location';
import { parseKML } from './kml-parser';
import { parseGPX, isValidGPX } from './gpx-parser';
import { parseGeoJSON, isValidGeoJSON } from './geojson-parser';
import { parseCSV, isValidCSV, CSV_COLUMN_HINTS } from './csv-parser';
import { parseKMZ, isKMZBuffer } from './kmz-parser';
import { extractKMLNetworkLinks } from './parsers/networklink';
import { supabase } from '@/integrations/supabase/client';

/**
 * Parser unificado para múltiples formatos de archivos geográficos
 */

export type SupportedFormat = 'kml' | 'kmz' | 'gpx' | 'geojson' | 'csv';

export interface FormatInfo {
 id: SupportedFormat;
 name: string;
 extensions: string[];
 description: string;
 platforms: string[];
 mimeTypes: string[];
}

export const SUPPORTED_FORMATS: FormatInfo[] = [
 {
  id: 'kml',
  name: 'KML',
  extensions: ['.kml'],
  description: 'Keyhole Markup Language',
  platforms: ['Google Earth', 'Google My Maps', 'QGIS'],
  mimeTypes: ['application/vnd.google-earth.kml+xml', 'application/xml', 'text/xml'],
 },
 {
  id: 'kmz',
  name: 'KMZ',
  extensions: ['.kmz'],
  description: 'KML comprimido (Google Earth)',
  platforms: ['Google Earth'],
  mimeTypes: ['application/vnd.google-earth.kmz', 'application/zip'],
 },
 {
  id: 'gpx',
  name: 'GPX',
  extensions: ['.gpx'],
  description: 'GPS Exchange Format',
  platforms: ['Garmin', 'Strava', 'Wikiloc', 'AllTrails', 'Komoot', 'Outdooractive'],
  mimeTypes: ['application/gpx+xml', 'application/xml', 'text/xml'],
 },
 {
  id: 'geojson',
  name: 'GeoJSON',
  extensions: ['.geojson', '.json'],
  description: 'Geographic JSON',
  platforms: ['Mapbox', 'Leaflet', 'APIs web', 'QGIS'],
  mimeTypes: ['application/geo+json', 'application/json'],
 },
 {
  id: 'csv',
  name: 'CSV',
  extensions: ['.csv'],
  description: 'Valores separados por comas',
  platforms: ['Excel', 'Google Sheets', 'LibreOffice'],
  mimeTypes: ['text/csv', 'text/plain'],
 },
];

export function getAcceptedExtensions(): string {
 return SUPPORTED_FORMATS.flatMap(f => f.extensions).join(',');
}

export function getFormatFromFileName(fileName: string): SupportedFormat | null {
 const lowerName = fileName.toLowerCase();
 
 for (const format of SUPPORTED_FORMATS) {
  for (const ext of format.extensions) {
   if (lowerName.endsWith(ext)) {
    return format.id;
   }
  }
 }
 
 return null;
}

export function detectFormatFromContent(content: string, fileName: string): SupportedFormat | null {
 const trimmedContent = content.trim();

 // 1. Content-based detection (takes priority — works for any extension)
 // XML-based: KML or GPX
 if (trimmedContent.startsWith('<?xml') || trimmedContent.startsWith('<')) {
  if (trimmedContent.includes('<kml') || trimmedContent.includes('<Placemark>') || trimmedContent.includes('<Document>')) {
   return 'kml';
  }
  if (trimmedContent.includes('<gpx') || trimmedContent.includes('<wpt') || trimmedContent.includes('<trk')) {
   return 'gpx';
  }
 }

 // JSON-based: GeoJSON
 if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
  if (isValidGeoJSON(content)) {
   return 'geojson';
  }
 }

 // CSV: tabular with coordinate columns
 if (isValidCSV(content)) {
  return 'csv';
 }

 // 2. Fallback to extension hint if content detection failed
 const extensionFormat = getFormatFromFileName(fileName);
 if (extensionFormat) {
  return extensionFormat;
 }

 return null;
}

export interface ParseResult {
 success: boolean;
 document?: KMLDocument;
 error?: string;
 format?: SupportedFormat;
 warnings?: string[];
}

/**
 * Parse a geographic file. Accepts either a string (text formats: KML/GPX/GeoJSON/CSV)
 * or an ArrayBuffer (binary formats: KMZ — detected by magic bytes or extension).
 * Returns a Promise because KMZ decompression is async.
 */
export async function parseGeoFile(input: string | ArrayBuffer, fileName: string): Promise<ParseResult> {
 // Detect KMZ first: by magic bytes (when binary) or extension hint
 const isBinary = typeof input !== 'string';
 const looksLikeKMZ = isBinary
  ? isKMZBuffer(input as ArrayBuffer)
  : fileName.toLowerCase().endsWith('.kmz');

 if (looksLikeKMZ) {
  if (!isBinary) {
   return {
    success: false,
    error: 'El archivo KMZ debe leerse como binario (ArrayBuffer), no como texto.',
    format: 'kmz',
   };
  }
  try {
   // Extract inner KML so we can both parse it AND inspect NetworkLinks.
   const { extractKMLFromKMZ } = await import('./kmz-parser');
   const innerKml = await extractKMLFromKMZ(input as ArrayBuffer, fileName);
   const document = parseKML(innerKml, fileName);
   const networkLinks = extractKMLNetworkLinks(innerKml);
   return await resolveOrFinalize(document, 'kmz', networkLinks, fileName);
  } catch (error) {
   return {
    success: false,
    error: error instanceof Error ? error.message : 'Error al procesar el KMZ',
    format: 'kmz',
   };
  }
 }

 // For all other formats we work with text content. Decode if we got a buffer.
 const content = isBinary
  ? new TextDecoder('utf-8').decode(input as ArrayBuffer)
  : (input as string);

 const format = detectFormatFromContent(content, fileName);
 
 if (!format) {
  return {
   success: false,
   error: `Formato de archivo no reconocido. Formatos soportados: ${SUPPORTED_FORMATS.map(f => f.name).join(', ')}`,
  };
 }
 
 try {
  let document: KMLDocument;
  
  switch (format) {
   case 'kml':
    document = parseKML(content, fileName);
    break;
   case 'gpx':
    document = parseGPX(content, fileName);
    break;
   case 'geojson':
    document = parseGeoJSON(content, fileName);
    break;
   case 'csv':
    document = parseCSV(content, fileName);
    break;
   default:
    return {
     success: false,
     error: 'Formato no soportado',
    };
  }

  // Plain KML may also contain <NetworkLink> entries (e.g. exported map index).
  const networkLinks = format === 'kml' ? extractKMLNetworkLinks(content) : [];
  return await resolveOrFinalize(document, format, networkLinks, fileName);
 } catch (error) {
  return {
   success: false,
   error: error instanceof Error ? error.message : 'Error al procesar el archivo',
   format,
  };
 }
}

/** Shared validation + warnings post-processing for any parsed KMLDocument. */
function finalizeParseResult(document: KMLDocument, format: SupportedFormat): ParseResult {
 const warnings: string[] = [];

 // Validate locations have valid coordinates
 const validLocations = document.locations.filter(loc =>
  loc.coordinates &&
  typeof loc.coordinates.lat === 'number' &&
  typeof loc.coordinates.lng === 'number' &&
  !isNaN(loc.coordinates.lat) &&
  !isNaN(loc.coordinates.lng) &&
  loc.coordinates.lat >= -90 &&
  loc.coordinates.lat <= 90 &&
  loc.coordinates.lng >= -180 &&
  loc.coordinates.lng <= 180
 );

 const invalidCount = document.locations.length - validLocations.length;
 if (invalidCount > 0) {
  warnings.push(`${invalidCount} ubicaciones con coordenadas inválidas fueron omitidas`);
 }

 if (validLocations.length === 0 && (!document.routes || document.routes.length === 0)) {
  return {
   success: false,
   error: 'El archivo no contiene ubicaciones ni rutas con coordenadas GPS válidas',
   format,
  };
 }

 document.locations = validLocations;

 return {
  success: true,
  document,
  format,
  warnings: warnings.length > 0 ? warnings : undefined,
 };
}

/**
 * Decode base64 (returned by the edge function) to ArrayBuffer in browser/test envs.
 */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * If the parsed document is empty AND the source contained <NetworkLink> URLs
 * (typical of KMZ exports from Google My Maps that only embed a remote pointer),
 * follow the first link via the fetch-remote-kml edge function and re-parse.
 * Falls back to a clear error if the fetch fails.
 */
async function resolveOrFinalize(
  document: KMLDocument,
  format: SupportedFormat,
  networkLinks: string[],
  fileName: string,
): Promise<ParseResult> {
  const isEmpty =
    document.locations.length === 0 && (!document.routes || document.routes.length === 0);
  if (!isEmpty || networkLinks.length === 0) {
    return finalizeParseResult(document, format);
  }

  const url = networkLinks[0];
  try {
    const { data, error } = await supabase.functions.invoke('fetch-remote-kml', {
      body: { url },
    });
    if (error || !data?.base64) {
      throw new Error(error?.message || 'No se pudo descargar el contenido remoto.');
    }
    const buffer = base64ToArrayBuffer(data.base64 as string);
    const ct = (data.contentType as string | undefined)?.toLowerCase() || '';
    const remoteName = url.split(/[?#]/)[0].split('/').pop() || `${fileName}.remote`;
    const isRemoteKMZ = isKMZBuffer(buffer) || ct.includes('kmz') || remoteName.toLowerCase().endsWith('.kmz');
    if (isRemoteKMZ) {
      return await parseGeoFile(buffer, remoteName.endsWith('.kmz') ? remoteName : `${remoteName}.kmz`);
    }
    const text = new TextDecoder('utf-8').decode(buffer);
    const inferredName = remoteName.includes('.') ? remoteName : `${remoteName}.kml`;
    return await parseGeoFile(text, inferredName);
  } catch (e) {
    return {
      success: false,
      error:
        `Este KMZ solo contiene un enlace a un mapa externo (${url}) y no se pudo descargar automáticamente. ` +
        `Exporta el mapa desde Google My Maps como KML completo y vuélvelo a subir.`,
      format,
    };
  }
}

// Re-export CSV hints for the upload UI
export { CSV_COLUMN_HINTS };
