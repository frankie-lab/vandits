import { GeoLocation, KMLDocument, EnrichedLocationData } from '@/types/location';

function generateId(): string {
  // Generate a proper UUID v4
 return crypto.randomUUID();
}

function extractCoordinates(coordString: string): { lat: number; lng: number; altitude?: number } | null {
 const cleaned = coordString.trim();
 const parts = cleaned.split(',').map(p => parseFloat(p.trim()));
 
 if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
 return {
 lng: parts[0],
 lat: parts[1],
 altitude: parts.length > 2 && !isNaN(parts[2]) ? parts[2] : undefined,
 };
 }
 return null;
}

function getContinent(lat: number, lng: number): string {
 if (lat > 35 && lat < 71 && lng > -25 && lng < 65) return 'Europa';
 if (lat > -35 && lat < 37 && lng > -20 && lng < 55) return 'África';
 if (lat > 5 && lat < 83 && lng > -170 && lng < -50) return 'América del Norte';
 if (lat > -60 && lat < 15 && lng > -85 && lng < -30) return 'América del Sur';
 if (lat > -50 && lat < 75 && lng > 25 && lng < 180) return 'Asia';
 if (lat > -50 && lng > 110 && lng < 180) return 'Oceanía';
 if (lat < -60) return 'Antártida';
 return 'Desconocido';
}

function cleanText(text: string | null | undefined): string | undefined {
 if (!text) return undefined;
 
  // Remove CDATA wrapper if present
 let cleaned = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
 
  // Decode HTML entities
 const textarea = document.createElement('textarea');
 textarea.innerHTML = cleaned;
 cleaned = textarea.value;
 
  // Strip HTML tags but preserve line breaks
 cleaned = cleaned
 .replace(/<br\s*\/?>/gi, '\n')
 .replace(/<\/p>/gi, '\n')
 .replace(/<\/div>/gi, '\n')
 .replace(/<[^>]*>/g, '')
 .trim();
 
 return cleaned || undefined;
}

function parseExtendedData(placemark: Element): Record<string, string> {
 const customData: Record<string, string> = {};
 
  // Parse ExtendedData/Data elements
 const dataElements = placemark.querySelectorAll('ExtendedData Data');
 dataElements.forEach((data) => {
 const name = data.getAttribute('name');
 const value = data.querySelector('value')?.textContent;
 if (name && value) {
 customData[name] = cleanText(value) || value;
 }
 });
 
  // Parse ExtendedData/SimpleData elements (for Schema-based data)
 const simpleDataElements = placemark.querySelectorAll('ExtendedData SchemaData SimpleData');
 simpleDataElements.forEach((data) => {
 const name = data.getAttribute('name');
 const value = data.textContent;
 if (name && value) {
 customData[name] = cleanText(value) || value;
 }
 });
 
 return customData;
}

// Parse timestamp from KML TimeStamp, TimeSpan, or ExtendedData
function parseTimestamp(placemark: Element, customData: Record<string, string>): Date | null {
  // 1. Try KML TimeStamp/when
 const timestampWhen = placemark.querySelector('TimeStamp when')?.textContent;
 if (timestampWhen) {
 const parsed = new Date(timestampWhen);
 if (!isNaN(parsed.getTime())) return parsed;
 }
 
  // 2. Try KML TimeSpan/begin (use start of range)
 const timeSpanBegin = placemark.querySelector('TimeSpan begin')?.textContent;
 if (timeSpanBegin) {
 const parsed = new Date(timeSpanBegin);
 if (!isNaN(parsed.getTime())) return parsed;
 }
 
  // 3. Try gx:TimeStamp (Google Earth extension)
 const gxTimestamp = placemark.querySelector('gx\\:TimeStamp when, TimeStamp when')?.textContent;
 if (gxTimestamp) {
 const parsed = new Date(gxTimestamp);
 if (!isNaN(parsed.getTime())) return parsed;
 }
 
  // 4. Try common date fields in ExtendedData
 const dateFields = [
 'date', 'Date', 'fecha', 'Fecha', 
 'created', 'Created', 'createdAt', 'created_at',
 'timestamp', 'Timestamp', 'time', 'Time',
 'datetime', 'DateTime', 'dateTime',
 'visitDate', 'visit_date', 'fechaVisita', 'fecha_visita',
 'addedOn', 'added_on', 'agregado'
 ];
 
 for (const field of dateFields) {
 const value = customData[field];
 if (value) {
      // Try parsing various date formats
 const parsed = parseFlexibleDate(value);
 if (parsed) return parsed;
 }
 }
 
 return null;
}

