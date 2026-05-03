## Problema

Al enriquecer un punto, el LLM recibe `name` y `coordinates` como si fueran coherentes. Cuando el KML/GPX trae un nombre que NO coincide con el lugar real de esas coordenadas (ej: "Castillo de Mesones de Isuela" en coordenadas del Monasterio de Piedra), el modelo redacta sobre el nombre e inventa que ese castillo está en esas coordenadas. No existe ningún chequeo previo de coherencia.

## Solución: validador de coherencia nombre↔coordenadas

Añadir un paso de verificación **antes** de llamar al LLM en `supabase/functions/enrich-location/index.ts`. Si el nombre no se corresponde con lo que hay en esas coordenadas, abortar el enriquecimiento automático y devolver candidatos para que el usuario decida.

### 1. Nuevo paso `validateNameCoordinateCoherence(name, lat, lng)`

Antes del prompt al LLM:

a) **Wikipedia geosearch por coordenadas** (radio 2 km): obtiene los artículos cercanos al punto físico.

b) **Wikipedia search por nombre**: busca el artículo del nombre dado y, si tiene coordenadas (`coordinates` prop de la API), calcula su distancia real al punto.

c) **Decisión**:
- Si el artículo del nombre existe y está a **≤ 2 km** de las coordenadas → coherente, continuar normal.
- Si el artículo del nombre existe pero está a **> 2 km** → **incoherencia**: abortar.
- Si no se encuentra artículo del nombre pero hay candidatos cercanos con `matchScore < 30` → ambiguo: tratar como punto sin identidad (mismo flujo que ya existe para "nameMissing").

d) **Respuesta de incoherencia** (nuevo shape):
```json
{
  "success": false,
  "reason": "name_coordinate_mismatch",
  "providedName": "Castillo de Mesones de Isuela",
  "nameLocation": { "lat": 41.55, "lng": -1.54, "distanceKm": 51 },
  "nearbyCandidates": [
    { "name": "Monasterio de Piedra", "distanceM": 120, "wikiUrl": "...", "summary": "..." }
  ]
}
```

### 2. Cliente: `triggerEnrichLocation` reacciona al mismatch

En `src/domains/content/lib/enrich-location.ts`, cuando la edge function devuelva `reason: 'name_coordinate_mismatch'`:

- No marcar como `enriched`.
- Lanzar evento `open-nearby-context` con `reason: 'name-coordinate-mismatch'` y los `nearbyCandidates` precargados.
- Mostrar toast: "El nombre no coincide con la ubicación. Selecciona el punto correcto o corrige las coordenadas."

### 3. Panel Contexto cercano: dos acciones nuevas

En el panel ya existente (`PointContextActions` / proximity context):

- **"Aceptar este lugar"** sobre un candidato → actualiza `name` del waypoint con el del candidato y dispara el enriquecimiento normal (las coordenadas ya estaban OK).
- **"Mantener nombre, mover a su ubicación real"** → actualiza las coordenadas del waypoint a las del artículo del nombre (`nameLocation`) y dispara enriquecimiento.

Esto cubre los dos casos posibles de incoherencia: nombre equivocado o coordenadas equivocadas.

### 4. Logs

Añadir `console.log` claros en la edge function:
- `[enrich] coherence check: name="X" provided=(lat,lng) nameWikiAt=(lat,lng) distance=Nkm → MISMATCH/OK`

Para que en futuros casos como el del Castillo se vea inmediatamente en `edge_function_logs` por qué se abortó.

## Archivos a modificar

- `supabase/functions/enrich-location/index.ts` — añadir `validateNameCoordinateCoherence` y rama de respuesta antes del prompt.
- `src/domains/content/lib/enrich-location.ts` — manejar `reason: 'name_coordinate_mismatch'` y precargar candidatos al evento.
- `src/domains/content/components/PointContextActions.tsx` (o equivalente del panel proximity) — añadir las dos acciones (aceptar nombre del candidato / mover coordenadas).
- `mem://logic/enrichment/name-coordinate-coherence.md` (nuevo) + entrada en `mem://index.md`.

## Umbral

Distancia de tolerancia: **2 km**. Justificación: Wikipedia geocoding tiene ruido de ~hasta 1 km en algunos artículos; <2 km cubre el caso "coordenada del centroide del pueblo vs el monumento" sin dar falso positivo. >2 km ya es un lugar distinto.

## Lo que NO se cambia

- Sigue siendo válido el flujo `nameMissing && descMissing` que ya redirige al panel.
- No se toca el prompt del LLM.
- No se mueven coordenadas automáticamente sin acción del usuario.
