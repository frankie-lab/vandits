# Por qué no avanza la geocodificación

La barra muestra **3120/3541 (88%)** y se queda parada. La causa:

- La UI cuenta como "no geocodificados" todos los puntos que no tienen `continent` **o** `country` (helper `getLocationHierarchy`).
- Pero el worker (`backfill-admin-fks`) y el store (`geocoding-job-store`) solo seleccionan filas con `country_id IS NULL`.
- En BD hay **421 puntos con `country_id` resuelto pero `continent_id = NULL`** (legacy de antes del trigger). El worker los ignora → "remaining = 0" instantáneo → la barra nunca avanza esos 421.

```text
3541 totales
- 3120 con country_id + continent_id  ✅ verdes
-  421 con country_id pero SIN continent_id  ❌ ignoradas por el worker
```

Confirmado por SQL: `count(*) filter (where continent_id is null and country_id is not null) = 421`.

# Plan (transversal)

Tratar "geocodificado" como "tiene los 8 FKs principales", no solo `country_id`. La forma más barata: si `country_id` ya existe, derivar `continent_id` desde el catálogo `admin_areas` (no hace falta llamar a Nominatim).

## Cambios

### 1. `supabase/functions/backfill-admin-fks/index.ts`
- Cambiar el filtro de candidatos: `country_id IS NULL OR continent_id IS NULL` (en lugar de solo `country_id IS NULL`).
- Antes de llamar a Nominatim, **fast path**: si la fila ya tiene `country_id` pero le falta `continent_id`, leer `admin_areas` para encontrar el continente del país (cadena padre) y hacer `UPDATE` directo. Sin red, sin sleep.
- Recalcular `remaining` con el mismo predicado nuevo.

### 2. `src/stores/geocoding-job-store.ts`
- En `resumeIfPending` y en cualquier conteo: usar `country_id.is.null,continent_id.is.null` con `.or()` para que el contador de la UI coincida con lo que el worker realmente procesa.

### 3. `src/domains/content/lib/document-geocoding.ts`
- `getDocumentPendingGeocoding` aplica el mismo predicado OR para que el botón "Geocodificar" por documento detecte estos casos.

### 4. `src/components/filters/GeographyTree.tsx`
- `totalUnclassified` ya cubre estos puntos (porque mira `h.continent`), no toca lógica. Pero verificar que `runBackfill(totalUnclassified)` arranca y que tras la primera tanda el contador se mueve.

## Resultado esperado

Al pulsar "Geocodificar todos" con los 421 puntos pendientes, el worker hará un UPDATE casi instantáneo (sin Nominatim) por cada fila que ya tiene país pero le falta continente, y la barra llegará al 100%.
