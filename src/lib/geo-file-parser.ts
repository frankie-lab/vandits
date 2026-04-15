import { KMLDocument } from '@/types/location';
import { parseKML } from './kml-parser';
import { parseGPX, isValidGPX } from './gpx-parser';
import { parseGeoJSON, isValidGeoJSON } from './geojson-parser';
import { parseCSV, isValidCSV, CSV_COLUMN_HINTS } from './csv-parser';

/**
 * Parser unificado para múltiples formatos de archivos geográficos
 */

export type SupportedFormat = 'kml' | 'gpx' | 'geojson' | 'csv';

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

export function parseGeoFile(content: string, fileName: string): ParseResult {
 const format = detectFormatFromContent(content, fileName);
 
 if (!format) {
 return {
 success: false,
 error: `Formato de archivo no reconocido. Formatos soportados: ${SUPPORTED_FORMATS.map(f => f.name).join(', ')}`,
 };
 }
 
 try {
 let document: KMLDocument;
 const warnings: string[] = [];
 
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
 } catch (error) {
 return {
 success: false,
 error: error instanceof Error ? error.message : 'Error al procesar el archivo',
 format,
 };
 }
}

// Re-export CSV hints for the upload UI
export { CSV_COLUMN_HINTS };
