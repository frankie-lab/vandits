# B2a — geo_health stale dry-run (plan)

Crear `docs/audits/b2-geo-health-stale-dry-run.md` con auditoría y UPDATE propuesto **comentado** para los ~394 POIs con `geo_health='ok'` que incumplen R2 (`enrichment_status='enriched' AND raw_geocode IS NULL`).

Solo lectura. Sin UPDATE, sin migración, sin re-enrich, sin bump.

## Pasos

1. Ejecutar SELECTs read-only vía `supabase--read_query`:
   - **Conteo total** del scope R2 estricto (sub-criterio `enriched + raw_geocode IS NULL`, sin null/(0,0)/out-of-range, ya verificados en cero).
   - **Breakdown** por country/region (top 10) para dimensionar.
   - **10 ejemplos** con `id, name, lat, lon, geo_health (current='ok'), target_geo_health='hardError', enrichment_status, geo_source, geo_confidence, raw_geocode IS NULL, country, region, zone, updated_at`.
   - **Confirmación R2 puro**: query con `HAVING` que verifique que el 100% del scope cae exclusivamente por el sub-criterio R2 (coords válidas, no null, no (0,0), no out-of-range).
   - **Solapamiento D6**: cuántos del scope tienen también `zone == region` (informativo, no bloqueante).

2. Escribir `docs/audits/b2-geo-health-stale-dry-run.md` con:
   - **§1 Objetivo** — Marcar como `hardError` los POIs enriched sin `raw_geocode` para que el sistema de Salud los detecte y `geocoding-job` los reprocese. No mover coords. No tocar `enriched_data`.
   - **§2 Scope** — conteo total + breakdown.
   - **§3 Validación R2 puro** — confirmación de que todos los casos son R2 exclusivamente.
   - **§4 SQL SELECT** dry-run (queries ejecutadas, copy-paste reproducible).
   - **§5 10 ejemplos** (tabla markdown).
   - **§6 SQL UPDATE propuesto (COMENTADO, NO EJECUTAR)**:
     ```sql
     -- DRY RUN — NO EJECUTAR
     -- UPDATE public.locations
     -- SET geo_health = 'hardError',
     --     updated_at = now()
     -- WHERE geo_health = 'ok'
     --   AND enrichment_status = 'enriched'
     --   AND raw_geocode IS NULL
     --   AND latitude IS NOT NULL
     --   AND longitude IS NOT NULL
     --   AND NOT (latitude = 0 AND longitude = 0)
     --   AND ABS(latitude) <= 90
     --   AND ABS(longitude) <= 180;
     ```
     - **Idempotencia**: re-ejecutarlo no cambia filas (predicate ya excluye `geo_health='hardError'`).
     - **No toca**: `latitude`, `longitude`, `enriched_data`, `enrichment_status`, `raw_geocode`, FKs geográficas.
   - **§7 Riesgos**:
     - R1: Explosión visual de health rings rojos (~394 markers) si UI no se prepara. Mitigación: comunicar antes de B5.
     - R2: `geocoding-job` saturando Nominatim al reprocesar masivo. Mitigación: ejecutar B5 con `page_size` bajo y cooldown.
     - R3: Si algún POI tiene coords correctas pero `raw_geocode` perdido por bug histórico, el reprocesado puede mover sutilmente las coords vía FKs. Mitigación: B5 debe correr en modo `fill` que preserve coords si el match es ambiguo.
     - R4: Solapamiento con D6 (`zone==region`) — POIs marcados aquí también necesitarán B3, pero el orden B2→B3 sigue siendo seguro (B3 sólo limpia `zone_id` redundante).
   - **§8 Rollback plan**:
     ```sql
     -- ROLLBACK (NO EJECUTAR salvo incidente)
     -- UPDATE public.locations
     -- SET geo_health = 'ok'
     -- WHERE id = ANY($1::uuid[]);  -- snapshot de ids capturado pre-UPDATE
     ```
     - **Pre-requisito**: antes de ejecutar el UPDATE real (fuera de B2a), capturar snapshot `SELECT id FROM ... WHERE <scope>` a CSV.
     - Ventana de rollback: ilimitada (el campo es idempotente y la condición original es reproducible mientras nadie re-enriquezca).
   - **§9 Confirmación read-only** — ningún UPDATE/DELETE/migración ejecutado en esta fase.

## Archivos

- **Crear**: `docs/audits/b2-geo-health-stale-dry-run.md`
- **No tocar**: `src/`, `supabase/`, `package.json`, `README.md`, `app-version.ts`, `.lovable/plan.md`, `docs/audits/geo-backfill-dry-run.md` (B2a es spin-off independiente).

## Version impact

**none** — solo documentación.
