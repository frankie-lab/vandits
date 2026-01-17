import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Continent mapping for common countries
const CONTINENT_MAP: Record<string, string> = {
  // Europe
  'España': 'Europa', 'Spain': 'Europa',
  'Francia': 'Europa', 'France': 'Europa',
  'Alemania': 'Europa', 'Germany': 'Europa',
  'Italia': 'Europa', 'Italy': 'Europa',
  'Portugal': 'Europa',
  'Reino Unido': 'Europa', 'United Kingdom': 'Europa',
  'Países Bajos': 'Europa', 'Netherlands': 'Europa',
  'Bélgica': 'Europa', 'Belgium': 'Europa',
  'Suiza': 'Europa', 'Switzerland': 'Europa',
  'Austria': 'Europa',
  'Polonia': 'Europa', 'Poland': 'Europa',
  'Suecia': 'Europa', 'Sweden': 'Europa',
  'Noruega': 'Europa', 'Norway': 'Europa',
  'Dinamarca': 'Europa', 'Denmark': 'Europa',
  'Finlandia': 'Europa', 'Finland': 'Europa',
  'Grecia': 'Europa', 'Greece': 'Europa',
  'Irlanda': 'Europa', 'Ireland': 'Europa',
  'Chequia': 'Europa', 'Czech Republic': 'Europa', 'Czechia': 'Europa',
  'Rumanía': 'Europa', 'Romania': 'Europa',
  'Hungría': 'Europa', 'Hungary': 'Europa',
  'Croacia': 'Europa', 'Croatia': 'Europa',
  'Eslovaquia': 'Europa', 'Slovakia': 'Europa',
  'Eslovenia': 'Europa', 'Slovenia': 'Europa',
  'Bulgaria': 'Europa',
  'Serbia': 'Europa',
  'Ucrania': 'Europa', 'Ukraine': 'Europa',
  'Rusia': 'Europa', 'Russia': 'Europa',
  // Americas
  'Estados Unidos': 'América del Norte', 'United States': 'América del Norte', 'USA': 'América del Norte',
  'Canadá': 'América del Norte', 'Canada': 'América del Norte',
  'México': 'América del Norte', 'Mexico': 'América del Norte',
  'Brasil': 'América del Sur', 'Brazil': 'América del Sur',
  'Argentina': 'América del Sur',
  'Chile': 'América del Sur',
  'Colombia': 'América del Sur',
  'Perú': 'América del Sur', 'Peru': 'América del Sur',
  // Asia
  'China': 'Asia',
  'Japón': 'Asia', 'Japan': 'Asia',
  'Corea del Sur': 'Asia', 'South Korea': 'Asia',
  'India': 'Asia',
  'Tailandia': 'Asia', 'Thailand': 'Asia',
  'Vietnam': 'Asia',
  'Turquía': 'Asia', 'Turkey': 'Asia', 'Türkiye': 'Asia',
  // Africa
  'Marruecos': 'África', 'Morocco': 'África',
  'Egipto': 'África', 'Egypt': 'África',
  'Sudáfrica': 'África', 'South Africa': 'África',
  // Oceania
  'Australia': 'Oceanía',
  'Nueva Zelanda': 'Oceanía', 'New Zealand': 'Oceanía',
};

function getContinent(country: string): string {
  return CONTINENT_MAP[country] || 'Desconocido';
}

// Estructura jerárquica geográfica completa
interface DatosGeograficos {
  continente?: string;
  pais?: string;
  admin_nivel_1?: string;      // Estado/Comunidad Autónoma/Región/Land
  admin_nivel_2?: string;      // Provincia/Departamento/Condado
  admin_nivel_3?: string;      // Comarca/Municipio/Borough
  localidad?: string;          // Ciudad/Villa/Pueblo
  sublocalidad?: string;       // Barrio/Distrito urbano
  direccion_postal?: string;
  coordenadas?: string;
  fuente_geocoding?: 'nominatim' | 'ai' | 'manual';
}

