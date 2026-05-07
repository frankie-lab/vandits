## Objetivo

Re-normalizar geográficamente el **100%** de los **5.074 puntos activos** (todos `is_approved=true`) aplicando las nuevas reglas: 8 niveles (continent → country → region → zone → admin3 → locality → sublocality + type), doble pasada Nominatim (zoom 18 + 10) y FKs vía `resolve-admin-area`.

## Diferencia con el batch anterior

El runner actual (`backfill-catalog-geo-once`) sólo procesa los puntos con jerarquía incompleta (~2.230). Esta vez se quiere reprocesar **todos**, incluidos los que ya tienen FKs, para sobreescribir con la normalización nueva (placeholders deduplicados, path materializado, sublocality, etc.).

## Plan

### 1. Extender `backfill-catalog-geo-once` con flag `force`

Añadir parámetro opcional `force: boolean` que se propaga a `backfill-admin-fks` como `force_renormalize: true`. Cuando `force=true`:
- El predicado "pendiente" desaparece (ya implementado en `backfill-admin-fks`).
- Procesa TODOS los puntos en catálogo en orden de creación.
- El bucle del runner debe avanzar con `offset` acumulado (no por "remaining decreciente"), porque al forzar, `remaining` se mantiene constante.

### 2. Lanzar el batch en background con avance por offset

Cambiar la estrategia de parada:
- Modo normal (`force=false`): parar cuando `remaining=0` o `processed=0` (comportamiento actual).
- Modo forzado (`force=true`): parar cuando `processed < limit_per_chunk` (no quedan filas en el rango) o se agote `max_iterations`. El runner pasa `offset` incremental a cada llamada.

### 3. Persistencia de estado entre invocaciones

El runner es one-shot por edge function (~130s budget). Para 5.074 puntos × ~2.2s = ~3 horas, hace falta:
- **Tabla ligera de control**: `geo_renormalization_jobs` (id, started_at, last_offset, total_target, processed, updated, failed, status). Permite reanudar.
- O bien, **invocaciones manuales sucesivas**: el runner devuelve `next_offset` y el master vuelve a invocar con ese offset hasta agotar.

Propuesta: **invocaciones sucesivas manuales** (más simple, sin schema nuevo). El runner devuelve `next_offset` y `done: boolean`. El master invoca desde consola en bucle.

### 4. CTA opcional en `AdminPanel`

Botón "Renormalizar TODO el catálogo (forzado)" que:
- Confirma con dialog ("Esto tomará ~3 horas, se ejecuta en chunks. ¿Continuar?").
- Lanza un loop client-side que llama a `backfill-catalog-geo-once` con `force=true` y `offset` incremental.
- Muestra progreso reutilizando `useGeocodingJobStore` + `GeocodingProgressBar`.
- Solo visible para `master`.

## Detalle técnico

- **Tasa Nominatim**: 1.1s entre llamadas + posibles 2 llamadas/punto = ~2.2s/punto. Total: 5.074 × 2.2s ≈ **3h 6min**.
- **Chunks**: 50 puntos por chunk del edge function (~110s) → ~102 chunks totales.
- **Sin pérdida de datos**: sólo se reescriben los FKs y los strings derivados (vía trigger). `enriched_data`, fotos, notas, colecciones, `is_approved`, visibilidad: intactos.
- **Sin afectar visibilidad del mapa**: la regla `is_approved=true` no cambia. Los puntos siguen visibles durante el proceso; sólo mejora su filtrado geográfico.
- **Idempotente**: si `resolve-admin-area` devuelve los mismos UUIDs, el UPDATE es no-op funcional.

## Archivos a tocar

1. `supabase/functions/backfill-catalog-geo-once/index.ts` — añadir `force`, lógica de `offset`, devolver `next_offset` y `done`.
2. `src/components/AdminPanel.tsx` — botón "Renormalizar TODO el catálogo" (sección Mantenimiento) con loop client-side y progreso.
3. (Reutiliza) `useGeocodingJobStore` + `GeocodingProgressBar` para feedback.

## Pregunta abierta

¿Prefieres que el botón viva en `AdminPanel` con loop client-side visible, o que sea un script "dispara-y-olvida" que tú invocas desde consola (`supabase.functions.invoke('backfill-catalog-geo-once', { body: { force: true, offset: 0 } })` y vas avanzando offset)?

Mi recomendación: **botón en AdminPanel** con barra de progreso (transversal, reusable, alineado con el resto del sistema de jobs).
