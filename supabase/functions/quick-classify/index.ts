import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LocationData {
  id: string;
  name: string;
  description?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  country?: string;
  region?: string;
  enrichedData?: {
    descripcion?: string;
    datos_clave?: {
      tipo?: string;
    };
  };
}

const CLASSIFICATION_TREE = `
ÁRBOL GLOBAL DE CLASIFICACIÓN DE PUNTOS GEOGRÁFICOS

1. Asentamientos humanos
   1.1 Ciudad
   1.2 Villa / Pueblo
   1.3 Aldea / Núcleo rural
   1.4 Barrio / Distrito urbano
   1.5 Área habitada dispersa

2. Entidades construidas (antropogénicas)
   2.1 Edificio
       2.1.1 Monumento
       2.1.2 Edificio histórico
       2.1.3 Edificio religioso
       2.1.4 Edificio residencial singular
   2.2 Establecimiento (actividad o servicio)
       2.2.1 Restaurante / Bar
       2.2.2 Hotel / Alojamiento
       2.2.3 Comercio
       2.2.4 Empresa
       2.2.5 Servicio público
   2.3 Infraestructura puntual
       2.3.1 Faro
       2.3.2 Torre / Antena
       2.3.3 Presa
       2.3.4 Estación
       2.3.5 Subestación / Instalación técnica
   2.4 Infraestructura lineal
       2.4.1 Carretera
       2.4.2 Vía férrea
       2.4.3 Canal / Acueducto
       2.4.4 Muralla / Línea defensiva
   2.5 Complejo / Recinto
       2.5.1 Campus
       2.5.2 Puerto
       2.5.3 Aeropuerto
       2.5.4 Parque industrial
       2.5.5 Recinto histórico

3. Lugares de interés (categoría semántica, nunca genérica)
   3.1 Lugar de interés cultural
   3.2 Lugar de interés histórico
   3.3 Lugar de interés turístico
   3.4 Lugar simbólico o tradicional
   3.5 Mirador / Punto panorámico

4. Accidentes geográficos (naturales)
   4.1 Accidente geográfico mayor
       4.1.1 Montaña
       4.1.2 Sierra
       4.1.3 Río
       4.1.4 Lago
       4.1.5 Isla
       4.1.6 Desierto
   4.2 Accidente geográfico menor
       4.2.1 Valle
       4.2.2 Playa
       4.2.3 Cabo
       4.2.4 Acantilado
       4.2.5 Cueva
       4.2.6 Cascada

5. Espacios naturales delimitados
   5.1 Parque nacional
   5.2 Parque natural
   5.3 Reserva natural
   5.4 Espacio protegido local
   5.5 Espacio natural no protegido
`;

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

    console.log('Quick classifying location:', location.name);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build context from existing data
    const existingDescription = location.enrichedData?.descripcion || location.description || '';
    const existingType = location.enrichedData?.datos_clave?.tipo || '';

    const systemPrompt = `Eres un clasificador experto de puntos geográficos. Tu tarea es asignar la clasificación más precisa del siguiente árbol:

${CLASSIFICATION_TREE}

INSTRUCCIONES:
1. Analiza el nombre, descripción y tipo del lugar
2. Asigna el código más específico posible (ej: "2.1.3" para un edificio religioso)
3. Responde SOLO con un JSON válido

Responde con este formato exacto:
{
  "clasificacion": {
    "categoria_principal": "X. Nombre de categoría principal",
    "subcategoria": "X.X Nombre de subcategoría",
    "tipo_especifico": "X.X.X Nombre específico (si aplica, null si no)",
    "codigo": "X.X.X o X.X"
  }
}`;

    const userPrompt = `Clasifica este punto geográfico:

Nombre: ${location.name}
Coordenadas: ${location.coordinates.lat}, ${location.coordinates.lng}
País: ${location.country || 'Desconocido'}
Región: ${location.region || 'Desconocida'}
Tipo existente: ${existingType || 'No especificado'}
Descripción: ${existingDescription.substring(0, 500)}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite', // Faster model for classification
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
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
          JSON.stringify({ error: 'Créditos de IA agotados.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON response
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) cleanContent = cleanContent.slice(7);
    if (cleanContent.startsWith('```')) cleanContent = cleanContent.slice(3);
    if (cleanContent.endsWith('```')) cleanContent = cleanContent.slice(0, -3);
    
    const parsed = JSON.parse(cleanContent.trim());
    const clasificacion = parsed.clasificacion;

    if (!clasificacion || !clasificacion.codigo) {
      throw new Error('Invalid classification response');
    }

    console.log('Classification result:', clasificacion);

    // Update the location in the database - merge with existing enriched_data
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current enriched_data
    const { data: currentLocation, error: fetchError } = await supabase
      .from('locations')
      .select('enriched_data')
      .eq('id', location.id)
      .single();

    if (fetchError) {
      console.error('Error fetching current location:', fetchError);
      throw fetchError;
    }

    // Merge clasificacion into existing enriched_data
    const updatedEnrichedData = {
      ...(currentLocation?.enriched_data || {}),
      clasificacion
    };

    const { error: updateError } = await supabase
      .from('locations')
      .update({ 
        enriched_data: updatedEnrichedData,
        updated_at: new Date().toISOString()
      })
      .eq('id', location.id);

    if (updateError) {
      console.error('Error updating location:', updateError);
      throw updateError;
    }

    console.log('Location classified successfully:', location.name);

    return new Response(
      JSON.stringify({ 
        success: true, 
        clasificacion,
        message: `Clasificado como ${clasificacion.codigo}: ${clasificacion.subcategoria || clasificacion.categoria_principal}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Quick classify error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
