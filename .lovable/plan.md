# Acelerar `batch-enrich` con concurrencia

ETA actual: ~19 s/POI × 1 a la vez ≈ 21 h para 3.241 puntos. Cuello de botella: el bucle de `supabase/functions/batch-enrich/index.ts` procesa POIs estrictamente en serie (`for` con `await`). El delay de 500 ms entre POIs aporta <3 % del tiempo; el modelo `google/gemini-2.5-flash` ya es rápido; el lookup a `places_trunk` ya está cableado al inicio del bucle.

## Cambios

### 1. Concurrencia por lotes en `batch-enrich`
Sustituir el `for (const locationId of locationIds)` por procesamiento en olas de tamaño `CONCURRENCY` (configurable, por defecto **8**) con `Promise.allSettled`. Toda la lógica por-POI existente (trunk lookup, fetch a `enrich-location`, UPDATE, errores estructurados) se extrae a una función `processSingleLocation(locationId)` y se invoca N veces en paralelo por ola.

- Cada POI sigue escribiendo su propio UPDATE individual → realtime sigue disparando el repaint per-POI uno a uno en el mapa.
- El progreso del job (`processed_count`, `error_count`, `processed_ids`, `error_ids`, `error_messages`) se actualiza con `Promise.allSettled().finally`, una sola escritura por ola (no por POI) para no saturar la tabla `enrichment_jobs`.
- `current_location_id` / `current_location_name` se setean al primero de cada ola (información ya aproximada, no crítica).

### 2. Eliminar `sleep(500ms)` entre POIs
Sustituirlo por **back-off solo ante 429**: si una llamada a `enrich-location` devuelve 429, ese worker espera `min(2^attempt × 1000, 8000) ms` y reintenta hasta 2 veces. Sin error, sin pausa.

### 3. Cancel / pause responsivos dentro de la ola
Antes de lanzar cada ola se relee `enrichment_jobs.status`. Si está `paused` o `cancelled`, se sale del bucle. Dentro de la ola, los workers comprueban el status antes de su iteración (no rompe los que ya están en vuelo, pero corta inmediatamente al siguiente).

### 4. UI: surfacing del nº de concurrencia (opcional, fuera del core)
Solo backend. No tocar UI en esta iteración. El usuario ve los puntos ponerse verde más rápido y la ETA recalculada por el propio progreso.

## Resultados esperados

- ETA para 3.241 POIs: **~2-3 h** (de 21 h) con concurrencia 8.
- Sin coste extra de modelo ni infraestructura.
- Cero impacto en UX: cada POI sigue cambiando a verde individualmente vía realtime, en orden de finalización.

## Riesgos y mitigaciones

- **Rate-limit en Lovable AI Gateway**: mitigado con back-off 429 + cap concurrencia=8. Si vemos picos de 429 en logs, bajamos a 5.
- **Rate-limit en Wikipedia API**: 8 req/s simultáneas está muy por debajo del límite público; sin riesgo realista.
- **Carga sobre `enrichment_jobs`**: una escritura por ola (no por POI) → mismo orden de magnitud o menor que ahora.
- **Errores estructurados**: la rama `__structured` se preserva intacta dentro de `processSingleLocation`.

## Detalles técnicos

**Archivo único tocado:** `supabase/functions/batch-enrich/index.ts`

Pseudocódigo del bucle nuevo:
```
const CONCURRENCY = 8;
for (let i = 0; i < locationIds.length; i += CONCURRENCY) {
  const { data: jobRow } = await supabase
    .from('enrichment_jobs').select('status').eq('id', jobId).single();
  if (jobRow?.status === 'paused' || jobRow?.status === 'cancelled') break;

  const wave = locationIds.slice(i, i + CONCURRENCY);
  await Promise.allSettled(wave.map(processSingleLocation));

  // Una sola escritura de progreso por ola
  await supabase.from('enrichment_jobs').update({
    processed_count: processedIds.length,
    error_count: errorIds.length,
    processed_ids: processedIds,
    error_ids: errorIds,
    error_messages: errorMessages,
  }).eq('id', jobId);
}
```

`processSingleLocation` contiene:
1. Trunk lookup (ya existe, líneas 187-218).
2. Catalog twin lookup (ya existe, líneas 230-264).
3. POST a `enrich-location` con back-off 429 (nuevo wrapper).
4. UPDATE a `locations` (ya existe).
5. `upsert_trunk_place` (ya existe).
6. Push a `processedIds` / `errorIds` / `errorMessages` (arrays compartidos, push es atómico en JS single-thread).

**No se toca:** `enrich-location`, el cliente, el store de realtime, el listener per-POI de `LocationMap`, los sonidos ni el tracker de enriquecimiento.
