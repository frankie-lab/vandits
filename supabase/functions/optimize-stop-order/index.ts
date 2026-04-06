const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_URL = "https://ai.lovable.dev/v1/chat/completions";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { origin, destination, stops, transportMode, travelProfile } = await req.json();

    if (!origin || !destination || !stops || !Array.isArray(stops) || stops.length < 2) {
      return new Response(
        JSON.stringify({ error: "Se necesitan al menos 2 paradas intermedias para optimizar" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stopsDescription = stops
      .map((s: any, i: number) => `${i + 1}. "${s.name}" (lat: ${s.lat}, lng: ${s.lng})`)
      .join("\n");

    const prompt = `Eres un planificador de viajes experto. Tu tarea es optimizar el orden de las paradas intermedias para minimizar la distancia total recorrida y maximizar la lógica geográfica del itinerario.

ORIGEN: "${origin.name}" (lat: ${origin.latitude}, lng: ${origin.longitude})
DESTINO: "${destination.name}" (lat: ${destination.latitude}, lng: ${destination.longitude})

PARADAS INTERMEDIAS (orden actual):
${stopsDescription}

MODO DE TRANSPORTE: ${transportMode}
PERFIL DE VIAJERO: ${travelProfile || "balanced"}

INSTRUCCIONES:
1. Analiza las coordenadas geográficas de todas las paradas.
2. Calcula el orden óptimo que minimice la distancia total desde el origen, pasando por todas las paradas, hasta el destino.
3. Considera la lógica geográfica: evita retrocesos y cruces innecesarios.
4. Para el modo "${transportMode}", ten en cuenta las carreteras/rutas disponibles.

Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "optimizedOrder": [0, 2, 1, 3],
  "explanation": "Breve explicación del porqué este orden es mejor",
  "estimatedSavingsPercent": 15,
  "wasAlreadyOptimal": false
}

Donde "optimizedOrder" es un array con los ÍNDICES ORIGINALES (0-based) de las paradas en el nuevo orden óptimo.
Si el orden actual ya es óptimo, pon wasAlreadyOptimal: true y devuelve el mismo orden.`;

    const aiResponse = await fetch(LOVABLE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Responde SOLO con JSON válido, sin markdown ni texto adicional." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", errText);
      return new Response(
        JSON.stringify({ error: "Error al consultar la IA" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Respuesta de IA no válida" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate optimizedOrder
    const order = parsed.optimizedOrder;
    if (!Array.isArray(order) || order.length !== stops.length) {
      return new Response(
        JSON.stringify({ error: "Orden optimizado inválido" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
