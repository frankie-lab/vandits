import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LocationData {
  id: string;
  name: string;
  description?: string;
  country?: string;
  region?: string;
  zone?: string;
  continent?: string;
  enriched_data?: {
    nombre_lugar?: string;
    descripcion?: string;
    punto_destacado?: string;
    etiquetas?: string[];
    datos_clave?: {
      tipo?: string;
    };
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, documentIds, limit = 20 } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all enriched locations
    let locationsQuery = supabase
      .from("locations")
      .select("id, name, description, country, region, zone, continent, enriched_data")
      .not("enriched_data", "is", null);

    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      locationsQuery = locationsQuery.in("document_id", documentIds);
    }

    const { data: locations, error: locationsError } = await locationsQuery;

    if (locationsError) {
      console.error("Error fetching locations:", locationsError);
      return new Response(
        JSON.stringify({ error: "Error fetching locations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!locations || locations.length === 0) {
      return new Response(
        JSON.stringify({ results: [], message: "No enriched locations to search" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a condensed representation of locations for the AI
    const locationSummaries = locations.map((loc: LocationData) => {
      const enriched = loc.enriched_data;
      return {
        id: loc.id,
        name: enriched?.nombre_lugar || loc.name,
        type: enriched?.datos_clave?.tipo || "lugar",
        highlight: enriched?.punto_destacado || "",
        tags: enriched?.etiquetas?.join(", ") || "",
        location: [loc.zone, loc.region, loc.country, loc.continent].filter(Boolean).join(", "),
        desc: (enriched?.descripcion || loc.description || "").slice(0, 200),
      };
    });

    // Use AI to find semantically relevant locations
    const systemPrompt = `Eres un experto en turismo y geografía. Tu tarea es analizar una consulta de búsqueda del usuario y encontrar las ubicaciones más relevantes de la lista proporcionada.

REGLAS:
1. Interpreta la intención del usuario (ej: "playas tranquilas" = buscar playas con descripción de tranquilidad, "pueblos con encanto" = pueblos pequeños pintorescos)
2. Considera sinónimos y conceptos relacionados
3. Evalúa la relevancia basándote en: nombre, tipo, descripción, etiquetas, punto destacado
4. Devuelve SOLO los IDs de las ubicaciones relevantes, ordenados por relevancia (máximo ${limit})
5. Si no hay resultados relevantes, devuelve un array vacío

Responde SOLO con un JSON válido con este formato exacto:
{
  "matches": ["id1", "id2", "id3"],
  "reasoning": "Breve explicación de por qué estos lugares coinciden con la búsqueda"
}`;

    const userPrompt = `Búsqueda del usuario: "${query}"

Ubicaciones disponibles (${locationSummaries.length} total):
${JSON.stringify(locationSummaries, null, 0)}`;

    console.log(`Semantic search for: "${query}" across ${locations.length} locations`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Límite de peticiones excedido, intenta de nuevo en unos segundos" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA agotados" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Error en el servicio de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse AI response
    let matches: string[] = [];
    let reasoning = "";

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        matches = parsed.matches || [];
        reasoning = parsed.reasoning || "";
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError, content);
      // Fallback: try to extract IDs from the response
      const idMatches = content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
      if (idMatches) {
        matches = idMatches.slice(0, limit);
      }
    }

    // Get full location data for matches
    const matchedLocations = matches
      .map(id => locations.find((loc: LocationData) => loc.id === id))
      .filter(Boolean);

    console.log(`Found ${matchedLocations.length} semantic matches for "${query}"`);

    return new Response(
      JSON.stringify({
        results: matchedLocations,
        reasoning,
        query,
        totalSearched: locations.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Semantic search error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
