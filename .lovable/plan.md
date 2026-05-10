## Objetivo
Corregir la lógica de enriquecimiento para que, cuando un POI ya trae geografía fiable (`country`, `region`, `zone`, y en muchos casos `localidad`) y coordenadas correctas, esa geografía pese más que una coincidencia textual ambigua en Wikipedia. El cambio debe ser transversal, persistente y sin parches por caso.

## Qué está fallando hoy
La edge function `enrich-location` tiene dos comportamientos distintos:

1. **`searchWikipedia(...)` sí usa geografía/coordenadas**
   - Primero intenta `geosearch` alrededor de las coordenadas.
   - Solo luego hace búsqueda textual, y además rechaza artículos a >50 km.

2. **`validateNameCoordinateCoherence(...)` NO usa la geografía del punto**
   - Busca por texto en Wikipedia (`srsearch`).
   - Escoge el “mejor match” por similitud de título.
   - Si ese artículo está a >2 km, aborta.
   - No tiene en cuenta `country`, `region`, `zone`, `localidad`, ni el contexto geográfico ya correcto del POI.

Resultado: si existe un artículo homónimo en otra región/país, la función aborta antes de construir el contexto enriquecido, aunque el punto esté bien ubicado y ya venga con metadatos geográficos correctos.

## Cambio propuesto

### 1) Rehacer la coherencia para que sea geo-aware
Actualizar `validateNameCoordinateCoherence(...)` para aceptar contexto geográfico del POI y aplicar una estrategia por capas:

- **Capa A — Prioridad absoluta a las coordenadas**
  - Buscar artículos cercanos por `geosearch` alrededor del punto.
  - Si entre los cercanos hay uno que encaja razonablemente con el nombre, se considera coherente y no se aborta.

- **Capa B — Desambiguación por geografía administrativa**
  - Al evaluar candidatos textuales, sumar score si el título/extract menciona `country`, `region`, `zone`, `localidad` del POI.
  - Penalizar o descartar candidatos que contradigan la geografía conocida.

- **Capa C — Solo abortar si la evidencia geográfica es fuerte**
  - No abortar solo porque exista un homónimo lejano.
  - Abortar únicamente si:
    - no existe candidato cercano razonable, y
    - el mejor candidato textual lejano es claramente superior, y
    - además no hay soporte geográfico local consistente.

Esto convierte la coherencia en una comprobación robusta de identidad, no en una simple colisión de títulos de Wikipedia.

### 2) Pasar la geografía real del POI a la validación
Cambiar la llamada desde `enrich-location/index.ts` para que `validateNameCoordinateCoherence(...)` reciba un objeto de contexto con:
- `country`
- `region`
- `zone`
- `localidad` / `sublocalidad` si están disponibles
- coordenadas

La validación debe trabajar con esa información como fuente de verdad contextual.

### 3) Mantener el flujo de recuperación, pero con menos falsos positivos
El bloque ámbar de recuperación debe seguir existiendo para errores reales, pero con la nueva lógica solo aparecerá cuando realmente haya un conflicto de identidad, no cuando la geografía del propio POI ya resuelve la ambigüedad.

### 4) Mantener el bypass manual explícito
Se mantiene la semántica del flujo manual con `skipValidation: true` para que el usuario pueda forzar un enriquecimiento si lo desea. Pero el objetivo es que en muchos casos ya no haga falta, porque la validación dejará de abortar incorrectamente.

## Impacto esperado
- Menos falsos rechazos en puntos con nombres ambiguos o repetidos.
- Mejor uso de las etiquetas geográficas ya resueltas del propio POI.
- El enriquecimiento seguirá siendo seguro, pero más inteligente y menos frágil.
- El popup solo mostrará recuperación cuando realmente haya una duda de identidad.

## Archivos a tocar
- `supabase/functions/enrich-location/index.ts`
- Posiblemente memoria de reglas:
  - `mem://logic/enrichment/name-coordinate-coherence`
  - `mem://logic/enrichment/force-generation-skip-validation` si hace falta aclarar la nueva semántica

## Detalle técnico
Propuesta de refactor:

```text
validateNameCoordinateCoherence(name, coordinates, geoContext)
  1. geosearch cerca del punto
  2. rank de candidatos cercanos por:
     - similitud de nombre
     - distancia
     - coincidencia con country/region/zone/localidad
  3. si hay candidato local suficientemente bueno => ok
  4. si no, búsqueda textual global
  5. rank de candidatos globales con mismo score geo-aware
  6. abortar solo si candidato lejano gana claramente y no hay soporte local
```

También conviene extraer un helper central de scoring para no duplicar heurísticas entre:
- `validateNameCoordinateCoherence(...)`
- `searchNearbyCandidates(...)`
- `searchWikipedia(...)` si procede

Así el criterio de “match razonable” queda unificado transversalmente.

## Validación
Probar con casos como:
- puntos con nombre ambiguo pero geografía correcta ya resuelta
- puntos con homónimos en otras provincias/países
- puntos realmente mal nombrados, que deben seguir mostrando recuperación

El resultado correcto será:
- si la geografía del POI y las coordenadas sostienen la identidad, el enriquecimiento continúa;
- si no, aparece el bloque de recuperación con candidatos cercanos.
