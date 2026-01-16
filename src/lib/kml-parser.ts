import { GeoLocation, KMLDocument } from '@/types/location';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
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
  // Simplified continent detection based on coordinates
  if (lat > 35 && lat < 71 && lng > -25 && lng < 65) return 'Europa';
  if (lat > -35 && lat < 37 && lng > -20 && lng < 55) return 'África';
  if (lat > 5 && lat < 83 && lng > -170 && lng < -50) return 'América del Norte';
  if (lat > -60 && lat < 15 && lng > -85 && lng < -30) return 'América del Sur';
  if (lat > -50 && lat < 75 && lng > 25 && lng < 180) return 'Asia';
  if (lat > -50 && lng > 110 && lng < 180) return 'Oceanía';
  if (lat < -60) return 'Antártida';
  return 'Desconocido';
}

export function parseKML(content: string, fileName: string): KMLDocument {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');
  
  const docName = doc.querySelector('Document > name')?.textContent || fileName.replace('.kml', '');
  const placemarks = doc.querySelectorAll('Placemark');
  
  const locations: GeoLocation[] = [];
  
  placemarks.forEach((placemark, index) => {
    const name = placemark.querySelector('name')?.textContent || `Punto ${index + 1}`;
    const description = placemark.querySelector('description')?.textContent || undefined;
    
    // Try to find coordinates in Point, or other geometry types
    let coordString = placemark.querySelector('Point coordinates')?.textContent;
    
    if (!coordString) {
      // Try LineString or Polygon (take first coordinate)
      coordString = placemark.querySelector('LineString coordinates')?.textContent?.split(/\s+/)[0];
    }
    
    if (!coordString) {
      coordString = placemark.querySelector('Polygon coordinates')?.textContent?.split(/\s+/)[0];
    }
    
    if (coordString) {
      const coords = extractCoordinates(coordString);
      if (coords) {
        const continent = getContinent(coords.lat, coords.lng);
        
        locations.push({
          id: generateId(),
          name,
          description,
          coordinates: coords,
          continent,
          country: undefined,
          region: undefined,
          zone: undefined,
          customData: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  });
  
  return {
    id: generateId(),
    name: docName,
    fileName,
    locations,
    uploadedAt: new Date(),
  };
}

export function exportToKML(locations: GeoLocation[], documentName: string): string {
  const placemarks = locations.map(loc => `
    <Placemark>
      <name>${escapeXml(loc.name)}</name>
      ${loc.description ? `<description>${escapeXml(loc.description)}</description>` : ''}
      <ExtendedData>
        ${loc.continent ? `<Data name="continent"><value>${escapeXml(loc.continent)}</value></Data>` : ''}
        ${loc.country ? `<Data name="country"><value>${escapeXml(loc.country)}</value></Data>` : ''}
        ${loc.region ? `<Data name="region"><value>${escapeXml(loc.region)}</value></Data>` : ''}
        ${loc.zone ? `<Data name="zone"><value>${escapeXml(loc.zone)}</value></Data>` : ''}
        ${Object.entries(loc.customData || {}).map(([key, value]) => 
          `<Data name="${escapeXml(key)}"><value>${escapeXml(value)}</value></Data>`
        ).join('')}
      </ExtendedData>
      <Point>
        <coordinates>${loc.coordinates.lng},${loc.coordinates.lat}${loc.coordinates.altitude ? `,${loc.coordinates.altitude}` : ''}</coordinates>
      </Point>
    </Placemark>
  `).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    ${placemarks}
  </Document>
</kml>`;
}

export function exportToCSV(locations: GeoLocation[]): string {
  const headers = ['name', 'latitude', 'longitude', 'altitude', 'continent', 'country', 'region', 'zone', 'description'];
  
  // Get all custom data keys
  const customKeys = new Set<string>();
  locations.forEach(loc => {
    Object.keys(loc.customData || {}).forEach(key => customKeys.add(key));
  });
  
  const allHeaders = [...headers, ...Array.from(customKeys)];
  
  const rows = locations.map(loc => {
    const baseRow = [
      loc.name,
      loc.coordinates.lat.toString(),
      loc.coordinates.lng.toString(),
      loc.coordinates.altitude?.toString() || '',
      loc.continent || '',
      loc.country || '',
      loc.region || '',
      loc.zone || '',
      loc.description || '',
    ];
    
    const customRow = Array.from(customKeys).map(key => loc.customData?.[key] || '');
    
    return [...baseRow, ...customRow].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
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
