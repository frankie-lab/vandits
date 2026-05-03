import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  normalizeCardConfig,
  EnrichmentCardConfigV2,
  DEFAULT_CARD_CONFIG_V2,
  getActiveFields,
} from "../_shared/card-schema.ts";
import { buildEnrichmentSchema } from "../_shared/build-enrichment-schema.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LocationData {
  name: string;
  description?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  country?: string;
  region?: string;
  zone?: string;
  continent?: string;
}

interface IncomingLocation {
  name?: string;
  description?: string;
  coordinates?: {
    lat?: number;
    lng?: number;
  };
  latitude?: number;
  longitude?: number;
  country?: string;
  region?: string;
  zone?: string;
  continent?: string;
}

function normalizeLocation(input?: IncomingLocation | null): LocationData | null {
  if (!input?.name) {
    return null;
  }

  const lat = typeof input.coordinates?.lat === 'number'
    ? input.coordinates.lat
    : typeof input.latitude === 'number'
      ? input.latitude
      : null;

  const lng = typeof input.coordinates?.lng === 'number'
    ? input.coordinates.lng
    : typeof input.longitude === 'number'
      ? input.longitude
      : null;

  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return {
    name: input.name,
    description: input.description,
    coordinates: { lat, lng },
    country: input.country,
    region: input.region,
    zone: input.zone,
    continent: input.continent,
  };
}

// Continent mapping for automatic geocoding
const CONTINENT_MAP: Record<string, string> = {
  // Europa Occidental
  'España': 'Europa', 'Spain': 'Europa',
  'Francia': 'Europa', 'France': 'Europa',
  'Alemania': 'Europa', 'Germany': 'Europa',
  'Italia': 'Europa', 'Italy': 'Europa',
  'Portugal': 'Europa',
  'Reino Unido': 'Europa', 'United Kingdom': 'Europa', 'UK': 'Europa',
  'Países Bajos': 'Europa', 'Netherlands': 'Europa', 'Holanda': 'Europa',
  'Bélgica': 'Europa', 'Belgium': 'Europa',
  'Suiza': 'Europa', 'Switzerland': 'Europa',
  'Austria': 'Europa',
  'Luxemburgo': 'Europa', 'Luxembourg': 'Europa',
  'Mónaco': 'Europa', 'Monaco': 'Europa',
  'Andorra': 'Europa',
  'Liechtenstein': 'Europa',
  'San Marino': 'Europa',
  'Vaticano': 'Europa', 'Vatican': 'Europa', 'Vatican City': 'Europa',
  
  // Europa del Norte
  'Suecia': 'Europa', 'Sweden': 'Europa',
  'Noruega': 'Europa', 'Norway': 'Europa',
  'Dinamarca': 'Europa', 'Denmark': 'Europa',
  'Finlandia': 'Europa', 'Finland': 'Europa',
  'Islandia': 'Europa', 'Iceland': 'Europa',
  'Irlanda': 'Europa', 'Ireland': 'Europa',
  'Escocia': 'Europa', 'Scotland': 'Europa',
  'Gales': 'Europa', 'Wales': 'Europa',
  'Inglaterra': 'Europa', 'England': 'Europa',
  
  // Europa del Este
  'Polonia': 'Europa', 'Poland': 'Europa',
  'Chequia': 'Europa', 'Czech Republic': 'Europa', 'Czechia': 'Europa', 'República Checa': 'Europa',
  'Eslovaquia': 'Europa', 'Slovakia': 'Europa',
  'Hungría': 'Europa', 'Hungary': 'Europa',
  'Rumanía': 'Europa', 'Romania': 'Europa',
  'Bulgaria': 'Europa',
  'Ucrania': 'Europa', 'Ukraine': 'Europa',
  'Belarús': 'Europa', 'Belarus': 'Europa', 'Bielorrusia': 'Europa',
  'Moldavia': 'Europa', 'Moldova': 'Europa',
  'Rusia': 'Europa', 'Russia': 'Europa', 'Russian Federation': 'Europa',
  'Lituania': 'Europa', 'Lithuania': 'Europa',
  'Letonia': 'Europa', 'Latvia': 'Europa',
  'Estonia': 'Europa',
  
  // Europa del Sur / Balcanes
  'Grecia': 'Europa', 'Greece': 'Europa',
  'Croacia': 'Europa', 'Croatia': 'Europa',
  'Eslovenia': 'Europa', 'Slovenia': 'Europa',
  'Serbia': 'Europa',
  'Montenegro': 'Europa',
  'Bosnia y Herzegovina': 'Europa', 'Bosnia and Herzegovina': 'Europa', 'Bosnia': 'Europa',
  'Macedonia del Norte': 'Europa', 'North Macedonia': 'Europa',
  'Albania': 'Europa',
  'Kosovo': 'Europa',
  'Chipre': 'Europa', 'Cyprus': 'Europa',
  'Malta': 'Europa',
  'Turquía': 'Europa', 'Turkey': 'Europa', 'Türkiye': 'Europa',
  
  // América del Norte
  'Estados Unidos': 'América del Norte', 'United States': 'América del Norte', 'USA': 'América del Norte', 'EE.UU.': 'América del Norte',
  'Canadá': 'América del Norte', 'Canada': 'América del Norte',
  'México': 'América del Norte', 'Mexico': 'América del Norte',
  'Cuba': 'América del Norte',
  'República Dominicana': 'América del Norte', 'Dominican Republic': 'América del Norte',
  'Puerto Rico': 'América del Norte',
  'Jamaica': 'América del Norte',
  'Haití': 'América del Norte', 'Haiti': 'América del Norte',
  'Guatemala': 'América del Norte',
  'Honduras': 'América del Norte',
  'El Salvador': 'América del Norte',
  'Nicaragua': 'América del Norte',
  'Costa Rica': 'América del Norte',
  'Panamá': 'América del Norte', 'Panama': 'América del Norte',
  'Belice': 'América del Norte', 'Belize': 'América del Norte',
  
  // América del Sur
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
  'Guyana': 'América del Sur',
  'Surinam': 'América del Sur', 'Suriname': 'América del Sur',
  'Guayana Francesa': 'América del Sur', 'French Guiana': 'América del Sur',
  
  // Asia
  'China': 'Asia',
  'Japón': 'Asia', 'Japan': 'Asia',
  'Corea del Sur': 'Asia', 'South Korea': 'Asia', 'Korea': 'Asia',
  'Corea del Norte': 'Asia', 'North Korea': 'Asia',
  'India': 'Asia',
  'Tailandia': 'Asia', 'Thailand': 'Asia',
  'Vietnam': 'Asia',
  'Indonesia': 'Asia',
  'Malasia': 'Asia', 'Malaysia': 'Asia',
  'Singapur': 'Asia', 'Singapore': 'Asia',
  'Filipinas': 'Asia', 'Philippines': 'Asia',
  'Camboya': 'Asia', 'Cambodia': 'Asia',
  'Laos': 'Asia',
  'Myanmar': 'Asia', 'Burma': 'Asia', 'Birmania': 'Asia',
  'Nepal': 'Asia',
  'Bután': 'Asia', 'Bhutan': 'Asia',
  'Bangladés': 'Asia', 'Bangladesh': 'Asia',
  'Sri Lanka': 'Asia',
  'Pakistán': 'Asia', 'Pakistan': 'Asia',
  'Afganistán': 'Asia', 'Afghanistan': 'Asia',
  'Kazajistán': 'Asia', 'Kazakhstan': 'Asia',
  'Uzbekistán': 'Asia', 'Uzbekistan': 'Asia',
  'Turkmenistán': 'Asia', 'Turkmenistan': 'Asia',
  'Tayikistán': 'Asia', 'Tajikistan': 'Asia',
  'Kirguistán': 'Asia', 'Kyrgyzstan': 'Asia',
  'Mongolia': 'Asia',
  'Taiwán': 'Asia', 'Taiwan': 'Asia',
  'Hong Kong': 'Asia',
  'Macao': 'Asia', 'Macau': 'Asia',
  
  // Oriente Medio
  'Israel': 'Asia',
  'Palestina': 'Asia', 'Palestine': 'Asia',
  'Líbano': 'Asia', 'Lebanon': 'Asia',
  'Siria': 'Asia', 'Syria': 'Asia',
  'Jordania': 'Asia', 'Jordan': 'Asia',
  'Irak': 'Asia', 'Iraq': 'Asia',
  'Irán': 'Asia', 'Iran': 'Asia',
  'Arabia Saudita': 'Asia', 'Saudi Arabia': 'Asia',
  'Emiratos Árabes Unidos': 'Asia', 'United Arab Emirates': 'Asia', 'UAE': 'Asia',
  'Catar': 'Asia', 'Qatar': 'Asia',
  'Kuwait': 'Asia',
  'Baréin': 'Asia', 'Bahrain': 'Asia',
  'Omán': 'Asia', 'Oman': 'Asia',
  'Yemen': 'Asia',
  'Georgia': 'Asia',
  'Armenia': 'Asia',
  'Azerbaiyán': 'Asia', 'Azerbaijan': 'Asia',
  
  // África
  'Marruecos': 'África', 'Morocco': 'África',
  'Egipto': 'África', 'Egypt': 'África',
  'Sudáfrica': 'África', 'South Africa': 'África',
  'Túnez': 'África', 'Tunisia': 'África',
  'Argelia': 'África', 'Algeria': 'África',
  'Libia': 'África', 'Libya': 'África',
  'Kenia': 'África', 'Kenya': 'África',
  'Tanzania': 'África',
  'Uganda': 'África',
  'Ruanda': 'África', 'Rwanda': 'África',
  'Etiopía': 'África', 'Ethiopia': 'África',
  'Nigeria': 'África',
  'Ghana': 'África',
  'Senegal': 'África',
  'Costa de Marfil': 'África', 'Ivory Coast': 'África', "Côte d'Ivoire": 'África',
  'Camerún': 'África', 'Cameroon': 'África',
  'Namibia': 'África',
  'Botsuana': 'África', 'Botswana': 'África',
  'Zimbabue': 'África', 'Zimbabwe': 'África',
  'Mozambique': 'África',
  'Madagascar': 'África',
  'Mauricio': 'África', 'Mauritius': 'África',
  'Seychelles': 'África',
  'Cabo Verde': 'África', 'Cape Verde': 'África',
  'Canarias': 'África',
  
  // Oceanía
  'Australia': 'Oceanía',
  'Nueva Zelanda': 'Oceanía', 'New Zealand': 'Oceanía',
  'Fiyi': 'Oceanía', 'Fiji': 'Oceanía',
  'Papúa Nueva Guinea': 'Oceanía', 'Papua New Guinea': 'Oceanía',
  'Samoa': 'Oceanía',
  'Tonga': 'Oceanía',
  'Vanuatu': 'Oceanía',
  'Islas Salomón': 'Oceanía', 'Solomon Islands': 'Oceanía',
  'Polinesia Francesa': 'Oceanía', 'French Polynesia': 'Oceanía',
  'Nueva Caledonia': 'Oceanía', 'New Caledonia': 'Oceanía',
  'Guam': 'Oceanía',
  'Hawái': 'Oceanía', 'Hawaii': 'Oceanía',
};

