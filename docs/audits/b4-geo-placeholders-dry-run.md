# B4 — Limpieza de placeholders geográficos (DRY-RUN)

**Estado:** read-only. Cero UPDATE/DELETE/migración/re-enrich/código/bump.
**Fecha:** 2026-05-20
**Scope:** placeholders `(sin <nivel>)` persistidos como si fueran valores reales en columnas estructuradas y en `enriched_data.datos_geograficos.*`.

---

## 1. Resumen de conteos

### Columnas estructuradas

| Campo | Count | Patrón |
|---|---|---|
| `country` | 0 | — |
| `continent` | 0 | — |
| `region` | **433** | `(sin región)` |
| `zone` | **26** | `(sin provincia)` |

### `enriched_data.datos_geograficos.*`

| Clave | Count | Patrón |
|---|---|---|
| `admin_nivel_1` | **276** | `(sin región)` |
| `admin_nivel_2` | **1 175** | `(sin provincia)` |
| `admin_nivel_3` | 0 | — |
| `admin_nivel_4` | 0 | — |
| `pais` / `continente` / `region` / `provincia` / `comarca` / `localidad` / `sublocalidad` | 0 | — |

**Total filas afectadas únicas (estimado):** ~1 600 (alta intersección entre `region` estructurada y `admin_nivel_1` enriched, idem `zone`/`admin_nivel_2`).

### Snapshots / hashes pre-flight

| Bucket | n | md5 |
|---|---|---|
| `region LIKE '(sin %'` | 433 | `4c7e39bb9dd4a6955bbef315bb3b49d6` |
| `zone LIKE '(sin %'` | 26 | `e6ff76bfca91cfd42fe0429364e49ff9` |
| `ed.admin_nivel_1 LIKE '(sin %'` | 276 | `ceff9b02684b77d45583e7d4304de2e3` |
| `ed.admin_nivel_2 LIKE '(sin %'` | 1 175 | `25ecd1154a7e4de43fff85f4bc716405` |

---

## 2. Breakdown por país (filas con ≥1 placeholder en region/zone/ed.n1/ed.n2)

| País | n |
|---|---|
| Italia | 867 |
| Portugal | 247 |
| Francia | 153 |
| España | 100 |
| Rumania | 49 |
| Noruega | 31 |
| Croacia | 23 |
| Serbia | 14 |
| Finlandia | 13 |
| Turquía | 12 |
| Eslovenia | 10 |
| Islandia | 9 |
| Estonia | 8 |
| Estados Unidos | 7 |
| Suecia | 7 |

---

## 3. Ejemplos (5 por bucket)

### `region = "(sin región)"` (columna)

| id | name | country | region | zone |
|---|---|---|---|---|
| 469e876b… | Macerata Feltria | Italia | (sin región) | Pesaro e Urbino |
| aab35077… | Citta di San Marino | San Marino | (sin región) | — |
| 36f3c83b… | Plänterwald | Alemania | (sin región) | — |
| c9afc5ba… | Hvar | Croacia | (sin región) | Split-Dalmatia County |
| 27d734a8… | Šišatovac monastery | Serbia | (sin región) | Voivodina |

### `zone = "(sin provincia)"` (columna)

| id | name | country | region | zone |
|---|---|---|---|---|
| 4286f755… | Chinchón | España | Comunidad de Madrid | (sin provincia) |
| 2cbf60c9… | Tazones | España | Principado de Asturias | (sin provincia) |
| 13ff227d… | Santa Fiora | Italia | Toscana | (sin provincia) |
| 0bd63308… | Toppo | Italia | Friuli-Venecia Julia | (sin provincia) |
| 2b8ba8c8… | Seinäjoki | Finlandia | South Ostrobothnia | (sin provincia) |

### `enriched_data.admin_nivel_1 = "(sin región)"`

Coincide en su mayoría con el bucket `region` estructurada (mismos POIs: Macerata Feltria, San Marino, Hvar, Šišatovac, Soomaa…).

### `enriched_data.admin_nivel_2 = "(sin provincia)"`

| id | name | country | n1 | n2 |
|---|---|---|---|---|
| 247fee24… | Potes | España | Cantabria | (sin provincia) |
| 86931110… | Liérganes | España | Cantabria | (sin provincia) |
| c0bc30cf… | Carmona | España | Cantabria | (sin provincia) |
| 3b8c47ed… | Bulnes | España | Principado de Asturias | (sin provincia) |
| d3b746a6… | Fornalutx | España | Illes Balears | (sin provincia) |

---

## 4. SQL SELECT reproducible

```sql
-- Conteo por columna estructurada
SELECT 'region' AS field, count(*) FROM locations
  WHERE deleted_at IS NULL AND lower(btrim(region)) LIKE '(sin %'
UNION ALL SELECT 'zone', count(*) FROM locations
  WHERE deleted_at IS NULL AND lower(btrim(zone)) LIKE '(sin %'
UNION ALL SELECT 'country', count(*) FROM locations
  WHERE deleted_at IS NULL AND lower(btrim(country)) LIKE '(sin %'
UNION ALL SELECT 'continent', count(*) FROM locations
  WHERE deleted_at IS NULL AND lower(btrim(continent)) LIKE '(sin %';

-- Conteo por clave enriched_data
WITH keys AS (
  SELECT unnest(ARRAY['admin_nivel_1','admin_nivel_2','admin_nivel_3','admin_nivel_4',
                      'pais','continente','region','provincia','comarca','localidad','sublocalidad']) AS k
)
SELECT k.k AS key,
       count(*) FILTER (WHERE lower(btrim(l.enriched_data->'datos_geograficos'->>k.k)) LIKE '(sin %') AS n
FROM locations l CROSS JOIN keys k
WHERE l.deleted_at IS NULL
GROUP BY k.k ORDER BY n DESC;

-- Snapshot/hash por bucket (pre-flight para B4-execute)
SELECT count(*) AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS hash
FROM (SELECT id FROM locations WHERE deleted_at IS NULL AND lower(btrim(region)) LIKE '(sin %') s;
-- repetir para zone, ed.admin_nivel_1, ed.admin_nivel_2
```

