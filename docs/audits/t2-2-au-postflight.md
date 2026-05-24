# T2.2 Lote 1.6 AU — Postflight

**Fecha:** 2026-05-21
**Scope:** `country_code='AU'` (2 POIs: Bahía de Botany, Playa de Manly)
**Canon:** `TERRITORIAL_CANON['AU']` — `hasProvincia=false` (county AU es cuasi obsoleto, no opera como provincia funcional), `municipioField='locality'` (LGA/Suburb).

## Migración aplicada

`20260521183810_t2-2-au-clean-zone-admin3.sql` — un solo paso:

- `UPDATE locations SET zone_id=NULL, zone=NULL, admin3_id=NULL`
- WHERE `country_code='AU' AND deleted_at IS NULL AND locality_id IS NOT NULL`
- Gated por `EXISTS` sobre `location_geo_provenance.source='t22_snapshot'`.

Ambos POIs tenían `locality_id` poblado (LGA/Suburb), por lo que **no se preservó admin3 de fallback**. Cero POIs marcados para revisión humana.

## Conteo antes / después

| Campo | Antes | Después |
|---|---|---|
| total | 2 | 2 |
| `zone_id` poblado | 2 | **0** |
| `zone` (texto) poblado | 0 | 0 |
| `admin3_id` poblado | 2 | **0** |
| `region_id` poblado | 2 | 2 |
| `locality_id` poblado | 2 | 2 |
| `sublocality_id` poblado | 0 | 0 |

## No tocado

`name`, `lat/lng`, `raw_geocode`, `region_id`, `locality_id`, `sublocality_id`, `enriched_data`, `enrichment_status`, `geo_health` (salvo trigger natural), tags, colecciones, media, código, re-enrich, `package/app-version`. **No bump.**

## Aislamiento confirmado

| País | total | z_id | z_txt | a3 | r | loc | sub | Estado |
|---|---|---|---|---|---|---|---|---|
| **AU** | 2 | 0 | 0 | 0 | 2 | 2 | 0 | ✅ limpiado |
| FI | 49 | 0 | 0 | 0 | 49 | 49 | 32 | ✅ intacto |
| NO | 41 | 0 | 0 | 15 | 34 | 24 | 10 | ✅ intacto |
| NL | 13 | 0 | 0 | 0 | 13 | 13 | 6 | ✅ intacto |
| SE | 8 | 0 | 0 | 1 | 7 | 7 | 4 | ✅ intacto |
| BR | 3 | 0 | 0 | 0 | 3 | 3 | 3 | ✅ intacto |
| JP | 1 | 1 | 1 | 1 | 1 | 1 | 1 | ⏸ pendiente (Lote 1.7) |

## GeographyTree

Australia ahora colapsa vía `collapseZoneForCountriesWithoutProvincia` (P-1.1):

- Australia → Estado/Territorio (`region_id` = NSW para ambos) → LGA/Suburb (Sutherland Shire / Northern Beaches Council vía `locality_id`).
- **Sin nivel Provincia/County intermedio.**
- **Sin nodos "(sin provincia)".**
- Counts del nodo NSW suman 2.
- POIs AU siguen visibles en mapa (lat/lng intactos).

## Rollback

One-shot SQL vía `location_geo_provenance` con `source='t22_snapshot'`:

```sql
-- Restaurar zone_id + admin3_id desde snapshot
UPDATE public.locations l
SET zone_id = (SELECT area_id FROM location_geo_provenance
               WHERE location_id=l.id AND field_type='zone' AND source='t22_snapshot' LIMIT 1),
    admin3_id = (SELECT area_id FROM location_geo_provenance
                 WHERE location_id=l.id AND field_type='admin3' AND source='t22_snapshot' LIMIT 1),
    zone = (SELECT original_value FROM location_geo_provenance
            WHERE location_id=l.id AND field_type='zone' AND source='t22_snapshot' LIMIT 1)
WHERE l.country_code='AU' AND l.deleted_at IS NULL;
```

Sin schema migration, sin sufijo `_pre_t22`.

## Status

Lote 1.6 AU completado. Lote 1.7 JP pendiente de aprobación. No bump.