// Inferir continente por coordenadas geográficas (fallback cuando el país no está en el mapa)
function inferContinentFromCoordinates(lat: number, lng: number): string {
  // Antártida
  if (lat < -60) {
    return 'Antártida';
  }
  
  // Oceanía: Australia, Nueva Zelanda, islas del Pacífico
  if (lat >= -50 && lat <= 0 && lng >= 100 && lng <= 180) {
    return 'Oceanía';
  }
  if (lat >= -50 && lat <= 30 && lng >= -180 && lng <= -100) {
    // Islas del Pacífico (lado oeste)
    return 'Oceanía';
  }
  
  // Europa: aprox lat 35-72, lng -25 a 60
  if (lat >= 35 && lat <= 72 && lng >= -25 && lng <= 60) {
    // Excepción: Turquía asiática y Oriente Medio
    if (lng > 40 && lat < 42) {
      return 'Asia';
    }
    return 'Europa';
  }
  
  // Asia: gran parte del hemisferio oriental
  if (lat >= -10 && lat <= 80 && lng >= 40 && lng <= 180) {
    return 'Asia';
  }
  if (lat >= 0 && lat <= 55 && lng >= 25 && lng <= 40) {
    // Oriente Medio
    return 'Asia';
  }
  
  // África
  if (lat >= -35 && lat <= 37 && lng >= -20 && lng <= 55) {
    // Excluir Europa (ya manejada arriba)
    if (lat < 35) {
      return 'África';
    }
    // Norte de África
    if (lat >= 35 && lat <= 37 && lng >= -10 && lng <= 35) {
      return 'África';
    }
  }
  
  // América del Norte: incluye Centroamérica y Caribe
  if (lat >= 7 && lat <= 85 && lng >= -170 && lng <= -50) {
    return 'América del Norte';
  }
  
  // América del Sur
  if (lat >= -60 && lat < 15 && lng >= -85 && lng <= -30) {
    return 'América del Sur';
  }
  // Colombia, Venezuela, Guayanas pueden estar sobre lat 7
  if (lat >= 0 && lat < 15 && lng >= -85 && lng <= -50) {
    return 'América del Sur';
  }
  
  // Fallback por hemisferio
  if (lng < -30) {
    return lat > 15 ? 'América del Norte' : 'América del Sur';
  }
  if (lng > 100) {
    return lat > -10 ? 'Asia' : 'Oceanía';
  }
  if (lat > 35) {
    return 'Europa';
  }
  if (lat > -35 && lng > -20 && lng < 55) {
    return 'África';
  }
  
  return 'Desconocido';
}

// Obtener continente: primero por mapa de países, luego por coordenadas
function getContinentForCountry(country: string | undefined, lat: number, lng: number): string {
  // Intentar mapeo directo
  if (country && CONTINENT_MAP[country]) {
    return CONTINENT_MAP[country];
  }
  
  // Fallback: inferir por coordenadas
  const inferred = inferContinentFromCoordinates(lat, lng);
  console.log(`Continent inferred from coordinates (${lat}, ${lng}): ${inferred}`);
  return inferred;
}

// Reverse geocode using Nominatim to get country/region/zone
async function reverseGeocodeLocation(lat: number, lng: number): Promise<{
  country?: string;
  region?: string;
  zone?: string;
  continent?: string;
}> {
  try {
    console.log('Reverse geocoding coordinates:', lat, lng);
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
      console.error('Nominatim error:', response.status);
      // Aun sin respuesta de Nominatim, inferir continente por coordenadas
      return { continent: inferContinentFromCoordinates(lat, lng) };
    }

    const data = await response.json();
    const address = data.address || {};

    const country = address.country || undefined;
    const region = address.state || address.region || address.province || undefined;
    const zone = address.county || address.city || address.town || address.municipality || undefined;
    
    // Usar getContinentForCountry para obtener continente con fallback a coordenadas
    const continent = getContinentForCountry(country, lat, lng);

    console.log('Geocoding result:', { country, region, zone, continent });
    return { country, region, zone, continent };
  } catch (error) {
    console.error('Geocoding error:', error);
    // Fallback: al menos inferir continente
    return { continent: inferContinentFromCoordinates(lat, lng) };
  }
}

// Search for nearby candidates using Wikipedia geosearch and evaluate correlation
interface NearbyCandidate {
  name: string;
  distance: number;
  pageId: number;
  url: string;
  extract?: string;
  matchScore: number; // 0-100 correlation score
  matchReason: string;
}

