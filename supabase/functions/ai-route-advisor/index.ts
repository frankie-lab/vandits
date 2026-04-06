import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WaypointInput {
  name: string
  lat: number
  lng: number
}

interface RouteContext {
  origin: WaypointInput
  destination: WaypointInput
  directDistanceKm: number
  hasSeaCrossing: boolean
  travelProfile: string
  availableModes: string[]
  priorityRanking?: string[]
  currentTransportMode?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: RouteContext = await req.json()
    const {
      origin, destination, directDistanceKm, hasSeaCrossing,
      travelProfile, availableModes, priorityRanking, currentTransportMode,
    } = body

    // Load transport modes from DB for richer context
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseKey)

    const { data: modesData } = await sb
      .from('transport_modes')
      .select('code, name, category, avg_speed_kmh, cost_per_km, base_cost, max_range_km, is_motorized, requires_schedule, requires_booking, score_comfort, score_flexibility, score_autonomy, score_risk, score_scenic')
      .eq('is_active', true)
      .in('code', availableModes.length > 0 ? availableModes : ['own_car', 'walking'])

    // Build context for AI
    const modesDescription = (modesData || []).map(m =>
      `- ${m.name} (${m.code}): ${m.category}, ${m.avg_speed_kmh}km/h, €${m.cost_per_km}/km + €${m.base_cost} base, rango máx: ${m.max_range_km || 'ilimitado'}km, confort: ${m.score_comfort}/10, flexibilidad: ${m.score_flexibility}/10, paisaje: ${m.score_scenic}/10, riesgo: ${m.score_risk}/10`
    ).join('\n')

    const systemPrompt = `Eres un experto planificador de viajes multimodal. Analiza el contexto del viaje y recomienda el modo de transporte más adecuado para cada segmento.

Reglas:
1. Solo recomienda modos que estén en la lista de disponibles del usuario.
2. Considera la distancia, geografía (mar, montaña, islas), perfil del viajero y prioridades.
3. Si hay cruce de mar, DEBES incluir ferry o vuelo como opción.
4. Prioriza según el ranking del viajero (si se proporciona).
5. Sé conciso y práctico.`

    const userPrompt = `## Viaje
- Origen: ${origin.name} (${origin.lat}, ${origin.lng})
- Destino: ${destination.name} (${destination.lat}, ${destination.lng})
- Distancia directa: ${directDistanceKm.toFixed(0)} km
- ¿Cruce marítimo?: ${hasSeaCrossing ? 'SÍ' : 'No'}
- Modo actual seleccionado: ${currentTransportMode || 'driving'}
- Perfil del viajero: ${travelProfile}
${priorityRanking ? `- Prioridades (orden): ${priorityRanking.join(' > ')}` : ''}

## Modos disponibles del usuario
${modesDescription || 'No hay datos de modos disponibles.'}

Responde con un JSON con esta estructura exacta:
{
  "recommendation": {
    "primaryMode": "código_del_modo",
    "reason": "explicación breve de por qué este modo es el mejor",
    "alternativeModes": ["modo2", "modo3"],
    "warnings": ["advertencia si hay algún riesgo o limitación"],
    "segments": [
      {
        "description": "Descripción del tramo",
        "mode": "código",
        "estimatedTimeHours": 2.5,
        "reason": "por qué este modo para este tramo"
      }
    ],
    "tips": ["consejo práctico para el viaje"]
  }
}`

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'recommend_transport',
            description: 'Provide transport mode recommendation for a trip segment',
            parameters: {
              type: 'object',
              properties: {
                recommendation: {
                  type: 'object',
                  properties: {
                    primaryMode: { type: 'string', description: 'Transport mode code' },
                    reason: { type: 'string', description: 'Why this mode is best' },
                    alternativeModes: { type: 'array', items: { type: 'string' } },
                    warnings: { type: 'array', items: { type: 'string' } },
                    segments: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          description: { type: 'string' },
                          mode: { type: 'string' },
                          estimatedTimeHours: { type: 'number' },
                          reason: { type: 'string' },
                        },
                        required: ['description', 'mode', 'reason'],
                      },
                    },
                    tips: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['primaryMode', 'reason', 'alternativeModes', 'segments'],
                },
              },
              required: ['recommendation'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'recommend_transport' } },
      }),
    })

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Add credits.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const errText = await aiResponse.text()
      console.error('AI gateway error:', aiResponse.status, errText)
      return new Response(JSON.stringify({ error: 'AI gateway error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiData = await aiResponse.json()
    
    // Extract tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]
    let recommendation = null
    
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments)
        recommendation = parsed.recommendation
      } catch {
        console.error('Failed to parse AI tool call arguments')
      }
    }

    if (!recommendation) {
      // Fallback: try content
      const content = aiData.choices?.[0]?.message?.content
      if (content) {
        try {
          const parsed = JSON.parse(content)
          recommendation = parsed.recommendation || parsed
        } catch {
          recommendation = {
            primaryMode: currentTransportMode || 'own_car',
            reason: content.slice(0, 200),
            alternativeModes: [],
            segments: [],
            warnings: ['No se pudo estructurar la respuesta de IA'],
          }
        }
      }
    }

    return new Response(JSON.stringify({ recommendation }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('ai-route-advisor error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
