## Objetivo
Cerrar la norma de coherencia identidad↔coordenadas en sus **dos direcciones** y resolver el conflicto SIEMPRE dentro del popup del propio punto, con lista de candidatos elegible por el usuario.

## Las dos direcciones del problema

### Caso A — Coordenadas correctas, nombre dudoso
Ya cubierto hoy (con el fix de Isola/Isla que entra en el plan anterior):
- Hay artículo Wikipedia cerca de las coords con nombre compatible → OK.
- El homónimo lejano sólo bloquea si además no comparte país/región/localidad del POI.

### Caso B — Nombre + país + región + provincia/comarca + localidad coinciden, pero las coordenadas caen lejos
Hoy NO se está detectando como tal: simplemente entra por la rama A, no encuentra cercano, encuentra el homónimo textual y aborta con un mensaje genérico de “está a X km”.

Lo correcto:
1. Resolver el bloque administrativo del POI (lo que ya tenemos: continent / country / region / zone / admin3 / locality / sublocality).
2. Resolver el bloque administrativo del **candidato textual** (mejor match Wikipedia/Wikidata por nombre).
3. Comparar bloques nivel a nivel:
   - **Si TODOS los niveles administrativos resuelven al mismo nodo** (mismo ISO α2 país, mismo ISO 3166-2 región, misma localidad…) y aun así la distancia entre coords es > umbral → es muy probablemente un **error de coordenadas**, no de identidad.
   - **Si difieren en cualquier nivel administrativo significativo** → es un **conflicto de identidad** (homónimo en otra zona).

Resultado por rama:
- **Conflicto de coordenadas**: ofrecer al usuario mover el punto a las coords del candidato (que ya conocemos: `nameLocation.lat/lng`). Enriquecer queda bloqueado hasta que el usuario decida.
- **Conflicto de identidad**: ofrecer al usuario elegir entre los candidatos cercanos (lista). Renombrar al elegido y re-enriquecer.
- **Coherente**: enriquecer normalmente.

## ¿Cuándo es necesaria la intervención del usuario?
Sólo en estos tres escenarios. En el resto, el sistema decide solo:

1. **Conflicto de identidad real**
   - Coords no caen en ningún artículo cercano compatible.
   - Existe un homónimo textual lejano cuya geografía administrativa NO coincide con la del POI.
   - Acción: el usuario elige entre los candidatos cercanos o renombra.

2. **Conflicto de coordenadas**
   - Nombre + administración coinciden con un candidato concreto.
   - Pero la distancia entre coords del POI y coords del candidato supera el umbral.
   - Acción: el usuario confirma “mover punto aquí” o “mantener coords”.

3. **No verificable**
   - Sin candidatos cercanos compatibles y sin homónimo claro.
   - El LLM no puede generar descripción verificable.
   - Acción: renombrar, abrir contexto cercano o aceptar como manual.

En todos los demás casos, no se interrumpe.

## Selección de identidad dentro del popup
Hoy el popup muestra el bloque `UnenrichedRecoveryBlock` con tres botones (Reintentar / Contexto cercano / Renombrar). Vamos a extenderlo para que el conflicto se resuelva ahí mismo, sin abrir paneles.

Cambios:
- Cuando exista un fallo de tipo `coherence` (A o B), el bloque mostrará **una lista de hasta 5 candidatos** ordenados por:
  1. cercanía a las coords del POI,
  2. solapamiento con su nombre,
  3. compatibilidad con país/región/localidad.
- Cada fila de la lista incluye: nombre del candidato, distancia, jerarquía resuelta (país · región · localidad) y un enlace al artículo.
- Acciones disponibles directamente en cada fila:
  - **Usar este nombre** (renombrar el punto y re-enriquecer).
  - **Mover punto aquí** (sustituir coordenadas por las del candidato y re-enriquecer).
  - **Es el correcto, ignorar conflicto** (forzar enriquecimiento con `skipValidation`).
- Si la rama es claramente B (conflicto de coordenadas con identidad compatible al 100 %), la fila destacada por defecto es la del candidato compatible, con CTA principal **“Mover punto aquí”** preseleccionado.
- Si la rama es A (conflicto de identidad), CTA principal es **“Usar este nombre”** sobre el mejor candidato cercano.

El bloque sigue siendo el mismo `UnenrichedRecoveryBlock` ya montado en:
- popup del mapa
- ficha completa (GalleryView)
- fila virtualizada de DocumentWaypointsTabs

Por lo tanto la lista de candidatos aparece en los tres sitios sin duplicar UI.

## Plan de implementación
### 1. Validador bidireccional
En `supabase/functions/enrich-location/index.ts` (`validateNameCoordinateCoherence`):
- Añadir resolución del bloque administrativo del candidato textual ganador.
- Comparar con el bloque administrativo del POI.
- Devolver siempre uno de tres veredictos: `coherent`, `name_mismatch`, `coordinate_mismatch`.
- En los dos últimos, devolver además la lista de **candidatos cercanos** y, si aplica, el **candidato textual con coords conocidas**.

### 2. Respuesta enriquecida al cliente
Ampliar el payload de rechazo:
- `reason`: `'name_mismatch' | 'coordinate_mismatch'` (sustituye al genérico actual).
- `candidates`: lista normalizada con `{ name, lat, lng, distanceKm, country, region, locality, url, source }`.
- `recommended`: el candidato sugerido por defecto.

### 3. Bloque de recuperación en el popup
En `UnenrichedRecoveryBlock`:
- Mostrar la lista de candidatos cuando exista, con sus tres acciones (Usar nombre / Mover punto / Ignorar).
- Implementar:
  - **Usar nombre**: update `name` + `triggerEnrichLocation`.
  - **Mover punto**: update `latitude/longitude` + `triggerEnrichLocation`.
  - **Ignorar conflicto**: `triggerEnrichLocation` con flag para saltar la validación.
- El mensaje y el CTA principal cambian según `reason` (`name_mismatch` o `coordinate_mismatch`).

### 4. Pipeline cliente
En `src/domains/content/lib/enrich-location.ts`:
- Persistir el fallo con `reason` correcto y la lista completa de candidatos para que el bloque la consuma en cualquier ubicación.
- Mantener el evento `open-nearby-context` solo como fallback para casos sin candidatos.

### 5. Validación con casos reales
- Isola Bella (Taormina): nombre, país, región, localidad coinciden, coords correctas → debe enriquecer sin pedir nada.
- Punto con nombre “Sagrada Familia” pero coords en París: debe detectarse como `coordinate_mismatch` y ofrecer mover a las coords reales en Barcelona.
- Punto “Santiago” con coords en Chile, país=España: `name_mismatch`, lista de Santiagos cercanos.
- Punto sin homónimo claro: `llm_unverifiable`, sin lista.

## Resultado esperado
- La validación distingue **identidad equivocada** vs **coordenadas equivocadas**.
- Cualquier conflicto se resuelve **dentro del popup del propio punto**, con lista de candidatos y tres acciones claras.
- El usuario sólo es interrumpido cuando realmente hay ambigüedad; el resto, automático.

## Archivos afectados
- `supabase/functions/enrich-location/index.ts` (validador, payload de respuesta).
- `src/domains/content/lib/enrich-location.ts` (parsing del nuevo `reason` y candidatos).
- `src/domains/content/lib/enrichment-error-kind.ts` (nuevos kinds + tipos).
- `src/domains/content/components/UnenrichedRecoveryBlock.tsx` (lista + 3 acciones).
- Memoria: actualizar `mem://logic/enrichment/name-coordinate-coherence` con la regla bidireccional y la UI de candidatos en popup.