async function reverseGeocode(lat: number, lng: number): Promise<{
  country?: string;
  region?: string;
  zone?: string;
  continent?: string;
  datos_geograficos?: DatosGeograficos;
}> {
  try {
    // Zoom 18 para máximo detalle
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'es,en',
          'User-Agent': 'GeoDataManager/1.0',
        },
      }
    );

    if (!response.ok) {
      console.error('Nominatim error:', response.status);
      return {};
    }

    const data = await response.json();
    const address = data.address || {};

    console.log('Nominatim raw address:', JSON.stringify(address));

    // Extraer jerarquía administrativa completa
    const country = address.country || undefined;
    const continent = country ? getContinent(country) : undefined;

    // Admin nivel 1: Estado/Comunidad Autónoma/Región/Land
    const admin_nivel_1 = address.state || address.region || address.province || undefined;
    
    // Admin nivel 2: Provincia/Departamento/Condado/Distrito
    const admin_nivel_2 = address.county || address.state_district || address.district || undefined;
    
    // Admin nivel 3: Comarca/Municipio/Borough
    const admin_nivel_3 = address.municipality || address.city_district || address.borough || address.suburb || undefined;
    
    // Localidad: Ciudad/Villa/Pueblo/Aldea
    const localidad = address.city || address.town || address.village || address.hamlet || undefined;
    
    // Sublocalidad: Barrio/Quarter
    const sublocalidad = address.neighbourhood || address.quarter || address.suburb || undefined;
    
    // Dirección postal si disponible
    let direccion_postal: string | undefined;
    if (address.road) {
      const parts = [address.road];
      if (address.house_number) parts.unshift(address.house_number);
      direccion_postal = parts.join(' ');
      if (address.postcode) direccion_postal += `, ${address.postcode}`;
    }

    // Para compatibilidad con campos existentes
    const region = admin_nivel_1;
    const zone = admin_nivel_2 || localidad;

    const datos_geograficos: DatosGeograficos = {
      continente: continent,
      pais: country,
      admin_nivel_1,
      admin_nivel_2,
      admin_nivel_3,
      localidad,
      sublocalidad,
      direccion_postal,
      coordenadas: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      fuente_geocoding: 'nominatim',
    };

    console.log('Geocoding result (extended):', datos_geograficos);

    return { country, region, zone, continent, datos_geograficos };
  } catch (error) {
    console.error('Geocoding error:', error);
    return {};
  }
}

// Delay function for rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { document_id, location_ids } = await req.json();
    
    console.log('Starting batch geocoding for document:', document_id, 'locations:', location_ids?.length || 'all');

    // Get locations to geocode
    let query = supabase
      .from('locations')
      .select('id, name, latitude, longitude, country, region, zone, continent, enriched_data')
      .is('country', null);
    
    if (document_id) {
      query = query.eq('document_id', document_id);
    }
    
    if (location_ids && location_ids.length > 0) {
      query = query.in('id', location_ids);
    }
    
    const { data: locations, error: fetchError } = await query.limit(500);
    
    if (fetchError) {
      console.error('Error fetching locations:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Error al obtener ubicaciones' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!locations || locations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No hay ubicaciones para geocodificar', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${locations.length} locations to geocode`);

    // Process locations synchronously (returns progress)
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      console.log(`Geocoding ${i + 1}/${locations.length}: ${loc.name}`);
      
      try {
        const result = await reverseGeocode(loc.latitude, loc.longitude);
        
        if (result.country) {
          // Merge datos_geograficos into enriched_data if it exists
          let updatedEnrichedData = loc.enriched_data || {};
          if (result.datos_geograficos) {
            updatedEnrichedData = {
              ...updatedEnrichedData,
              datos_geograficos: result.datos_geograficos,
            };
          }

          const { error: updateError } = await supabase
            .from('locations')
            .update({
              country: result.country,
              region: result.region,
              zone: result.zone,
              continent: result.continent,
              enriched_data: updatedEnrichedData,
            })
            .eq('id', loc.id);
          
          if (updateError) {
            console.error('Update error for', loc.name, ':', updateError);
            errorCount++;
          } else {
            console.log(`Updated ${loc.name}: ${result.country}, ${result.region}, ${result.zone}`);
            successCount++;
          }
        } else {
          console.log(`No geocoding result for ${loc.name}`);
          errorCount++;
        }
        
        // Rate limiting: Nominatim requires 1 req/sec
        if (i < locations.length - 1) {
          await delay(1100);
        }
      } catch (err) {
        console.error(`Error geocoding ${loc.name}:`, err);
        errorCount++;
      }
    }
    
    console.log(`Batch geocoding complete: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Geocodificación completada: ${successCount} éxitos, ${errorCount} errores`,
        total: locations.length,
        success_count: successCount,
        error_count: errorCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Batch geocode error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