async function searchNearbyCandidates(
  coordinates: { lat: number; lng: number },
  searchRadiusMeters: number,
  expectedNature?: string,
  originalName?: string
): Promise<NearbyCandidate[]> {
  const candidates: NearbyCandidate[] = [];
  
  try {
    console.log(`Searching nearby candidates within ${searchRadiusMeters}m of ${coordinates.lat}, ${coordinates.lng}`);
    
    // Use Wikipedia geosearch to find nearby places
    const radiusMeters = Math.min(searchRadiusMeters, 10000); // API max is 10km
    const geoSearchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${coordinates.lat}|${coordinates.lng}&gsradius=${radiusMeters}&gslimit=10&format=json&origin=*`;
    
    const geoResponse = await fetch(geoSearchUrl);
    if (!geoResponse.ok) {
      console.error('Wikipedia geosearch failed:', geoResponse.status);
      return candidates;
    }
    
    const geoData = await geoResponse.json();
    const nearbyPages = geoData.query?.geosearch || [];
    
    console.log(`Found ${nearbyPages.length} nearby Wikipedia pages`);
    
    // Get extracts for each nearby place
    for (const page of nearbyPages) {
      try {
        // Fetch extract for this page
        const extractUrl = `https://es.wikipedia.org/w/api.php?action=query&pageids=${page.pageid}&prop=extracts|info&exintro=true&explaintext=true&exchars=500&inprop=url&format=json&origin=*`;
        const extractResponse = await fetch(extractUrl);
        
        if (!extractResponse.ok) continue;
        
        const extractData = await extractResponse.json();
        const pageInfo = extractData.query?.pages?.[page.pageid];
        
        if (!pageInfo) continue;
        
        // Calculate match score based on various factors
        let matchScore = 0;
        let matchReasons: string[] = [];
        
        const titleLower = page.title.toLowerCase();
        const extractLower = (pageInfo.extract || '').toLowerCase();
        const originalNameLower = (originalName || '').toLowerCase();
        const expectedNatureLower = (expectedNature || '').toLowerCase();
        
        // Score based on name similarity
        if (originalName) {
          const nameWords = originalNameLower.split(/\s+/).filter((w: string) => w.length > 2);
          const titleWords = titleLower.split(/\s+/);
          const matchingWords = nameWords.filter((w: string) => titleWords.some((tw: string) => tw.includes(w) || w.includes(tw)));
          
          if (matchingWords.length > 0) {
            const nameMatchPercent = (matchingWords.length / nameWords.length) * 40;
            matchScore += nameMatchPercent;
            matchReasons.push(`Coincidencia de nombre: ${matchingWords.join(', ')}`);
          }
          
          // Exact match bonus
          if (titleLower.includes(originalNameLower) || originalNameLower.includes(titleLower)) {
            matchScore += 30;
            matchReasons.push('Coincidencia exacta de nombre');
          }
        }
        
        // Score based on expected nature match
        if (expectedNature) {
          const natureKeywords = expectedNatureLower.split(/[\s,]+/).filter((w: string) => w.length > 3);
          let natureMatches = 0;
          
          for (const keyword of natureKeywords) {
            if (titleLower.includes(keyword) || extractLower.includes(keyword)) {
              natureMatches++;
            }
          }
          
          if (natureMatches > 0) {
            const natureMatchPercent = (natureMatches / natureKeywords.length) * 30;
            matchScore += natureMatchPercent;
            matchReasons.push(`Coincide con naturaleza esperada (${natureMatches} términos)`);
          }
        }
        
        // Score based on distance (closer = better)
        const distanceScore = Math.max(0, 20 - (page.dist / radiusMeters) * 20);
        matchScore += distanceScore;
        if (page.dist < 100) {
          matchReasons.push(`Muy cercano (${Math.round(page.dist)}m)`);
        }
        
        candidates.push({
          name: page.title,
          distance: Math.round(page.dist),
          pageId: page.pageid,
          url: pageInfo.fullurl || `https://es.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          extract: pageInfo.extract?.substring(0, 300),
          matchScore: Math.round(matchScore),
          matchReason: matchReasons.length > 0 ? matchReasons.join('; ') : 'Sin coincidencias claras',
        });
        
      } catch (err) {
        console.error('Error processing nearby page:', page.title, err);
      }
    }
    
    // Sort by match score descending
    candidates.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log('Candidates found:', candidates.map(c => ({ name: c.name, score: c.matchScore, distance: c.distance })));
    
  } catch (error) {
    console.error('Error searching nearby candidates:', error);
  }
  
  return candidates;
}

// Haversine distance in km between two coordinates
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Buscar datos estructurados en Wikipedia API
async function searchWikipedia(placeName: string, coordinates: { lat: number; lng: number }): Promise<{
  extract?: string;
  url?: string;
  pageId?: number;
  title?: string;
} | null> {
  try {
    console.log('Searching Wikipedia for:', placeName);
    
    // Primero buscar por geosearch (coordenadas)
    const geoSearchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${coordinates.lat}|${coordinates.lng}&gsradius=1000&gslimit=5&format=json&origin=*`;
    
    const geoResponse = await fetch(geoSearchUrl);
    if (geoResponse.ok) {
      const geoData = await geoResponse.json();
      const nearbyPages = geoData.query?.geosearch || [];
      
      // Buscar coincidencia con el nombre
      const matchingPage = nearbyPages.find((p: any) => 
        p.title.toLowerCase().includes(placeName.toLowerCase()) ||
        placeName.toLowerCase().includes(p.title.toLowerCase())
      );
      
      if (matchingPage) {
        // Obtener extracto del artículo
        const extractUrl = `https://es.wikipedia.org/w/api.php?action=query&pageids=${matchingPage.pageid}&prop=extracts|info&exintro=true&explaintext=true&inprop=url&format=json&origin=*`;
        const extractResponse = await fetch(extractUrl);
        
        if (extractResponse.ok) {
          const extractData = await extractResponse.json();
          const page = extractData.query?.pages?.[matchingPage.pageid];
          
          if (page && page.extract) {
            console.log('Wikipedia article found via geosearch:', page.title);
            return {
              extract: page.extract.substring(0, 1500),
              url: page.fullurl,
              pageId: matchingPage.pageid,
              title: page.title
            };
          }
        }
      }
    }
    
    // Fallback: búsqueda por texto — but validate geographic coherence
    const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(placeName)}&srlimit=3&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl);
    
    if (!searchResponse.ok) return null;
    
    const searchData = await searchResponse.json();
    const results = searchData.query?.search || [];
    
    if (results.length === 0) {
      console.log('No Wikipedia results for:', placeName);
      return null;
    }
    
    // Obtener extracto del primer resultado
    const pageId = results[0].pageid;
    const extractUrl = `https://es.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=extracts|info|coordinates&exintro=true&explaintext=true&inprop=url&format=json&origin=*`;
    const extractResponse = await fetch(extractUrl);
    
    if (!extractResponse.ok) return null;
    
    const extractData = await extractResponse.json();
    const page = extractData.query?.pages?.[pageId];
    
    if (page && page.extract) {
      // Geographic coherence check: if Wikipedia article has coordinates, verify they're within 50km
      const wikiCoords = page.coordinates?.[0];
      if (wikiCoords) {
        const distKm = haversineDistance(coordinates.lat, coordinates.lng, wikiCoords.lat, wikiCoords.lon);
        if (distKm > 50) {
          console.log(`Wikipedia article "${page.title}" rejected: ${distKm.toFixed(0)}km from point (max 50km)`);
          return null;
        }
      }
      
      console.log('Wikipedia article found via search:', page.title);
      return {
        extract: page.extract.substring(0, 1500),
        url: page.fullurl,
        pageId: pageId,
        title: page.title
      };
    }
    
    return null;
  } catch (error) {
    console.error('Wikipedia search error:', error);
    return null;
  }
}

// Buscar datos factuales en Wikidata
async function searchWikidata(placeName: string, coordinates: { lat: number; lng: number }): Promise<{
  population?: number;
  elevation?: number;
  foundingDate?: string;
  officialWebsite?: string;
  wikidataId?: string;
  instanceOf?: string[];
  heritage?: string[];
} | null> {
  try {
    console.log('Searching Wikidata for:', placeName);
    
    // Buscar entidad por nombre
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(placeName)}&language=es&limit=5&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl);
    
    if (!searchResponse.ok) return null;
    
    const searchData = await searchResponse.json();
    const entities = searchData.search || [];
    
    if (entities.length === 0) {
      console.log('No Wikidata entities for:', placeName);
      return null;
    }
    
    // Tomar el primer resultado (más relevante)
    const entityId = entities[0].id;
    
    // Obtener propiedades de la entidad
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=claims|labels&languages=es|en&format=json&origin=*`;
    const entityResponse = await fetch(entityUrl);
    
    if (!entityResponse.ok) return null;
    
    const entityData = await entityResponse.json();
    const entity = entityData.entities?.[entityId];
    
    if (!entity) return null;
    
    const claims = entity.claims || {};
    
    // Geographic coherence check: if entity has P625 (coordinate location), verify within 50km
    if (claims.P625) {
      const coordClaim = claims.P625[0];
      const wdLat = coordClaim?.mainsnak?.datavalue?.value?.latitude;
      const wdLng = coordClaim?.mainsnak?.datavalue?.value?.longitude;
      if (typeof wdLat === 'number' && typeof wdLng === 'number') {
        const distKm = haversineDistance(coordinates.lat, coordinates.lng, wdLat, wdLng);
        if (distKm > 50) {
          console.log(`Wikidata entity "${entityId}" rejected: ${distKm.toFixed(0)}km from point (max 50km)`);
          return null;
        }
      }
    }
    const result: any = { wikidataId: entityId };
    
    // P1082 - Población
    if (claims.P1082) {
      const popClaim = claims.P1082[0];
      if (popClaim?.mainsnak?.datavalue?.value?.amount) {
        result.population = parseInt(popClaim.mainsnak.datavalue.value.amount);
      }
    }
    
    // P2044 - Elevación sobre el nivel del mar
    if (claims.P2044) {
      const elevClaim = claims.P2044[0];
      if (elevClaim?.mainsnak?.datavalue?.value?.amount) {
        result.elevation = parseInt(elevClaim.mainsnak.datavalue.value.amount);
      }
    }
    
    // P571 - Fecha de fundación
    if (claims.P571) {
      const dateClaim = claims.P571[0];
      if (dateClaim?.mainsnak?.datavalue?.value?.time) {
        result.foundingDate = dateClaim.mainsnak.datavalue.value.time.replace('+', '').split('T')[0];
      }
    }
    
    // P856 - Sitio web oficial
    if (claims.P856) {
      const webClaim = claims.P856[0];
      if (webClaim?.mainsnak?.datavalue?.value) {
        result.officialWebsite = webClaim.mainsnak.datavalue.value;
      }
    }
    
    // P31 - Instancia de (tipo de lugar)
    if (claims.P31) {
      result.instanceOf = [];
      for (const claim of claims.P31.slice(0, 3)) {
        const qid = claim?.mainsnak?.datavalue?.value?.id;
        if (qid) {
          result.instanceOf.push(qid);
        }
      }
    }
    
    // P1435 - Estado de patrimonio (UNESCO, BIC, etc.)
    if (claims.P1435) {
      result.heritage = [];
      for (const claim of claims.P1435) {
        const qid = claim?.mainsnak?.datavalue?.value?.id;
        if (qid) {
          result.heritage.push(qid);
        }
      }
    }
    
    console.log('Wikidata data found:', result);
    return result;
  } catch (error) {
    console.error('Wikidata search error:', error);
    return null;
  }
}

// Buscar datos en GeoNames (requiere username gratuito)
async function searchGeoNames(placeName: string, coordinates: { lat: number; lng: number }): Promise<{
  geonameId?: number;
  toponymName?: string;
  adminName1?: string;
  adminName2?: string;
  adminName3?: string;
  countryName?: string;
  population?: number;
  elevation?: number;
  featureClass?: string;
  featureCode?: string;
  alternateNames?: string[];
} | null> {
  try {
    const GEONAMES_USERNAME = Deno.env.get('GEONAMES_USERNAME');
    if (!GEONAMES_USERNAME) {
      console.log('GeoNames username not configured, skipping');
      return null;
    }
    
    console.log('Searching GeoNames for:', placeName);
    
    // Buscar por coordenadas (más preciso)
    const nearbyUrl = `http://api.geonames.org/findNearbyPlaceNameJSON?lat=${coordinates.lat}&lng=${coordinates.lng}&radius=5&maxRows=5&username=${GEONAMES_USERNAME}`;
    
    const nearbyResponse = await fetch(nearbyUrl);
    if (!nearbyResponse.ok) {
      console.error('GeoNames error:', nearbyResponse.status);
      return null;
    }
    
    const nearbyData = await nearbyResponse.json();
    const places = nearbyData.geonames || [];
    
    if (places.length === 0) {
      console.log('No GeoNames results near coordinates');
      return null;
    }
    
    // Buscar coincidencia con el nombre o tomar el más cercano
    let bestMatch = places.find((p: any) => 
      p.toponymName?.toLowerCase().includes(placeName.toLowerCase()) ||
      placeName.toLowerCase().includes(p.toponymName?.toLowerCase())
    ) || places[0];
    
    const result: any = {
      geonameId: bestMatch.geonameId,
      toponymName: bestMatch.toponymName,
      adminName1: bestMatch.adminName1,
      adminName2: bestMatch.adminName2,
      adminName3: bestMatch.adminName3,
      countryName: bestMatch.countryName,
      population: bestMatch.population > 0 ? bestMatch.population : undefined,
      featureClass: bestMatch.fclass,
      featureCode: bestMatch.fcode,
    };
    
    // Obtener detalles adicionales si encontramos el lugar
    if (bestMatch.geonameId) {
      const detailUrl = `http://api.geonames.org/getJSON?geonameId=${bestMatch.geonameId}&username=${GEONAMES_USERNAME}`;
      const detailResponse = await fetch(detailUrl);
      
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        if (detailData.elevation) {
          result.elevation = detailData.elevation;
        }
        if (detailData.alternateNames) {
          result.alternateNames = detailData.alternateNames
            .slice(0, 5)
            .map((n: any) => n.name)
            .filter((n: string) => n.length > 2);
        }
      }
    }
    
    console.log('GeoNames data found:', result);
    return result;
  } catch (error) {
    console.error('GeoNames search error:', error);
    return null;
  }
}

