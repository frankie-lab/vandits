# Geo Historical Cleanup — Closure (B2 → B5b/B5c)

**Status:** ✅ Cierre histórico. Docs-only.
**Fecha:** 2026-05-20
**Version impact:** none. Sin bump. Sin código. Sin migraciones. Sin re-enrich.

Documento de cierre de la campaña histórica de limpieza geográfica sobre `public.locations`. Consolida fases B2 → B5b/B5c en un único punto de entrada. No modifica datos.

---

## 1. Fases ejecutadas

| Fase | Objeto | Acción | Filas afectadas | Auditoría |
|---|---|---|---:|---|
| **B2b** | `geo_health` stale (`ok` con `raw_geocode IS NULL`) | `geo_health → 'hardError'` (re-evaluable) | **388** | `b2-geo-health-stale-execution.md` |
| **B3** | `zone == region` (duplicado denormalizado) | `zone → NULL` | **1 607** | `b3-zone-region-execution.md` |
| **B3.5** | `enriched_data.datos_geograficos.admin_nivel_2 == admin_nivel_1` | `admin_nivel_2 → null` (en JSON) | **56** | `b3-5-enriched-admin-nivel-2-execution.md` |
| **B4a** | `region LIKE '(sin %'` | `region → NULL` | **433** | `b4-geo-placeholders-execution.md` |
| **B4b** | `zone LIKE '(sin %'` | `zone → NULL` | **26** | `b4-geo-placeholders-execution.md` |
| **B4c** | `enriched_data.admin_nivel_1 LIKE '(sin %'` | `admin_nivel_1 → null` | **276** | `b4-geo-placeholders-execution.md` |
| **B4d** | `enriched_data.admin_nivel_2 LIKE '(sin %'` | `admin_nivel_2 → null` | **1 175** | `b4-geo-placeholders-execution.md` |
| **B5a piloto** | `B5a_CLEAN` calibración | `resolve-coordinates` (raw_geocode + *_id + geo_health) | **5** | `b5a-pilot-5-execution.md` |
| **B5a.2** | `B5a_CLEAN` batch | `resolve-coordinates` | **30** | `b5a-2-batch-30-execution.md` |
| **B5a.3** | `B5a_CLEAN` cierre | `resolve-coordinates` | **19** | `b5a-3-final-19-execution.md` |
| **B5a stale-name refresh** | Re-evaluación bucket | Reclassify (sin data write) | — | `b5a-stale-name-refresh-execution.md` |
| **B5b/B5c flags** | `custom_data.geo_resolution` para 70 POIs no aptos B5a | `pending_review`/`needs_name_fix`/`geo_irrecoverable` | **70** | `geo-resolution-flags-application-execution.md` |
| **Totales** | | | **~4 085 escrituras** | |

---

## 2. Auditoría completa (archivos generados)

### 2.1 Dry-runs + execution pairs
- `b2-geo-health-stale-dry-run.md` + `b2-geo-health-stale-execution.md`
- `b3-zone-region-dry-run.md` + `b3-zone-region-execution.md`
- `b3-5-enriched-admin-nivel-2-execution.md` (sin dry-run independiente — derivado del dry-run de B3)
- `b4-geo-placeholders-dry-run.md` + `b4-geo-placeholders-execution.md`
- `b5-full-classification-dry-run.md` (clasificación maestra L0)
- `b5-l0-calibration-sample.md` + `b5-l0-calibration-review.md`
- `b5-poi-maturity-distribution.md`
- `b5a-stale-name-dry-run.md` + `b5a-stale-name-refresh-execution.md`
- `b5a-pilot-5-execution.md`
- `b5a-2-batch-30-execution.md`
- `b5a-3-final-19-execution.md`
- `b5b-needs-name-fix-dry-run.md`
- `b5b-human-review-queue.md`
- `geo-resolution-flags-application-dry-run.md` + `geo-resolution-flags-application-execution.md`

### 2.2 Contratos
- `docs/contracts/geo-resolution-flags-contract.md` (estados `pending_review`/`needs_name_fix`/`needs_coord_fix`/`geo_irrecoverable`/`approved_for_geocode`/`resolved`).

### 2.3 Snapshots
- `docs/audits/snapshots/geo-resolution-flags-pre.csv` (snapshot pre-UPDATE de los 70 POIs B5b/B5c).
- Snapshots inline en cada execution doc (count + md5 hash + predicado SQL).

---

## 3. Datos tocados (whitelist)

Las únicas columnas modificadas en toda la campaña:

| Columna | Fases | Tipo de cambio |
|---|---|---|
| `locations.zone` | B3, B4b | `→ NULL` |
| `locations.region` | B4a | `→ NULL` |
| `locations.enriched_data` (jsonb path) | B3.5, B4c, B4d | `admin_nivel_*` → `null` |
| `locations.geo_health` | B2b, B5a (auto) | `'ok' → 'hardError'` (B2b); recálculo derivado (B5a) |
| `locations.raw_geocode` | B5a piloto + .2 + .3 | populado (54 POIs) |
| `locations.geo_source`, `geo_confidence`, `geo_resolved_at` | B5a piloto + .2 + .3 | populados |
| `locations.country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`, `country_code`, `admin1_iso`, `postal_code`, `timezone` | B5a piloto + .2 + .3 | populados/refrescados desde geocoder |
| `locations.custom_data` (jsonb path `geo_resolution`) | B5b/B5c flags | clave añadida (70 POIs) |
| `locations.updated_at` | todas | `now()` |

