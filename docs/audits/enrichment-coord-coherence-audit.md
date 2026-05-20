# Auditoría — Coherencia coordenadas ↔ enriquecimiento

Documento docs-only. No modifica `src/`, `supabase/`, datos, `package.json`, `README`, versión ni tests. tests/lint not run: docs-only critical audit. Version impact: none.

## 1. Caso de referencia

POI canónico que materializa el fallo: **"Glorieta de la Antártida" / "Antarctica Roundabout"**.

```text
id                   = 89867d20-bc1e-4a12-82fa-ba4820a5cdab
name                 = "Antarctica Roundabout"
latitude             = 0
longitude            = 0                      ← Null Island (Atlántico, Golfo de Guinea)
geo_health           = 'ok'                   ← BUG CRÍTICO
geo_source           = NULL
geo_confidence       = NULL
geo_resolved_at      = NULL
raw_geocode          = NULL                   ← jamás se llamó a resolve-coordinates
country              = 'España'
region               = 'Castilla-La Mancha'
zone                 = 'Castilla-La Mancha'   ← duplica region; debería ser 'Guadalajara'
country_id, region_id, zone_id, locality_id  → todos resueltos
enrichment_status    = 'enriched'
enriched_data.datos_geograficos:
    coordenadas        = "0.000000, 0.000000"
    pais               = "España"
    admin_nivel_1      = "Castilla-La Mancha"
    admin_nivel_2      = "Guadalajara"
    admin_nivel_3      = "Guadalajara"
    localidad          = "Guadalajara"
    fuente_geocoding   = "nominatim"
    fuente_refinamiento= "ai"                 ← cadena admin inventada por LLM
```

Distancia entre el POI persistido y su ubicación esperada (Azuqueca de Henares, 40.5686 / -3.2667): **≈ 4.700 km**.

## 2. SQL de evidencia (reproducible, read-only)

```sql
SELECT id, name,
       latitude, longitude,
       geo_health, geo_source, geo_confidence, geo_resolved_at,
       raw_geocode IS NOT NULL AS has_raw_geocode,
       country, region, zone, continent,
       country_id, region_id, zone_id, locality_id,
       enrichment_status,
       enriched_data->>'descripcion' IS NOT NULL AS has_desc,
       enriched_data->'datos_geograficos'        AS dg
FROM locations
WHERE name IN ('Antarctica Roundabout', 'Glorieta de la Antártida')
   OR (latitude = 0 AND longitude = 0);
```

Dimensionado sistémico (para futuro backfill, fuera de scope):

```sql
SELECT
  COUNT(*) FILTER (WHERE latitude = 0 AND longitude = 0)             AS null_island,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)      AS missing_coords,
  COUNT(*) FILTER (WHERE ABS(latitude) > 90 OR ABS(longitude) > 180) AS out_of_wgs84,
  COUNT(*) FILTER (WHERE latitude=0 AND longitude=0 AND geo_health='ok')                 AS null_island_marked_ok,
  COUNT(*) FILTER (WHERE latitude=0 AND longitude=0 AND enrichment_status='enriched')    AS null_island_enriched
FROM locations;
```

## 3. Cadena de fallos

1. **Entry gate acepta `(0,0)`** — `enrich-location/normalizeLocation` solo filtra `null`/`NaN`. Acepta `(0,0)` y valores fuera de WGS84.
2. **IA inventa geografía** — sin coords útiles, el prompt permite que el LLM rellene `datos_geograficos.pais / admin_nivel_* / coordenadas` desde el nombre. Marca observable: `fuente_refinamiento='ai'`.
3. **`batch-enrich` persiste geografía textual sin cotejar reverse-geocode** — toma `enrichData.data._geocoded` y escribe `country/region/zone/continent` directamente. Nunca llama a `resolve-coordinates`. Por eso `geo_source/geo_confidence/raw_geocode` quedan NULL.
4. **No existe gate de coherencia IA ↔ coords** — nadie compara cadena admin de la IA contra cadena admin del reverse-geocode.
5. **`places_trunk` puede quedar envenenado** — `upsert_trunk_place(_lat=0,_lng=0,...)` cachea basura; futuros POIs `(0,0)` la heredan vía `lookup_trunk_place`.
6. **`geo_health` marca `'ok'`** — el clasificador no contempla `(0,0)`, out-of-range, ni `enriched + raw_geocode IS NULL`.
7. **`zone` duplica `region`** — `zone='Castilla-La Mancha'` cuando el canon exige `zone_id=PROVINCIA` (debería ser `Guadalajara`).
8. **Sin gate de identidad nombre↔coords** — nadie compara el nombre declarado contra reverse-geocode/nearby/name-search antes del LLM. Permite que "Glorieta de la Antártida" en `(0,0)` o un nombre real desplazado a coordenadas erróneas pase a enriquecimiento sin verificación de identidad.

## 4. Tabla de anomalías

| # | Capa | Síntoma | Causa probable | Impacto |
|---|---|---|---|---|
| F1 | enrich-location entry gate | `(0,0)` cruza como válido | `normalizeLocation` solo filtra `null`/`NaN` | Activa toda la cadena |
| F2 | LLM prompt | IA escribe `datos_geograficos.*` | Prompt no restringe campos | Geografía inventada |
| F3 | batch-enrich persistencia | `country/region/zone` desde `_geocoded` IA | Falta llamada obligatoria a `resolve-coordinates` | Corrompe columnas estructuradas |
| F4 | pipeline | Sin assert IA↔coords | No existe helper de coherencia | Errores silenciosos |
| F5 | places_trunk | RPCs admiten `(0,0)` | No validan WGS84 | Cache envenenada propagable |
| F6 | geo_health | `(0,0)` → `'ok'` | Reglas incompletas | POIs corruptos pasan por sanos |
| F7 | canon territorial | `zone == region` | Resolver admin sin guard | Árbol geográfico roto |
| F8 | identity gate | Nombre y coords incoherentes pasan al LLM | No existe `assertNameCoordinateIdentity` pre-LLM | Identidad del POI no garantizada |

## 5. Síntesis

> **El enriquecimiento literario y la verdad geográfica son flujos desacoplados. El segundo nunca audita al primero, y el primero puede escribir en territorio del segundo.**

Las 7 anomalías son manifestaciones de esa misma ausencia de gate. El contrato vive en `docs/contracts/enrichment-coord-coherence-contract.md`.

## 6. Restricciones del documento

- No modifica datos, Supabase, runtime, tests, `package.json`, `README`, versión.
- tests/lint not run: docs-only critical audit. Version impact: none.
