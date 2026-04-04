import { corsHeaders } from '@supabase/supabase-js/cors';

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

      // Format cost breakdown if available
      const costBreakdown = alt.cost_breakdown?.map((cb: any) =>
        `${cb.category_icon} ${cb.category_name}: ${cb.total}€`
      ).join(' | ') || 'No disponible';

      const warnings = alt.warnings?.length > 0
        ? `\n  ⚠️ Avisos: ${alt.warnings.join('; ')}`
        : '';

      return `Opción ${i + 1}: "${alt.name}" — Score: ${alt.scores.overall}/10
  Coste: ~${alt.total_cost}€ | Tiempo: ~${alt.total_time_hours}h | Distancia: ${alt.total_distance_km}km
  Desglose costes: ${costBreakdown}
  Scores: Coste=${alt.scores.cost} Tiempo=${alt.scores.time} Flex=${alt.scores.flexibility} Autonomía=${alt.scores.autonomy} Confort=${alt.scores.comfort} Seguridad=${alt.scores.risk} Escénico=${alt.scores.scenic} Carga=${alt.scores.load || 'N/A'} Restricciones=${alt.scores.restrictions || 'N/A'}
  Medios: ${alt.modes_used?.join(', ')}${warnings}
  Tramos:
    ${segments}`;
    }).join('\n\n');

    const prompt = `Eres un experto en planificación de viajes multimodales. Analiza estas ${alternatives.length} alternativas de ruta para el viaje ${waypoint_names?.join(' → ') || ''} con perfil de viajero "${profile_name || 'personalizado'}".

${routeSummaries}

Genera un análisis comparativo detallado en español con esta estructura:

## 🏆 Recomendación principal
Cuál es la mejor opción y por qué (2-3 frases directas)

## Análisis por opción (máx 5):
Para cada opción:
- ✅ **Ventajas** (2-3 puntos concretos)
- ⚠️ **Inconvenientes** (2-3 puntos)
- 💰 **Desglose de costes**: comenta las categorías más relevantes (combustible, peajes, billetes, seguros, etc.)
- 📋 **Restricciones**: licencias necesarias, reservas obligatorias, dependencia de horarios
- 💡 **Consejo práctico** específico para esta combinación

## 🔄 Tabla comparativa rápida
Resume en formato conciso: cuándo elegir cada opción (ej: "Si priorizas coste → Opción 2", "Si buscas aventura → Opción 3")

## ⚡ Consejos generales
2-3 tips prácticos para el itinerario completo.

Sé directo, aporta valor real con insights que no sean obvios. Usa datos concretos. Menciona implicaciones prácticas (dónde repostar, dónde cambiar de medio, necesidad de reservar con antelación, etc.)`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Eres un experto planificador de viajes multimodales con experiencia en logística de transporte en Europa. Respondes siempre en español con un tono profesional pero accesible. Conoces bien los costes reales, restricciones legales y aspectos prácticos de cada medio de transporte.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Límite de peticiones excedido. Inténtalo de nuevo en unos segundos.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos agotados. Añade fondos en Ajustes > Workspace > Usage.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const text = await response.text();
      console.error('AI gateway error:', response.status, text);
      return new Response(JSON.stringify({ error: 'Error en el análisis IA' }), {
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
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