Todas las escrituras protegidas por CTE guard (`count + md5(id list)`) con `division_by_zero` en caso de drift.

---

## 4. Datos NO tocados (lista cerrada)

Bajo ninguna fase de la campaña histórica se modificó:

- ❌ `locations.name`
- ❌ `locations.latitude` / `locations.longitude` / `locations.altitude`
- ❌ `locations.description`
- ❌ `locations.enriched_data.descripcion` ni resto de bloques no-geográficos (`media`, `historia`, `rating*`, etc.)
- ❌ `locations.enrichment_status`
- ❌ `locations.is_approved`
- ❌ `locations.visibility`
- ❌ `locations.owner_user_id`, `pioneer_user_id`, `document_id`
- ❌ `locations.deleted_at`
- ❌ `locations.tags`, `locations.personal_category_id`
- ❌ `locations.type_id`, `place_type`
- ❌ Tablas relacionadas: `collections`, `collection_items`, `location_photos`, `location_notes`, `user_places`, `places`, `documents`, `document_tracks`.
- ❌ Código aplicación. Sin migraciones. Sin cambios en RLS. Sin re-enrich IA.

---

## 5. Pendiente para revisión humana

### 5.1 Cola B5b — 51 `human_review` (flagged)
- 14 `pending_review` / `generic_name`: decidir rename canónico vs `reject`.
- 37 `needs_name_fix` / `tail_suffix_artifact`: strip de sufijos `Nuevo`/`Nueva`/`#N` + resolución de colisiones intra-bucket (Burdeos×3, Albacete×2, Málaga×2).
- Detalle por POI en `b5b-human-review-queue.md`.

### 5.2 Cola B5c — 15 `geo_irrecoverable` (flagged)
- Nombres fabricados sin referente Wikipedia/OSM. Candidatos a soft-delete o reclasificación a fixture sintético.

### 5.3 4 Parque Municipal cosméticos (flagged `pending_review/manual_review_required`)
- `geo_health='ok'` con `raw_geocode` poblado tras B5a.3. Revisar nombre sin tocar el geocode resuelto.

### 5.4 Residuos B5a (no procesados)
- 19 POIs `B5a_CLEAN` originales descartados por riesgo (nombres ambiguos, `spaces≥2`, cuevas/nuraghe). Listados en `b5a-2-batch-30-execution.md §1` y `b5a-3-final-19-execution.md`. Requieren revisión caso a caso antes de cualquier `resolve-coordinates`.

---

## 6. Próximos pasos no automáticos

1. **UI admin filtrable por `custom_data.geo_resolution.status`** (contrato §7 "Futuro") para drenar las 70 filas flagged sin SQL ad-hoc.
2. **Gate operacional** en futuros batches B5/B5a: excluir `WHERE custom_data->'geo_resolution'->>'status' IN ('geo_irrecoverable','needs_name_fix')`. Documentado en `geo-resolution-flags-contract.md §6`.
3. **Resolución manual de colisiones TAIL** (Burdeos×3 etc.) antes de cualquier dedup automatizado.
4. **Revisión de los 4 Parque Municipal cosméticos** — decisión: aceptar el nombre genérico o renombrar manualmente preservando `raw_geocode`.
5. **Sweep periódico** de `geo_health = 'hardError'` para detectar nuevos candidatos B5a tras enriquecimientos sucesivos (re-evaluación, no rollback de B2b).
6. **Cierre formal de `tech-debt.md §7`** una vez la UI admin de flags esté operativa.

---

## 7. Garantías de cierre

- ✅ Todas las fases tienen dry-run + execution con `count` + `md5(id list)` coincidentes (excepto drift documentado de −1 en B2b, 0,26%).
- ✅ Todos los UPDATE usaron `WITH guard AS (… division_by_zero …)` para abortar ante drift.
- ✅ Whitelist de columnas tocadas explícita por fase; no hubo escritura colateral.
- ✅ Reversibilidad: cada fase documenta su rollback. Flags B5b/B5c reversibles vía `custom_data - 'geo_resolution'`.
- ✅ Sin cambios de schema, código, IA, versión ni `.lovable/plan.md` durante toda la campaña.

---

## 8. Referencia rápida

| Quiero… | Voy a… |
|---|---|
| Ver el plan original de toda la campaña | `b5-full-classification-dry-run.md` |
| Ver el contrato de flags | `docs/contracts/geo-resolution-flags-contract.md` |
| Drenar la cola humana | `b5b-human-review-queue.md` |
| Auditar una fase concreta | `b{N}-…-execution.md` correspondiente |
| Recuperar el snapshot pre-UPDATE de flags | `docs/audits/snapshots/geo-resolution-flags-pre.csv` |
