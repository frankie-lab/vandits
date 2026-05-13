
# Test Matrix PR-1 — dataset controlado para validar curated-only sharing (v4 final)

## Reglas duras

1. **Cero cambios en Frankie GMZ** (`b977aa23-…`): no insertar/modificar/borrar POIs, follows ni colecciones. Frankie solo viewer/master.
2. **Job sintético de failures con `user_id = Beta`** (no nullable, no opcional). `prewarmFromRecentJobs` filtra por `user_id = auth.uid()`, así que sin esto los rings review/hardError no aparecen al loguearse como Beta.
3. **`geo_health` nunca se setea explícito**. El trigger `locations_set_geo_health` lo reescribe siempre vía `_compute_location_geo_health_lookup(...)` a partir de coords + FKs + strings. Para cada estado se construye el input que produce el bucket deseado, y se **verifica con SELECT post-insert** que el valor real coincide. Si no coincide, se ajusta el fixture antes de seguir.

## Schema verificado (BD real, 2026-05-13)

- `locations.geo_health` text, sin enum/CHECK. Reescrito por trigger en cada INSERT/UPDATE.
- `_compute_location_geo_health` devuelve uno de: `empty | broken | partial | stale_name | ok`.
- `locations.visibility` CHECK = `{public, followers, private}`.
- No hay tabla `enrichment_failure_store`. Failures viven en `enrichment_jobs.error_messages` (jsonb keyed by `location_id`).
- `enrichment_jobs.user_id` requerido para que `prewarmFromRecentJobs` lo recupere.
- `EnrichmentErrorKind`: review = `{coherence, llm_unverifiable, no_match}`, hardError = `{rate_limit, no_credits, timeout, network, unknown}`.

## Receta de fixtures por estado (compatible con trigger)

Para cada caso, `latitude/longitude` siempre presentes; lo que varía son strings y FKs:

| Estado lógico | `enriched_data.descripcion` | Cómo forzar el bucket en BD |
|---------------|-----------------------------|------------------------------|
| `ok` enriched | non-empty | strings y FKs coherentes resueltos vía `resolve-admin-area` (helper `resolveAllFks` ya disponible) → trigger devuelve `ok`. |
| `partial`     | non-empty | `country` (string) presente, `country_id = NULL` → primer branch de partial. |
| `broken` (chain) | non-empty | `country_id` y `region_id` presentes pero `region.parent_id ≠ country_id` (usar dos admin_areas reales sin relación padre/hijo) → branch broken. |
| `review`      | empty     | mismas FKs coherentes que `ok` (queda `ok`) + entrada en `enrichment_jobs.error_messages` con `kind='coherence'`. Ring lo aporta el failure store. |
| `hardError`   | empty     | igual que review pero `kind='timeout'`. |
| `no-enriched` | empty     | FKs coherentes, sin entrada en error_messages. |

Tras cada bloque de inserts, ejecutar:

```sql
SELECT id, name, geo_health, enriched_data->>'descripcion' IS NOT NULL AS has_desc
FROM locations
WHERE enriched_data->>'_test_matrix' = 'pr1-2026-05-13' AND owner_user_id = '<uid>';
```

y comparar contra la matriz esperada. Si una fila salió con `geo_health` distinto, **corregir el fixture** (ajustar FKs/strings) antes de validar PR-1.

## Dataset (solo Sandbox / Beta / Alpha)

Todos los POIs llevan `enriched_data->>'_test_matrix' = 'pr1-2026-05-13'` para limpieza.

### 1. Sandbox Agent — visibility/deleted (10)

Tag `#test-sandbox`, Galicia, `is_approved=true`, todos `ok` enriched.

| visibility / estado | n | Frankie ve |
|---|---|---|
| `followers` ok enriched | 5 | Sí |
| `public` ok enriched | 2 | Sí |
| `private` ok enriched | 2 | No |
| `followers` ok enriched + `deleted_at=now()` | 1 | No |

### 2. Aventurera Beta — curated-only (10)

Todos `visibility=followers`, `is_approved=true`, tag `#test-beta`, A Coruña. Frankie no debe ver ninguno.

| Estado | descripcion | failure kind | n |
|---|---|---|---|
| partial | non-empty | — | 3 |
| broken (chain) | non-empty | — | 2 |
| review | empty | `coherence` | 1 |
| hardError | empty | `timeout` | 1 |
| no-enriched | empty | — | 3 |

### 3. Explorador Alpha — realtime (8)

Tag `#test-alpha`, Andalucía + Marruecos, `is_approved=true`, todos `ok` enriched.

| visibility | n |
|---|---|
| `followers` | 5 |
| `public` | 2 |
| `private` | 1 |

### 4. Job sintético de failures (Beta)

Un único INSERT en `enrichment_jobs`:

- `user_id = '<Beta uid>'` (obligatorio).
- `document_id = NULL`.
- `status = 'completed'`, `total_count = 2`.
- `error_ids = [reviewLocId, hardErrorLocId]`.
- `error_messages = { "<reviewLocId>": { "kind": "coherence" }, "<hardErrorLocId>": { "kind": "timeout" } }`.
- `created_at = now()` para que entre en los 20 más recientes que lee `prewarmFromRecentJobs`.

## Validaciones

### Como Beta (logueado)
- Eje Salud: 7 POIs propios rotos (3 partial + 2 chain + 1 review + 1 hardError).
- Rings amber/yellow/magenta/red en la cantidad esperada.
- Repair CTA partial/chain encola via `enqueue_health_repair`.
- POIs ajenos NO entran en su eje Salud.

### Como Frankie (logueado)

Visibility matrix:

| Filtro | Esperado |
|---|---|
| `#test-sandbox` followers ok | 5 |
| `#test-sandbox` public ok | 2 |
| `#test-sandbox` private | 0 |
| `#test-sandbox` deleted | 0 |
| `#test-beta` (cualquier) | 0 |
| `#test-alpha` followers ok | 5 |
| `#test-alpha` public ok | 2 |
| `#test-alpha` private | 0 |

Health domain privado: rings y eje Salud solo sobre POIs propios reales.

Realtime (Alpha → Frankie, sin reload):
1. Cambiar un POI followers ok a `partial` ⇒ desaparece.
2. Vaciar `enriched_data.descripcion` de otro ⇒ desaparece.
3. `visibility='private'` en otro ⇒ desaparece.
4. Revertir #1 a estado `ok` enriched ⇒ reaparece.

Counts: `myCatalog` Frankie igual; `catalogTotal` += 7 (Sandbox) + 7 (Alpha).

## Limpieza

```sql
DELETE FROM enrichment_jobs WHERE error_messages::text LIKE '%pr1-2026-05-13%';
DELETE FROM locations WHERE enriched_data->>'_test_matrix' = 'pr1-2026-05-13';
```

Ningún DELETE toca filas de Frankie.

## Orden global

1. Sembrar Sandbox + Beta + Alpha + job sintético.
2. SELECT de verificación; ajustar fixtures hasta que `geo_health` real == matriz.
3. Validar PR-1 (matriz Frankie + health propio Beta + realtime).
4. PR-3 — RLS server-side.
5. PR-2 — pennant visual.

## Riesgos abiertos

- Si una receta no produce el `geo_health` esperado por desfase de admin_areas, ajustar referencias antes de validar — no continuar con datos divergentes.
- Si el trigger `locations_auto_enqueue_geo_repair` mete los POIs rotos de Beta en un job auto-repair, está bien: el job sintético sigue presente para los kinds review/hardError (lo importante es que `prewarmFromRecentJobs` lo lea, lo cual depende de `user_id`).