// Buscar imagen real en Wikimedia Commons con búsqueda precisa
async function searchWikimediaImage(
  placeName: string, 
  placeType: string, 
  country?: string,
  region?: string,
  coordinates?: { lat: number; lng: number }
): Promise<{ url: string; title: string } | null> {
  try {
    // Normalizar el nombre del lugar para búsqueda
    const normalizedName = placeName
      .replace(/\s+/g, ' ')
      .trim();
    
    // Estrategia de búsqueda: múltiples queries de más específica a menos específica
    const searchQueries: string[] = [];
    
    // Query 1: Nombre exacto con tipo y región (más específico)
    if (region && placeType) {
      searchQueries.push(`"${normalizedName}" ${region} ${placeType}`);
    }
    
    // Query 2: Nombre exacto con país
    if (country) {
      searchQueries.push(`"${normalizedName}" ${country}`);
    }
    
    // Query 3: Solo nombre exacto entre comillas
    searchQueries.push(`"${normalizedName}"`);
    
    // Query 4: Nombre sin comillas (fallback)
    searchQueries.push(normalizedName);
    
    console.log('Image search queries:', searchQueries);
    
    for (const searchQuery of searchQueries) {
      // Buscar en Wikimedia Commons con búsqueda mejorada
      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srnamespace=6&srlimit=10&format=json&origin=*`;
      
      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) {
        console.error('Wikimedia search failed:', searchResponse.status);
        continue;
      }
      
      const searchData = await searchResponse.json();
      const results = searchData.query?.search || [];
      
      if (results.length === 0) {
        console.log('No results for query:', searchQuery);
        continue;
      }
      
      // Filtrar por imágenes (excluir SVG, PDF, mapas, escudos, logos, flags, personas)
      const imageResults = results.filter((r: any) => {
        const title = r.title.toLowerCase();
        const snippet = (r.snippet || '').toLowerCase();
        const combined = title + ' ' + snippet;
        
        // Solo formatos de imagen
        const isImage = title.endsWith('.jpg') || title.endsWith('.jpeg') || title.endsWith('.png') || title.endsWith('.webp');
        if (!isImage) return false;
        
        // Excluir tipos de imágenes que no son fotos del lugar
        const excludePatterns = [
          'coat of arms', 'escudo', 'flag', 'bandera', 'logo', 'logotipo',
          'map', 'mapa', 'location', 'ubicación', 'locator', 'diagram',
          'icon', 'icono', 'symbol', 'símbolo', 'seal', 'sello',
          'signature', 'firma', 'stamp', 'autograph', 
          'commons-logo', 'wiki', 'wikidata',
          // Excluir retratos y personas
          'portrait', 'retrato', 'headshot', 'face', 'rostro', 'cara',
          'footballer', 'futbolista', 'player', 'jugador', 'athlete', 'atleta',
          'actor', 'actriz', 'actress', 'singer', 'cantante', 'politician', 'político',
          'writer', 'escritor', 'author', 'autor', 'celebrity', 'famoso',
          'person', 'persona', 'people', 'gente', 'man ', 'woman ', 'hombre ', 'mujer ',
          'interview', 'entrevista', 'press conference', 'rueda de prensa',
          'award', 'premio', 'ceremony', 'ceremonia', 'red carpet', 'alfombra roja',
          'mugshot', 'selfie', 'profile photo', 'foto de perfil',
          // Excluir fotos personales y eventos con personas
          'meeting', 'reunión', 'conference', 'congreso', 'speech', 'discurso',
          'visiting', 'visitando', 'posing', 'posed', 'smiling', 'sonriendo',
          'wearing', 'llevando', 'hat', 'gorra', 'sombrero', 'glasses', 'gafas',
          'podium', 'stage', 'escenario', 'crowd', 'multitud', 'audience', 'público',
          'president', 'presidente', 'minister', 'ministro', 'governor', 'gobernador',
          'mayor', 'alcalde', 'director', 'manager', 'gerente', 'ceo', 'chairman',
          'professor', 'profesor', 'doctor', 'scientist', 'científico',
          // Excluir imágenes de Universidad/organizaciones que suelen tener personas
          'university', 'universidad', 'college', 'school', 'colegio', 'student', 'estudiante',
          'graduation', 'graduación', 'diploma', 'degree',
          // Excluir eventos deportivos (que muestran personas)
          'match', 'partido', 'game', 'competition', 'competición', 'race', 'carrera',
          'championship', 'campeonato', 'tournament', 'torneo', 'league', 'liga'
        ];
        
        for (const pattern of excludePatterns) {
          if (combined.includes(pattern)) {
            console.log('Excluding image (pattern match):', title, 'Pattern:', pattern);
            return false;
          }
        }
        
        // Excluir imágenes que parecen ser de deportistas/personas famosas
        const personIndicators = [
          /\b(fc|cf|cd|sd|ud|ad|rcd|rayo|athletic|atlético|real|sporting|barcelona|madrid)\b/i,
          /\b(20\d{2}|19\d{2})\s*(season|temporada|world cup|mundial|euro|liga|championship)/i,
          /\b(goal|gol|training|entrenamiento)\b/i,
          /\b(jersey|camiseta|uniform|equipación)\b/i,
          // Patrones adicionales para detectar personas en fotos
          /\b(dr\.|prof\.|sr\.|sra\.|mr\.|mrs\.|ms\.)\b/i,
          /\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}\b/i,
          /\bat\s+the\s+(event|ceremony|conference|meeting|opening)\b/i
        ];
        
        for (const regex of personIndicators) {
          if (regex.test(combined)) {
            console.log('Excluding image (person indicator):', title);
            return false;
          }
        }
        
        return true;
      });
      
      if (imageResults.length === 0) {
        console.log('No valid image files for query:', searchQuery);
        continue;
      }
      
      // Puntuación de relevancia para cada imagen
      const scoredResults = imageResults.map((r: any) => {
        let score = 0;
        const title = r.title.toLowerCase();
        const snippet = (r.snippet || '').toLowerCase();
        const combined = title + ' ' + snippet;
        const nameWords = normalizedName.toLowerCase().split(/\s+/);
        
        // Puntuación por coincidencia de palabras del nombre en el título
        for (const word of nameWords) {
          if (word.length > 2 && title.includes(word)) {
            score += 10;
          }
        }
        
        // Puntuación por coincidencia exacta del nombre
        if (title.includes(normalizedName.toLowerCase())) {
          score += 50;
        }
        
        // Puntuación por región/país en título
        if (region && title.includes(region.toLowerCase())) {
          score += 20;
        }
        if (country && title.includes(country.toLowerCase())) {
          score += 15;
        }
        
        // BONUS para paisajes, vistas panorámicas, naturaleza (ideal para regiones/distritos)
        const landscapeTerms = [
          'panorama', 'landscape', 'paisaje', 'view', 'vista',
          'aerial', 'aérea', 'drone', 'skyline', 'horizon', 'horizonte',
          'lake', 'lago', 'river', 'río', 'mountain', 'montaña', 'forest', 'bosque',
          'beach', 'playa', 'coast', 'costa', 'valley', 'valle', 'nature', 'naturaleza',
          'scenic', 'escénico', 'sunset', 'sunrise', 'atardecer', 'amanecer',
          'overview', 'general view', 'vista general', 'countryside', 'campo'
        ];
        for (const term of landscapeTerms) {
          if (combined.includes(term)) {
            score += 25; // Bonus significativo para paisajes
          }
        }
        
        // Bonus para fotos (vs dibujos)
        if (combined.includes('photo') || combined.includes('foto') || combined.includes('photograph')) {
          score += 10;
        }
        
        // Penalización por contenido que podría incluir personas de forma sutil
        const subtlePersonIndicators = [
          'with', 'con', 'beside', 'junto', 'near', 'cerca',
          'holding', 'sosteniendo', 'wearing', 'vistiendo'
        ];
        for (const term of subtlePersonIndicators) {
          if (combined.includes(term)) {
            score -= 10;
          }
        }
        
        return { ...r, score };
      });
      
      // Ordenar por puntuación
      scoredResults.sort((a: any, b: any) => b.score - a.score);
      
      console.log('Top scored results:', scoredResults.slice(0, 3).map((r: any) => ({ title: r.title, score: r.score })));
      
      // Tomar el mejor resultado
      const bestResult = scoredResults[0];
      if (!bestResult || bestResult.score < 5) {
        console.log('Best result score too low:', bestResult?.score);
        continue;
      }
      
      // Obtener la URL de la imagen
      const fileName = bestResult.title.replace('File:', '');
      const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`;
      
      const imageInfoResponse = await fetch(imageInfoUrl);
      if (!imageInfoResponse.ok) {
        console.error('Image info request failed');
        continue;
      }
      
      const imageInfoData = await imageInfoResponse.json();
      const pages = imageInfoData.query?.pages || {};
      const pageId = Object.keys(pages)[0];
      
      if (!pageId || pageId === '-1') {
        console.log('Image not found');
        continue;
      }
      
      const imageInfo = pages[pageId]?.imageinfo?.[0];
      const thumbUrl = imageInfo?.thumburl || imageInfo?.url;
      
      if (thumbUrl) {
        console.log('Found relevant image:', thumbUrl, 'Score:', bestResult.score);
        return { url: thumbUrl, title: fileName };
      }
    }
    
    console.log('No suitable image found after all queries');
    return null;
  } catch (error) {
    console.error('Error searching Wikimedia:', error);
    return null;
  }
}

