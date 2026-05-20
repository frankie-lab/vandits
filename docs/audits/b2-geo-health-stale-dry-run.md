# B2a — geo_health stale dry-run

**Fecha:** 2026-05-20
**Estado:** DRY-RUN — sin UPDATE, sin migración, sin re-enrich, sin bump.
**Version impact:** none.

## §1. Objetivo

Corregir `geo_health` de POIs marcados `'ok'` que incumplen la regla R2 del contrato `enrichment-coord-coherence-contract.md`:

> R2: `enrichment_status='enriched'` implica `raw_geocode IS NOT NULL`.

Acción propuesta (NO ejecutada en B2a): degradar `geo_health` a `'hardError'` para que el sistema de Salud (rings rojos) los detecte y el operador pueda reenviarlos a `geocoding-job` en una fase posterior (B5).

**No se mueven coordenadas. No se toca `enriched_data`. No se reenriquece.**

## §2. Scope

- **Total filas afectadas:** `389`
- **Sub-criterio R2 (`enriched + raw_geocode IS NULL`):** `389` → **100% del scope**
- Null coords: `0`
- Null Island `(0,0)`: `1` (subset de R2, mismo POI)
- Out-of-range: `0`

### Breakdown por país/región (top 10)

| Country         | Region       | n   |
|-----------------|--------------|-----|
| España          | —            | 183 |
| Portugal        | —            | 66  |
| Francia         | —            | 62  |
| Francia         | Occitanie    | 8   |
| Estados Unidos  | —            | 7   |
| Marruecos       | —            | 6   |
| Reino Unido     | —            | 5   |
| Grecia          | —            | 5   |
| Italia          | —            | 5   |
| Francia         | Bretagne     | 4   |

## §3. Validación R2 puro

El conteo agregado confirma que **todos los 389 POIs caen exclusivamente por R2** (coords válidas, no null, no `(0,0)` salvo 1 caso que también es R2, no out-of-range). El UPDATE propuesto puede usar el predicado R2 estricto sin riesgo de scope-creep.

**Solapamiento informativo D6 (`zone == region` textual):** `1` POI. No bloqueante — B3 lo limpiará después.

## §4. SQL SELECT (reproducible)

```sql
-- Conteo total + breakdown por sub-criterio
SELECT COUNT(*) AS total,
  COUNT(*) FILTER (WHERE enrichment_status='enriched' AND raw_geocode IS NULL) AS r2_match,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)                 AS null_coords,
  COUNT(*) FILTER (WHERE latitude=0 AND longitude=0)                            AS null_island,
  COUNT(*) FILTER (WHERE ABS(latitude)>90 OR ABS(longitude)>180)                AS out_of_range
FROM public.locations
WHERE geo_health='ok'
  AND (
    latitude IS NULL OR longitude IS NULL
    OR (latitude=0 AND longitude=0)
    OR ABS(latitude)>90 OR ABS(longitude)>180
    OR (enrichment_status='enriched' AND raw_geocode IS NULL)
  );

-- 10 ejemplos
SELECT
  id, name, latitude, longitude,
  geo_health                              AS current_geo_health,
  'hardError'::text                       AS target_geo_health,
  enrichment_status, geo_source, geo_confidence,
  (raw_geocode IS NOT NULL)               AS has_raw_geocode,
  country, region, zone, updated_at
FROM public.locations
WHERE geo_health='ok'
  AND enrichment_status='enriched'
  AND raw_geocode IS NULL
ORDER BY updated_at DESC
LIMIT 10;
```

## §5. 10 ejemplos

| id (corto) | name                  | lat       | lon       | current | target    | enrich_status | geo_source | has_raw | country | region          | zone                | updated_at           |
|------------|-----------------------|-----------|-----------|---------|-----------|---------------|------------|---------|---------|-----------------|---------------------|----------------------|
| fe3a877c   | Compiano              | 44.496049 |  9.662079 | ok      | hardError | enriched      | —          | false   | Italia  | Emilia-Romagna  | Parma               | 2026-05-14 19:49:51  |
| f96246f9   | Percile               | 42.094568 | 12.908485 | ok      | hardError | enriched      | —          | false   | Italia  | Lazio           | Roma Capitale       | 2026-05-14 19:49:49  |
| d1d117ea   | Offagna               | 43.527682 | 13.441472 | ok      | hardError | enriched      | —          | false   | Italia  | Marche          | Ancona              | 2026-05-14 19:47:10  |
| c1dfcacb   | Montechiarugolo       | 44.693401 | 10.422480 | ok      | hardError | enriched      | —          | false   | Italia  | Emilia-Romagna  | Parma               | 2026-05-14 19:46:49  |
| bc303ce4   | Opi                   | 41.781026 | 13.829726 | ok      | hardError | enriched      | —          | false   | Italia  | Abruzzo         | L'Aquila            | 2026-05-14 19:46:43  |
| ad09dc98   | Grottammare           | 42.990497 | 13.868760 | ok      | hardError | enriched      | —          | false   | Italia  | Marche          | Ascoli Piceno       | 2026-05-14 19:46:16  |
| a99dfa4e   | Castro dei Volsci     | 41.508217 | 13.406303 | ok      | hardError | enriched      | —          | false   | Italia  | Lazio           | Frosinone           | 2026-05-14 19:46:10  |
| 7bd04f1b   | Follina               | 45.953073 | 12.118137 | ok      | hardError | enriched      | —          | false   | Italia  | Veneto          | Province of Treviso | 2026-05-14 19:40:28  |
| 791ade58   | Monteleone di Spoleto | 42.651006 | 12.951560 | ok      | hardError | enriched      | —          | false   | Italia  | Umbria          | Perugia             | 2026-05-14 19:40:24  |
| 674cda6d   | San Leo               | 43.896961 | 12.343644 | ok      | hardError | enriched      | —          | false   | Italia  | Emilia-Romagna  | Rímini              | 2026-05-14 19:38:03  |

