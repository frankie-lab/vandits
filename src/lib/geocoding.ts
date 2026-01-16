// Reverse geocoding service using Nominatim (OpenStreetMap)
// Rate limited to 1 request per second as per Nominatim usage policy

interface GeocodingResult {
  country?: string;
  region?: string;
  zone?: string;
  continent?: string;
}

const CONTINENT_MAP: Record<string, string> = {
  // Europe
  'España': 'Europa', 'Spain': 'Europa',
  'Francia': 'Europa', 'France': 'Europa',
  'Alemania': 'Europa', 'Germany': 'Europa',
  'Italia': 'Europa', 'Italy': 'Europa',
  'Portugal': 'Europa',
  'Reino Unido': 'Europa', 'United Kingdom': 'Europa',
  'Países Bajos': 'Europa', 'Netherlands': 'Europa',
  'Bélgica': 'Europa', 'Belgium': 'Europa',
  'Suiza': 'Europa', 'Switzerland': 'Europa',
  'Austria': 'Europa',
  'Polonia': 'Europa', 'Poland': 'Europa',
  'Suecia': 'Europa', 'Sweden': 'Europa',
  'Noruega': 'Europa', 'Norway': 'Europa',
  'Dinamarca': 'Europa', 'Denmark': 'Europa',
  'Finlandia': 'Europa', 'Finland': 'Europa',
  'Grecia': 'Europa', 'Greece': 'Europa',
  'Irlanda': 'Europa', 'Ireland': 'Europa',
  'Chequia': 'Europa', 'Czech Republic': 'Europa', 'Czechia': 'Europa',
  'Rumanía': 'Europa', 'Romania': 'Europa',
  'Hungría': 'Europa', 'Hungary': 'Europa',
  'Croacia': 'Europa', 'Croatia': 'Europa',
  'Eslovaquia': 'Europa', 'Slovakia': 'Europa',
  'Eslovenia': 'Europa', 'Slovenia': 'Europa',
  'Bulgaria': 'Europa',
  'Serbia': 'Europa',
  'Ucrania': 'Europa', 'Ukraine': 'Europa',
  'Rusia': 'Europa', 'Russia': 'Europa',
  
  // Americas
  'Estados Unidos': 'América del Norte', 'United States': 'América del Norte', 'USA': 'América del Norte',
  'Canadá': 'América del Norte', 'Canada': 'América del Norte',
  'México': 'América del Norte', 'Mexico': 'América del Norte',
  'Brasil': 'América del Sur', 'Brazil': 'América del Sur',
  'Argentina': 'América del Sur',
  'Chile': 'América del Sur',
  'Colombia': 'América del Sur',
  'Perú': 'América del Sur', 'Peru': 'América del Sur',
  'Venezuela': 'América del Sur',
  'Ecuador': 'América del Sur',
  'Bolivia': 'América del Sur',
  'Paraguay': 'América del Sur',
  'Uruguay': 'América del Sur',
  'Guatemala': 'América del Norte',
  'Cuba': 'América del Norte',
  'República Dominicana': 'América del Norte', 'Dominican Republic': 'América del Norte',
  'Honduras': 'América del Norte',
  'Nicaragua': 'América del Norte',
  'El Salvador': 'América del Norte',
  'Costa Rica': 'América del Norte',
  'Panamá': 'América del Norte', 'Panama': 'América del Norte',
  
  // Asia
  'China': 'Asia',
  'Japón': 'Asia', 'Japan': 'Asia',
  'Corea del Sur': 'Asia', 'South Korea': 'Asia',
  'India': 'Asia',
  'Indonesia': 'Asia',
  'Tailandia': 'Asia', 'Thailand': 'Asia',
  'Vietnam': 'Asia',
  'Filipinas': 'Asia', 'Philippines': 'Asia',
  'Malasia': 'Asia', 'Malaysia': 'Asia',
  'Singapur': 'Asia', 'Singapore': 'Asia',
  'Turquía': 'Asia', 'Turkey': 'Asia', 'Türkiye': 'Asia',
  'Arabia Saudita': 'Asia', 'Saudi Arabia': 'Asia',
  'Emiratos Árabes Unidos': 'Asia', 'United Arab Emirates': 'Asia',
  'Israel': 'Asia',
  'Irán': 'Asia', 'Iran': 'Asia',
  'Irak': 'Asia', 'Iraq': 'Asia',
  'Pakistán': 'Asia', 'Pakistan': 'Asia',
  'Bangladés': 'Asia', 'Bangladesh': 'Asia',
  'Kazajistán': 'Asia', 'Kazakhstan': 'Asia',
  
  // Africa
  'Marruecos': 'África', 'Morocco': 'África',
  'Egipto': 'África', 'Egypt': 'África',
  'Sudáfrica': 'África', 'South Africa': 'África',
  'Nigeria': 'África',
  'Kenia': 'África', 'Kenya': 'África',
  'Etiopía': 'África', 'Ethiopia': 'África',
  'Tanzania': 'África',
  'Argelia': 'África', 'Algeria': 'África',
  'Túnez': 'África', 'Tunisia': 'África',
  'Ghana': 'África',
  'Costa de Marfil': 'África', 'Ivory Coast': 'África',
  'Senegal': 'África',
  'Uganda': 'África',
  'Mozambique': 'África',
  'Angola': 'África',
  'Camerún': 'África', 'Cameroon': 'África',
  
  // Oceania
  'Australia': 'Oceanía',
  'Nueva Zelanda': 'Oceanía', 'New Zealand': 'Oceanía',
  'Fiyi': 'Oceanía', 'Fiji': 'Oceanía',
  'Papúa Nueva Guinea': 'Oceanía', 'Papua New Guinea': 'Oceanía',
};

function getContinent(country: string): string {
  return CONTINENT_MAP[country] || 'Desconocido';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'es,en',
          'User-Agent': 'GeoDataManager/1.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Geocoding request failed');
    }

    const data = await response.json();
    const address = data.address || {};

    const country = address.country || undefined;
    const region = address.state || address.region || address.province || undefined;
    const zone = address.county || address.city || address.town || address.municipality || undefined;
    const continent = country ? getContinent(country) : undefined;

    return { country, region, zone, continent };
  } catch (error) {
    console.error('Geocoding error:', error);
    return {};
  }
}

export interface GeocodingProgress {
  current: number;
  total: number;
  currentName: string;
}

export async function batchReverseGeocode(
  locations: Array<{ id: string; name: string; lat: number; lng: number }>,
  onProgress: (progress: GeocodingProgress) => void,
  onResult: (id: string, result: GeocodingResult) => void
): Promise<void> {
  const total = locations.length;
  
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    
    onProgress({
      current: i + 1,
      total,
      currentName: loc.name,
    });

    const result = await reverseGeocode(loc.lat, loc.lng);
    onResult(loc.id, result);

    // Rate limiting: wait 1.1 seconds between requests (Nominatim policy)
    if (i < locations.length - 1) {
      await delay(1100);
    }
  }
}
