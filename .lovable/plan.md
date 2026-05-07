## Estado actual (lo que YA existe)

- **`admin_areas`** — jerárquica con `parent_id`, `path[]`, `depth`, `iso_code`, `aliases[]`, `wikidata_id`, `osm_id`, `centroid_lat/lng`, `is_placeholder`. Trigger mantiene `path` materializado.
- **`place_types`** — catálogo jerárquico (continent..sublocality + tipos POI).
- **`locations`** — 8 FKs (`continent_id`..`sublocality_id`, `type_id`, `street_name`) + cache de strings sincronizado por trigger `locations_sync_admin_cache`.
- **`resolve-admin-area`** — resuelve por ISO → aliases → name+parent → insert. Propaga parent_id canónico.
- **`geo-normalizer.ts`** — convierte Nominatim a 7 niveles canónicos con reglas por país (ES, FR, IT, DE, GB, US, PT, CA, MX, AR, BR…).
- **`backfill-admin-fks`** — re-geocodifica Nominatim doble-zoom, rate-limit 1 req/s, presupuesto 120s.
- **`places_trunk`** — caché global por bucket geohash + TTL.

## Estándares

Tabla maestra de estándares que el sistema usa de forma transversal. Cualquier campo, índice o lookup nuevo debe encajar aquí.

| Estándar | Uso en el sistema | Ubicación |
|---|---|---|
| **ISO 3166-1 alpha-2** | Código país (`ES`, `FR`, `US`) | `admin_areas.iso_code` (países) + `locations.country_code` (cache, Fase 1) |
| **ISO 3166-1 alpha-3** | Código país largo (`ESP`, `FRA`) | `admin_areas.iso_code_alpha3` (Fase 1) |
| **ISO 3166-2** | Subdivisión nivel 1 (`ES-AN`, `FR-IDF`, `US-CA`) | `admin_areas.iso_code` (regiones) + `locations.admin1_iso` (cache, Fase 1). Regex de match ya existe en `resolve-admin-area`. |
| **UN M49** | Códigos numéricos país/continente | `admin_areas.m49_code` (Fase 1, opcional) |
| **WGS84 (EPSG:4326)** | Sistema de referencia de TODAS las coordenadas | `locations.latitude/longitude`, `document_tracks.coordinates`, parsers, Leaflet, Nominatim |
| **GeoJSON (RFC 7946)** | Intercambio de geometrías | Parsers (`geojson-parser.ts`), `document_tracks.coordinates`, exports |
| **KML 2.2 / GPX 1.1** | Formatos de importación | `kml-parser.ts`, `gpx-parser.ts` |
| **IANA Timezone DB** | Zonas horarias (`Europe/Madrid`) | `locations.timezone` resuelto offline con `tz-lookup` (Fase 1) |
| **ISO 8601** | Fechas y duraciones | Ya nativo en `timestamptz` de Postgres |
| **ISO 639-1** | Idioma del nombre local (`es`, `fr`, `en`) | `admin_areas.name_lang` + `name_translations` jsonb (Fase 1) |
| **UPU postal codes** | Códigos postales | `locations.postal_code` (Fase 1) |
| **OpenStreetMap** | Fuente principal (Nominatim reverse + datos) | `admin_areas.osm_id`, edge function `resolve-coordinates` (Fase 2) |
| **GeoNames** | Fuente de fallback y seed | `admin_areas.geonames_id` (Fase 1), seed Fase 3 |
| **Wikidata** | Identificador estable cross-fuente | `admin_areas.wikidata_id` (ya existe) |

Reglas:
- Toda lat/lng del sistema es **WGS84 grados decimales** sin excepción.
- Toda referencia a país en código se almacena en **ISO alpha-2 mayúsculas**.
- Toda subdivisión nivel 1 con código se almacena en **ISO 3166-2 mayúsculas**.
- Toda zona horaria es **identificador IANA**, nunca offset numérico.
- Todo intercambio externo (export/import/API) usa **GeoJSON**.

## Lo que FALTA para cumplir tu spec

| Campo pedido | Hoy | Falta |
|---|---|---|
| latitud / longitud (WGS84) | ✓ | — |
| continente | ✓ | — |
| country_code (ISO 3166-1 α2) | parcial en `admin_areas.iso_code` | cache en `locations` |
| country_name | ✓ | — |
| admin_level_1/2/3 | ✓ | — |
| **admin_level_N_type** ("Comunidad Autónoma"…) | ✗ | nuevo campo `admin_areas.admin_type_local` |
| localidad / sublocalidad | ✓ | — |
| **código postal** | ✗ | nuevo campo `locations.postal_code` |
| **zona horaria (IANA)** | ✗ | nuevo campo `locations.timezone` |
| nombre detectado | ✓ | — |
| tipo de lugar | ✓ (`type_id`) | — |
| **fuente** | ✗ | nuevo campo `locations.geo_source` |
| **nivel de confianza** | ✗ | nuevo campo `locations.geo_confidence` |
| idioma del nombre local | ✗ | `admin_areas.name_lang` + `name_translations` |

