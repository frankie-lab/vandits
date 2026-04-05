const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const DUFFEL_API_URL = 'https://api.duffel.com'

const SearchSchema = z.object({
  origin_iata: z.string().length(3),
  destination_iata: z.string().length(3),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.number().int().min(1).max(9).default(1),
  cabin_class: z.enum(['economy', 'premium_economy', 'business', 'first']).default('economy'),
  max_results: z.number().int().min(1).max(10).default(3),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const DUFFEL_API_TOKEN = Deno.env.get('DUFFEL_API_TOKEN')
    if (!DUFFEL_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'DUFFEL_API_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const parsed = SearchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { origin_iata, destination_iata, departure_date, passengers, cabin_class, max_results } = parsed.data

    // Step 1: Create an offer request
    const offerRequestBody = {
      data: {
        slices: [
          {
            origin: origin_iata,
            destination: destination_iata,
            departure_date,
          },
        ],
        passengers: Array.from({ length: passengers }, () => ({ type: 'adult' as const })),
        cabin_class,
        max_connections: 1,
      },
    }

    const offerRes = await fetch(`${DUFFEL_API_URL}/air/offer_requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DUFFEL_API_TOKEN}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(offerRequestBody),
    })

    if (!offerRes.ok) {
      const errBody = await offerRes.text()
      console.error(`Duffel API error [${offerRes.status}]:`, errBody)
      return new Response(
        JSON.stringify({ error: 'Duffel API error', status: offerRes.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const offerData = await offerRes.json()
    const offers = offerData.data?.offers ?? []

    // Sort by price, take top N
    const sortedOffers = offers
      .sort((a: any, b: any) => parseFloat(a.total_amount) - parseFloat(b.total_amount))
      .slice(0, max_results)

    // Map to a simplified response
    const results = sortedOffers.map((offer: any) => {
      const slice = offer.slices?.[0]
      const segments = slice?.segments ?? []
      const firstSeg = segments[0]
      const lastSeg = segments[segments.length - 1]

      return {
        id: offer.id,
        price: {
          amount: parseFloat(offer.total_amount),
          currency: offer.total_currency,
        },
        airline: {
          name: firstSeg?.marketing_carrier?.name ?? 'Unknown',
          iata: firstSeg?.marketing_carrier?.iata_code ?? '',
          logo: firstSeg?.marketing_carrier?.logo_symbol_url ?? null,
        },
        departure: {
          airport: firstSeg?.origin?.iata_code,
          time: firstSeg?.departing_at,
        },
        arrival: {
          airport: lastSeg?.destination?.iata_code,
          time: lastSeg?.arriving_at,
        },
        duration: slice?.duration ?? null,
        stops: Math.max(0, segments.length - 1),
        cabin_class: offer.cabin_class ?? cabin_class,
      }
    })

    return new Response(
      JSON.stringify({ 
        offers: results,
        origin: origin_iata,
        destination: destination_iata,
        date: departure_date,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('search-flights error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
