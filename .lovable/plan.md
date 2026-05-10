## Diagnóstico (resumen)

El job global del 9 de mayo (4747 puntos, todo el mundo) **completó correctamente**. El plan de Geografía Universal SÍ es transversal a todos los continentes.

El job actual `c7b599b5` (3093 puntos, "Revisar normalizados · selección") está atascado con `last_error: "Invalid URL"` porque `backfill-admin-fks` mete los 3093 UUIDs en una URL PostgREST `?id=in.(uuid1,…uuid3093)` ≈ **114 KB**, muy por encima del límite de URL del runtime (~16 KB). Ningún punto se procesa.

## Principios para el fix (según tu indicación)

1. **Sin límites artificiales bajos**. El tick procesa el máximo posible por iteración, no un page_size de 25.
2. **El usuario no decide en el momento del error**. Si una selección no cabe entera en una URL, el sistema **no falla**: trocea internamente y procesa todo de forma transparente.
3. **Aviso solo si la selección es enorme** (umbral configurable, p.ej. > 10 000 puntos). En ese caso, antes de crear el job, el diálogo de "Revisar normalizados" muestra: *"Has seleccionado X puntos. Se procesarán en bloques automáticos. Tiempo estimado: ~Y min. ¿Continuar?"*. No obliga a partir manualmente; solo informa.

## Cambios

### 1. `supabase/functions/backfill-admin-fks/index.ts`

- Cuando llega `body.location_ids` con N elementos, **slicing server-side**:
  ```ts
  const slice = locationIds?.slice(offset, offset + limit) ?? null;
  if (slice) q = q.in('id', slice);   // nunca más de `limit` IDs en la URL
  ```
  El `.range()` se elimina para esa rama (el slice ya pagina).
- **`limit` por tick = 500** (UUIDs ≈ 18 KB en URL → seguro). Cada tick procesa hasta 500 puntos: el job de 3093 acaba en ≤ 7 ticks (≤ 7 minutos con cron 1×min).
- **Conteos sin red** cuando hay `location_ids`: `totalInScope = locationIds.length`. Se eliminan las queries `count: exact` de líneas 385/405 que también explotaban con la URL larga.
- **Salvaguarda universal**: cualquier `q.in('id', ids)` con `ids.length > 500` se trocea internamente (loop con OR de slices) — protege futuros llamadores.

### 2. `supabase/functions/geocoding-job-tick/index.ts`

- Subir `pageSize` por defecto de **25 → 500** cuando hay `location_ids` (alineado con el límite seguro de URL).
- Sin otros cambios: el offset bookkeeping y `cancel_geocoding_job` siguen igual.

### 3. UI — aviso pre-job (`useGeocodingJobStore` / diálogo "Revisar normalizados")

- Antes de crear el job, si `locationIds.length > 10 000`:
  - Mostrar diálogo informativo: *"X puntos seleccionados. Se procesarán automáticamente en bloques de 500 (~Y minutos). ¿Continuar?"*
  - Botones: **Procesar todo** (default) / **Cancelar**.
- Si `length ≤ 10 000`: arrancar directo sin preguntar (caso actual de 3093, ni se notaría).
- No hay opción de "partir manualmente": el troceo es server-side y transparente.

### 4. Limpieza inmediata del job atascado

Una vez desplegado el fix:
- Cancelar `c7b599b5` vía `cancel_geocoding_job(_job_id)`.
- Relanzar "Revisar normalizados" desde la UI → el nuevo job usará el código corregido y completará los 3093 en ≤ 7 minutos.

## Qué NO cambia

- Cobertura geográfica del backfill: continúa siendo mundial (cualquier continente / país / región). El bug era de longitud de URL, no de zona geográfica.
- `resolve-admin-area`, `geo-normalizer`, catálogo `admin_areas`, place_types: intactos.
- El job global del 9 de mayo (4747 puntos ya normalizados) no se relanza.

## Verificación

1. Tras deploy, cancelar `c7b599b5`.
2. Relanzar "Revisar normalizados · selección" sobre los 3093.
3. Confirmar en `geocoding_jobs`: `processed` avanza ~500/tick, `last_error` vacío, `status='completed'` en ≤ 7 ticks.
4. Probar con una selección pequeña (~50) y otra grande (~12 000) para validar el diálogo de aviso.