---

## 5. SQL UPDATE propuesto (COMENTADO — NO EJECUTAR)

> Cuatro pasadas idempotentes, snapshot+hash por bucket. Cada UPDATE toca un único campo + `updated_at`.

```sql
-- B4a: region textual placeholder → NULL (~433)
-- UPDATE locations SET region = NULL, updated_at = now()
-- WHERE deleted_at IS NULL AND lower(btrim(region)) LIKE '(sin %';

-- B4b: zone textual placeholder → NULL (~26)
-- UPDATE locations SET zone = NULL, updated_at = now()
-- WHERE deleted_at IS NULL AND lower(btrim(zone)) LIKE '(sin %';

-- B4c: enriched_data.admin_nivel_1 placeholder → null (~276)
-- UPDATE locations
-- SET enriched_data = jsonb_set(enriched_data, '{datos_geograficos,admin_nivel_1}', 'null'::jsonb, false),
--     updated_at = now()
-- WHERE deleted_at IS NULL
--   AND lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_1')) LIKE '(sin %';

-- B4d: enriched_data.admin_nivel_2 placeholder → null (~1175)
-- UPDATE locations
-- SET enriched_data = jsonb_set(enriched_data, '{datos_geograficos,admin_nivel_2}', 'null'::jsonb, false),
--     updated_at = now()
-- WHERE deleted_at IS NULL
--   AND lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_2')) LIKE '(sin %';
```

### Campos NO tocados (garantía dura)

`country`, `country_id`, `continent`, `continent_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`, `sublocality_id`, `latitude`, `longitude`, `altitude`, `raw_geocode`, `enrichment_status`, `geo_health`, `geo_source`, `geo_confidence`, `name`, `description`, `owner_user_id`, `document_id`, `visibility`, `is_approved`, resto de claves de `enriched_data` (incluido `descripcion`, `tags`, `pais`, `continente`, `admin_nivel_3/4`, etc.).

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| `region`/`zone` NULL hace que el árbol caiga a `(sin <nivel>)` en `GeographyTree`. | El placeholder ya estaba allí — no hay regresión visual. Helper `getLocationHierarchy` rinde el mismo label desde literal-string a fallback. |
| `enriched_data.admin_nivel_2` NULL podría re-romper el fallback usado en B3 (Opción A) para ~199 POIs. | No aplica: B4 sólo nulifica los placeholders, no los valores reales. Los 199 fallback-POIs tienen valores reales (Cáceres, Asturias…), no placeholders. |
| Re-introducción del placeholder por un futuro pipeline de enrichment. | Fuera de scope B4 (requiere CHECK trigger o normalizador en el pipeline, propuesta B5). |
| Drift entre snapshot y execute. | Guard CTE en B4-execute aborta si `(count, hash)` ≠ snapshot. |

---

## 7. Rollback plan

Por bucket, predicado idempotente seguro (no requiere lista de IDs):

```sql
-- Rollback B4a/B4b: restaurar literal "(sin <nivel>)" si fuera necesario para UI
-- UPDATE locations SET region = '(sin región)', updated_at = now()
-- WHERE deleted_at IS NULL AND region IS NULL AND updated_at >= '<fecha-execute>'::date AND id IN (snapshot);

-- Rollback B4c/B4d: restaurar literal en enriched_data
-- UPDATE locations
-- SET enriched_data = jsonb_set(enriched_data, '{datos_geograficos,admin_nivel_2}', '"(sin provincia)"'::jsonb, false),
--     updated_at = now()
-- WHERE deleted_at IS NULL AND enriched_data->'datos_geograficos'->'admin_nivel_2' = 'null'::jsonb
--   AND updated_at >= '<fecha-execute>'::date AND id IN (snapshot);
```

Recomendable capturar snapshot `(id, region|zone|n1|n2)` previo en tabla temporal `b4_geo_snapshot` o CSV en `/mnt/documents/` para rollback granular. Sin snapshot, PITR es la red de seguridad.

---

## 8. Recomendación de ejecución

**Proceder con B4-execute en 4 pasadas independientes**, snapshot+hash por bucket:

1. **B4a** — `region` (433) — bajo riesgo, alta visibilidad UI.
2. **B4b** — `zone` (26) — bajo riesgo, marginal.
3. **B4c** — `ed.admin_nivel_1` (276) — coherencia con B4a.
4. **B4d** — `ed.admin_nivel_2` (1 175) — coherencia con B4b + B3.5.

Cada pasada con guard CTE (`abort` en drift >0.5 %). Ninguna toca FK ni geometría ni enrichment. Resultado: el árbol geográfico ya cae al placeholder UI canónico (`(sin <nivel>)`) por código, no por dato — separación correcta de presentación vs persistencia.

**Aprobación requerida** antes de capturar snapshots + UPDATE.

---

## 9. Restricciones honradas

- Cero UPDATE. Cero DELETE. Cero migración. Cero re-enrich. Cero código. Cero bump.
- Cero edición de `.lovable/plan.md`.
- Solo SELECT read-only + creación de este documento.

**Version impact:** none.
