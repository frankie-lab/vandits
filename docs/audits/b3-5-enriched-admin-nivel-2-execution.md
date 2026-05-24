# B3.5 — `enriched_data.admin_nivel_2 == admin_nivel_1` cleanup (EXECUTED)

**Status:** ✅ Executed
**Date:** 2026-05-20
**Scope:** 56 POIs donde `enriched_data.datos_geograficos.admin_nivel_2` duplicaba `admin_nivel_1`.

## Snapshot pre-ejecución

- **Count:** 56
- **Hash:** `044efd50f85bcd4c3e5e9bf948a15e12`
- **Predicado:**
  ```sql
  deleted_at IS NULL
    AND enriched_data->'datos_geograficos'->>'admin_nivel_1' IS NOT NULL
    AND enriched_data->'datos_geograficos'->>'admin_nivel_2' IS NOT NULL
    AND lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_2'))
      = lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_1'))
  ```

Verificado pre-flight: `n=56`, `hash=044efd50f85bcd4c3e5e9bf948a15e12` (match exacto con dry-run B3).

## SQL ejecutado

```sql
WITH snap AS (
  SELECT id FROM locations
  WHERE deleted_at IS NULL
    AND enriched_data->'datos_geograficos'->>'admin_nivel_1' IS NOT NULL
    AND enriched_data->'datos_geograficos'->>'admin_nivel_2' IS NOT NULL
    AND lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_2'))
      = lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_1'))
),
guard AS (
  SELECT count(*) AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS hash FROM snap
),
abort AS (
  SELECT 1/CASE WHEN (SELECT n FROM guard)=56
                 AND (SELECT hash FROM guard)='044efd50f85bcd4c3e5e9bf948a15e12'
            THEN 1 ELSE 0 END AS ok
)
UPDATE locations l
SET enriched_data = jsonb_set(
      l.enriched_data,
      '{datos_geograficos,admin_nivel_2}',
      'null'::jsonb,
      false
    ),
    updated_at = now()
FROM snap, abort
WHERE l.id = snap.id;
```

Guard CTE habría abortado con `division_by_zero` si count o hash no coincidían.

## Campos modificados

- `enriched_data.datos_geograficos.admin_nivel_2` → JSON `null` (clave conservada, valor nulificado)
- `updated_at` → `now()`

## Campos NO tocados

`zone`, `zone_id`, `region`, `region_id`, `admin3_id`, `locality_id`, `country`, `country_id`, `continent`, `latitude`, `longitude`, `altitude`, `raw_geocode`, `enrichment_status`, `geo_health`, `geo_source`, `geo_confidence`, resto de claves dentro de `enriched_data` (incluido `admin_nivel_1` y todo `datos_geograficos.*` distinto de `admin_nivel_2`).

## Post-flight

- **Remaining duplicados:** 0 ✅
- Predicado idempotente: re-ejecución safe no-op.

## Rollback

Sin snapshot externo `(id, admin_nivel_2_old)`, el rollback exacto del valor textual no es posible vía SQL (B3.5 sustituyó por `null`, no preservamos el valor previo — que por definición era igual a `admin_nivel_1`).

Rollback funcional (restaurar duplicado a partir de `admin_nivel_1`):

```sql
-- UPDATE locations
-- SET enriched_data = jsonb_set(
--       enriched_data,
--       '{datos_geograficos,admin_nivel_2}',
--       to_jsonb(enriched_data->'datos_geograficos'->>'admin_nivel_1'),
--       false
--     ),
--     updated_at = now()
-- WHERE deleted_at IS NULL
--   AND enriched_data->'datos_geograficos'->>'admin_nivel_1' IS NOT NULL
--   AND enriched_data->'datos_geograficos'->'admin_nivel_2' = 'null'::jsonb
--   AND updated_at >= '2026-05-20'::date;
```

PITR si se requiere restauración exacta byte-a-byte.

---

**Version impact:** none. **No migrations, no code, no re-enrich, no bump.**
