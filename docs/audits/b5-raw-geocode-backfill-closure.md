# B5 — Backfill raw_geocode para enriched POI-3 — CLOSURE

**Estado:** ✅ CERRADO
**Fecha cierre:** 2026-05-21
**Version impact:** none
**Tests/lint:** not run — docs-only B5 closure.

---

## 1. Resumen ejecutivo

- **Scope inicial:** 339 POIs en POI-3 (enriched + `raw_geocode IS NULL`).
- **338 fixtures sintéticos** identificados y soft-deleted por **Camino G** (reversible vía `deleted_at`).
- **1 POI real residual:** `Monasterio de Sumela` (id `b41a33d7-10e7-45c0-9cc9-f95fbd775d13`).
- **Sumela resuelto por Camino R** con `resolve-coordinates` (`persist: true`).
- **Sumela:** `geo_health` **partial → ok**.
- **Sumela:** `geo_confidence = 95`.
- **Sumela:** FKs admin completas (`continent_id`, `country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`).
- **Sumela queda en POI-9** (enriched + geo OK).
- **Scope POI-3 final = 0.**
- **B5 cerrado.**

---

## 2. Distribución del scope

| Bloque | Cubo | Count | Tratamiento | Resultado |
|---|---|---:|---|---|
| G-piloto (owner `08e0c12c…`) | B | 10 | Soft-delete | ✅ |
| G-1 resto (owner `08e0c12c…`) | B | 169 | Soft-delete | ✅ |
| G-2 (owner `ec870c6b…`) | B | 159 | Soft-delete | ✅ |
| **Total fixtures sintéticos** | **B** | **338** | **Soft-delete reversible** | ✅ |
| Monasterio de Sumela | A | 1 | `resolve-coordinates persist:true` | ✅ POI-9 |
| **Total scope inicial** | | **339** | | **POI-3 = 0** |

---

## 3. Auditorías creadas

- `docs/audits/b5-raw-geocode-backfill-poi3-plan.md` — Plan + recomendación Camino G.
- `docs/audits/b5-g-pilot-soft-delete-execution.md` — Ejecución G-piloto (10 IDs).
- `docs/audits/b5-g1-soft-delete-execution.md` — Ejecución G-1 (169 IDs).
- `docs/audits/b5-g2-soft-delete-execution.md` — Ejecución G-2 (159 IDs).
- `docs/audits/b5-camino-r-sumela-execution.md` — Ejecución Camino R Sumela.
- `docs/audits/b5-raw-geocode-backfill-closure.md` — Este documento.

## 4. Snapshots creados

- `docs/audits/snapshots/b5-raw-geocode-backfill-scope.csv` — Scope completo inicial (339).
- `docs/audits/snapshots/b5-g1-soft-delete-scope.csv` — 169 IDs G-1.
- `docs/audits/snapshots/b5-g2-soft-delete-scope.csv` — 159 IDs G-2.
- `docs/audits/snapshots/b5-camino-r-sumela-preflight.csv` — Pre-flight Sumela.

---

## 5. Columnas tocadas

**Soft-delete (G-piloto + G-1 + G-2, 338 filas):**
- `deleted_at` → `now()` (era `NULL`).
- `updated_at` → `now()`.

**Camino R Sumela (1 fila):**
- `raw_geocode` → jsonb canónico Nominatim.
- `geo_source` → `'nominatim'`.
- `geo_confidence` → `95`.
- `geo_resolved_at` → `now()`.
- `country_code` → `'TR'`.
- `postal_code` → `'61750'`.
- `continent_id`, `country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id` → FKs canónicas.
- `geo_health` → recalculado a `'ok'` (vía trigger).
- `updated_at` → `now()`.

## 6. Columnas NO tocadas (en ninguno de los 339)

- `name`
- `latitude`, `longitude`
- `enriched_data`
- `enrichment_status`
- Colecciones / membresías
- `is_approved`
- `owner_user_id`
- Cualquier otra columna no listada en §5.

---

## 7. Garantías negativas

- ✅ **No hubo re-enrich IA** — ni en fixtures soft-deleted, ni en Sumela. `enriched_data` y `enrichment_status` intactos en las 339 filas.
- ✅ **No se geocodificaron fixtures** — `resolve-coordinates` se ejecutó **exclusivamente** sobre Sumela (1 ID). Los 338 fixtures NO recibieron `raw_geocode`.
- ✅ **No hubo hard-delete** — los 338 fixtures se marcaron con `deleted_at = now()`, fila física preservada.
- ✅ **No hubo bump de versión** — `1.3.5` sin cambios.
- ✅ **No hubo cambios de código, migraciones, edge functions, `package.json`, app-version, README, version-history, ni `.lovable/plan.md`.**

---

## 8. Rollback disponible

**G-piloto / G-1 / G-2 (338 filas):**
```sql
-- Por bloque (preferido, usando snapshots)
UPDATE public.locations
SET deleted_at = NULL, updated_at = now()
WHERE id IN (SELECT id FROM <snapshot-csv>);

-- O time-bounded (defensivo)
UPDATE public.locations
SET deleted_at = NULL, updated_at = now()
WHERE owner_user_id IN ('08e0c12c-bdab-4db8-b147-7ef8ce7c5c76','ec870c6b-fe8f-41c3-8682-a70bd67cf128')
  AND deleted_at >= '2026-05-21'
  AND raw_geocode IS NULL
  AND enrichment_status = 'enriched';
```

**Camino R Sumela (1 fila):**
```sql
UPDATE public.locations
SET raw_geocode = NULL,
    geo_source = NULL,
    geo_confidence = NULL,
    geo_resolved_at = NULL,
    country_code = NULL,
    postal_code = NULL,
    continent_id = NULL,
    country_id = NULL,
    region_id = NULL,
    zone_id = NULL,
    admin3_id = NULL,
    locality_id = NULL,
    updated_at = now()
WHERE id = 'b41a33d7-10e7-45c0-9cc9-f95fbd775d13';
-- geo_health volverá a 'partial' vía trigger.
```

Pre-flight snapshot disponible en `docs/audits/snapshots/b5-camino-r-sumela-preflight.csv`.

---

## 9. Cierre

B5 cerrado. Scope POI-3 = 0. Sin deuda residual. Reversibilidad 100% para los 339 cambios.
