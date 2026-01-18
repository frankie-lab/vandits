import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 100 ubicaciones únicas globales para los usuarios de prueba
const testLocations = [
  // Europa
  { name: "Castillo de Neuschwanstein", lat: 47.5576, lng: 10.7498, country: "Alemania", continent: "Europa" },
  { name: "Coliseo Romano", lat: 41.8902, lng: 12.4922, country: "Italia", continent: "Europa" },
  { name: "Torre Eiffel", lat: 48.8584, lng: 2.2945, country: "Francia", continent: "Europa" },
  { name: "Sagrada Familia", lat: 41.4036, lng: 2.1744, country: "España", continent: "Europa" },
  { name: "Big Ben", lat: 51.5007, lng: -0.1246, country: "Reino Unido", continent: "Europa" },
  { name: "Acrópolis de Atenas", lat: 37.9715, lng: 23.7257, country: "Grecia", continent: "Europa" },
  { name: "Puente de Carlos", lat: 50.0865, lng: 14.4114, country: "Chequia", continent: "Europa" },
  { name: "Palacio de Schönbrunn", lat: 48.1845, lng: 16.3122, country: "Austria", continent: "Europa" },
  { name: "Rijksmuseum", lat: 52.3600, lng: 4.8852, country: "Países Bajos", continent: "Europa" },
  { name: "Muro de Berlín Memorial", lat: 52.5351, lng: 13.3900, country: "Alemania", continent: "Europa" },
  { name: "Catedral de Notre-Dame", lat: 48.8530, lng: 2.3499, country: "Francia", continent: "Europa" },
  { name: "Plaza de San Marcos", lat: 45.4341, lng: 12.3388, country: "Italia", continent: "Europa" },
  { name: "Alhambra", lat: 37.1760, lng: -3.5881, country: "España", continent: "Europa" },
  { name: "Castillo de Edimburgo", lat: 55.9486, lng: -3.1999, country: "Reino Unido", continent: "Europa" },
  { name: "Meteora", lat: 39.7217, lng: 21.6306, country: "Grecia", continent: "Europa" },
  { name: "Fiordos Noruegos - Geiranger", lat: 62.1008, lng: 7.2059, country: "Noruega", continent: "Europa" },
  { name: "Lago Bled", lat: 46.3625, lng: 14.0940, country: "Eslovenia", continent: "Europa" },
  { name: "Dubrovnik Murallas", lat: 42.6407, lng: 18.1082, country: "Croacia", continent: "Europa" },
  { name: "Palacio de Pena", lat: 38.7876, lng: -9.3906, country: "Portugal", continent: "Europa" },
  { name: "Aurora Boreal Tromsø", lat: 69.6496, lng: 18.9560, country: "Noruega", continent: "Europa" },
  { name: "Catedral de Colonia", lat: 50.9413, lng: 6.9583, country: "Alemania", continent: "Europa" },
  { name: "Mont Saint-Michel", lat: 48.6361, lng: -1.5115, country: "Francia", continent: "Europa" },
  { name: "Cinque Terre", lat: 44.1461, lng: 9.6439, country: "Italia", continent: "Europa" },
  { name: "Mezquita de Córdoba", lat: 37.8789, lng: -4.7794, country: "España", continent: "Europa" },
  { name: "Stonehenge", lat: 51.1789, lng: -1.8262, country: "Reino Unido", continent: "Europa" },
  
  // Asia
  { name: "Gran Muralla China - Badaling", lat: 40.3598, lng: 116.0201, country: "China", continent: "Asia" },
  { name: "Taj Mahal", lat: 27.1751, lng: 78.0421, country: "India", continent: "Asia" },
  { name: "Templo Fushimi Inari", lat: 34.9671, lng: 135.7727, country: "Japón", continent: "Asia" },
  { name: "Angkor Wat", lat: 13.4125, lng: 103.8670, country: "Camboya", continent: "Asia" },
  { name: "Petra", lat: 30.3285, lng: 35.4444, country: "Jordania", continent: "Asia" },
  { name: "Templo del Buda de Oro", lat: 13.7465, lng: 100.5134, country: "Tailandia", continent: "Asia" },
  { name: "Terrazas de Arroz Tegallalang", lat: -8.4312, lng: 115.2792, country: "Indonesia", continent: "Asia" },
  { name: "Capadocia", lat: 38.6431, lng: 34.8289, country: "Turquía", continent: "Asia" },
  { name: "Monte Fuji", lat: 35.3606, lng: 138.7274, country: "Japón", continent: "Asia" },
  { name: "Ha Long Bay", lat: 20.9101, lng: 107.1839, country: "Vietnam", continent: "Asia" },
  { name: "Palacio Potala", lat: 29.6574, lng: 91.1175, country: "Tíbet/China", continent: "Asia" },
  { name: "Marina Bay Sands", lat: 1.2834, lng: 103.8607, country: "Singapur", continent: "Asia" },
  { name: "Templos de Bagan", lat: 21.1717, lng: 94.8585, country: "Myanmar", continent: "Asia" },
  { name: "Ciudad Prohibida", lat: 39.9163, lng: 116.3972, country: "China", continent: "Asia" },
  { name: "Guerreros de Terracota", lat: 34.3848, lng: 109.2734, country: "China", continent: "Asia" },
  { name: "Templo Borobudur", lat: -7.6079, lng: 110.2038, country: "Indonesia", continent: "Asia" },
  { name: "Varanasi Ghats", lat: 25.3176, lng: 83.0068, country: "India", continent: "Asia" },
  { name: "DMZ Corea", lat: 37.9565, lng: 126.6778, country: "Corea del Sur", continent: "Asia" },
  { name: "Jardines de Suzhou", lat: 31.3256, lng: 120.6275, country: "China", continent: "Asia" },
  { name: "Templo Kinkaku-ji", lat: 35.0394, lng: 135.7292, country: "Japón", continent: "Asia" },
  
  // América
  { name: "Machu Picchu", lat: -13.1631, lng: -72.5450, country: "Perú", continent: "Sudamérica" },
  { name: "Cristo Redentor", lat: -22.9519, lng: -43.2105, country: "Brasil", continent: "Sudamérica" },
  { name: "Cataratas del Iguazú", lat: -25.6953, lng: -54.4367, country: "Argentina/Brasil", continent: "Sudamérica" },
  { name: "Salar de Uyuni", lat: -20.1338, lng: -67.4891, country: "Bolivia", continent: "Sudamérica" },
  { name: "Galápagos", lat: -0.9538, lng: -90.9656, country: "Ecuador", continent: "Sudamérica" },
  { name: "Torres del Paine", lat: -50.9423, lng: -73.4068, country: "Chile", continent: "Sudamérica" },
  { name: "Glaciar Perito Moreno", lat: -50.4967, lng: -73.1377, country: "Argentina", continent: "Sudamérica" },
  { name: "Gran Cañón", lat: 36.0544, lng: -112.1401, country: "EEUU", continent: "Norteamérica" },
  { name: "Estatua de la Libertad", lat: 40.6892, lng: -74.0445, country: "EEUU", continent: "Norteamérica" },
  { name: "Chichén Itzá", lat: 20.6843, lng: -88.5678, country: "México", continent: "Norteamérica" },
  { name: "Yellowstone", lat: 44.4280, lng: -110.5885, country: "EEUU", continent: "Norteamérica" },
  { name: "Cataratas del Niágara", lat: 43.0962, lng: -79.0377, country: "Canadá/EEUU", continent: "Norteamérica" },
  { name: "Teotihuacán", lat: 19.6925, lng: -98.8438, country: "México", continent: "Norteamérica" },
  { name: "Monument Valley", lat: 36.9980, lng: -110.0985, country: "EEUU", continent: "Norteamérica" },
  { name: "Antelope Canyon", lat: 36.8619, lng: -111.3743, country: "EEUU", continent: "Norteamérica" },
  { name: "Lago Moraine", lat: 51.3217, lng: -116.1860, country: "Canadá", continent: "Norteamérica" },
  { name: "Cenotes Yucatán", lat: 20.7655, lng: -87.4654, country: "México", continent: "Norteamérica" },
  { name: "Carretera Austral", lat: -43.7833, lng: -72.0667, country: "Chile", continent: "Sudamérica" },
  { name: "Líneas de Nazca", lat: -14.7390, lng: -75.1300, country: "Perú", continent: "Sudamérica" },
  { name: "Cartagena Murallas", lat: 10.4236, lng: -75.5477, country: "Colombia", continent: "Sudamérica" },
  
  // África
  { name: "Pirámides de Giza", lat: 29.9792, lng: 31.1342, country: "Egipto", continent: "África" },
  { name: "Victoria Falls", lat: -17.9244, lng: 25.8567, country: "Zambia/Zimbabue", continent: "África" },
  { name: "Serengeti", lat: -2.3333, lng: 34.8333, country: "Tanzania", continent: "África" },
  { name: "Table Mountain", lat: -33.9628, lng: 18.4098, country: "Sudáfrica", continent: "África" },
  { name: "Marrakech Medina", lat: 31.6295, lng: -7.9811, country: "Marruecos", continent: "África" },
  { name: "Desierto del Sahara - Merzouga", lat: 31.0801, lng: -4.0131, country: "Marruecos", continent: "África" },
  { name: "Kilimanjaro", lat: -3.0674, lng: 37.3556, country: "Tanzania", continent: "África" },
  { name: "Valle de los Reyes", lat: 25.7402, lng: 32.6014, country: "Egipto", continent: "África" },
  { name: "Cráter del Ngorongoro", lat: -3.2086, lng: 35.4877, country: "Tanzania", continent: "África" },
  { name: "Isla de Zanzíbar", lat: -6.1659, lng: 39.1989, country: "Tanzania", continent: "África" },
  { name: "Desierto de Namibia", lat: -24.7549, lng: 15.2877, country: "Namibia", continent: "África" },
  { name: "Delta del Okavango", lat: -19.2861, lng: 22.8485, country: "Botsuana", continent: "África" },
  { name: "Lalibela Iglesias", lat: 12.0319, lng: 39.0433, country: "Etiopía", continent: "África" },
  { name: "Fez Medina", lat: 34.0622, lng: -4.9769, country: "Marruecos", continent: "África" },
  { name: "Ciudad del Cabo", lat: -33.9249, lng: 18.4241, country: "Sudáfrica", continent: "África" },
  
  // Oceanía
  { name: "Ópera de Sídney", lat: -33.8568, lng: 151.2153, country: "Australia", continent: "Oceanía" },
  { name: "Gran Barrera de Coral", lat: -18.2871, lng: 147.6992, country: "Australia", continent: "Oceanía" },
  { name: "Uluru", lat: -25.3444, lng: 131.0369, country: "Australia", continent: "Oceanía" },
  { name: "Milford Sound", lat: -44.6414, lng: 167.8976, country: "Nueva Zelanda", continent: "Oceanía" },
  { name: "Hobbiton", lat: -37.8721, lng: 175.6830, country: "Nueva Zelanda", continent: "Oceanía" },
  { name: "Bora Bora", lat: -16.5004, lng: -151.7415, country: "Polinesia Francesa", continent: "Oceanía" },
  { name: "Rotorua Geysers", lat: -38.1368, lng: 176.2497, country: "Nueva Zelanda", continent: "Oceanía" },
  { name: "Twelve Apostles", lat: -38.6658, lng: 143.1050, country: "Australia", continent: "Oceanía" },
  { name: "Isla de Pascua", lat: -27.1127, lng: -109.3497, country: "Chile", continent: "Oceanía" },
  { name: "Fiordland", lat: -45.4154, lng: 167.7180, country: "Nueva Zelanda", continent: "Oceanía" },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar autenticación del usuario que llama
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Cliente con service role para crear usuarios
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Cliente con token del usuario para verificar permisos
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verificar que el usuario es master
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Usuario no autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'master');

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Solo usuarios master pueden crear usuarios de prueba' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = [];
    const timestamp = Date.now();

    // Crear 2 usuarios de prueba
    for (let i = 1; i <= 2; i++) {
      const email = `editor${i}_${timestamp}@test.local`;
      const password = `TestEditor${i}!2024`;
      const displayName = i === 1 ? 'Explorador Alpha' : 'Aventurera Beta';
      const username = i === 1 ? `explorador_alpha_${timestamp}` : `aventurera_beta_${timestamp}`;

      console.log(`Creando usuario ${i}: ${email}`);

      // Crear usuario en auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          full_name: displayName
        }
      });

      if (authError) {
        console.error(`Error creando usuario ${i}:`, authError);
        results.push({ email, error: authError.message });
        continue;
      }

      const userId = authData.user.id;
      console.log(`Usuario ${i} creado con ID: ${userId}`);

      // Asignar rol editor
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role: 'editor' });

      if (roleError) {
        console.error(`Error asignando rol a usuario ${i}:`, roleError);
      }

      // Crear documento para el usuario
      const documentId = crypto.randomUUID();
      const { error: docError } = await supabaseAdmin
        .from('documents')
        .insert({
          id: documentId,
          user_id: userId,
          name: `Rutas de ${displayName}`,
          original_filename: `rutas_${username}.kml`
        });

      if (docError) {
        console.error(`Error creando documento para usuario ${i}:`, docError);
        results.push({ email, userId, error: docError.message });
        continue;
      }

      // Seleccionar 50 ubicaciones para este usuario (diferentes para cada uno)
      const startIndex = (i - 1) * 50;
      const userLocations = testLocations.slice(startIndex, startIndex + 50);

      // Crear ubicaciones
      const locationsToInsert = userLocations.map((loc, idx) => ({
        id: crypto.randomUUID(),
        document_id: documentId,
        name: loc.name,
        latitude: loc.lat,
        longitude: loc.lng,
        country: loc.country,
        continent: loc.continent,
        visibility: 'public',
        description: `Punto de interés turístico: ${loc.name}. Ubicado en ${loc.country}, continente ${loc.continent}.`,
        place_type: 'tourist_attraction',
        custom_data: {
          source: 'test_data',
          created_by: 'create-test-users',
          index: idx + 1
        }
      }));

      const { error: locError } = await supabaseAdmin
        .from('locations')
        .insert(locationsToInsert);

      if (locError) {
        console.error(`Error creando ubicaciones para usuario ${i}:`, locError);
        results.push({ email, userId, documentId, locationsCreated: 0, error: locError.message });
      } else {
        console.log(`${locationsToInsert.length} ubicaciones creadas para usuario ${i}`);
        results.push({
          email,
          password,
          userId,
          documentId,
          displayName,
          role: 'editor',
          locationsCreated: locationsToInsert.length,
          success: true
        });
      }
    }

    return new Response(JSON.stringify({
      message: 'Usuarios de prueba creados',
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error general:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
