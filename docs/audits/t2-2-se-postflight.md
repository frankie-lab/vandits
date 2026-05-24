# T2.2 Lote 1.4 SE — Postflight

**Fecha:** 2026-05-21
**Patrón:** T2.2 canon territorial (`TERRITORIAL_CANON['SE']`, `hasProvincia=false`, `municipioField='locality'`)
**Scope:** `country_code='SE'` exclusivamente.

## Resultado de datos (SE)

| Campo            | Antes | Después | Δ        |
|------------------|-------|---------|----------|
| total POIs       | 8     | 8       | —        |
| `zone_id`        | 8     | **0**   | -8       |
| `zone` (text)    | 8     | **0**   | -8       |
| `admin3_id`      | 8     | **1**   | -7 (1 preservado) |
| `region_id`      | 7     | 7       | preservado (1 preexistente NULL) |
| `locality_id`    | 7     | 7       | preservado |
| `sublocality_id` | 4     | 4       | preservado |

### POI preservado con `admin3_id` (revisión humana)

| id | name | motivo |
|----|------|--------|
| `46efe691-026b-41d3-85a5-41ab271d4f22` | Kullens fyr | `locality_id IS NULL` → `admin3_id` (Höganäs) conservado como fallback municipal |

### POI con deuda preexistente (no T2.2)

| id | name | observación |
|----|------|-------------|
| `090d9e0f-d852-4d97-aabe-23b92385d1d3` | Piedras de Ale | `region_id IS NULL` y `geo_resolved_at IS NULL` — deuda de admin_areas (T2.3 SE), fuera de scope T2.2 |

## Migración aplicada

Una sola migración con dos UPDATEs gated por `EXISTS … source='t22_snapshot'` (no por `geo_resolved_at`, para cubrir también el POI con `geo_resolved_at NULL` cuyo snapshot ya existía):

1. Limpia `zone_id` + `zone` en los 8 POIs SE.
2. Limpia `admin3_id` en los 7 POIs SE con `locality_id IS NOT NULL`.

Restricciones respetadas: NO se tocó `name`, `lat/lng`, `raw_geocode`, `region_id`, `locality_id`, `sublocality_id`, `enriched_data`, `enrichment_status`, `tags`, colecciones, media, código, re-enrich ni `package/app-version`. Sin bump.

## Aislamiento de otros países (verificado)

| País | total | zone_id | zone | admin3_id | region_id | locality_id | sublocality_id |
|------|-------|---------|------|-----------|-----------|-------------|----------------|
| FI   | 49    | 0       | 0    | 0         | 49        | 49          | 32             |
| NO   | 41    | 0       | 0    | 15        | 34        | 24          | 10             |
| NL   | 13    | 0       | 0    | 0         | 13        | 13          | 6              |
| BR   | 3     | 3       | 3    | 3         | 3         | 3           | 3              |
| AU   | 2     | 2       | 0    | 2         | 2         | 2           | 0              |
| JP   | 1     | 1       | 1    | 1         | 1         | 1           | 1              |

FI/NO/NL idénticos a sus postflights. BR/AU/JP intactos (pendientes).

## GeographyTree (validación visual esperada)

Reutiliza `collapseZoneForCountriesWithoutProvincia` (P-1.1) ya validado en FI/NO/NL:

- **Sverige** muestra sus Län (Län = `region_id`) reales bajo el país (Gotlands län, Skåne län, Stockholms län, Uppsala län; total Län distintos en este lote = 1 área canónica `99dd5182…` resuelta a su nombre).
- **Sin nivel "Provincia"** intermedio.
- **Sin nodos `(sin provincia)`**.
- Hoja: **Kommun (`locality_id`)** + opcionalmente **Stadsdel/Tätort (`sublocality_id`)**.
- Counts de Län suman 7 (+ 1 POI sin región: Piedras de Ale, visible bajo nodo "(sin región)" preexistente).
- POIs SE siguen visibles en el mapa.
- Kullens fyr aparece bajo su Län vía `region_id` (sin Kommun como hoja, ya que carece de `locality_id`); su `admin3_id` se conserva como fallback interno.

## Rollback SE

Disponible vía snapshot global `location_geo_provenance` con `source='t22_snapshot'` (16 filas para SE: 8 admin3 + 8 zone).

```sql
-- Rollback SE (one-shot)
UPDATE public.locations l
SET admin3_id = p.area_id
FROM public.location_geo_provenance p
WHERE p.location_id = l.id
  AND p.source = 't22_snapshot'
  AND p.field_type = 'admin3'
  AND l.country_code = 'SE';

UPDATE public.locations l
SET zone_id = p.area_id, zone = p.original_value
FROM public.location_geo_provenance p
WHERE p.location_id = l.id
  AND p.source = 't22_snapshot'
  AND p.field_type = 'zone'
  AND l.country_code = 'SE';
```

Idempotente. Sin schema migration. Sin sufijos `_pre_t22`.

## Estado de lote

- ✅ Lote 0 snapshot global (`source='t22_snapshot'`)
- ✅ Lote 1.1 FI (49 POIs)
- ✅ Lote 1.2 NO (41 POIs)
- ✅ Lote 1.3 NL (13 POIs)
- ✅ **Lote 1.4 SE (8 POIs)** ← este postflight
- ⏸ Lote 1.5 BR (pendiente aprobación)
- ⏸ Lote 1.6 AU (pendiente)
- ⏸ Lote 1.7 JP (pendiente)

**No bump.** Sin cambios de código, sin re-enrich, sin tocar media/tags/colecciones.
