# T2.2 Lote 1.5 BR — Postflight

**Fecha:** 2026-05-21
**Patrón:** T2.2 canon territorial (`TERRITORIAL_CANON['BR']`, `hasProvincia=false`, `municipioField='locality'`)
**Scope:** `country_code='BR'` exclusivamente.

Justificación `hasProvincia=false`: en Brasil la "mesorregião"/microrregião IBGE es agrupación censal-estadística, NO un nivel administrativo entre Estado y Município. El árbol canónico es `País → Estado → Município → Distrito/Bairro`.

## Resultado de datos (BR)

| Campo            | Antes | Después | Δ   |
|------------------|-------|---------|-----|
| total POIs       | 3     | 3       | —   |
| `zone_id`        | 3     | **0**   | -3  |
| `zone` (text)    | 3     | **0**   | -3  |
| `admin3_id`      | 3     | **0**   | -3  |
| `region_id`      | 3     | 3       | preservado (Estados: SE, RJ, PE) |
| `locality_id`    | 3     | 3       | preservado (Município) |
| `sublocality_id` | 3     | 3       | preservado (Bairro/Distrito) |

Los 3 POIs BR (Paraty, Ipanema, Olinda) tenían `locality_id` poblado → limpieza completa, sin POIs preservados como fallback, sin pendientes de revisión humana.

## Migración aplicada

Una sola migración gated por `EXISTS … source='t22_snapshot'`, limpia `zone_id` + `zone` + `admin3_id` en los 3 POIs BR.

Restricciones respetadas: NO se tocó `name`, `lat/lng`, `raw_geocode`, `region_id`, `locality_id`, `sublocality_id`, `enriched_data`, `enrichment_status`, `tags`, colecciones, media, código, re-enrich ni `package/app-version`. Sin bump.

## Aislamiento de otros países (verificado)

| País | total | zone_id | zone | admin3_id | region_id | locality_id | sublocality_id |
|------|-------|---------|------|-----------|-----------|-------------|----------------|
| FI   | 49    | 0       | 0    | 0         | 49        | 49          | 32             |
| NO   | 41    | 0       | 0    | 15        | 34        | 24          | 10             |
| NL   | 13    | 0       | 0    | 0         | 13        | 13          | 6              |
| SE   | 8     | 0       | 0    | 1         | 7         | 7           | 4              |
| AU   | 2     | 2       | 0    | 2         | 2         | 2           | 0              |
| JP   | 1     | 1       | 1    | 1         | 1         | 1           | 1              |

FI/NO/NL/SE idénticos a sus postflights respectivos. AU/JP intactos (pendientes).

## GeographyTree (validación visual esperada)

Reutiliza `collapseZoneForCountriesWithoutProvincia` (P-1.1) ya validado en FI/NO/NL/SE:

- **Brasil** muestra sus Estados reales bajo el país: Rio de Janeiro (Paraty + Ipanema = 2), Pernambuco (Olinda = 1).
- **Sin nivel "Provincia"** intermedio (mesorregião no se renderiza).
- **Sin nodos `(sin provincia)`**.
- Hoja: **Município (`locality_id`)** + opcionalmente **Bairro/Distrito (`sublocality_id`)**.
- Counts de Estados suman 3.
- POIs BR siguen visibles en el mapa.

## Rollback BR

Disponible vía snapshot global `location_geo_provenance` con `source='t22_snapshot'` (6 filas para BR: 3 admin3 + 3 zone).

```sql
-- Rollback BR (one-shot)
UPDATE public.locations l
SET admin3_id = p.area_id
FROM public.location_geo_provenance p
WHERE p.location_id = l.id
  AND p.source = 't22_snapshot'
  AND p.field_type = 'admin3'
  AND l.country_code = 'BR';

UPDATE public.locations l
SET zone_id = p.area_id, zone = p.original_value
FROM public.location_geo_provenance p
WHERE p.location_id = l.id
  AND p.source = 't22_snapshot'
  AND p.field_type = 'zone'
  AND l.country_code = 'BR';
```

Idempotente. Sin schema migration. Sin sufijos `_pre_t22`.

## Estado de lote

- ✅ Lote 0 snapshot global (`source='t22_snapshot'`)
- ✅ Lote 1.1 FI (49 POIs)
- ✅ Lote 1.2 NO (41 POIs)
- ✅ Lote 1.3 NL (13 POIs)
- ✅ Lote 1.4 SE (8 POIs)
- ✅ **Lote 1.5 BR (3 POIs)** ← este postflight
- ⏸ Lote 1.6 AU (pendiente aprobación)
- ⏸ Lote 1.7 JP (pendiente)

**No bump.** Sin cambios de código, sin re-enrich, sin tocar media/tags/colecciones.
