import { GeoLocation, KMLDocument } from '@/types/location';

/**
 * Parser para archivos CSV con coordenadas
 * Compatible con: Excel, Google Sheets, cualquier aplicación
 * 
 * Columnas detectadas automáticamente:
 * - Latitud: lat, latitude, latitud, y, LAT
 * - Longitud: lng, lon, longitude, longitud, long, x, LNG, LON
 * - Nombre: name, nombre, title, titulo, label, NAME
 * - Descripción: description, descripcion, desc, notes, notas, comments
 * - Altitud: alt, altitude, altitud, elevation, ele, z
 */

interface CSVRow {
 [key: string]: string;
}

const LAT_COLUMNS = ['lat', 'latitude', 'latitud', 'y', 'coordenada_y', 'coord_y'];
const LNG_COLUMNS = ['lng', 'lon', 'longitude', 'longitud', 'long', 'x', 'coordenada_x', 'coord_x'];
const NAME_COLUMNS = ['name', 'nombre', 'title', 'titulo', 'label', 'etiqueta', 'place', 'lugar', 'sitio', 'punto'];
const DESC_COLUMNS = ['description', 'descripcion', 'desc', 'notes', 'notas', 'comments', 'comentarios', 'observaciones', 'obs'];
const ALT_COLUMNS = ['alt', 'altitude', 'altitud', 'elevation', 'ele', 'z', 'altura'];

function parseCSVLine(line: string): string[] {
 const result: string[] = [];
 let current = '';
 let inQuotes = false;
 
 for (let i = 0; i < line.length; i++) {
 const char = line[i];
 
 if (char === '"') {
 if (inQuotes && line[i + 1] === '"') {
 current += '"';
 i++;
 } else {
 inQuotes = !inQuotes;
 }
 } else if ((char === ',' || char === ';' || char === '\t') && !inQuotes) {
 result.push(current.trim());
 current = '';
 } else {
 current += char;
 }
 }
 
 result.push(current.trim());
 return result;
}

function detectDelimiter(content: string): string {
 const firstLine = content.split('\n')[0];
 const commas = (firstLine.match(/,/g) || []).length;
 const semicolons = (firstLine.match(/;/g) || []).length;
 const tabs = (firstLine.match(/\t/g) || []).length;
 
 if (tabs > commas && tabs > semicolons) return '\t';
 if (semicolons > commas) return ';';
 return ',';
}

function findColumn(headers: string[], possibleNames: string[]): number {
 const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/['"]/g, ''));
 
 for (const name of possibleNames) {
 const index = normalizedHeaders.indexOf(name.toLowerCase());
 if (index !== -1) return index;
 }
 
  // Try partial match
 for (const name of possibleNames) {
 const index = normalizedHeaders.findIndex(h => h.includes(name.toLowerCase()));
 if (index !== -1) return index;
 }
 
 return -1;
}

export function parseCSV(content: string, fileName: string): KMLDocument {
  // Normalize line endings
 const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
 const lines = normalizedContent.split('\n').filter(line => line.trim());
 
 if (lines.length < 2) {
 throw new Error('El archivo CSV debe contener al menos una fila de encabezados y una fila de datos');
 }
 
 const delimiter = detectDelimiter(content);
 const headers = parseCSVLine(lines[0]);
 
  // Find column indices
 const latIndex = findColumn(headers, LAT_COLUMNS);
 const lngIndex = findColumn(headers, LNG_COLUMNS);
 const nameIndex = findColumn(headers, NAME_COLUMNS);
 const descIndex = findColumn(headers, DESC_COLUMNS);
 const altIndex = findColumn(headers, ALT_COLUMNS);
 
 if (latIndex === -1 || lngIndex === -1) {
 throw new Error(
 `No se encontraron columnas de coordenadas. ` +
 `Columnas de latitud válidas: ${LAT_COLUMNS.join(', ')}. ` +
 `Columnas de longitud válidas: ${LNG_COLUMNS.join(', ')}`
 );
 }
 
 const locations: GeoLocation[] = [];
 const errors: string[] = [];
 
 for (let i = 1; i < lines.length; i++) {
 const values = parseCSVLine(lines[i]);
 
 if (values.length < Math.max(latIndex, lngIndex) + 1) {
 continue; // Skip incomplete rows
 }
 
 const latStr = values[latIndex]?.replace(',', '.').trim();
 const lngStr = values[lngIndex]?.replace(',', '.').trim();
 
 const lat = parseFloat(latStr);
 const lng = parseFloat(lngStr);
 
 if (isNaN(lat) || isNaN(lng)) {
 errors.push(`Fila ${i + 1}: coordenadas inválidas`);
 continue;
 }
 
    // Validate coordinate ranges
 if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
 errors.push(`Fila ${i + 1}: coordenadas fuera de rango`);
 continue;
 }
 
 const name = nameIndex !== -1 && values[nameIndex] 
 ? values[nameIndex].replace(/^["']|["']$/g, '').trim()
 : `Punto ${locations.length + 1}`;
 
 const description = descIndex !== -1 && values[descIndex]
 ? values[descIndex].replace(/^["']|["']$/g, '').trim()
 : undefined;
 
 const altStr = altIndex !== -1 ? values[altIndex]?.replace(',', '.').trim() : undefined;
 const altitude = altStr ? parseFloat(altStr) : undefined;
 
 locations.push({
 id: crypto.randomUUID(),
 name,
 description,
 coordinates: {
 lat,
 lng,
 altitude: altitude && !isNaN(altitude) ? altitude : undefined,
 },
 createdAt: new Date(),
 updatedAt: new Date(),
 });
 }
 
 if (locations.length === 0) {
 throw new Error(
 `No se encontraron ubicaciones válidas en el CSV. ` +
 (errors.length > 0 ? `Errores: ${errors.slice(0, 3).join('; ')}` : '')
 );
 }
 
 const documentName = fileName.replace(/\.csv$/i, '');
 
 return {
 id: crypto.randomUUID(),
 name: documentName,
 fileName,
 locations,
 uploadedAt: new Date(),
 };
}

export function isValidCSV(content: string): boolean {
 try {
 const lines = content.split('\n').filter(line => line.trim());
 if (lines.length < 2) return false;
 
 const headers = parseCSVLine(lines[0]);
 const latIndex = findColumn(headers, LAT_COLUMNS);
 const lngIndex = findColumn(headers, LNG_COLUMNS);
 
 return latIndex !== -1 && lngIndex !== -1;
 } catch {
 return false;
 }
}

// Export column names for documentation
export const CSV_COLUMN_HINTS = {
 latitude: LAT_COLUMNS,
 longitude: LNG_COLUMNS,
 name: NAME_COLUMNS,
 description: DESC_COLUMNS,
 altitude: ALT_COLUMNS,
};
