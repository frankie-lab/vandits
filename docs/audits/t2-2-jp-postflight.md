# T2.2 Lote 1.7 JP — Postflight

**Fecha:** 2026-05-21
**Scope:** `country_code='JP'` (1 POI: Shirakawa-go historic village)
**Canon:** `TERRITORIAL_CANON['JP']` — `hasProvincia=false` (subprefectura JP es limitada, no opera como provincia funcional general), `municipioField='locality'` (Municipio = Shi/Machi/Mura/Ku especial).

## Migración aplicada

`20260521183958_t2-2-jp-clean-zone-admin3.sql` — un solo paso:

- `UPDATE locations SET zone_id=NULL, zone=NULL, admin3_id=NULL`
- WHERE `country_code='JP' AND deleted_at IS NULL AND locality_id IS NOT NULL`
- Gated por `EXISTS` sobre `location_geo_provenance.source='t22_snapshot'`.

El POI tenía `locality_id` poblado (Shirakawa-mura), por lo que **no se preservó admin3 de fallback**. Cero POIs marcados para revisión humana.

## Conteo antes / después

| Campo | Antes | Después |
|---|---|---|
| total | 1 | 1 |
| `zone_id` poblado | 1 | **0** |
| `zone` (texto) poblado | 1 | **0** |
| `admin3_id` poblado | 1 | **0** |
| `region_id` poblado | 1 | 1 |
| `locality_id` poblado | 1 | 1 |
| `sublocality_id` poblado | 1 | 1 |

## No tocado

`name`, `lat/lng`, `raw_geocode`, `region_id`, `locality_id`, `sublocality_id`, `enriched_data`, `enrichment_status`, `geo_health` (salvo trigger natural), tags, colecciones, media, código, re-enrich, `package/app-version`. **No bump.**

## Aislamiento confirmado (cierre Lote 1 completo)

| País | total | z_id | z_txt | a3 | r | loc | sub | Estado |
|---|---|---|---|---|---|---|---|---|
| FI | 49 | 0 | 0 | 0 | 49 | 49 | 32 | ✅ Lote 1.1 |
| NO | 41 | 0 | 0 | 15 | 34 | 24 | 10 | ✅ Lote 1.2 (15 humanos) |
| NL | 13 | 0 | 0 | 0 | 13 | 13 | 6 | ✅ Lote 1.3 |
| SE | 8 | 0 | 0 | 1 | 7 | 7 | 4 | ✅ Lote 1.4 (1 humano) |
| BR | 3 | 0 | 0 | 0 | 3 | 3 | 3 | ✅ Lote 1.5 |
| AU | 2 | 0 | 0 | 0 | 2 | 2 | 0 | ✅ Lote 1.6 |
| **JP** | 1 | 0 | 0 | 0 | 1 | 1 | 1 | ✅ **Lote 1.7** |

**Total Lote 1:** 117 POIs procesados, 16 conservados con admin3 de fallback (NO+SE) marcados para revisión humana.

## GeographyTree

Japón colapsa vía `collapseZoneForCountriesWithoutProvincia` (P-1.1):

- Japón → Prefectura (`region_id` = Gifu) → Municipio (`locality_id` = Shirakawa-mura) → Barrio/Aldea (`sublocality_id`).
- **Sin nivel Provincia/Subprefectura general intermedio.**
- **Sin nodos "(sin provincia)".**
- Counts del nodo Gifu suman 1.
- POIs JP siguen visibles en mapa (lat/lng intactos).

## Rollback

One-shot SQL vía `location_geo_provenance` con `source='t22_snapshot'`:

```sql
UPDATE public.locations l
SET zone_id = (SELECT area_id FROM location_geo_provenance
               WHERE location_id=l.id AND field_type='zone' AND source='t22_snapshot' LIMIT 1),
    admin3_id = (SELECT area_id FROM location_geo_provenance
                 WHERE location_id=l.id AND field_type='admin3' AND source='t22_snapshot' LIMIT 1),
    zone = (SELECT original_value FROM location_geo_provenance
            WHERE location_id=l.id AND field_type='zone' AND source='t22_snapshot' LIMIT 1)
WHERE l.country_code='JP' AND l.deleted_at IS NULL;
```

Sin schema migration, sin sufijo `_pre_t22`.

## Status

Lote 1.7 JP completado. **Lote 1 (FI/NO/NL/SE/BR/AU/JP) cerrado al 100%.** No bump.