// Parse dates in various formats
function parseFlexibleDate(dateStr: string): Date | null {
 if (!dateStr || typeof dateStr !== 'string') return null;
 
 const trimmed = dateStr.trim();
 
  // ISO 8601 format
 let parsed = new Date(trimmed);
 if (!isNaN(parsed.getTime())) return parsed;
 
  // DD/MM/YYYY or DD-MM-YYYY
 const euMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
 if (euMatch) {
 const [, day, month, year] = euMatch;
 parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
 if (!isNaN(parsed.getTime())) return parsed;
 }
 
  // YYYY/MM/DD or YYYY-MM-DD (already handled by ISO, but be explicit)
 const isoMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
 if (isoMatch) {
 const [, year, month, day] = isoMatch;
 parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
 if (!isNaN(parsed.getTime())) return parsed;
 }
 
  // MM/DD/YYYY (US format) - less common, try last
 const usMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
 if (usMatch) {
 const [, month, day, year] = usMatch;
    // Only use if month <= 12 and day > 12 (to distinguish from EU format)
 if (parseInt(month) <= 12 && parseInt(day) > 12) {
 parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
 if (!isNaN(parsed.getTime())) return parsed;
 }
 }
 
 return null;
}

export function parseKML(content: string, fileName: string): KMLDocument {
 const parser = new DOMParser();
 const doc = parser.parseFromString(content, 'text/xml');
 
  // Check for parse errors
 const parseError = doc.querySelector('parsererror');
 if (parseError) {
 throw new Error('Error al parsear el archivo KML');
 }
 
 const docName = cleanText(doc.querySelector('Document > name')?.textContent) || fileName.replace('.kml', '');
 const placemarks = doc.querySelectorAll('Placemark');
 
 const locations: GeoLocation[] = [];
 
 placemarks.forEach((placemark, index) => {
 const name = cleanText(placemark.querySelector('name')?.textContent) || `Punto ${index + 1}`;
 const description = cleanText(placemark.querySelector('description')?.textContent);
 
    // Try to find coordinates in different geometry types
 let coordString = placemark.querySelector('Point coordinates')?.textContent;
 
 if (!coordString) {
 const lineCoords = placemark.querySelector('LineString coordinates')?.textContent;
 if (lineCoords) {
 coordString = lineCoords.trim().split(/\s+/)[0];
 }
 }
 
 if (!coordString) {
 const polyCoords = placemark.querySelector('Polygon coordinates')?.textContent;
 if (polyCoords) {
 coordString = polyCoords.trim().split(/\s+/)[0];
 }
 }
 
    // Also try LookAt coordinates
 if (!coordString) {
 const lookAt = placemark.querySelector('LookAt');
 if (lookAt) {
 const lat = lookAt.querySelector('latitude')?.textContent;
 const lng = lookAt.querySelector('longitude')?.textContent;
 if (lat && lng) {
 coordString = `${lng},${lat}`;
 }
 }
 }
 
    // Parse custom data early to check for dates
 const customData = parseExtendedData(placemark);
 
 if (coordString) {
 const coords = extractCoordinates(coordString);
 if (coords) {
 const continent = getContinent(coords.lat, coords.lng);
 
        // Extract country/region from customData if available
 const country = customData['country'] || customData['Country'] || customData['pais'] || customData['País'] || undefined;
 const region = customData['region'] || customData['Region'] || customData['región'] || customData['Región'] || undefined;
 const zone = customData['zone'] || customData['Zone'] || customData['zona'] || customData['Zona'] || undefined;
 
        // Try to extract date from KML timestamp or ExtendedData
 const extractedDate = parseTimestamp(placemark, customData);
 
        // Remove extracted fields from customData (including date fields)
 const fieldsToRemove = [
 'country', 'Country', 'pais', 'País', 
 'region', 'Region', 'región', 'Región', 
 'zone', 'Zone', 'zona', 'Zona',
 'date', 'Date', 'fecha', 'Fecha',
 'created', 'Created', 'createdAt', 'created_at',
 'timestamp', 'Timestamp', 'time', 'Time',
 'datetime', 'DateTime', 'dateTime',
 'visitDate', 'visit_date', 'fechaVisita', 'fecha_visita',
 'addedOn', 'added_on', 'agregado'
 ];
 fieldsToRemove.forEach(key => {
 delete customData[key];
 });
 
 const now = new Date();
 
 locations.push({
 id: generateId(),
 name,
 description,
 coordinates: coords,
 continent,
 country,
 region,
 zone,
 customData,
 createdAt: extractedDate || now,
 updatedAt: now,
 });
 }
 }
 });
 
 console.log(`Parsed ${locations.length} locations from KML`);
 
 return {
 id: generateId(),
 name: docName,
 fileName,
 locations,
 uploadedAt: new Date(),
 };
}

