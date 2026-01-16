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

    // Step 1: Get text enrichment
    const textResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Genera una ficha técnica verificable para este punto geográfico:\n\n${locationContext}` }
        ],
        temperature: 0.2,
      }),
    });

    if (!textResponse.ok) {
      if (textResponse.status === 429) {
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
      return new Response(
        JSON.stringify({ error: 'Error del servicio de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const textData = await textResponse.json();
    const content = textData.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response:', textData);
      return new Response(
        JSON.stringify({ error: 'Respuesta vacía del servicio de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON response
    let enrichedData;
    try {
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
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', content);
      return new Response(
        JSON.stringify({ error: 'Error al procesar la respuesta del servicio' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully enriched location text:', location.name);

    // Step 2: Generate image if requested
    if (generateImage) {
      try {
        console.log('Generating image for:', enrichedData.nombre_lugar);
        
        const imagePrompt = `Fotografía documental de ${enrichedData.nombre_lugar}, ${enrichedData.datos_clave?.tipo || 'lugar geográfico'} ubicado en ${enrichedData.localizacion}. ${enrichedData.punto_destacado}. Estilo fotográfico realista, luz natural, perspectiva panorámica. Sin texto ni marcas de agua.`;
        
        const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-image-preview',
            messages: [
              { role: 'user', content: imagePrompt }
            ],
            modalities: ['image', 'text'],
          }),
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const generatedImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          
          if (generatedImage) {
            enrichedData.imagen = generatedImage;
            console.log('Successfully generated image for:', location.name);
          } else {
            console.log('No image in response for:', location.name);
          }
        } else {
          console.error('Image generation failed:', imageResponse.status);
        }
      } catch (imageError) {
        console.error('Error generating image:', imageError);
        // Continue without image - it's optional
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
