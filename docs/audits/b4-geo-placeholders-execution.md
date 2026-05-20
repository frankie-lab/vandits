# B4 — Placeholders geográficos (EXECUTED)

**Status:** ✅ Executed (4 pasadas idempotentes)
**Fecha:** 2026-05-20
**Plan:** `docs/audits/b4-geo-placeholders-dry-run.md`

## Pre-flight (snapshot+hash validados)

| Bucket | n | hash |
|---|---|---|
| `region LIKE '(sin %'` | 433 | `4c7e39bb9dd4a6955bbef315bb3b49d6` ✅ |
| `zone LIKE '(sin %'` | 26 | `e6ff76bfca91cfd42fe0429364e49ff9` ✅ |
| `ed.admin_nivel_1 LIKE '(sin %'` | 276 | `ceff9b02684b77d45583e7d4304de2e3` ✅ |
| `ed.admin_nivel_2 LIKE '(sin %'` | 1 175 | `25ecd1154a7e4de43fff85f4bc716405` ✅ |

Sin drift respecto al dry-run.

## SQL ejecutado (4 pasadas)

Cada UPDATE protegido por CTE guard (`abort` con division_by_zero si n/hash no coincide).

```sql
-- B4a: region = NULL (433)
WITH snap AS (SELECT id FROM locations WHERE deleted_at IS NULL AND lower(btrim(region)) LIKE '(sin %'),
guard AS (SELECT count(*) AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS h FROM snap),
abort AS (SELECT 1/CASE WHEN (SELECT n FROM guard)=433 AND (SELECT h FROM guard)='4c7e39bb9dd4a6955bbef315bb3b49d6' THEN 1 ELSE 0 END AS ok)
UPDATE locations l SET region=NULL, updated_at=now() FROM snap, abort WHERE l.id=snap.id;

-- B4b: zone = NULL (26)
WITH snap AS (SELECT id FROM locations WHERE deleted_at IS NULL AND lower(btrim(zone)) LIKE '(sin %'),
guard AS (SELECT count(*) AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS h FROM snap),
abort AS (SELECT 1/CASE WHEN (SELECT n FROM guard)=26 AND (SELECT h FROM guard)='e6ff76bfca91cfd42fe0429364e49ff9' THEN 1 ELSE 0 END AS ok)
UPDATE locations l SET zone=NULL, updated_at=now() FROM snap, abort WHERE l.id=snap.id;

-- B4c: enriched_data.admin_nivel_1 = null (276)
WITH snap AS (SELECT id FROM locations WHERE deleted_at IS NULL AND lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_1')) LIKE '(sin %'),
guard AS (SELECT count(*) AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS h FROM snap),
abort AS (SELECT 1/CASE WHEN (SELECT n FROM guard)=276 AND (SELECT h FROM guard)='ceff9b02684b77d45583e7d4304de2e3' THEN 1 ELSE 0 END AS ok)
UPDATE locations l SET enriched_data=jsonb_set(l.enriched_data,'{datos_geograficos,admin_nivel_1}','null'::jsonb,false), updated_at=now() FROM snap, abort WHERE l.id=snap.id;

-- B4d: enriched_data.admin_nivel_2 = null (1175)
WITH snap AS (SELECT id FROM locations WHERE deleted_at IS NULL AND lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_2')) LIKE '(sin %'),
guard AS (SELECT count(*) AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS h FROM snap),
abort AS (SELECT 1/CASE WHEN (SELECT n FROM guard)=1175 AND (SELECT h FROM guard)='25ecd1154a7e4de43fff85f4bc716405' THEN 1 ELSE 0 END AS ok)
UPDATE locations l SET enriched_data=jsonb_set(l.enriched_data,'{datos_geograficos,admin_nivel_2}','null'::jsonb,false), updated_at=now() FROM snap, abort WHERE l.id=snap.id;
```

## Campos modificados

- B4a → `region` (text → NULL)
- B4b → `zone` (text → NULL)
- B4c → `enriched_data.datos_geograficos.admin_nivel_1` (text → JSON null)
- B4d → `enriched_data.datos_geograficos.admin_nivel_2` (text → JSON null)
- `updated_at` → `now()` en cada pasada

## Campos NO tocados

`country`, `country_id`, `continent`, `continent_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`, `sublocality_id`, `latitude`, `longitude`, `altitude`, `raw_geocode`, `enrichment_status`, `geo_health`, `geo_source`, `geo_confidence`, resto de claves de `enriched_data` (incluido `descripcion`, `tags`, `pais`, `continente`, `admin_nivel_3/4`).

## Post-flight

| Bucket | Remaining |
|---|---|
| `region LIKE '(sin %'` | **0** ✅ |
| `zone LIKE '(sin %'` | **0** ✅ |
| `ed.admin_nivel_1 LIKE '(sin %'` | **0** ✅ |
| `ed.admin_nivel_2 LIKE '(sin %'` | **0** ✅ |

## Rollback

Predicados idempotentes; sin snapshot externo, sólo restauración funcional (todos los valores previos eran exactamente `(sin <nivel>)`):

```sql
-- B4a/B4b rollback funcional
-- UPDATE locations SET region='(sin región)', updated_at=now() WHERE deleted_at IS NULL AND region IS NULL AND updated_at >= '2026-05-20'::date AND id IN (snapshot externo);
-- (idem para zone)

-- B4c/B4d rollback funcional
-- UPDATE locations SET enriched_data=jsonb_set(enriched_data,'{datos_geograficos,admin_nivel_2}','"(sin provincia)"'::jsonb,false), updated_at=now()
-- WHERE deleted_at IS NULL AND enriched_data->'datos_geograficos'->'admin_nivel_2'='null'::jsonb AND updated_at >= '2026-05-20'::date AND id IN (snapshot externo);
```

PITR si se requiere restauración exacta byte-a-byte.

---

**Version impact:** none. No migrations, no code, no re-enrich, no bump.
