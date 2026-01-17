import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { location, generateImage = true } = await req.json() as { location: LocationData; generateImage?: boolean };
    
    if (!location) {
      return new Response(
        JSON.stringify({ error: 'Location data is required' }),
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

    console.log('Enriching location:', location.name, 'at', location.coordinates.lat, location.coordinates.lng);

    // Step 0: Auto-geocode if geographic data is missing
    let geoData = {
      country: location.country,
      region: location.region,
      zone: location.zone,
      continent: location.continent,
    };
    
    if (!location.country || !location.region) {
      console.log('Missing geographic data, running reverse geocoding...');
      const geocodeResult = await reverseGeocodeLocation(
        location.coordinates.lat,
        location.coordinates.lng
      );
      
      if (geocodeResult.country) {
        geoData = {
          country: geocodeResult.country,
          region: geocodeResult.region,
          zone: geocodeResult.zone,
          continent: geocodeResult.continent,
        };
        console.log('Geocoded successfully:', geoData);
      }
    }

    const locationContext = `
Nombre proporcionado: ${location.name}
Coordenadas: ${location.coordinates.lat}, ${location.coordinates.lng}
${geoData.country ? `País: ${geoData.country}` : ''}
${geoData.region ? `Región: ${geoData.region}` : ''}
${geoData.zone ? `Zona: ${geoData.zone}` : ''}
${geoData.continent ? `Continente: ${geoData.continent}` : ''}
${location.description ? `Descripción original: ${location.description}` : ''}
    `.trim();

    const systemPrompt = `Eres un redactor especializado en turismo y viajes, encargado de generar fichas descriptivas evocadoras de puntos geográficos y lugares de interés. Tu objetivo es crear contenido atractivo que invite al lector a descubrir el lugar, manteniendo siempre la veracidad de los datos.

PRINCIPIO DE VALIDACIÓN (OBLIGATORIO):
- Todos los datos factuales deben proceder de fuentes fiables y cualificadas.
- Cada ficha se construye a partir de las coordenadas proporcionadas, que actúan como referencia primaria del punto.
- El nombre, la localización y los datos históricos/geográficos deben ser coherentes con esas coordenadas.
- Si existe web oficial, referencia institucional o identificador público, debe indicarse.
- Los datos no verificados se omiten (nunca se indica "no verificado").

IDIOMA Y TONO:
- Castellano normativo.
- Estilo narrativo, evocador y turístico.
- Se permiten descripciones emotivas, sensoriales y literarias.
- Se pueden usar adjetivos que transmitan la atmósfera del lugar.
- El objetivo es despertar el interés y la curiosidad del lector.

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

REGLAS DE CONTENIDO:

1. Nombre del lugar: Usar el nombre oficial o el más común documentado. Coherente con las coordenadas.

2. Clasificación (OBLIGATORIO): Asignar el código más específico posible del árbol de clasificación.
   - categoria_principal: Texto completo (ej: "2. Entidades construidas (antropogénicas)")
   - subcategoria: Texto completo (ej: "2.1 Edificio")
   - tipo_especifico: Texto completo si aplica (ej: "2.1.3 Edificio religioso")
   - codigo: Solo el código numérico (ej: "2.1.3")

3. Localización: Una sola línea estructurada: vía o núcleo, municipio, provincia, región/comunidad autónoma, país, continente.

4. Descripción (~2000 caracteres, 5 frases mínimo): 
   - Contenido evocador que combine datos verificables con narrativa turística atractiva.
   - Incluir contexto histórico, geográfico o cultural relevante.
   - Describir la atmósfera, sensaciones o experiencia del visitante.
   - Mencionar elementos visuales, sonoros o sensoriales característicos.

5. Punto destacado: Una frase impactante que capture la esencia única del lugar.

6. Observación (opcional): Información práctica útil para el visitante.

7. Nube de etiquetas (hashtags): Reflejar naturaleza, tipología, contexto geográfico, cultural o funcional. CamelCase.

8. DATOS GEOGRÁFICOS (OBLIGATORIO):
   - continente, pais, admin_nivel_1, admin_nivel_2, admin_nivel_3, localidad, sublocalidad, lugar_interes, direccion_postal

9. Datos clave: tipo, dimensiones, acceso, estado/protección, coordenadas, web_referencia (solo si oficial).

10. Fuentes: Obligatorio. Priorizar fuentes institucionales, Wikipedia, o sitios oficiales de turismo.

11. ÍNDICE DE INTERÉS (OBLIGATORIO 1-5):
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
    - Popularidad turística documentada

Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "verified": true/false,
  "verification_notes": "Notas sobre coherencia",
  "categoria": "Categoría legacy para compatibilidad",
  "clasificacion": {
    "categoria_principal": "2. Entidades construidas (antropogénicas)",
    "subcategoria": "2.1 Edificio",
    "tipo_especifico": "2.1.3 Edificio religioso",
    "codigo": "2.1.3"
  },
  "nombre_lugar": "Nombre oficial verificado",
  "localizacion": "Dirección estructurada",
  "descripcion": "Descripción evocadora",
  "punto_destacado": "Frase destacada",
  "observacion": "Info práctica opcional",
  "etiquetas": ["#hashtag1", "#hashtag2"],
  "datos_geograficos": {
    "continente": "Europa",
    "pais": "España",
    "admin_nivel_1": "Comunidad Autónoma",
    "admin_nivel_2": "Provincia",
    "admin_nivel_3": "Comarca/Municipio",
    "localidad": "Ciudad/Pueblo",
    "sublocalidad": "Barrio",
    "lugar_interes": "Nombre del POI",
    "direccion_postal": "Dirección"
  },
  "datos_clave": {
    "tipo": "Tipo específico",
    "dimension_principal": "Si verificable",
    "acceso": "Si verificable",
    "estado_proteccion": "Si aplica",
    "coordenadas": "lat, lng",
    "web_referencia": "Solo si existe"
  },
  "fuentes": ["Fuente 1", "Fuente 2"],
  "indice_interes": 4,
  "indice_interes_notas": "Breve justificación del índice asignado"
}

Responde SOLO con el JSON. Omite campos opcionales sin datos verificados, pero SIEMPRE incluye clasificacion, datos_geograficos e indice_interes.`;

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
        const mergedGeoData: any = {
          continente: aiGeoData.continente || geoData.continent,
          pais: aiGeoData.pais || geoData.country,
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
        
        // Update geoData from AI if Nominatim didn't provide it
        if (!geoData.country && aiGeoData.pais) {
          geoData.country = aiGeoData.pais;
          geoData.continent = aiGeoData.continente;
          geoData.region = aiGeoData.admin_nivel_1;
          geoData.zone = aiGeoData.admin_nivel_2 || aiGeoData.localidad;
        }
        
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
        
        // Add geographic tags based on complete hierarchy
        const geoTags: string[] = [];
        const gd = enrichedData.datos_geograficos;
        if (gd.continente) geoTags.push(`#${gd.continente.replace(/\s+/g, '')}`);
        if (gd.pais) geoTags.push(`#${gd.pais.replace(/\s+/g, '')}`);
        if (gd.admin_nivel_1) geoTags.push(`#${gd.admin_nivel_1.replace(/\s+/g, '')}`);
        if (gd.admin_nivel_2) geoTags.push(`#${gd.admin_nivel_2.replace(/\s+/g, '')}`);
        if (gd.localidad) geoTags.push(`#${gd.localidad.replace(/\s+/g, '')}`);
        
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

    // Step 3: Search for real image from Wikimedia Commons with improved precision
    if (generateImage) {
      try {
        console.log('Searching real image for:', enrichedData.nombre_lugar);
        
        const imageResult = await searchWikimediaImage(
          enrichedData.nombre_lugar,
          enrichedData.datos_clave?.tipo || 'lugar',
          location.country,
          location.region,
          location.coordinates
        );
        
        if (imageResult) {
          enrichedData.imagen = imageResult.url;
          enrichedData.imagen_fuente = `Wikimedia Commons: ${imageResult.title}`;
          console.log('Found relevant image for:', location.name);
        } else {
          console.log('No suitable image found for:', location.name);
        }
      } catch (imageError) {
        console.error('Error searching image:', imageError);
        // Continue without image
      }
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
