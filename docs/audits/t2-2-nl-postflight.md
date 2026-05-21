# T2.2 Lote 1.3 NL — Postflight

**Fecha:** 2026-05-21
**Patrón:** T2.2 canon territorial (`TERRITORIAL_CANON['NL']`, `hasProvincia=false`, `municipioField='locality'`)
**Scope:** `country_code='NL'` exclusivamente.

## Resultado de datos (NL)

| Campo            | Antes | Después | Δ        |
|------------------|-------|---------|----------|
| total POIs       | 13    | 13      | —        |
| `zone_id`        | 9     | **0**   | -9       |
| `zone` (text)    | 0     | **0**   | —        |
| `admin3_id`      | 13    | **0**   | -13      |
| `region_id`      | 13    | 13      | preservado |
| `locality_id`    | 13    | 13      | preservado |
| `sublocality_id` | 6     | 6       | preservado |

Los 13 POIs NL tenían `locality_id` poblado (Gemeente), por lo que **ningún POI quedó preservado como fallback admin3** (a diferencia de NO). No hay POIs pendientes de revisión humana en este lote.

## Migraciones aplicadas

1. **Migración A** (POIs con `geo_resolved_at < 2026-05-21`, 9 POIs): limpia `zone_id`, `zone`, `admin3_id`.
2. **Migración B** (4 POIs con `geo_resolved_at IS NULL` y snapshot t22 disponible: Alkmaar, Marken, Zaanse Schans, Giethoorn): limpia `admin3_id` aplicando el mismo canon.

Total NL: 13/13 limpiados.

Restricciones respetadas: NO se tocó `name`, `lat/lng`, `raw_geocode`, `region_id`, `locality_id`, `sublocality_id`, `enriched_data`, `enrichment_status`, `tags`, colecciones, media, código, re-enrich ni `package/app-version`. Sin bump.

## Aislamiento de otros países (verificado)

| País | total | zone_id | zone | admin3_id | region_id | locality_id | sublocality_id |
|------|-------|---------|------|-----------|-----------|-------------|----------------|
| FI   | 49    | 0       | 0    | 0         | 49        | 49          | 32             |
| NO   | 41    | 0       | 0    | 15        | 34        | 24          | 10             |
| SE   | 8     | 8       | 8    | 8         | 7         | 7           | 4              |
| BR   | 3     | 3       | 3    | 3         | 3         | 3           | 3              |
| AU   | 2     | 2       | 0    | 2         | 2         | 2           | 0              |
| JP   | 1     | 1       | 1    | 1         | 1         | 1           | 1              |

FI y NO permanecen idénticos a sus postflights respectivos. SE/BR/AU/JP intactos (pendientes).

## GeographyTree (validación visual esperada)

Reutiliza el fix `collapseZoneForCountriesWithoutProvincia` (P-1.1) ya validado en FI y NO:

- **Países Bajos** muestra sus 12 provincies (Provincie = `region_id`) reales bajo el país.
- **Sin nivel "Provincia"** intermedio.
- **Sin nodos `(sin provincia)`**.
- Hoja: **Gemeente (`locality_id`)** + opcionalmente **Wijk/Buurt (`sublocality_id`)**.
- Counts de regiones suman 13.
- POIs NL siguen visibles en el mapa.

## Rollback NL

Disponible vía snapshot global `location_geo_provenance` con `source='t22_snapshot'` (22 filas para NL: 13 admin3 + 9 zone).

```sql
-- Rollback NL (one-shot)
UPDATE public.locations l
SET admin3_id = p.area_id
FROM public.location_geo_provenance p
WHERE p.location_id = l.id
  AND p.source = 't22_snapshot'
  AND p.field_type = 'admin3'
  AND l.country_code = 'NL';

UPDATE public.locations l
SET zone_id = p.area_id, zone = p.original_value
FROM public.location_geo_provenance p
WHERE p.location_id = l.id
  AND p.source = 't22_snapshot'
  AND p.field_type = 'zone'
  AND l.country_code = 'NL';
```

Idempotente. Sin schema migration. Sin sufijos `_pre_t22`.

## Estado de lote

- ✅ Lote 0 snapshot global (`source='t22_snapshot'`)
- ✅ Lote 1.1 FI (49 POIs)
- ✅ Lote 1.2 NO (41 POIs)
- ✅ **Lote 1.3 NL (13 POIs)** ← este postflight
- ⏸ Lote 1.4 SE (pendiente aprobación)
- ⏸ Lote 1.5 BR (pendiente)
- ⏸ Lote 1.6 AU (pendiente)
- ⏸ Lote 1.7 JP (pendiente)

**No bump.** Sin cambios de código, sin re-enrich, sin tocar media/tags/colecciones.
