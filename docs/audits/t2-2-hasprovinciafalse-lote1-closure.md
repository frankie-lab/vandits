# T2.2 Lote 1 — Cierre documental (`hasProvincia=false`)

**Fecha cierre:** 2026-05-21
**Alcance:** aplicación del canon territorial global a los 7 países `hasProvincia=false` del Lote 1.
**Estado:** ✅ Completado al 100%. Sin bump.

## Países procesados

| Lote | País | POIs scope | Limpios | Preservados (revisión humana) | Postflight |
|---|---|---:|---:|---:|---|
| 1.1 | FI Finlandia | 49 | 49 | 0 | `docs/audits/t2-2-fi-postflight.md` |
| 1.2 | NO Noruega | 41 | 26 | **15** | `docs/audits/t2-2-no-postflight.md` |
| 1.3 | NL Países Bajos | 13 | 13 | 0 | `docs/audits/t2-2-nl-postflight.md` |
| 1.4 | SE Suecia | 8 | 7 | **1** | `docs/audits/t2-2-se-postflight.md` |
| 1.5 | BR Brasil | 3 | 3 | 0 | `docs/audits/t2-2-br-postflight.md` |
| 1.6 | AU Australia | 2 | 2 | 0 | `docs/audits/t2-2-au-postflight.md` |
| 1.7 | JP Japón | 1 | 1 | 0 | `docs/audits/t2-2-jp-postflight.md` |
| **Total** | **7** | **117** | **101** | **16** | 7 postflights |

## Limpieza aplicada (canon `hasProvincia=false`)

Patrón único usado en los 7 países, validado primero en FI:

1. **`zone_id` + `zone` (texto residual) eliminados** — el slot provincia no opera en estos países (FI sin provincia, NO fylker = región, NL provincie = región, SE län = región, BR mesorregión censal ≠ provincia, AU county cuasi obsoleto, JP subprefectura limitada).
2. **`admin3_id` eliminado solo cuando `locality_id` ya cubría el municipio canónico** (Kunta/Kommune/Gemeente/Kommun/Município/LGA-Suburb/Municipio JP). El campo `municipioField='locality'` en todos.
3. **`region_id` preservado** — es el slot real de provincia/región funcional en cada país.
4. **`locality_id` preservado** — municipio canónico.
5. **`sublocality_id` preservado** — barrio/distrito/aldea.
6. **Gating duro:** todas las migraciones llevan `EXISTS` sobre `location_geo_provenance.source='t22_snapshot'` para evitar tocar filas sin snapshot.

## POIs preservados para revisión humana (16)

POIs sin `locality_id` poblado al momento del barrido; se conservó `admin3_id` como **fallback no canónico** y quedan marcados para revisión humana:

- **NO Noruega — 15 POIs** sin Kommune resoluble (ver `docs/audits/t2-2-no-postflight.md`).
- **SE Suecia — 1 POI** (Kullens fyr, `46efe691…`) sin Kommun resoluble (ver `docs/audits/t2-2-se-postflight.md`).

Estos POIs **no rompen GeographyTree**: cuelgan del nivel Región sin nodo "(sin provincia)" porque ya no tienen `zone_id`. El `admin3_id` conservado es invisible al árbol (el canon `hasProvincia=false` colapsa zone vía `collapseZoneForCountriesWithoutProvincia`, P-1.1).

## Snapshots y rollback

- **Snapshot global:** `location_geo_provenance` con `source='t22_snapshot'`, escrito antes del Lote 1, contiene `field_type ∈ {zone, admin3}`, `area_id` y `original_value` por POI.
- **Rollback por país:** one-shot SQL documentado en cada postflight; restaura `zone_id`, `zone` y `admin3_id` desde el snapshot filtrado por `country_code`.
- **Sin schema migration** asociada al rollback, **sin sufijo `_pre_t22`**.

## Aislamiento confirmado

Snapshot final del estado de los 7 países tras Lote 1.7:

| País | total | z_id | z_txt | a3 | region_id | locality_id | sublocality_id |
|---|---:|---:|---:|---:|---:|---:|---:|
| FI | 49 | 0 | 0 | 0 | 49 | 49 | 32 |
| NO | 41 | 0 | 0 | 15 | 34 | 24 | 10 |
| NL | 13 | 0 | 0 | 0 | 13 | 13 | 6 |
| SE | 8 | 0 | 0 | 1 | 7 | 7 | 4 |
| BR | 3 | 0 | 0 | 0 | 3 | 3 | 3 |
| AU | 2 | 0 | 0 | 0 | 2 | 2 | 0 |
| JP | 1 | 0 | 0 | 0 | 1 | 1 | 1 |

Ningún país fuera del scope fue tocado en ningún lote.

## Invariantes respetadas

A lo largo de los 7 lotes **no se modificaron**:

- `name`
- `latitude` / `longitude`
- `raw_geocode`
- `region_id`, `locality_id`, `sublocality_id`
- `enriched_data`
- `enrichment_status`
- `geo_health` (salvo trigger natural inevitable derivado del propio UPDATE)
- `tags`
- `collections` / `collection_items`
- `location_photos` / media
- código de aplicación
- re-enrich (no se re-disparó IA)
- `package.json` / `app-version` (**sin bump**)

## Postflights creados

- `docs/audits/t2-2-fi-postflight.md`
- `docs/audits/t2-2-no-postflight.md`
- `docs/audits/t2-2-nl-postflight.md`
- `docs/audits/t2-2-se-postflight.md`
- `docs/audits/t2-2-br-postflight.md`
- `docs/audits/t2-2-au-postflight.md`
- `docs/audits/t2-2-jp-postflight.md`

## GeographyTree

En los 7 países el árbol colapsa correctamente vía `collapseZoneForCountriesWithoutProvincia` (P-1.1):

- País → Región (real) → Municipio → Barrio/Distrito.
- **Sin nivel Provincia intermedio.**
- **Sin nodos "(sin provincia)".**
- Counts de región suman el total de POIs preservados por país.
- Todos los POIs siguen visibles en el mapa (lat/lng intactos).

## Tickets abiertos

### T2.3 — Placeholder "(sin región)"

Tras el Lote 1, el árbol territorial ya no produce nodos "(sin provincia)" en países `hasProvincia=false`. Queda abierto el **placeholder simétrico "(sin región)"** para POIs sin `region_id` resoluble en cualquier país. Definir:

- comportamiento del nodo en GeographyTree (placeholder visible vs. agrupación neutra);
- política de recovery: cuándo es legítimo dejar `region_id` vacío y cuándo debe encolarse `run_geo_backfill`;
- contract test que falle si reaparece `"(sin provincia)"` en países `hasProvincia=false` o si `"(sin región)"` se renderiza con copy distinto al canónico.

### Revisión humana — 16 admin3 preservados (NO + SE)

16 POIs (15 NO + 1 SE) conservan `admin3_id` como fallback no canónico por falta de `locality_id`. Acción pendiente:

- batch de revisión humana sobre estos 16 POIs;
- resolver `locality_id` (Kommune/Kommun) caso por caso, vía recovery search multi-source o ajuste manual;
- una vez resuelto, repetir el patrón T2.2 (clear `admin3_id`) en una pasada residual;
- documentar en `docs/audits/t2-2-no-postflight.md` / `t2-2-se-postflight.md` el cierre por POI.

Listado canónico de los 16 IDs ya disponible en los postflights NO y SE respectivos.

## Status

**T2.2 Lote 1 (`hasProvincia=false`): cerrado.** Próximos hitos: T2.3 placeholder "(sin región)" + cierre humano de los 16 admin3 NO+SE. **Sin bump.**
