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
Nombre del lugar: ${location.name}
Coordenadas: ${location.coordinates.lat}, ${location.coordinates.lng}
${location.country ? `País: ${location.country}` : ''}
${location.region ? `Región: ${location.region}` : ''}
${location.zone ? `Zona: ${location.zone}` : ''}
${location.description ? `Descripción original: ${location.description}` : ''}
    `.trim();

    const systemPrompt = `Eres un experto en turismo, gastronomía y viajes. Tu tarea es crear fichas informativas detalladas sobre lugares turísticos.

INSTRUCCIONES:
1. Primero, verifica si el nombre del lugar coincide con las coordenadas proporcionadas. Si no coinciden, menciona la discrepancia.
2. Investiga y proporciona información relevante sobre:
   - Descripción general del lugar
   - Atractivos turísticos principales
   - Gastronomía local y platos típicos
   - Mejor época para visitar
   - Consejos prácticos para viajeros
   - Datos curiosos o históricos

3. Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "verified": true/false,
  "verification_notes": "Notas sobre la verificación del lugar",
  "enriched_description": "Descripción enriquecida del lugar (2-3 párrafos)",
  "tourism": {
    "main_attractions": ["atracción 1", "atracción 2", ...],
    "best_season": "Mejor época para visitar",
    "tips": ["consejo 1", "consejo 2", ...]
  },
  "gastronomy": {
    "typical_dishes": ["plato 1", "plato 2", ...],
    "recommended_restaurants": ["Buscar restaurantes locales recomendados"],
    "food_tips": "Consejos sobre la comida local"
  },
  "practical_info": {
    "accessibility": "Información sobre cómo llegar",
    "estimated_time": "Tiempo recomendado de visita",
    "budget": "Nivel de presupuesto (bajo/medio/alto)"
  },
  "curiosities": ["dato curioso 1", "dato curioso 2", ...]
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
          { role: 'user', content: `Crea una ficha turística completa para este lugar:\n\n${locationContext}` }
        ],
        temperature: 0.7,
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

    // Try to parse the JSON response
    let enrichedData;
    try {
      // Clean the response - remove markdown code blocks if present
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
      // Return the raw content as a fallback
      enrichedData = {
        verified: true,
        verification_notes: 'Respuesta procesada',
        enriched_description: content,
        tourism: { main_attractions: [], best_season: '', tips: [] },
        gastronomy: { typical_dishes: [], recommended_restaurants: [], food_tips: '' },
        practical_info: { accessibility: '', estimated_time: '', budget: '' },
        curiosities: []
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
