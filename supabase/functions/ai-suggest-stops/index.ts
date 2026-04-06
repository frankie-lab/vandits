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

interface SuggestStopsRequest {
  origin: WaypointInput
  destination: WaypointInput
  existingWaypoints?: WaypointInput[]
  totalDistanceKm: number
  transportMode: string
  travelProfile: string
  interestTypes?: string[]
  maxStops?: number
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

    const body: SuggestStopsRequest = await req.json()
    const {
      origin, destination, existingWaypoints = [],
      totalDistanceKm, transportMode, travelProfile,
      interestTypes = ['cultural', 'naturaleza', 'gastronomía', 'pueblo con encanto'],
      maxStops = 5,
    } = body

    // Load travel profile for context
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseKey)

    const { data: profileData } = await sb
      .from('travel_profiles')
      .select('name, description')
      .eq('code', travelProfile)
      .maybeSingle()

    const profileDesc = profileData
      ? `${profileData.name}: ${profileData.description || ''}`
      : `Perfil: ${travelProfile}`

    const existingList = existingWaypoints.length > 0
      ? `\n\n## Paradas ya incluidas\n${existingWaypoints.map((wp, i) => `- ${wp.name} (${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})`).join('\n')}`
      : ''

    const systemPrompt = `Eres un experto viajero que conoce Europa y el mundo. Tu tarea es sugerir paradas intermedias interesantes en una ruta por carretera.

Reglas:
1. Sugiere lugares REALES con coordenadas EXACTAS (no inventadas).
2. Los lugares deben estar geográficamente entre el origen y el destino, no desviaciones enormes.
3. Adapta las sugerencias al perfil del viajero y sus intereses.
4. Incluye una mezcla de tipos: ciudades, pueblos, miradores, parques naturales, etc.
5. Para cada lugar, explica brevemente por qué merece la pena parar.
6. No repitas paradas que ya están en el itinerario.
7. Ordena las paradas en el orden geográfico natural de la ruta (de origen a destino).
8. Máximo ${maxStops} sugerencias.`

    const userPrompt = `## Ruta
- Origen: ${origin.name} (${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)})
- Destino: ${destination.name} (${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)})
- Distancia total: ${totalDistanceKm.toFixed(0)} km
- Modo: ${transportMode}
- Perfil: ${profileDesc}
- Intereses: ${interestTypes.join(', ')}
- Máx. paradas a sugerir: ${maxStops}${existingList}

Sugiere las mejores paradas intermedias para este viaje.`

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
            name: 'suggest_stops',
            description: 'Suggest intermediate stops for a road trip',
            parameters: {
              type: 'object',
              properties: {
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: 'Place name' },
                      lat: { type: 'number', description: 'Latitude' },
                      lng: { type: 'number', description: 'Longitude' },
                      type: { type: 'string', description: 'Type: city, town, viewpoint, nature, gastronomy, monument, etc.' },
                      reason: { type: 'string', description: 'Why this stop is worth it' },
                      estimatedStopMinutes: { type: 'number', description: 'Suggested time to spend there in minutes' },
                      highlights: { type: 'array', items: { type: 'string' }, description: 'Key things to see/do' },
                    },
                    required: ['name', 'lat', 'lng', 'type', 'reason'],
                  },
                },
              },
              required: ['suggestions'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'suggest_stops' } },
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
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]
    let suggestions = null

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments)
        suggestions = parsed.suggestions
      } catch {
        console.error('Failed to parse AI tool call arguments')
      }
    }

    if (!suggestions) {
      const content = aiData.choices?.[0]?.message?.content
      if (content) {
        try {
          const parsed = JSON.parse(content)
          suggestions = parsed.suggestions || []
        } catch {
          suggestions = []
        }
      }
    }

    return new Response(JSON.stringify({ suggestions: suggestions || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('ai-suggest-stops error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