// Genera la descripción formateada en HTML a partir de la ficha técnica enriquecida
function formatEnrichedDescription(loc: GeoLocation): string {
 const enriched = loc.enrichedData;
 
 if (!enriched) {
 return loc.description || '';
 }
 
 const parts: string[] = [];
 
  // Imagen (si existe) - compatible con Google My Maps
 if (enriched.imagen) {
 parts.push(`<img src="${enriched.imagen}" style="max-width:100%;height:auto;margin-bottom:10px;" />`);
 }
 
  // Nombre del lugar (como título)
 parts.push(`<b>${enriched.nombre_lugar}</b>`);
 parts.push('');
 
  // Localización
 parts.push(`<i>${enriched.localizacion}</i>`);
 parts.push('');
 
  // Descripción
 parts.push(enriched.descripcion);
 parts.push('');
 
  // Punto destacado
 parts.push(`<b></b> ${enriched.punto_destacado}`);
 parts.push('');
 
  // Observación (opcional)
 if (enriched.observacion) {
 parts.push(`<i>${enriched.observacion}</i>`);
 parts.push('');
 }
 
  // Nube de etiquetas
 if (enriched.etiquetas && enriched.etiquetas.length > 0) {
 parts.push(enriched.etiquetas.join(''));
 parts.push('');
 }
 
  // Datos clave
 parts.push('---');
 parts.push(`<b>Tipo:</b> ${enriched.datos_clave.tipo}`);
 if (enriched.datos_clave.dimension_principal) {
 parts.push(`<b>Dimensión:</b> ${enriched.datos_clave.dimension_principal}`);
 }
 if (enriched.datos_clave.acceso) {
 parts.push(`<b>Acceso:</b> ${enriched.datos_clave.acceso}`);
 }
 if (enriched.datos_clave.estado_proteccion) {
 parts.push(`<b>Protección:</b> ${enriched.datos_clave.estado_proteccion}`);
 }
 parts.push(`<b>Coordenadas:</b> ${enriched.datos_clave.coordenadas}`);
 if (enriched.datos_clave.web_referencia) {
 const url = enriched.datos_clave.web_referencia.startsWith('http') 
 ? enriched.datos_clave.web_referencia 
 : `https://${enriched.datos_clave.web_referencia}`;
 parts.push(`<b>Web:</b> <a href="${url}" target="_blank">${enriched.datos_clave.web_referencia}</a>`);
 }
 parts.push('---');
 parts.push('');
 
  // Fuentes
 parts.push('<small><b>Fuentes:</b></small>');
 enriched.fuentes.forEach(fuente => {
 parts.push(`<small>• ${fuente}</small>`);
 });
 
 return parts.join('<br/>');
}

export function exportToKML(locations: GeoLocation[], documentName: string): string {
 const placemarks = locations.map(loc => {
    // Usar ficha enriquecida si existe, sino descripción original
 const description = formatEnrichedDescription(loc);
 
 return `
 <Placemark>
 <name>${escapeXml(loc.name)}</name>
 ${description ? `<description><![CDATA[${description}]]></description>` : ''}
 <ExtendedData>
 ${loc.continent ? `<Data name="continent"><value>${escapeXml(loc.continent)}</value></Data>` : ''}
 ${loc.country ? `<Data name="country"><value>${escapeXml(loc.country)}</value></Data>` : ''}
 ${loc.region ? `<Data name="region"><value>${escapeXml(loc.region)}</value></Data>` : ''}
 ${loc.zone ? `<Data name="zone"><value>${escapeXml(loc.zone)}</value></Data>` : ''}
 ${loc.enrichedData ? `<Data name="enriched"><value>true</value></Data>` : ''}
 ${loc.enrichedData?.etiquetas ? `<Data name="tags"><value>${escapeXml(loc.enrichedData.etiquetas.join(', '))}</value></Data>` : ''}
 ${Object.entries(loc.customData || {}).map(([key, value]) => 
 `<Data name="${escapeXml(key)}"><value>${escapeXml(value)}</value></Data>`
 ).join('')}
 </ExtendedData>
 <Point>
 <coordinates>${loc.coordinates.lng},${loc.coordinates.lat}${loc.coordinates.altitude ? `,${loc.coordinates.altitude}` : ''}</coordinates>
 </Point>
 </Placemark>
 `;
 }).join('\n');
 
 return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
 <Document>
 <name>${escapeXml(documentName)}</name>
 ${placemarks}
 </Document>
</kml>`;
}

export function exportToCSV(locations: GeoLocation[]): string {
 const headers = ['name', 'description', 'latitude', 'longitude', 'altitude', 'continent', 'country', 'region', 'zone'];
 
 const customKeys = new Set<string>();
 locations.forEach(loc => {
 Object.keys(loc.customData || {}).forEach(key => customKeys.add(key));
 });
 
 const allHeaders = [...headers, ...Array.from(customKeys)];
 
 const rows = locations.map(loc => {
 const baseRow = [
 loc.name,
 loc.description || '',
 loc.coordinates.lat.toString(),
 loc.coordinates.lng.toString(),
 loc.coordinates.altitude?.toString() || '',
 loc.continent || '',
 loc.country || '',
 loc.region || '',
 loc.zone || '',
 ];
 
 const customRow = Array.from(customKeys).map(key => loc.customData?.[key] || '');
 
 return [...baseRow, ...customRow].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
 });
 
 return [allHeaders.join(','), ...rows].join('\n');
}

export function exportToJSON(locations: GeoLocation[]): string {
 return JSON.stringify(locations, null, 2);
}

function escapeXml(text: string): string {
 return text
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&apos;');
}
