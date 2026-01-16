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

// Buscar imagen real en Wikimedia Commons
async function searchWikimediaImage(placeName: string, placeType: string, country?: string): Promise<string | null> {
  try {
    // Construir query de búsqueda
    const searchTerms = [placeName];
    if (country) searchTerms.push(country);
    
    const searchQuery = searchTerms.join(' ');
    console.log('Searching Wikimedia for:', searchQuery);
    
    // Buscar en Wikimedia Commons
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srnamespace=6&srlimit=5&format=json&origin=*`;
    
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      console.error('Wikimedia search failed:', searchResponse.status);
      return null;
    }
    
    const searchData = await searchResponse.json();
    const results = searchData.query?.search || [];
    
    if (results.length === 0) {
      console.log('No Wikimedia results for:', searchQuery);
      // Intentar con solo el nombre del lugar
      const fallbackUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(placeName)}&srnamespace=6&srlimit=5&format=json&origin=*`;
      const fallbackResponse = await fetch(fallbackUrl);
      if (!fallbackResponse.ok) return null;
      
      const fallbackData = await fallbackResponse.json();
      const fallbackResults = fallbackData.query?.search || [];
      if (fallbackResults.length === 0) return null;
      
      results.push(...fallbackResults);
    }
    
    // Filtrar por imágenes (excluir SVG, PDF, etc.)
    const imageResults = results.filter((r: any) => {
      const title = r.title.toLowerCase();
      return title.endsWith('.jpg') || title.endsWith('.jpeg') || title.endsWith('.png') || title.endsWith('.webp');
    });
    
    if (imageResults.length === 0) {
      console.log('No image files found');
      return null;
    }
    
    // Obtener la URL de la primera imagen
    const fileName = imageResults[0].title.replace('File:', '');
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`;
    
    const imageInfoResponse = await fetch(imageInfoUrl);
    if (!imageInfoResponse.ok) {
      console.error('Image info request failed');
      return null;
    }
    
    const imageInfoData = await imageInfoResponse.json();
    const pages = imageInfoData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    
    if (!pageId || pageId === '-1') {
      console.log('Image not found');
      return null;
    }
    
    const imageInfo = pages[pageId]?.imageinfo?.[0];
    const thumbUrl = imageInfo?.thumburl || imageInfo?.url;
    
    if (thumbUrl) {
      console.log('Found image:', thumbUrl);
      return thumbUrl;
    }
    
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

    const locationContext = `
Nombre proporcionado: ${location.name}
Coordenadas: ${location.coordinates.lat}, ${location.coordinates.lng}
${location.country ? `País: ${location.country}` : ''}
${location.region ? `Región: ${location.region}` : ''}
${location.zone ? `Zona: ${location.zone}` : ''}
${location.continent ? `Continente: ${location.continent}` : ''}
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

REGLAS DE CONTENIDO:

1. Nombre del lugar: Usar únicamente el nombre oficial o el más común documentado. Coherente con las coordenadas. No añadir descriptores.

2. Localización: Una sola línea. Dirección completa estructurada incluyendo (cuando sea verificable): vía o núcleo concreto, municipio, provincia, región/comunidad autónoma, país, continente. Derivada directamente de las coordenadas.

3. Descripción: Entre 2 y 3 frases. Contenido exclusivamente factual: qué es el lugar, un dato físico/geográfico/histórico principal, un dato verificable por frase. Tiempo verbal: presente. Todos los datos deben ser compatibles con la posición geográfica indicada.

4. Punto destacado: Una sola frase. Identifica el elemento más relevante documentado del punto.

5. Observación (opcional): Solo si aporta información práctica o contextual verificable. Redacción condicional. Sin valoración subjetiva.

6. Nube de etiquetas (hashtags): Formada únicamente por hashtags. Las etiquetas se generan a partir de los resultados de las consultas realizadas para construir la descripción, no por inferencia creativa. Deben reflejar naturaleza, tipología, contexto geográfico, cultural o funcional del punto. No incluir etiquetas redundantes ni genéricas.

7. Datos clave: Lista solo con datos verificados: tipo, altura/dimensión principal (si aplica), acceso (si verificable), estado/protección (si aplica), coordenadas, web/referencia pública (solo si existe).

8. Fuentes: Obligatorio. Priorizar fuentes institucionales, técnicas o académicas (IGN, organismos autonómicos, ayuntamientos, parques naturales, cartografía oficial). Solo se citan fuentes efectivamente utilizadas.

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
  "nombre_lugar": "Nombre oficial verificado",
  "localizacion": "Dirección completa estructurada en una línea",
  "descripcion": "2-3 frases factuales sobre el lugar",
  "punto_destacado": "Una frase con el elemento más relevante",
  "observacion": "Solo si hay información práctica verificable",
  "etiquetas": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "datos_clave": {
    "tipo": "Categoría del lugar",
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
    const maxRetries = 2;
    let lastError: string | null = null;
    let enrichedData: any = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retry attempt ${attempt} for ${location.name}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
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
          if (textResponse.status === 429) {
            if (attempt < maxRetries) {
              console.log('Rate limited, waiting before retry...');
              await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
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
          continue;
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

    // Step 2: Search for real image from Wikimedia Commons
    if (generateImage) {
      try {
        console.log('Searching real image for:', enrichedData.nombre_lugar);
        
        const imageUrl = await searchWikimediaImage(
          enrichedData.nombre_lugar,
          enrichedData.datos_clave?.tipo || 'lugar',
          location.country
        );
        
        if (imageUrl) {
          enrichedData.imagen = imageUrl;
          enrichedData.imagen_fuente = 'Wikimedia Commons (CC)';
          console.log('Found real image for:', location.name);
        } else {
          console.log('No image found for:', location.name);
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
