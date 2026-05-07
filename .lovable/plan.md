## Objetivo

Crear un batch puntual (one-shot) que repase TODOS los puntos en catálogo (`is_approved=true`, `deleted_at IS NULL`) de TODOS los usuarios y rellene la jerarquía geográfica completa (8 niveles: continent → country → region → zone → admin3 → locality → sublocality + type) usando las nuevas normas de normalización.

## Contexto detectado

- `backfill-admin-fks` ya implementa la lógica correcta (Nominatim doble pasada zoom 18 + 10 → `resolve-admin-area` → UPDATE FKs → trigger `locations_sync_admin_cache` actualiza strings).
- Predicado actual: `country_id IS NULL OR continent_id IS NULL`. Esto deja fuera ~1.500 puntos en catálogo con `country_id` resuelto pero faltando niveles intermedios (region/zone/locality/admin3/sublocality).
- Hay scoping por `owner_user_id` cuando hay JWT y por `document_id`. No hay scope por "catálogo".
- Existe flag `force_renormalize=true` para reprocesar todo.

## Plan

### 1. Extender el predicado "pendiente" en `backfill-admin-fks`

Reemplazar el filtro:
```
.or('country_id.is.null,continent_id.is.null')
```
por uno que detecte cualquier nivel faltante de la nueva jerarquía:
```
.or('continent_id.is.null,country_id.is.null,region_id.is.null,zone_id.is.null,locality_id.is.null')
```
(`admin3_id` y `sublocality_id` son opcionales por naturaleza — no todos los lugares los tienen — así que no entran en el predicado para evitar reprocesar infinito.)

### 2. Añadir scope `catalog_only` al edge function

Nuevo parámetro opcional `catalog_only: boolean` que añade `.eq('is_approved', true)` tanto al fetch como al cálculo de `remaining`. Compatible con el resto de scopes.

### 3. Crear batch runner one-shot

Nuevo edge function `backfill-catalog-geo-once`:
- Llama a `backfill-admin-fks` en bucle con `{ catalog_only: true, limit: 100, force_renormalize: false }` (sin force — solo los que faltan según el nuevo predicado).
- Sin scope de usuario (sin JWT → procesa todos).
- Continúa hasta `remaining === 0` o hasta agotar presupuesto de tiempo.
- Devuelve resumen acumulado: `total_processed`, `total_updated`, `total_failed`, `iterations`, `remaining`.
- Idempotente: se puede invocar manualmente varias veces hasta drenar la cola.

### 4. CTA en panel admin (opcional, sólo invocador manual)

En `Admin > Mantenimiento` (o donde estén los jobs masters), un botón "Renormalizar catálogo global" que:
- Llama a `backfill-catalog-geo-once`.
- Muestra progreso reutilizando `useGeocodingJobStore` + `GeocodingProgressBar` (el bus único ya existente).
- Sólo visible para `master` (RLS en `app_settings` ya cubre).

### 5. Consulta previa para confirmar magnitud

Antes de lanzar, una `read_query` rápida:
```sql
SELECT COUNT(*) FROM locations
WHERE deleted_at IS NULL AND is_approved = true
AND (continent_id IS NULL OR country_id IS NULL
     OR region_id IS NULL OR zone_id IS NULL OR locality_id IS NULL);
```
para saber el volumen real (~835 sin continent + ~1.500 con jerarquía incompleta = estimado 2.000-2.500 puntos).

## Detalle técnico

- **Tasa Nominatim**: 1.1s entre llamadas + posibles 2 llamadas/punto (zoom 18 + 10) → ~2.000 puntos × 2.2s = ~75 min total. El runner one-shot lanza chunks de 100 (~3.5 min cada uno, dentro del límite 150s del edge function) iterando hasta drenar.
- **Sin pérdida de datos**: la lógica de UPDATE sólo escribe los FKs nuevos; el trigger sincroniza strings sin tocar nada más. `enriched_data`, fotos, notas, colecciones intactas.
- **Sin afectar mapa global**: la regla de visibilidad (`is_approved=true`) no cambia. Los puntos siguen visibles durante el proceso; sólo se enriquece su filtro geográfico.

## Archivos a tocar

1. `supabase/functions/backfill-admin-fks/index.ts` — extender predicado + parámetro `catalog_only`.
2. `supabase/functions/backfill-catalog-geo-once/index.ts` — nuevo, runner one-shot.
3. (Opcional) `src/app/admin/...` — botón "Renormalizar catálogo global".
4. Memoria: actualizar `mem://logic/geocoding/unified-job` para mencionar el scope `catalog_only`.