async function searchWikipediaPageImage(placeName: string): Promise<{ url: string; title: string } | null> {
  for (const lang of ['es', 'en']) {
    try {
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages|info&piprop=thumbnail&pithumbsize=800&titles=${encodeURIComponent(placeName)}&inprop=url&format=json&origin=*`;
      const response = await fetch(searchUrl);
      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const pages = Object.values(data.query?.pages || {}) as any[];
      const page = pages.find((entry) => entry?.thumbnail?.source);
      if (page?.thumbnail?.source) {
        return { url: page.thumbnail.source, title: `${lang}:${page.title}` };
      }
    } catch (error) {
      console.error('Wikipedia image search error:', error);
    }
  }

  return null;
}

async function searchImageFromSources(
  placeName: string,
  placeType: string,
  country: string | undefined,
  region: string | undefined,
  coordinates: { lat: number; lng: number },
  sources: string[],
): Promise<{ url: string; source: string } | null> {
  for (const source of sources) {
    if (source === 'wikipedia') {
      const wikipediaImage = await searchWikipediaPageImage(placeName);
      if (wikipediaImage) {
        return {
          url: wikipediaImage.url,
          source: `Wikipedia: ${wikipediaImage.title}`,
        };
      }
    }

    if (source === 'wikimedia_commons') {
      const wikimediaImage = await searchWikimediaImage(placeName, placeType, country, region, coordinates);
      if (wikimediaImage) {
        return {
          url: wikimediaImage.url,
          source: `Wikimedia Commons: ${wikimediaImage.title}`,
        };
      }
    }
  }

  return null;
}

// Validar que una URL existe y es accesible
async function validateUrl(url: string): Promise<boolean> {
  if (!url || url.trim() === '') return false;
  
  try {
    // Normalizar URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    // Excluir URLs genéricas o no relevantes
    const invalidPatterns = [
      'example.com', 'test.com', 'localhost', '127.0.0.1',
      'google.com/search', 'wikipedia.org/wiki/Main_Page',
      'facebook.com', 'twitter.com', 'instagram.com',
      'youtube.com', 'linkedin.com'
    ];
    
    for (const pattern of invalidPatterns) {
      if (normalizedUrl.toLowerCase().includes(pattern)) {
        console.log('URL excluded (generic pattern):', normalizedUrl);
        return false;
      }
    }
    
    // Verificar que la URL responde con HEAD request (más rápido)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(normalizedUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeoDataManager/1.0 (URL Validator)',
      },
    });
    
    clearTimeout(timeoutId);
    
    // Aceptar respuestas exitosas y redirecciones
    const isValid = response.status >= 200 && response.status < 400;
    console.log('URL validation:', normalizedUrl, 'Status:', response.status, 'Valid:', isValid);
    
    return isValid;
  } catch (error) {
    console.log('URL validation failed:', url, error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

// Fetch global enrichment card config from app_settings (v2 normalized).
// Single source of truth shared with frontend via _shared/card-schema.ts.
async function getGlobalEnrichmentConfig(): Promise<EnrichmentCardConfigV2> {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Supabase credentials not available for global config lookup');
      return { ...DEFAULT_CARD_CONFIG_V2 };
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?key=eq.enrichment_card_config&select=value`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch global enrichment config:', response.status);
      return { ...DEFAULT_CARD_CONFIG_V2 };
    }

    const data = await response.json();
    if (data && data.length > 0 && data[0].value) {
      const cfg = normalizeCardConfig(data[0].value);
      console.log(
        'Global enrichment config loaded |',
        'tone:', cfg.tone,
        '| min_length:', cfg.min_length,
        '| active fields:', getActiveFields(cfg).map((f) => f.key).join(','),
      );
      return cfg;
    }

    return { ...DEFAULT_CARD_CONFIG_V2 };
  } catch (error) {
    console.error('Error fetching global enrichment config:', error);
    return { ...DEFAULT_CARD_CONFIG_V2 };
  }
}

// Profile-specific enrichment preferences (curator or druid overrides)
interface ProfileEnrichmentPrefs {
  enrichment_expected_nature?: string;
  enrichment_search_radius_meters?: number;
  enrichment_include_contact?: boolean;
  enrichment_show_sources?: boolean;
  enrichment_correct_coordinates?: boolean;
  enrichment_tone?: string;
  enrichment_min_length?: number;
  enrichment_custom_prompt?: string;
  enrichment_include_image?: boolean;
  enrichment_include_web?: boolean;
  enrichment_include_tags?: boolean;
  enrichment_include_interest_index?: boolean;
  enrichment_focus_keywords?: string[];
  enrichment_exclude_keywords?: string[];
}

