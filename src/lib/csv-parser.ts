import { KMLDocument } from '@/types/location';
import {
  ParsedGeoContent,
  ParsedPoint,
  getContinent,
  parseFlexibleDate,
  toKMLDocument,
} from './parsers/shared';

/**
 * Parser para archivos CSV con coordenadas.
 * Compatible con Excel, Google Sheets, etc.
 *
 * Detección automática:
 *  - Latitud / Longitud / Altitud / Nombre / Descripción
 *  - Fecha (date/fecha/time/timestamp/when) → timestamp
 *  - Cualquier columna no mapeada → customData
 */

const LAT_COLUMNS = ['lat', 'latitude', 'latitud', 'y', 'coordenada_y', 'coord_y'];
const LNG_COLUMNS = ['lng', 'lon', 'longitude', 'longitud', 'long', 'x', 'coordenada_x', 'coord_x'];
const NAME_COLUMNS = ['name', 'nombre', 'title', 'titulo', 'label', 'etiqueta', 'place', 'lugar', 'sitio', 'punto'];
const DESC_COLUMNS = ['description', 'descripcion', 'desc', 'notes', 'notas', 'comments', 'comentarios', 'observaciones', 'obs'];
const ALT_COLUMNS = ['alt', 'altitude', 'altitud', 'elevation', 'ele', 'z', 'altura'];
const DATE_COLUMNS = ['date', 'fecha', 'time', 'timestamp', 'when', 'datetime', 'created_at', 'created'];

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
  const normalized = headers.map((h) => h.toLowerCase().trim().replace(/['"]/g, ''));
  for (const name of possibleNames) {
    const idx = normalized.indexOf(name.toLowerCase());
    if (idx !== -1) return idx;
  }
  for (const name of possibleNames) {
    const idx = normalized.findIndex((h) => h.includes(name.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseCSVToContent(content: string, fileName: string): ParsedGeoContent {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error('El archivo CSV debe contener al menos una fila de encabezados y una fila de datos');
  }

  const headers = parseCSVLine(lines[0]);
  const latIndex = findColumn(headers, LAT_COLUMNS);
  const lngIndex = findColumn(headers, LNG_COLUMNS);
  const nameIndex = findColumn(headers, NAME_COLUMNS);
  const descIndex = findColumn(headers, DESC_COLUMNS);
  const altIndex = findColumn(headers, ALT_COLUMNS);
  const dateIndex = findColumn(headers, DATE_COLUMNS);

  if (latIndex === -1 || lngIndex === -1) {
    throw new Error(
      `No se encontraron columnas de coordenadas. ` +
        `Columnas de latitud válidas: ${LAT_COLUMNS.join(', ')}. ` +
        `Columnas de longitud válidas: ${LNG_COLUMNS.join(', ')}`
    );
  }

  const mappedIndices = new Set([latIndex, lngIndex, nameIndex, descIndex, altIndex, dateIndex].filter((i) => i !== -1));

  const points: ParsedPoint[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < Math.max(latIndex, lngIndex) + 1) continue;

    const latStr = values[latIndex]?.replace(',', '.').trim();
    const lngStr = values[lngIndex]?.replace(',', '.').trim();
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng)) {
      errors.push(`Fila ${i + 1}: coordenadas inválidas`);
      continue;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      errors.push(`Fila ${i + 1}: coordenadas fuera de rango`);
      continue;
    }

    const name =
      nameIndex !== -1 && values[nameIndex]
        ? values[nameIndex].replace(/^["']|["']$/g, '').trim()
        : `Punto ${points.length + 1}`;
    const description =
      descIndex !== -1 && values[descIndex]
        ? values[descIndex].replace(/^["']|["']$/g, '').trim()
        : undefined;
    const altStr = altIndex !== -1 ? values[altIndex]?.replace(',', '.').trim() : undefined;
    const altitude = altStr ? parseFloat(altStr) : undefined;

    let timestamp: Date | undefined;
    if (dateIndex !== -1 && values[dateIndex]) {
      timestamp = parseFlexibleDate(values[dateIndex]) || undefined;
    }

    // Unmapped columns → customData
    const customData: Record<string, string> = {};
    headers.forEach((header, colIdx) => {
      if (mappedIndices.has(colIdx)) return;
      const v = values[colIdx];
      if (v && v.trim()) {
        customData[header.replace(/['"]/g, '').trim()] = v.replace(/^["']|["']$/g, '').trim();
      }
    });

    points.push({
      id: crypto.randomUUID(),
      name,
      description,
      coordinates: { lat, lng, altitude: altitude && !isNaN(altitude) ? altitude : undefined },
      timestamp,
      continent: getContinent(lat, lng),
      customData: Object.keys(customData).length > 0 ? customData : undefined,
    });
  }

  if (points.length === 0) {
    throw new Error(
      `No se encontraron ubicaciones válidas en el CSV. ` +
        (errors.length > 0 ? `Errores: ${errors.slice(0, 3).join('; ')}` : '')
    );
  }

  return {
    documentName: fileName.replace(/\.csv$/i, ''),
    fileName,
    points,
    routes: [],
  };
}

export function parseCSV(content: string, fileName: string): KMLDocument {
  const parsed = parseCSVToContent(content, fileName);
  return toKMLDocument(parsed);
}

export function isValidCSV(content: string): boolean {
  try {
    const lines = content.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return false;
    const headers = parseCSVLine(lines[0]);
    const latIndex = findColumn(headers, LAT_COLUMNS);
    const lngIndex = findColumn(headers, LNG_COLUMNS);
    return latIndex !== -1 && lngIndex !== -1;
  } catch {
    return false;
  }
}

export const CSV_COLUMN_HINTS = {
  latitude: LAT_COLUMNS,
  longitude: LNG_COLUMNS,
  name: NAME_COLUMNS,
  description: DESC_COLUMNS,
  altitude: ALT_COLUMNS,
  date: DATE_COLUMNS,
};