## Plan de implementación (4 fases)

### Fase 1 — Modelo de datos canónico

```text
admin_areas:
  + iso_code_alpha3       text        -- ISO 3166-1 alpha-3
  + m49_code              smallint    -- UN M49 (opcional)
  + admin_type_local      text        -- "Comunidad Autónoma", "Région", "State", "Bundesland"
  + name_lang             text        -- ISO 639-1
  + name_translations     jsonb       -- { "en": "Andalusia", "fr": "Andalousie" }
  + source                text        -- "osm" | "geonames" | "manual" | "iso-seed"
  + geonames_id           bigint
  + timezone              text        -- IANA (cuando aplica al nivel)

locations:
  + country_code          text        -- ISO 3166-1 alpha-2 (cache)
  + admin1_iso            text        -- ISO 3166-2 (cache)
  + postal_code           text
  + timezone              text        -- IANA, calculado por lat/lng
  + geo_source            text        -- "nominatim" | "geonames" | "manual" | "import"
  + geo_confidence        smallint    -- 0..100
  + geo_resolved_at       timestamptz
  + raw_geocode           jsonb       -- respuesta cruda original (auditoría)

place_types:
  + sort_admin_level      smallint    -- 0..7 ordenado, lógica genérica
```

Trigger `locations_sync_admin_cache` extendido para propagar `country_code`, `admin1_iso` y `timezone` desde `admin_areas`.

### Fase 2 — Pipeline único `resolve-coordinates`

Edge function orquestadora, **único punto de entrada** desde lat/lng:

```text
input:  { latitude, longitude, hint_name?, hint_type? }
output: { CanonicalLocation, confidence, source, raw }
```

Pasos:
1. **Cache trunk** — `lookup_trunk_place(lat,lng,...)`.
2. **Reverse geocode** — Nominatim (doble-zoom existente). Plug-in GeoNames como fallback.
3. **Normalización** — `geo-normalizer.ts` extendido para guardar `admin_type_local` (state/state_district/county/etc.) tal cual lo devuelve Nominatim.
4. **Resolución FKs** — `resolve-admin-area` (ya existe).
5. **Timezone** — `tz-lookup` offline por lat/lng → IANA.
6. **Postal code** — del address Nominatim.
7. **Clasificación de tipo** — `osm_class`/`osm_type` → `place_types` vía tabla `osm_to_place_type`.
8. **Confianza** — heurística: 100 match ISO; 80 aliases; 60 insert nuevo; −10 por nivel placeholder; −20 si tipo Nominatim muy genérico.
9. **Snapshot raw** → `locations.raw_geocode`.

Refactor: `backfill-admin-fks`, `enrich-location` y `resolveAllFks` (cliente) pasan a llamar a `resolve-coordinates`. Una única ruta.

### Fase 3 — Catálogo internacional semilla

Script idempotente que rellena `admin_areas`:

- **Continentes (7)** — códigos M49 + ISO alpha-2 (`EU`, `AS`…).
- **Países (~250)** — ISO 3166-1 α2 + α3 + M49, nombre EN/ES/local, capital, wikidata, geonames_id.
- **Subdivisiones nivel 1** — **ISO 3166-2 completo**: CCAA España, Régions Francia, States USA, Bundesländer DE, Prefecturas Japón, Provinces Canadá, etc., con `admin_type_local` y `name_translations`.

Fuentes: dataset `iso-3166-2-db` (MIT) + GeoNames `admin1CodesASCII.txt` + `countryInfo.txt`.

Efecto: futuras llamadas a `resolve-admin-area` resuelven por **match ISO** (alta confianza) en lugar de crear filas.

### Fase 4 — Backfill y consistencia

1. Job `backfill-coordinates` (sustituye `backfill-admin-fks`) recorre `locations` con `geo_confidence IS NULL` o `< 70`.
2. UI: `useGeocodingJobStore` + `GeocodingProgressBar` ya existen.
3. Auditoría: vista `v_geo_coverage` con % puntos por país que tienen cada nivel resuelto y % con confianza ≥80.

## Fuera de alcance (decisión aparte)

- **Elasticsearch / OpenSearch** — `pg_trgm` + GIN sobre `aliases[]` cubren búsquedas fuzzy. ES sería sobre-ingeniería.
- **PostGIS `geography(Point)` + GIST** — `places_trunk` ya usa buckets 0.001°. Upgrade opcional, no bloqueante.
- **Multi-idioma de UI** — el modelo soporta `name_translations`, pero la elección por locale es decisión de UI aparte.

## Garantías técnicas

- **Idempotente**: re-correr el pipeline da el mismo resultado.
- **Preserva original**: `raw_geocode` jsonb + `aliases[]` acumulan los nombres entrantes.
- **Resultados parciales válidos**: `geo_confidence` permite mostrar puntos con jerarquía incompleta (océanos, Antártida, sublocalidades inexistentes).
- **Sin breaking changes en cliente**: strings legacy (`country`, `region`, `zone`) se siguen sincronizando vía trigger.

¿Procedo con Fase 1 como primer entregable?