
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { alternatives, profile_name, waypoint_names } = await req.json();

    if (!alternatives || alternatives.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No hay alternativas para analizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const routeSummaries = alternatives.slice(0, 5).map((alt: any, i: number) => {
      const segments = alt.segments.map((s: any) =>
        `${s.from} → ${s.to}: ${s.mode.name} (${s.distance_km}km, ~${s.estimated_cost}€, ~${s.estimated_time_hours}h)`
      ).join('\n    ');
      return `Opción ${i + 1}: "${alt.name}" — Score: ${alt.scores.overall}/10
  Coste: ~${alt.total_cost}€ | Tiempo: ~${alt.total_time_hours}h | Distancia: ${alt.total_distance_km}km
  Scores: Coste=${alt.scores.cost} Tiempo=${alt.scores.time} Flex=${alt.scores.flexibility} Autonomía=${alt.scores.autonomy} Confort=${alt.scores.comfort} Riesgo=${alt.scores.risk} Escénico=${alt.scores.scenic}
  Tramos:
    ${segments}`;
    }).join('\n\n');

    const prompt = `Eres un experto en planificación de viajes. Analiza estas ${alternatives.length} alternativas de ruta para el viaje ${waypoint_names?.join(' → ') || ''} con perfil "${profile_name || 'personalizado'}".

${routeSummaries}

Genera un análisis comparativo en español con:
1. **Recomendación principal**: cuál es la mejor opción y por qué (2-3 frases)
2. **Para cada opción** (máx 5):
   - ✅ Ventajas principales (2-3 puntos)
   - ⚠️ Inconvenientes (2-3 puntos)
   - 💡 Consejo práctico específico
3. **Conclusión**: resumen de cuándo elegir cada opción según el tipo de viajero

Sé conciso, práctico y directo. Usa datos concretos de los scores. No repitas los números que ya se muestran, aporta valor con insights reales.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Eres un experto planificador de viajes multimodales. Responde siempre en español.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const text = await response.text();
      console.error('AI gateway error:', response.status, text);
      return new Response(JSON.stringify({ error: 'AI analysis failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content || 'No se pudo generar el análisis.';

    return new Response(
      JSON.stringify({ explanation }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('explain-routes error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
