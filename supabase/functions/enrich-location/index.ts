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
    const { location } = await req.json() as { location: LocationData };
    
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
${location.description ? `Descripción original: ${location.description}` : ''}
    `.trim();

    const systemPrompt = `Eres un redactor técnico encargado de generar fichas informativas homogéneas de puntos geográficos y lugares de interés, basadas exclusivamente en datos verificables.

PRINCIPIO DE VALIDACIÓN (OBLIGATORIO):
- Todos los puntos deben validarse con datos ciertos procedentes de fuentes fiables.
- Cada ficha se construye a partir de las coordenadas proporcionadas, que actúan como referencia primaria del punto.
- El nombre, la localización y la descripción deben ser coherentes con esas coordenadas.
- Si existe web oficial, referencia institucional, panel informativo, señalización oficial, o identificador público, debe indicarse.
- Si algún dato no puede validarse con fuentes fiables, debe indicarse explícitamente como no verificado.

IDIOMA Y TONO:
- Castellano normativo.
- Estilo descriptivo, técnico y neutral.
- Prohibido el lenguaje promocional, emocional o literario.
- No usar superlativos ni adjetivos valorativos.

REGLAS DE CONTENIDO:
1. Nombre del lugar: Usar únicamente el nombre oficial o el más común documentado. Coherente con las coordenadas.
2. Localización: Una sola frase. De lo específico a lo general (entorno inmediato → municipio → provincia → comunidad).
3. Descripción: Entre 2 y 3 frases. Contenido exclusivamente factual: qué es, dato físico/geográfico/histórico principal. Tiempo verbal: presente.
4. Punto destacado: Una sola frase. El elemento más relevante documentado.
5. Observación: Solo si aporta información práctica o contextual verificable. Redacción condicional.
6. Datos clave: tipo, dimensión principal, acceso, estado/protección, coordenadas, web/referencia.
7. Fuentes: Obligatorio. Priorizar IGN, organismos autonómicos, ayuntamientos, parques naturales, cartografía oficial.

PROHIBICIONES:
- No metáforas ni adjetivos valorativos.
- No experiencias personales.
- No inventar datos.
- No inferencias no respaldadas.

Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "verified": true/false,
  "verification_notes": "Notas sobre coherencia entre nombre y coordenadas",
  "nombre_lugar": "Nombre oficial verificado",
  "localizacion": "Frase única de ubicación específica a general",
  "descripcion": "2-3 frases factuales sobre el lugar",
  "punto_destacado": "Una frase con el elemento más relevante",
  "observacion": "Solo si aplica, información práctica verificable",
  "datos_clave": {
    "tipo": "Categoría del lugar (mirador, playa, montaña, etc.)",
    "dimension_principal": "Altura, extensión u otra medida si aplica",
    "acceso": "Cómo se accede al lugar",
    "estado_proteccion": "Si tiene alguna protección oficial",
    "coordenadas": "Coordenadas del punto",
    "web_referencia": "Web oficial o referencia pública si existe"
  },
  "fuentes": ["Fuente 1", "Fuente 2"],
  "datos_no_verificados": ["Dato 1 sin verificar"] // Solo si hay datos no verificables
}

Responde SOLO con el JSON, sin texto adicional.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        temperature: 0.3, // Más bajo para respuestas más precisas y técnicas
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Límite de peticiones excedido. Por favor, intenta más tarde.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos de IA agotados. Añade créditos en la configuración.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Error del servicio de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response:', data);
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
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', content);
      // Fallback structure
      enrichedData = {
        verified: false,
        verification_notes: 'Error al procesar la respuesta del servicio',
        nombre_lugar: location.name,
        localizacion: `${location.region || ''}, ${location.country || ''}`.trim() || 'No disponible',
        descripcion: location.description || 'Información no disponible',
        punto_destacado: 'No se pudo determinar',
        datos_clave: {
          tipo: 'No determinado',
          acceso: 'No disponible',
          coordenadas: `${location.coordinates.lat}, ${location.coordinates.lng}`,
        },
        fuentes: ['Datos proporcionados por el usuario'],
        datos_no_verificados: ['Toda la información requiere verificación manual']
      };
    }

    console.log('Successfully enriched location:', location.name);

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
