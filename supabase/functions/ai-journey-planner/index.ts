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

interface JourneyPlanRequest {
  waypoints: WaypointInput[]
  totalDistanceKm: number
  totalDurationHours: number
  transportMode: string
  travelProfile: string
  maxDrivingHoursPerDay?: number
  preferredStopTypes?: string[]
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

    const body: JourneyPlanRequest = await req.json()
    const {
      waypoints, totalDistanceKm, totalDurationHours,
      transportMode, travelProfile,
      maxDrivingHoursPerDay = 6,
      preferredStopTypes = ['ciudad', 'pueblo con encanto', 'zona natural'],
    } = body

    if (!waypoints || waypoints.length < 2) {
      return new Response(JSON.stringify({ error: 'Se necesitan al menos 2 waypoints' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load travel profile data for richer context
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseKey)

    const { data: profileData } = await sb
      .from('travel_profiles')
      .select('name, description, weight_comfort, weight_scenic, weight_cost, weight_time')
      .eq('code', travelProfile)
      .maybeSingle()

    const profileDescription = profileData
      ? `${profileData.name}: ${profileData.description || ''}. Prioridades: confort=${profileData.weight_comfort}, paisaje=${profileData.weight_scenic}, coste=${profileData.weight_cost}, tiempo=${profileData.weight_time}`
      : `Perfil: ${travelProfile}`

    const waypointsList = waypoints.map((wp, i) =>
      `${i + 1}. ${wp.name} (${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})`
    ).join('\n')

    const systemPrompt = `Eres un experto planificador de viajes por carretera. Tu tarea es dividir un viaje largo en jornadas diarias realistas y agradables.

Reglas:
1. Máximo ${maxDrivingHoursPerDay} horas de conducción efectiva por día.
2. Sugiere paradas para dormir en lugares interesantes o prácticos (no en medio de la nada).
3. Incluye pausas para comer y descansar.
4. Adapta las jornadas al perfil del viajero.
5. Indica la hora aproximada de salida y llegada de cada día.
6. Sugiere tipos de alojamiento coherentes con el perfil (camping, hotel, hostal, etc.).
7. Si el viaje es corto (< ${maxDrivingHoursPerDay}h), indica que se puede hacer en un solo día.
8. Usa nombres de ciudades/pueblos reales que estén en la ruta.`

    const userPrompt = `## Viaje a planificar
- Distancia total: ${totalDistanceKm.toFixed(0)} km
- Duración estimada de conducción: ${totalDurationHours.toFixed(1)} horas
- Modo de transporte: ${transportMode}
- Perfil del viajero: ${profileDescription}
- Tipos de parada preferidos: ${preferredStopTypes.join(', ')}
- Máx. horas conducción/día: ${maxDrivingHoursPerDay}

## Waypoints del itinerario
${waypointsList}

Genera un plan de viaje día a día.`

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
            name: 'create_journey_plan',
            description: 'Create a day-by-day journey plan for a road trip',
            parameters: {
              type: 'object',
              properties: {
                journeyPlan: {
                  type: 'object',
                  properties: {
                    totalDays: { type: 'number', description: 'Total number of travel days' },
                    summary: { type: 'string', description: 'Brief overview of the journey plan' },
                    days: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          dayNumber: { type: 'number' },
                          title: { type: 'string', description: 'Short title for the day, e.g. "Barcelona → Zaragoza"' },
                          departureTime: { type: 'string', description: 'Suggested departure time, e.g. "09:00"' },
                          arrivalTime: { type: 'string', description: 'Estimated arrival time, e.g. "16:00"' },
                          drivingHours: { type: 'number', description: 'Hours of effective driving' },
                          distanceKm: { type: 'number', description: 'Approximate distance in km' },
                          overnightStop: { type: 'string', description: 'City/town name to spend the night' },
                          overnightLat: { type: 'number', description: 'Latitude of overnight stop' },
                          overnightLng: { type: 'number', description: 'Longitude of overnight stop' },
                          accommodationType: { type: 'string', description: 'Suggested accommodation type' },
                          lunchStop: { type: 'string', description: 'Suggested lunch stop city/town' },
                          highlights: { type: 'array', items: { type: 'string' }, description: 'Points of interest along the way' },
                          tips: { type: 'array', items: { type: 'string' }, description: 'Practical tips for the day' },
                        },
                        required: ['dayNumber', 'title', 'drivingHours', 'distanceKm', 'overnightStop'],
                      },
                    },
                    generalTips: { type: 'array', items: { type: 'string' }, description: 'General tips for the whole journey' },
                  },
                  required: ['totalDays', 'summary', 'days'],
                },
              },
              required: ['journeyPlan'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'create_journey_plan' } },
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
    let journeyPlan = null

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments)
        journeyPlan = parsed.journeyPlan
      } catch {
        console.error('Failed to parse AI tool call arguments')
      }
    }

    if (!journeyPlan) {
      const content = aiData.choices?.[0]?.message?.content
      if (content) {
        try {
          const parsed = JSON.parse(content)
          journeyPlan = parsed.journeyPlan || parsed
        } catch {
          journeyPlan = {
            totalDays: 1,
            summary: content.slice(0, 300),
            days: [],
            generalTips: ['No se pudo estructurar la respuesta de IA'],
          }
        }
      }
    }

    return new Response(JSON.stringify({ journeyPlan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('ai-journey-planner error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
