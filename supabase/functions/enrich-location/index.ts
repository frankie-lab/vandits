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
  'Estados Unidos': 'América del Norte', 'United States': 'América del Norte', 'USA': 'América del Norte',
  'Canadá': 'América del Norte', 'Canada': 'América del Norte',
  'México': 'América del Norte', 'Mexico': 'América del Norte',
  'Brasil': 'América del Sur', 'Brazil': 'América del Sur',
  'Argentina': 'América del Sur',
  'Chile': 'América del Sur',
  'Colombia': 'América del Sur',
  'Perú': 'América del Sur', 'Peru': 'América del Sur',
  'China': 'Asia',
  'Japón': 'Asia', 'Japan': 'Asia',
  'Corea del Sur': 'Asia', 'South Korea': 'Asia',
  'India': 'Asia',
  'Tailandia': 'Asia', 'Thailand': 'Asia',
  'Vietnam': 'Asia',
  'Turquía': 'Asia', 'Turkey': 'Asia', 'Türkiye': 'Asia',
  'Marruecos': 'África', 'Morocco': 'África',
  'Egipto': 'África', 'Egypt': 'África',
  'Sudáfrica': 'África', 'South Africa': 'África',
  'Australia': 'Oceanía',
  'Nueva Zelanda': 'Oceanía', 'New Zealand': 'Oceanía',
};

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
      return {};
    }

    const data = await response.json();
    const address = data.address || {};

    const country = address.country || undefined;
    const region = address.state || address.region || address.province || undefined;
    const zone = address.county || address.city || address.town || address.municipality || undefined;
    const continent = country ? (CONTINENT_MAP[country] || 'Desconocido') : undefined;

    console.log('Geocoding result:', { country, region, zone, continent });
    return { country, region, zone, continent };
  } catch (error) {
    console.error('Geocoding error:', error);
    return {};
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
          'portrait', 'retrato', 'headshot', 'face', 'rostro',
          'footballer', 'futbolista', 'player', 'jugador', 'athlete', 'atleta',
          'actor', 'actriz', 'singer', 'cantante', 'politician', 'político',
          'writer', 'escritor', 'author', 'autor', 'celebrity', 'famoso',
          'person', 'persona', 'people', 'gente', 'man ', 'woman ', 'hombre ', 'mujer ',
          'interview', 'entrevista', 'press conference', 'rueda de prensa',
          'award', 'premio', 'ceremony', 'ceremonia', 'red carpet', 'alfombra roja',
          'mugshot', 'selfie', 'profile photo', 'foto de perfil'
        ];
        
        for (const pattern of excludePatterns) {
          if (title.includes(pattern) || snippet.includes(pattern)) {
            console.log('Excluding image (pattern match):', title, 'Pattern:', pattern);
            return false;
          }
        }
        
        // Excluir imágenes que parecen ser de deportistas/personas famosas
        const personIndicators = [
          /\b(fc|cf|cd|sd|ud|ad|rcd|rayo|athletic|atlético|real|sporting|barcelona|madrid)\b/i,
          /\b(20\d{2}|19\d{2})\s*(season|temporada|world cup|mundial|euro|liga|championship)/i,
          /\b(goal|gol|match|partido|game|training|entrenamiento)\b/i,
          /\b(jersey|camiseta|uniform|equipación)\b/i
        ];
        
        for (const regex of personIndicators) {
          if (regex.test(title) || regex.test(snippet)) {
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
        
        // Penalización por términos genéricos
        const genericTerms = ['view', 'vista', 'panorama', 'landscape', 'paisaje', 'general'];
        for (const term of genericTerms) {
          if (title.includes(term)) {
            score -= 5;
          }
        }
        
        // Bonus para fotos (vs dibujos)
        if (title.includes('photo') || title.includes('foto') || snippet.includes('photograph')) {
          score += 10;
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

    const systemPrompt = `Eres un redactor técnico encargado de generar fichas informativas homogéneas de puntos geográficos y lugares de interés, basadas exclusivamente en datos verificables.

PRINCIPIO DE VALIDACIÓN (OBLIGATORIO):
- Todos los puntos deben validarse con datos ciertos procedentes de fuentes fiables.
- Cada ficha se construye a partir de las coordenadas proporcionadas, que actúan como referencia primaria del punto.
- El nombre, la localización y la descripción deben ser coherentes con esas coordenadas.
- Si existe web oficial, referencia institucional, panel informativo, señalización oficial o identificador público, debe indicarse.
- Los datos no verificados no se presentan en ningún caso.
- No se permite indicar explícitamente "no verificado" en el contenido final: simplemente se omite el dato.

IDIOMA Y TONO:
- Castellano normativo.
- Estilo descriptivo, técnico y neutral.
- Prohibido el lenguaje promocional, emocional o literario.
- No usar superlativos ni adjetivos valorativos.

CATEGORÍAS DISPONIBLES (usar exactamente una):
- Naturaleza: Parques naturales, reservas, espacios protegidos, bosques, montañas, ríos, lagos, cascadas, cuevas, formaciones geológicas
- Playas y Costa: Playas, calas, acantilados costeros, cabos, islas, puertos naturales
- Patrimonio Histórico: Castillos, fortalezas, murallas, yacimientos arqueológicos, ruinas históricas
- Arquitectura Religiosa: Iglesias, catedrales, monasterios, ermitas, santuarios, conventos
- Núcleos Urbanos: Ciudades, pueblos, villas, conjuntos histórico-artísticos, cascos antiguos
- Miradores y Paisajes: Miradores, puntos panorámicos, balcones naturales
- Museos y Cultura: Museos, centros de interpretación, espacios culturales
- Gastronomía: Restaurantes, bodegas, mercados, productores locales
- Alojamiento: Hoteles, casas rurales, camping, albergues
- Rutas y Senderos: Caminos, senderos señalizados, vías verdes, rutas temáticas
- Otros: Lugares que no encajan en las categorías anteriores

REGLAS DE CONTENIDO:

1. Nombre del lugar: Usar únicamente el nombre oficial o el más común documentado. Coherente con las coordenadas. No añadir descriptores.

2. Categoría: Asignar UNA de las categorías disponibles según la naturaleza principal del punto.

3. Localización: Una sola línea. Dirección completa estructurada incluyendo (cuando sea verificable): vía o núcleo concreto, municipio, provincia, región/comunidad autónoma, país, continente. Derivada directamente de las coordenadas.

4. Descripción: Entre 2 y 3 frases. Contenido exclusivamente factual: qué es el lugar, un dato físico/geográfico/histórico principal, un dato verificable por frase. Tiempo verbal: presente. Todos los datos deben ser compatibles con la posición geográfica indicada.

5. Punto destacado: Una sola frase. Identifica el elemento más relevante documentado del punto.

6. Observación (opcional): Solo si aporta información práctica o contextual verificable. Redacción condicional. Sin valoración subjetiva.

7. Nube de etiquetas (hashtags): Formada únicamente por hashtags. Las etiquetas se generan a partir de los resultados de las consultas realizadas para construir la descripción, no por inferencia creativa. Deben reflejar naturaleza, tipología, contexto geográfico, cultural o funcional del punto. No incluir etiquetas redundantes ni genéricas. Normalizar con CamelCase y acentos (#CastillaYLeón, #PatrimonioHistórico).

8. Datos clave: Lista solo con datos verificados: tipo, altura/dimensión principal (si aplica), acceso (si verificable), estado/protección (si aplica), coordenadas, web/referencia pública (solo si existe).

9. Fuentes: Obligatorio. Priorizar fuentes institucionales, técnicas o académicas (IGN, organismos autonómicos, ayuntamientos, parques naturales, cartografía oficial). Solo se citan fuentes efectivamente utilizadas.

PROHIBICIONES:
- No metáforas.
- No adjetivos valorativos.
- No experiencias personales.
- No inventar datos.
- No inferencias no respaldadas por fuentes.
- No presentar datos no verificados.

Responde SIEMPRE en formato JSON con esta estructura exacta (omitir campos opcionales si no hay datos verificados):
{
  "verified": true/false,
  "verification_notes": "Notas sobre coherencia entre nombre y coordenadas",
  "categoria": "Una de las categorías disponibles",
  "nombre_lugar": "Nombre oficial verificado",
  "localizacion": "Dirección completa estructurada en una línea",
  "descripcion": "2-3 frases factuales sobre el lugar",
  "punto_destacado": "Una frase con el elemento más relevante",
  "observacion": "Solo si hay información práctica verificable",
  "etiquetas": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "datos_clave": {
    "tipo": "Tipo específico del lugar",
    "dimension_principal": "Solo si verificable",
    "acceso": "Solo si verificable",
    "estado_proteccion": "Solo si aplica",
    "coordenadas": "Coordenadas del punto",
    "web_referencia": "Solo si existe"
  },
  "fuentes": ["Fuente 1 efectivamente utilizada", "Fuente 2"]
}

Responde SOLO con el JSON, sin texto adicional. Omite cualquier campo opcional que no tenga datos verificados.`;

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
        
        // Parse structured geographic data from AI's localizacion field as backup
        // Format expected: "Village, Municipality, Province, Region, Country, Continent"
        if (!geoData.country && enrichedData.localizacion) {
          const parts = enrichedData.localizacion.split(',').map((p: string) => p.trim());
          // Try to extract from known patterns - Spain example: "Zugarramurdi, Navarra, España, Europa"
          const spainMatch = parts.find((p: string) => p.toLowerCase().includes('españa') || p.toLowerCase() === 'spain');
          if (spainMatch) {
            geoData.country = 'España';
            geoData.continent = 'Europa';
            // Region is usually before country
            const countryIndex = parts.indexOf(spainMatch);
            if (countryIndex >= 1) {
              // Find the region (typically Comunidad Autónoma)
              for (let i = countryIndex - 1; i >= 0; i--) {
                const part = parts[i];
                // Skip municipality/province, look for larger region
                if (part.length > 3 && !part.match(/^\d/) && i > 0) {
                  if (!geoData.region) {
                    geoData.region = part;
                  }
                  if (!geoData.zone && i > 1) {
                    // Zone is one level up from region
                    geoData.zone = parts[i - 1];
                  }
                }
              }
            }
          }
          console.log('Parsed geo from localizacion:', geoData);
        }
        
        // Add geographic tags based on geocoded data (GPS-derived or parsed)
        const geoTags: string[] = [];
        if (geoData.continent) geoTags.push(`#${geoData.continent.replace(/\s+/g, '')}`);
        if (geoData.country) geoTags.push(`#${geoData.country.replace(/\s+/g, '')}`);
        if (geoData.region) geoTags.push(`#${geoData.region.replace(/\s+/g, '')}`);
        if (geoData.zone) geoTags.push(`#${geoData.zone.replace(/\s+/g, '')}`);
        
        // Store geographic tags separately
        enrichedData.etiquetas_geograficas = geoTags;
        
        // Also add them to the main etiquetas array (deduplicated)
        const existingTagsLower = enrichedData.etiquetas.map((t: string) => t.toLowerCase().replace('#', ''));
        geoTags.forEach(geoTag => {
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

    console.log('Successfully enriched location text:', location.name);

    // Step 2: Search for real image from Wikimedia Commons with improved precision
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