// Fetch profile-specific preferences (curator or druid)
async function getProfilePreferences(profileType: 'curator' | 'druid', profileId: string): Promise<ProfileEnrichmentPrefs | null> {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Supabase credentials not available for profile lookup');
      return null;
    }
    
    const table = profileType === 'curator' ? 'curators' : 'druids';
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${profileId}&select=enrichment_expected_nature,enrichment_search_radius_meters,enrichment_include_contact,enrichment_show_sources,enrichment_correct_coordinates,enrichment_tone,enrichment_min_length,enrichment_custom_prompt,enrichment_include_image,enrichment_include_web,enrichment_include_tags,enrichment_include_interest_index,enrichment_focus_keywords,enrichment_exclude_keywords`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch ${profileType} preferences:`, response.status);
      return null;
    }
    
    const data = await response.json();
    if (data && data.length > 0) {
      console.log(`${profileType} preferences loaded:`, data[0]);
      return data[0] as ProfileEnrichmentPrefs;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching ${profileType} preferences:`, error);
    return null;
  }
}

// Build tone instructions based on curator preference
function getToneInstructions(tone: string): string {
  const toneMap: Record<string, string> = {
    'tecnico': `TONO TÉCNICO:
- Lenguaje preciso, objetivo y especializado.
- Priorizar datos cuantitativos y clasificaciones formales.
- Evitar adjetivos subjetivos o valoraciones emocionales.
- Estilo enciclopédico y riguroso.`,
    'divulgativo': `TONO DIVULGATIVO:
- Lenguaje accesible pero informativo.
- Equilibrio entre datos técnicos y narrativa atractiva.
- Explicar conceptos complejos de forma comprensible.
- Despertar curiosidad sin sacrificar precisión.`,
    'poetico': `TONO POÉTICO/LITERARIO:
- Lenguaje evocador, sensorial y emotivo.
- Uso de metáforas, imágenes y recursos literarios.
- Transmitir la atmósfera y el espíritu del lugar.
- Priorizar la experiencia estética sobre los datos fríos.`,
    'formal': `TONO FORMAL/INSTITUCIONAL:
- Lenguaje protocolar y profesional.
- Estructura ordenada y jerárquica.
- Evitar coloquialismos o expresiones informales.
- Adecuado para documentación oficial.`,
    'casual': `TONO CASUAL/CERCANO:
- Lenguaje coloquial y amigable.
- Como si un amigo te recomendara el lugar.
- Incluir opiniones y valoraciones personales.
- Priorizar la experiencia práctica del visitante.`,
  };
  
  return toneMap[tone] || toneMap['divulgativo'];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { location: rawLocation, generateImage = true, imageSources, curatorId, druidId, skipValidation = false, confirmedCandidate } = await req.json() as { 
      location: IncomingLocation; 
      generateImage?: boolean;
      imageSources?: string[];
      curatorId?: string;
      druidId?: string;
      skipValidation?: boolean;
      confirmedCandidate?: string;
    };

    const location = normalizeLocation(rawLocation);
    if (!location) {
      return new Response(
        JSON.stringify({ error: 'Location data with valid coordinates is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch GLOBAL config from app_settings (base for ALL profiles)
    const globalConfig = await getGlobalEnrichmentConfig();
    console.log('Global enrichment config:', globalConfig.tone, globalConfig.min_length);

    // 2. Fetch profile-specific overrides (curator or druid)
    let profilePrefs: ProfileEnrichmentPrefs | null = null;
    let profileType: string = 'user';
    if (curatorId) {
      profileType = 'curator';
      console.log('Fetching preferences for curator:', curatorId);
      profilePrefs = await getProfilePreferences('curator', curatorId);
    } else if (druidId) {
      profileType = 'druid';
      console.log('Fetching preferences for druid:', druidId);
      profilePrefs = await getProfilePreferences('druid', druidId);
    }
    
    // 3. Merge: profile overrides > global config (v2 card schema)
    const activeFieldKeys = new Set(getActiveFields(globalConfig).map((f) => f.key));
    const configuredImageSources = Array.isArray(imageSources) && imageSources.length > 0
      ? imageSources
      : (globalConfig.image_sources ?? DEFAULT_CARD_CONFIG_V2.image_sources);
    const activeExternalImageSources = configuredImageSources.filter((source): source is string => typeof source === 'string' && source !== 'user_uploaded');
    const shouldGenerateImage = generateImage && (profilePrefs?.enrichment_include_image ?? globalConfig.include_image) && activeExternalImageSources.length > 0;
    const minLength = profilePrefs?.enrichment_min_length ?? globalConfig.min_length;
    const tone = profilePrefs?.enrichment_tone ?? globalConfig.tone;
    const globalPrompt = globalConfig.custom_prompt || '';
    const profilePrompt = profilePrefs?.enrichment_custom_prompt || '';
    const customPrompt = [globalPrompt, profilePrompt].filter(Boolean).join('\n\n') || undefined;
    // Field-level toggles derived from the v2 card schema (single source of truth)
    const includeTags = activeFieldKeys.has('etiquetas');
    const includeWeb = globalConfig.include_web;
    const includeInterestIndex = activeFieldKeys.has('indice_interes');
    const focusKeywords = profilePrefs?.enrichment_focus_keywords || [];
    const excludeKeywords = profilePrefs?.enrichment_exclude_keywords || [];

    const expectedNature = profilePrefs?.enrichment_expected_nature;
    const searchRadiusMeters = profilePrefs?.enrichment_search_radius_meters ?? 500;
    const includeContact = globalConfig.include_contact;
    const showSources = activeFieldKeys.has('fuentes');
    const correctCoordinates = profilePrefs?.enrichment_correct_coordinates ?? globalConfig.correct_coordinates;

    console.log(`Enriching location: ${location.name} | profile: ${profileType} | tone: ${tone} | minLength: ${minLength}`);
    if (profilePrefs) {
      console.log(`Using ${profileType} overrides - expectedNature: ${expectedNature}, searchRadius: ${searchRadiusMeters}`);
    }

    // Step 0: Consultar todas las fuentes de datos en paralelo
    console.log('Fetching data from multiple sources in parallel...');
    
    const [geocodeResult, wikipediaResult, wikidataResult, geonamesResult] = await Promise.all([
      // Nominatim/OSM para geocoding
      (!location.country || !location.region) 
        ? reverseGeocodeLocation(location.coordinates.lat, location.coordinates.lng)
        : Promise.resolve({ country: location.country, region: location.region, zone: location.zone, continent: location.continent }),
      
      // Wikipedia para extractos y artículos
      searchWikipedia(location.name, location.coordinates),
      
      // Wikidata para datos estructurados
      searchWikidata(location.name, location.coordinates),
      
      // GeoNames para topónimos (opcional, requiere username)
      searchGeoNames(location.name, location.coordinates),
    ]);
    
    // Consolidar datos geográficos
    let geoData = {
      country: location.country || geocodeResult?.country,
      region: location.region || geocodeResult?.region,
      zone: location.zone || geocodeResult?.zone,
      continent: location.continent || geocodeResult?.continent,
    };
    
    // Enriquecer con GeoNames si disponible
    if (geonamesResult) {
      if (!geoData.country && geonamesResult.countryName) {
        geoData.country = geonamesResult.countryName;
      }
      if (!geoData.region && geonamesResult.adminName1) {
        geoData.region = geonamesResult.adminName1;
      }
      if (!geoData.zone && (geonamesResult.adminName2 || geonamesResult.adminName3)) {
        geoData.zone = geonamesResult.adminName2 || geonamesResult.adminName3;
      }
    }
    
    console.log('Data sources fetched:', {
      geocoding: !!geocodeResult?.country,
      wikipedia: !!wikipediaResult?.extract,
      wikidata: !!wikidataResult?.wikidataId,
      geonames: !!geonamesResult?.geonameId,
    });

    // ========== PRE-VALIDATION PHASE ==========
    // Check if we need to validate the location before enrichment
    // This is a key quality control step for curator enrichment
    
    const MIN_CORRELATION_SCORE = 40; // Minimum score to auto-enrich
    const GOOD_CORRELATION_SCORE = 60; // Score for confident match
    
    // Search for nearby candidates if validation is not skipped
    if (!skipValidation) {
      console.log('Running pre-validation phase...');
      
      const nearbyCandidates = await searchNearbyCandidates(
        location.coordinates,
        searchRadiusMeters,
        expectedNature,
        location.name
      );
      
      // Evaluate correlation
      const bestCandidate = nearbyCandidates[0];
      const hasGoodMatch = bestCandidate && bestCandidate.matchScore >= GOOD_CORRELATION_SCORE;
      const hasAnyMatch = bestCandidate && bestCandidate.matchScore >= MIN_CORRELATION_SCORE;
      
      // Also check if Wikipedia/Wikidata found a direct match
      const hasDirectWikipediaMatch = wikipediaResult?.title?.toLowerCase().includes(location.name.toLowerCase().substring(0, 5)) ||
                                       location.name.toLowerCase().includes(wikipediaResult?.title?.toLowerCase().substring(0, 5) || '');
      const hasDirectWikidataMatch = !!wikidataResult?.wikidataId;
      
      const hasDirectMatch = hasDirectWikipediaMatch || hasDirectWikidataMatch;
      
      console.log('Pre-validation results:', {
        bestCandidateScore: bestCandidate?.matchScore || 0,
        hasGoodMatch,
        hasAnyMatch,
        hasDirectMatch,
        candidatesCount: nearbyCandidates.length,
      });
      
      // If no clear correlation, proceed anyway but flag as low-confidence
      if (!hasGoodMatch && !hasDirectMatch) {
        console.log('No strong correlation found - proceeding with best-effort enrichment (verified=false)');
        // We continue to the enrichment step below, the AI prompt already handles
        // the case where data is sparse by setting verified: false
      }
      
      // If we have a confirmed candidate from user, use that instead
      if (confirmedCandidate && nearbyCandidates.length > 0) {
        const confirmed = nearbyCandidates.find(c => c.name === confirmedCandidate);
        if (confirmed) {
          console.log('Using user-confirmed candidate:', confirmed.name);
          // Override location name with confirmed candidate
          location.name = confirmed.name;
        }
      }
      
      console.log('Pre-validation passed - proceeding with enrichment');
    } else {
      console.log('Skipping pre-validation (skipValidation=true)');
    }

    // Construir contexto enriquecido para la IA con datos de todas las fuentes
    let locationContext = `
Nombre proporcionado: ${location.name}
Coordenadas: ${location.coordinates.lat}, ${location.coordinates.lng}
${geoData.country ? `País: ${geoData.country}` : ''}
${geoData.region ? `Región: ${geoData.region}` : ''}
${geoData.zone ? `Zona: ${geoData.zone}` : ''}
${geoData.continent ? `Continente: ${geoData.continent}` : ''}
${location.description ? `Descripción original: ${location.description}` : ''}

IMPORTANTE: Si los datos de Wikipedia o Wikidata proporcionados no son geográficamente coherentes con las coordenadas del punto (por ejemplo, describen algo en otra ciudad o país), IGNÓRALOS completamente y genera la ficha solo con lo que puedas inferir del nombre, coordenadas y datos geográficos.`;

    // Añadir datos de Wikipedia si disponibles
    if (wikipediaResult?.extract) {
      locationContext += `\n\n[DATOS WIKIPEDIA]\nArtículo: ${wikipediaResult.title}\n${wikipediaResult.extract}`;
    }
    
    // Añadir datos de Wikidata si disponibles
    if (wikidataResult) {
      let wikidataInfo = '\n\n[DATOS WIKIDATA - Verificados]';
      if (wikidataResult.population) wikidataInfo += `\nPoblación: ${wikidataResult.population.toLocaleString('es-ES')}`;
      if (wikidataResult.elevation) wikidataInfo += `\nAltitud: ${wikidataResult.elevation}m`;
      if (wikidataResult.foundingDate) wikidataInfo += `\nFecha fundación: ${wikidataResult.foundingDate}`;
      if (wikidataResult.officialWebsite) wikidataInfo += `\nWeb oficial: ${wikidataResult.officialWebsite}`;
      if (wikidataResult.heritage && wikidataResult.heritage.length > 0) wikidataInfo += `\nPatrimonio: Sí (${wikidataResult.heritage.length} designaciones)`;
      locationContext += wikidataInfo;
    }
    
    // Añadir datos de GeoNames si disponibles
    if (geonamesResult) {
      let geonamesInfo = '\n\n[DATOS GEONAMES - Topónimos]';
      if (geonamesResult.toponymName) geonamesInfo += `\nNombre oficial: ${geonamesResult.toponymName}`;
      if (geonamesResult.population && geonamesResult.population > 0) geonamesInfo += `\nPoblación: ${geonamesResult.population.toLocaleString('es-ES')}`;
      if (geonamesResult.elevation) geonamesInfo += `\nAltitud: ${geonamesResult.elevation}m`;
      if (geonamesResult.alternateNames && geonamesResult.alternateNames.length > 0) {
        geonamesInfo += `\nNombres alternativos: ${geonamesResult.alternateNames.join(', ')}`;
      }
      locationContext += geonamesInfo;
    }
    
    locationContext = locationContext.trim();

    // Build dynamic prompt based on curator preferences
    const toneInstructions = getToneInstructions(tone);
    
    // Custom curator instructions
    let curatorInstructions = '';
    if (customPrompt) {
      curatorInstructions = `\n\nINSTRUCCIONES ESPECÍFICAS DEL CURADOR:\n${customPrompt}`;
    }
    
    // Expected nature instruction - this is a key directive for the AI
    let natureInstructions = '';
    if (expectedNature) {
      natureInstructions = `\n\nNATURALEZA ESPERADA DE LOS PUNTOS:
"${expectedNature}"
IMPORTANTE: La IA usará esta descripción para buscar los puntos más próximos respecto al radio de búsqueda (${searchRadiusMeters}m) para definir el lugar de enriquecimiento. 
Si el punto proporcionado no coincide exactamente con la naturaleza esperada, busca el punto de interés más cercano dentro del radio que SÍ coincida con esta descripción.`;
    }
    
    // Coordinate correction instructions
    let coordCorrectionInstructions = '';
    if (correctCoordinates) {
      coordCorrectionInstructions = `\n\nCORRECCIÓN DE COORDENADAS:
Si detectas que las coordenadas proporcionadas no corresponden exactamente con el lugar identificado (por ejemplo, están ligeramente desplazadas), proporciona las coordenadas corregidas en el campo "coordenadas_corregidas" del JSON de respuesta.
Formato: { "lat": número, "lng": número, "motivo": "explicación breve" }`;
    }
    
    // Contact data instructions
    let contactInstructions = '';
    if (includeContact) {
      contactInstructions = `\n12. DATOS DE CONTACTO (si están disponibles y son verificables):
   - telefono: Número de teléfono oficial
   - email: Correo electrónico oficial  
   - horario: Horario de apertura/visita
   - precio: Precio de entrada si aplica
   Incluir estos datos en "datos_contacto" dentro de "datos_clave".`;
    }
    
    // Sources instructions
    let sourcesInstructions = '';
    if (showSources) {
      sourcesInstructions = `\n13. FUENTES CONSULTADAS (OBLIGATORIO):
   En el campo "fuentes", lista todas las fuentes utilizadas para generar esta ficha:
   - URLs de Wikipedia, sitios oficiales, portales de turismo
   - Nombre de la fuente y tipo de información obtenida`;
    }
    
    // Focus/exclude keywords
    let keywordInstructions = '';
    if (focusKeywords.length > 0) {
      keywordInstructions += `\n\nPALABRAS CLAVE A ENFATIZAR: ${focusKeywords.join(', ')}`;
    }
    if (excludeKeywords.length > 0) {
      keywordInstructions += `\n\nPALABRAS O TEMAS A EVITAR: ${excludeKeywords.join(', ')}`;
    }
    
    // Dynamic content rules based on preferences
    const tagsRule = includeTags 
      ? '7. Nube de etiquetas (hashtags): Reflejar naturaleza, tipología, contexto geográfico, cultural o funcional. CamelCase.'
      : '7. Etiquetas: OMITIR - no generar hashtags para este curador.';
    
    const webRule = includeWeb
      ? '9. Datos clave: tipo, dimensiones, acceso, estado/protección, coordenadas, web_referencia (solo si oficial).'
      : '9. Datos clave: tipo, dimensiones, acceso, estado/protección, coordenadas. NO incluir web_referencia.';
    
    const interestIndexRule = includeInterestIndex
      ? `11. ÍNDICE DE INTERÉS (OBLIGATORIO 1-5):
    Evalúa el lugar según estos criterios y asigna una puntuación de 1 a 5:
    - 1: Lugar común, poco conocido o de interés muy local
    - 2: Lugar de interés regional o con algún elemento destacable
    - 3: Lugar de interés nacional, con valor turístico medio
    - 4: Lugar de alto interés, popular entre turistas, bien documentado
    - 5: Lugar excepcional, patrimonio mundial, destino icónico, muy referenciado
    
    Basa tu evaluación en:
    - Presencia en Wikipedia y fuentes de turismo
    - Relevancia histórica/cultural/natural
    - Unicidad y singularidad del lugar
    - Popularidad turística documentada`
      : '11. Índice de interés: OMITIR para este curador.';

    const systemPrompt = `Eres un redactor especializado en turismo y viajes, encargado de generar fichas descriptivas evocadoras de puntos geográficos y lugares de interés. Tu objetivo es crear contenido atractivo que invite al lector a descubrir el lugar, manteniendo siempre la veracidad de los datos.

PRINCIPIO DE VALIDACIÓN (OBLIGATORIO):
- Todos los datos factuales deben proceder de fuentes fiables y cualificadas.
- Cada ficha se construye a partir de las coordenadas proporcionadas, que actúan como referencia primaria del punto.
- El nombre, la localización y los datos históricos/geográficos deben ser coherentes con esas coordenadas.
- Si existe web oficial, referencia institucional o identificador público, debe indicarse.
- Los datos no verificados se omiten (nunca se indica "no verificado").
${natureInstructions}
${coordCorrectionInstructions}
${toneInstructions}
${curatorInstructions}
${keywordInstructions}
${contactInstructions}
${sourcesInstructions}

ÁRBOL GLOBAL DE CLASIFICACIÓN DE PUNTOS (OBLIGATORIO - usar exactamente uno):

1. Asentamientos humanos
   1.1 Ciudad
   1.2 Villa / Pueblo
   1.3 Aldea / Núcleo rural
   1.4 Barrio / Distrito urbano
   1.5 Área habitada dispersa

2. Entidades construidas (antropogénicas)
   2.1 Edificio
       2.1.1 Monumento
       2.1.2 Edificio histórico
       2.1.3 Edificio religioso
       2.1.4 Edificio residencial singular
   2.2 Establecimiento (actividad o servicio)
       2.2.1 Restaurante / Bar
       2.2.2 Hotel / Alojamiento
       2.2.3 Comercio
       2.2.4 Empresa
       2.2.5 Servicio público
   2.3 Infraestructura puntual
       2.3.1 Faro
       2.3.2 Torre / Antena
       2.3.3 Presa
       2.3.4 Estación
       2.3.5 Subestación / Instalación técnica
   2.4 Infraestructura lineal
       2.4.1 Carretera
       2.4.2 Vía férrea
       2.4.3 Canal / Acueducto
       2.4.4 Muralla / Línea defensiva
   2.5 Complejo / Recinto
       2.5.1 Campus
       2.5.2 Puerto
       2.5.3 Aeropuerto
       2.5.4 Parque industrial
       2.5.5 Recinto histórico

3. Lugares de interés (categoría semántica, nunca genérica)
   3.1 Lugar de interés cultural
   3.2 Lugar de interés histórico
   3.3 Lugar de interés turístico
   3.4 Lugar simbólico o tradicional
   3.5 Mirador / Punto panorámico

4. Accidentes geográficos (naturales)
   4.1 Accidente geográfico mayor
       4.1.1 Montaña
       4.1.2 Sierra
       4.1.3 Río
       4.1.4 Lago
       4.1.5 Isla
       4.1.6 Desierto
   4.2 Accidente geográfico menor
       4.2.1 Valle
       4.2.2 Playa
       4.2.3 Cabo
       4.2.4 Acantilado
       4.2.5 Cueva
       4.2.6 Cascada

5. Espacios naturales delimitados
   5.1 Parque nacional
   5.2 Parque natural
   5.3 Reserva natural
   5.4 Espacio protegido local
   5.5 Espacio natural no protegido

${builtSchema.rulesBlock}

${builtSchema.jsonShapeBlock}

Responde SOLO con el JSON. Omite campos opcionales sin datos verificados, pero SIEMPRE incluye clasificacion y datos_geograficos cuando estén entre las claves activas.${!shouldGenerateImage ? ' NO incluir imagen - desactivada en Configuración de fichas.' : ''}`;

    // Step 1: Get text enrichment with retry logic
    const maxRetries = 3;
    let lastError: string | null = null;
    let enrichedData: any = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Longer delays for retries, especially for 503 errors
          const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
          console.log(`Retry attempt ${attempt} for ${location.name}, waiting ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const textResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Genera una ficha técnica verificable para este punto geográfico:\n\n${locationContext}` }
            ],
          }),
        });

        if (!textResponse.ok) {
          // Handle 503 Service Unavailable - retry with longer delay
          if (textResponse.status === 503) {
            console.log('Service temporarily unavailable (503), will retry...');
            lastError = 'Servicio temporalmente no disponible, reintentando...';
            if (attempt < maxRetries) {
              continue;
            }
            return new Response(
              JSON.stringify({ error: 'Servicio de IA temporalmente no disponible. Por favor, intenta de nuevo en unos minutos.' }),
              { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          if (textResponse.status === 429) {
            if (attempt < maxRetries) {
              console.log('Rate limited, waiting before retry...');
              continue;
            }
            return new Response(
              JSON.stringify({ error: 'Límite de peticiones excedido. Por favor, intenta más tarde.' }),
              { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          if (textResponse.status === 402) {
            return new Response(
              JSON.stringify({ error: 'Créditos de IA agotados. Añade créditos en la configuración.' }),
              { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const errorText = await textResponse.text();
          console.error('AI gateway error:', textResponse.status, errorText);
          lastError = `Error del servicio de IA: ${textResponse.status}`;
          if (attempt < maxRetries) {
            continue;
          }
        }

        const textData = await textResponse.json();
        console.log('AI response received:', JSON.stringify(textData).substring(0, 200));
        
        const content = textData.choices?.[0]?.message?.content;

        if (!content) {
          console.error('No content in AI response:', JSON.stringify(textData));
          lastError = 'Respuesta vacía del servicio de IA';
          continue;
        }

        // Parse JSON response
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.slice(7);
        }
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.slice(3);
        }
        if (cleanContent.endsWith('```')) {
          cleanContent = cleanContent.slice(0, -3);
        }
        
        enrichedData = JSON.parse(cleanContent.trim());
        
        if (!enrichedData.etiquetas) {
          enrichedData.etiquetas = [];
        }
        
        // Merge/enhance datos_geograficos from AI with Nominatim data
        // AI provides refined location info (lugar_interes, sublocalidad, direccion_postal)
        // Nominatim provides base geographic hierarchy
        const aiGeoData = enrichedData.datos_geograficos || {};
        
        // Determinar país y continente con prioridad: AI -> Nominatim -> inferencia
        let finalPais = aiGeoData.pais || geoData.country;
        let finalContinente = aiGeoData.continente || geoData.continent;
        
        // Si tenemos país pero no continente válido, inferir del mapa
        if (finalPais && (!finalContinente || finalContinente === 'Desconocido')) {
          const inferredContinent = CONTINENT_MAP[finalPais];
          if (inferredContinent) {
            console.log(`Continent inferred from country map: ${finalPais} -> ${inferredContinent}`);
            finalContinente = inferredContinent;
          } else {
            // Intentar inferir por coordenadas
            finalContinente = inferContinentFromCoordinates(location.coordinates.lat, location.coordinates.lng);
            console.log(`Continent inferred from coordinates: ${finalContinente}`);
          }
        }
        
        // Asegurar que nunca sea "Desconocido" si tenemos país conocido
        if (finalContinente === 'Desconocido' && finalPais) {
          // Buscar variantes del nombre del país
          const countryVariants = Object.keys(CONTINENT_MAP);
          for (const variant of countryVariants) {
            if (variant.toLowerCase() === finalPais.toLowerCase() ||
                finalPais.toLowerCase().includes(variant.toLowerCase()) ||
                variant.toLowerCase().includes(finalPais.toLowerCase())) {
              finalContinente = CONTINENT_MAP[variant];
              console.log(`Continent found via fuzzy match: ${finalPais} ~ ${variant} -> ${finalContinente}`);
              break;
            }
          }
        }
        
        const mergedGeoData: any = {
          continente: finalContinente,
          pais: finalPais,
          admin_nivel_1: aiGeoData.admin_nivel_1 || geoData.region,
          admin_nivel_2: aiGeoData.admin_nivel_2 || geoData.zone,
          admin_nivel_3: aiGeoData.admin_nivel_3,
          localidad: aiGeoData.localidad,
          sublocalidad: aiGeoData.sublocalidad,
          lugar_interes: aiGeoData.lugar_interes || location.name,
          direccion_postal: aiGeoData.direccion_postal,
          coordenadas: `${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lng.toFixed(6)}`,
          fuente_geocoding: geoData.country ? 'nominatim' : undefined,
          fuente_refinamiento: 'ai',
        };
        
        // Clean undefined values
        Object.keys(mergedGeoData).forEach(key => {
          if (mergedGeoData[key] === undefined) {
            delete mergedGeoData[key];
          }
        });
        
        enrichedData.datos_geograficos = mergedGeoData;
        
        // Update geoData from merged data
        geoData.country = mergedGeoData.pais;
        geoData.continent = mergedGeoData.continente;
        geoData.region = mergedGeoData.admin_nivel_1 || geoData.region;
        geoData.zone = mergedGeoData.admin_nivel_2 || mergedGeoData.localidad || geoData.zone;
        
        // Fallback: parse from localizacion if still missing
        if (!geoData.country && enrichedData.localizacion) {
          const parts = enrichedData.localizacion.split(',').map((p: string) => p.trim());
          const spainMatch = parts.find((p: string) => p.toLowerCase().includes('españa') || p.toLowerCase() === 'spain');
          if (spainMatch) {
            geoData.country = 'España';
            geoData.continent = 'Europa';
            const countryIndex = parts.indexOf(spainMatch);
            if (countryIndex >= 1) {
              for (let i = countryIndex - 1; i >= 0; i--) {
                const part = parts[i];
                if (part.length > 3 && !part.match(/^\d/) && i > 0) {
                  if (!geoData.region) {
                    geoData.region = part;
                  }
                  if (!geoData.zone && i > 1) {
                    geoData.zone = parts[i - 1];
                  }
                }
              }
            }
          }
          console.log('Parsed geo from localizacion:', geoData);
        }
        
        // Add geographic tags based on complete hierarchy (NEVER include "Desconocido")
        const geoTags: string[] = [];
        const gd = enrichedData.datos_geograficos;
        const excludedGeoTerms = ['desconocido', 'unknown', 'sin clasificar', 'unclassified'];
        
        const addGeoTag = (value: string | undefined) => {
          if (value && !excludedGeoTerms.some(term => value.toLowerCase().includes(term))) {
            geoTags.push(`#${value.replace(/\s+/g, '')}`);
          }
        };
        
        addGeoTag(gd.continente);
        addGeoTag(gd.pais);
        addGeoTag(gd.admin_nivel_1);
        addGeoTag(gd.admin_nivel_2);
        addGeoTag(gd.localidad);
        
        // Store geographic tags separately
        enrichedData.etiquetas_geograficas = geoTags;
        
        // Also add them to the main etiquetas array (deduplicated)
        const existingTagsLower = enrichedData.etiquetas.map((t: string) => t.toLowerCase().replace('#', ''));
        geoTags.forEach((geoTag: string) => {
          const geoTagLower = geoTag.toLowerCase().replace('#', '');
          if (!existingTagsLower.includes(geoTagLower)) {
            enrichedData.etiquetas.push(geoTag);
          }
        });
        
        // Store geocoded geographic data in enrichedData for database update
        enrichedData._geocoded = geoData;
        
        // Añadir información de las fuentes consultadas
        enrichedData._fuentes_consultadas = {
          nominatim: !!geocodeResult?.country,
          wikipedia: wikipediaResult ? {
            titulo: wikipediaResult.title,
            url: wikipediaResult.url,
          } : null,
          wikidata: wikidataResult ? {
            id: wikidataResult.wikidataId,
            poblacion: wikidataResult.population,
            altitud: wikidataResult.elevation,
            fundacion: wikidataResult.foundingDate,
            web_oficial: wikidataResult.officialWebsite,
            patrimonio: wikidataResult.heritage?.length || 0,
          } : null,
          geonames: geonamesResult ? {
            id: geonamesResult.geonameId,
            nombres_alternativos: geonamesResult.alternateNames,
          } : null,
          gemini: true, // Siempre usamos Gemini para la generación
          wikimedia_commons: false, // Se actualiza después si se encuentra imagen
        };
        
        // Usar web oficial de Wikidata si no hay otra
        if (wikidataResult?.officialWebsite && !enrichedData.datos_clave?.web_referencia) {
          if (!enrichedData.datos_clave) enrichedData.datos_clave = {};
          enrichedData.datos_clave.web_referencia = wikidataResult.officialWebsite;
        }
        
        // Añadir URL de Wikipedia a las fuentes si existe
        if (wikipediaResult?.url && enrichedData.fuentes) {
          if (!enrichedData.fuentes.includes(wikipediaResult.url)) {
            enrichedData.fuentes.push(wikipediaResult.url);
          }
        }
        
        // Añadir datos de altitud y población de Wikidata/GeoNames si no los tiene
        if (!enrichedData.datos_clave) enrichedData.datos_clave = {};
        
        if (wikidataResult?.population && !enrichedData.datos_clave.poblacion) {
          enrichedData.datos_clave.poblacion = wikidataResult.population.toLocaleString('es-ES');
        } else if (geonamesResult?.population && geonamesResult.population > 0 && !enrichedData.datos_clave.poblacion) {
          enrichedData.datos_clave.poblacion = geonamesResult.population.toLocaleString('es-ES');
        }
        
        if (wikidataResult?.elevation && !enrichedData.datos_clave.altitud) {
          enrichedData.datos_clave.altitud = `${wikidataResult.elevation}m`;
        } else if (geonamesResult?.elevation && !enrichedData.datos_clave.altitud) {
          enrichedData.datos_clave.altitud = `${geonamesResult.elevation}m`;
        }
        
        if (wikidataResult?.foundingDate && !enrichedData.datos_clave.fundacion) {
          enrichedData.datos_clave.fundacion = wikidataResult.foundingDate;
        }
        
        // Success - break out of retry loop
        lastError = null;
        break;
        
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        lastError = 'Error al procesar la respuesta del servicio';
        continue;
      }
    }
    
    if (lastError || !enrichedData) {
      console.error('All attempts failed for:', location.name);
      return new Response(
        JSON.stringify({ error: lastError || 'Error desconocido al enriquecer ubicación' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Validate web reference URL if present
    if (enrichedData.datos_clave?.web_referencia) {
      console.log('Validating web reference:', enrichedData.datos_clave.web_referencia);
      const isValidUrl = await validateUrl(enrichedData.datos_clave.web_referencia);
      if (!isValidUrl) {
        console.log('Invalid or inaccessible URL, removing from data');
        delete enrichedData.datos_clave.web_referencia;
      }
    }

    console.log('Successfully enriched location text:', location.name);

    // Step 3: Search for a real image only from the active configured sources
    if (shouldGenerateImage) {
      try {
        console.log('Searching real image for:', enrichedData.nombre_lugar, 'using sources:', activeExternalImageSources);

        const imageResult = await searchImageFromSources(
          enrichedData.nombre_lugar,
          enrichedData.datos_clave?.tipo || 'lugar',
          location.country,
          location.region,
          location.coordinates,
          activeExternalImageSources,
        );

        if (imageResult) {
          enrichedData.imagen = imageResult.url;
          enrichedData.imagen_fuente = imageResult.source;
          if (enrichedData._fuentes_consultadas) {
            enrichedData._fuentes_consultadas.wikimedia_commons = imageResult.source.startsWith('Wikimedia Commons');
            enrichedData._fuentes_consultadas.wikipedia = imageResult.source.startsWith('Wikipedia')
              ? { titulo: enrichedData.nombre_lugar, url: imageResult.url }
              : enrichedData._fuentes_consultadas.wikipedia;
          }
          console.log('Found relevant image for:', location.name);
        } else {
          console.log('No suitable image found for:', location.name);
        }
      } catch (imageError) {
        console.error('Error searching image:', imageError);
      }
    } else {
      console.log('Skipping automatic image lookup because it is disabled or there are no external active sources');
    }

    return new Response(
      JSON.stringify({ success: true, data: enrichedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Enrich location error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