## §6. SQL UPDATE propuesto — COMENTADO, NO EJECUTAR

```sql
-- DRY RUN — NO EJECUTAR EN B2a
-- UPDATE public.locations
-- SET geo_health = 'hardError',
--     updated_at = now()
-- WHERE geo_health = 'ok'
--   AND enrichment_status = 'enriched'
--   AND raw_geocode IS NULL
--   AND latitude  IS NOT NULL
--   AND longitude IS NOT NULL
--   AND NOT (latitude = 0 AND longitude = 0)
--   AND ABS(latitude)  <= 90
--   AND ABS(longitude) <= 180;
```

**Propiedades:**

- **Idempotente**: re-ejecutar no cambia filas (el predicado `geo_health='ok'` ya excluye las recién marcadas como `'hardError'`).
- **Read-only sobre datos críticos**: NO toca `latitude`, `longitude`, `enriched_data`, `enrichment_status`, `raw_geocode`, FKs geográficas (`region_id`, `zone_id`, `admin3_id`, `locality_id`).
- **Trigger único**: sólo `geo_health` + bump de `updated_at`.

## §7. Riesgos

| Id | Riesgo | Mitigación |
|----|--------|-----------|
| R1 | Explosión visual: ~389 health rings rojos aparecen simultáneamente en el mapa global y en sidebars de usuarios cuyos POIs caigan en scope. | Comunicar antes del UPDATE real. Esperar que B5 (re-geocode) corra detrás y devuelva la mayoría a `'ok'` en horas. |
| R2 | `geocoding-job` saturando Nominatim cuando se procesen los 389 a la vez. | Ejecutar B5 con `page_size` bajo (≤25) y cooldown explícito. Helper canónico `lookup_admin_area` ya respeta rate-limit. |
| R3 | Algún POI puede tener coords correctas pero `raw_geocode` perdido por bug histórico; el re-geocode podría desplazar sutilmente los FKs admin si Nominatim devuelve otra opción. | B5 debe correr en modo `fill`: rellenar sólo lo que falte, conservando lat/lon. Verificar que `geocoding-job` no sobrescribe coords cuando lat/lon ya existen. |
| R4 | Solapamiento con D6 (`zone==region`): 1 POI también necesitará B3. | El orden B2a → B3 sigue siendo seguro: B3 sólo limpia `zone_id` redundante, no afecta `geo_health`. |
| R5 | Si `enriched_data.descripcion` está vacío para alguno de estos POIs, el cambio de `geo_health` podría chocar con `getPointVisualState` (gris empty + ring rojo). | Combinación válida según `mem://style/map/health-rings-rule`: rings se renderizan sobre cualquier estado de marker. No bloqueante. |

## §8. Rollback plan

**Pre-requisito antes de ejecutar el UPDATE real (FUERA de B2a):**

```sql
-- Snapshot pre-UPDATE (exportar a CSV)
COPY (
  SELECT id, geo_health AS prev_geo_health, updated_at AS prev_updated_at
  FROM public.locations
  WHERE geo_health = 'ok'
    AND enrichment_status = 'enriched'
    AND raw_geocode IS NULL
    AND latitude  IS NOT NULL
    AND longitude IS NOT NULL
    AND NOT (latitude = 0 AND longitude = 0)
    AND ABS(latitude)  <= 90
    AND ABS(longitude) <= 180
) TO STDOUT WITH CSV HEADER;
```

**Rollback (solo si se detecta incidente):**

```sql
-- ROLLBACK — NO EJECUTAR salvo incidente
-- UPDATE public.locations
-- SET geo_health = 'ok'
-- WHERE id = ANY($1::uuid[]);   -- $1 = ids capturados en el snapshot
```

**Ventana de rollback:** ilimitada mientras nadie reenriquezca los POIs afectados (los ids del snapshot siguen siendo válidos). Idempotente: re-ejecutar el rollback no cambia filas ya restauradas.

## §9. Confirmación read-only

- **3 queries `SELECT`** ejecutados vía `supabase--read_query` (conteo, breakdown, solapamiento D6).
- `0` UPDATE / `0` DELETE / `0` INSERT / `0` migraciones / `0` re-enrich.
- Ningún archivo de `src/`, `supabase/`, `package.json`, `README.md`, `app-version.ts` modificado.
- Único archivo creado: este documento.
