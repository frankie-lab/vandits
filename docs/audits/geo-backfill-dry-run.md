# Auditoría dry-run — Backfill / limpieza de POIs dañados (post Fases 1–7)

Documento docs-only. **No ejecuta nada.** Sólo cataloga los SELECTs que el operador (master) podrá lanzar manualmente desde el panel admin o vía `supabase--read_query` para medir la deuda histórica que las Fases 1–7 del contrato [`enrichment-coord-coherence-contract.md`](../contracts/enrichment-coord-coherence-contract.md) ya bloquean en entrada pero no han limpiado retroactivamente.

- No UPDATE. No DELETE. No migraciones. No re-enrich. No runtime. No bump.
- **Version impact: none.**
- tests/lint not run: docs-only audit.

## 1. Contexto

Fases ya aplicadas (ver contrato y `docs/releases/version-history.md` 1.2.10 → 1.2.16):

| Fase | Regla | Efecto en entrada |
|---|---|---|
| 1 | R1 — `isValidWgs84Coord` entry gate | Nuevos enrich rechazan coords inválidas |
| 2 | R3 — `resolve-coordinates` obligatorio pre-LLM | Geografía estructurada SoT = reverse-geocode |
| 3 | R9 — `assertNameCoordinateIdentity` | POIs sin identidad nombre↔coords → `pending_validation` |
| 4 | R4 + R5 — IA fuera de geografía + sin placeholders | LLM no escribe `pais/region/admin*/coordenadas` ni `(sin …)` |
| 5 | R2 — `compute_geo_health` honesto | Trigger DB marca `hardError` cuando R2 falla; helper cliente espejo |
| 6 | R6 — `assertGeoCoherence` + quarantine | Narrativa IA incoherente con canonical → `enrichment_status='quarantine'` |
| 7 | R7 + R8 — `places_trunk` saneado + `zone≠region` guard | RPCs trunk rechazan coords inválidas; resolver admin dropea `zone_id` redundante |

Lo que **no** han hecho las Fases 1–7: tocar filas históricas que entraron antes de los gates. Este documento mide cuántas hay y propone un plan de saneo por fases B1–B6.

## 2. Tipos de daño auditados

Todos los SELECT son sólo lectura. `LIMIT 10 ORDER BY updated_at DESC` en las muestras para ver el daño reciente primero. Sustituir `public.locations` por la vista resuelta `v_locations_resolved` si se prefiere la lectura cliente (no necesario para esta auditoría).

### D1 — Coords nulas

POIs sin coords. Antes de Fase 1 era posible insertar `null/null` desde imports defectuosos.

```sql
-- count
SELECT count(*) AS d1_count
FROM public.locations
WHERE latitude IS NULL OR longitude IS NULL;

-- sample
SELECT id, name, document_id, enrichment_status, geo_health, updated_at
FROM public.locations
WHERE latitude IS NULL OR longitude IS NULL
ORDER BY updated_at DESC
LIMIT 10;
```

### D2 — Null Island `(0, 0)`

Sentinela canónico de "coords nunca resueltas" (ver `enrichment-coord-coherence-audit.md`). Epsilon `1e-7` igual que `coord-validity.ts`.

```sql
SELECT count(*) AS d2_count
FROM public.locations
WHERE ABS(latitude) < 1e-7 AND ABS(longitude) < 1e-7;

SELECT id, name, document_id, enrichment_status, geo_health, updated_at
FROM public.locations
WHERE ABS(latitude) < 1e-7 AND ABS(longitude) < 1e-7
ORDER BY updated_at DESC
LIMIT 10;
```

### D3 — Fuera de rango WGS84 / NaN

```sql
SELECT count(*) AS d3_count
FROM public.locations
WHERE latitude > 90 OR latitude < -90
   OR longitude > 180 OR longitude < -180
   OR latitude = 'NaN'::float8
   OR longitude = 'NaN'::float8;

SELECT id, name, latitude, longitude, enrichment_status, geo_health, updated_at
FROM public.locations
WHERE latitude > 90 OR latitude < -90
   OR longitude > 180 OR longitude < -180
   OR latitude = 'NaN'::float8
   OR longitude = 'NaN'::float8
ORDER BY updated_at DESC
LIMIT 10;
```

### D4 — `enriched` sin `raw_geocode`

POI marcado como `enrichment_status='enriched'` pero sin evidencia de reverse-geocode. R2 lo declara `hardError`; Fase 5 ya lo computa en lectura, pero la columna persistida puede no haberse re-evaluado para filas viejas.

```sql
SELECT count(*) AS d4_count
FROM public.locations
WHERE enrichment_status = 'enriched' AND raw_geocode IS NULL;

SELECT id, name, geo_health, geo_source, updated_at
FROM public.locations
WHERE enrichment_status = 'enriched' AND raw_geocode IS NULL
ORDER BY updated_at DESC
LIMIT 10;
```

### D5 — `geo_health='ok'` stale (debería `hardError`)

Unión de D1∪D2∪D3∪D4 cuya columna persistida sigue diciendo `'ok'`. Es la deuda real visible en mapa (markers verdes mintiendo).

```sql
SELECT count(*) AS d5_count
FROM public.locations
WHERE geo_health = 'ok'
  AND (
    latitude IS NULL OR longitude IS NULL
    OR (ABS(latitude) < 1e-7 AND ABS(longitude) < 1e-7)
    OR latitude > 90 OR latitude < -90
    OR longitude > 180 OR longitude < -180
    OR latitude = 'NaN'::float8 OR longitude = 'NaN'::float8
    OR (enrichment_status = 'enriched' AND raw_geocode IS NULL)
  );

SELECT id, name, latitude, longitude, enrichment_status, raw_geocode IS NULL AS no_raw, updated_at
FROM public.locations
WHERE geo_health = 'ok'
  AND (
    latitude IS NULL OR longitude IS NULL
    OR (ABS(latitude) < 1e-7 AND ABS(longitude) < 1e-7)
    OR latitude > 90 OR latitude < -90
    OR longitude > 180 OR longitude < -180
    OR latitude = 'NaN'::float8 OR longitude = 'NaN'::float8
    OR (enrichment_status = 'enriched' AND raw_geocode IS NULL)
  )
ORDER BY updated_at DESC
LIMIT 10;
```

### D6 — `zone == region`

Fase 7/R8 ya impide nuevas asignaciones de `zone_id` redundante. D6 mide las filas históricas. Dos pasadas: (a) por nombre normalizado en columnas textuales legacy, (b) por FK joins.

```sql
-- a) textual legacy (columnas country/region/zone)
SELECT count(*) AS d6a_count
FROM public.locations
WHERE zone IS NOT NULL AND region IS NOT NULL
  AND lower(unaccent(trim(zone))) = lower(unaccent(trim(region)));

SELECT id, name, region, zone, updated_at
FROM public.locations
WHERE zone IS NOT NULL AND region IS NOT NULL
  AND lower(unaccent(trim(zone))) = lower(unaccent(trim(region)))
ORDER BY updated_at DESC
LIMIT 10;

-- b) FK admin_areas (zone_id apunta a la misma área que region_id, o a un área homónima)
SELECT count(*) AS d6b_count
FROM public.locations l
JOIN public.admin_areas az ON az.id = l.zone_id
JOIN public.admin_areas ar ON ar.id = l.region_id
WHERE l.zone_id IS NOT NULL
  AND l.region_id IS NOT NULL
  AND (
    l.zone_id = l.region_id
    OR lower(unaccent(trim(az.name))) = lower(unaccent(trim(ar.name)))
  );

SELECT l.id, l.name, ar.name AS region_name, az.name AS zone_name, l.updated_at
FROM public.locations l
JOIN public.admin_areas az ON az.id = l.zone_id
JOIN public.admin_areas ar ON ar.id = l.region_id
WHERE l.zone_id IS NOT NULL
  AND l.region_id IS NOT NULL
  AND (
    l.zone_id = l.region_id
    OR lower(unaccent(trim(az.name))) = lower(unaccent(trim(ar.name)))
  )
ORDER BY l.updated_at DESC
LIMIT 10;
```

> Nota: requiere extensión `unaccent`. Si no está instalada, sustituir por `lower(trim(...))` en los SELECTs y aceptar falsos negativos por tildes.

### D7 — Placeholders persistidos

R5 prohíbe `(sin región)` y variantes. Detectar en columnas estructuradas y dentro de `enriched_data → datos_geograficos`.

```sql
-- columnas estructuradas
SELECT count(*) AS d7_struct_count
FROM public.locations
WHERE country ~* '^\(sin .+\)$'
   OR region ~* '^\(sin .+\)$'
   OR zone ~* '^\(sin .+\)$'
   OR continent ~* '^\(sin .+\)$';

SELECT id, name, country, region, zone, continent, updated_at
FROM public.locations
WHERE country ~* '^\(sin .+\)$'
   OR region ~* '^\(sin .+\)$'
   OR zone ~* '^\(sin .+\)$'
   OR continent ~* '^\(sin .+\)$'
ORDER BY updated_at DESC
LIMIT 10;

-- enriched_data.datos_geograficos.*
SELECT count(*) AS d7_enriched_count
FROM public.locations
WHERE enriched_data -> 'datos_geograficos' IS NOT NULL
  AND (
    (enriched_data #>> '{datos_geograficos,pais}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,admin_nivel_1}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,admin_nivel_2}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,admin_nivel_3}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,localidad}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,sublocalidad}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,continente}') ~* '^\(sin .+\)$'
  );

SELECT id, name, enriched_data -> 'datos_geograficos' AS datos_geo, updated_at
FROM public.locations
WHERE enriched_data -> 'datos_geograficos' IS NOT NULL
  AND (
    (enriched_data #>> '{datos_geograficos,pais}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,admin_nivel_1}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,admin_nivel_2}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,admin_nivel_3}') ~* '^\(sin .+\)$'
    OR (enriched_data #>> '{datos_geograficos,localidad}') ~* '^\(sin .+\)$'
  )
ORDER BY updated_at DESC
LIMIT 10;
```

### D8 — `places_trunk` con coords inválidas

R7 ya las rechaza en `lookup/upsert_trunk_place`. Las filas históricas siguen sirviendo de lookup hasta que se purguen.

```sql
SELECT count(*) AS d8_count
FROM public.places_trunk
WHERE lat IS NULL OR lng IS NULL
   OR (ABS(lat) < 1e-7 AND ABS(lng) < 1e-7)
   OR lat > 90 OR lat < -90
   OR lng > 180 OR lng < -180
   OR lat = 'NaN'::float8
   OR lng = 'NaN'::float8;

SELECT id, name, lat, lng, updated_at
FROM public.places_trunk
WHERE lat IS NULL OR lng IS NULL
   OR (ABS(lat) < 1e-7 AND ABS(lng) < 1e-7)
   OR lat > 90 OR lat < -90
   OR lng > 180 OR lng < -180
   OR lat = 'NaN'::float8
   OR lng = 'NaN'::float8
ORDER BY updated_at DESC
LIMIT 10;
```

> Si el nombre real de columnas en `places_trunk` no es `lat/lng`, ajustar al esquema vigente antes de ejecutar.

## 3. Tabla de conteos (placeholder)

A rellenar tras ejecutar manualmente los SELECT de §2.

| Categoría | Definición | Count | % sobre total `locations` | Observaciones |
|---|---|---:|---:|---|
| D1 | Coords nulas | — | — | |
| D2 | Null Island `(0,0)` | — | — | |
| D3 | Fuera WGS84 / NaN | — | — | |
| D4 | Enriched sin `raw_geocode` | — | — | |
| D5 | `geo_health='ok'` stale | — | — | mide visibilidad de la mentira |
| D6a | `zone == region` textual | — | — | |
| D6b | `zone_id` redundante FK | — | — | |
| D7-struct | Placeholders en columnas | — | — | |
| D7-enriched | Placeholders en `enriched_data` | — | — | |
| D8 | `places_trunk` envenenado | — | — | |

Total de filas en `public.locations`:
```sql
SELECT count(*) FROM public.locations;
```

## 4. Muestras

Los SELECT de §2 ya incluyen `LIMIT 10 ORDER BY updated_at DESC` para inspección directa. Pegar resultados aquí cuando se ejecuten.

## 5. Propuesta de corrección por fases (B1–B6)

Cada fase es un contrato + migración + tests independientes. **NUNCA agrupar.** Aquí sólo se describe la intención.

### B1 — Sanea `places_trunk` (resuelve D8)

- Identificar filas con coords inválidas (query D8).
- Re-mapear locations cuyo `trunk_id` apunte a esas filas a `trunk_id = NULL` (R7 ya impide que se recreen mal).
- Purgar/anonimizar las filas trunk inválidas.
- Idempotente.

### B2 — Reset `geo_health` stale (resuelve D5)

- `UPDATE public.locations SET geo_health = 'hardError' WHERE <predicado R2>`.
- No toca coords ni `enriched_data` ni `enrichment_status`.
- Equivalente a forzar la re-evaluación del trigger de Fase 5 sobre filas viejas.
- Idempotente.

### B3 — `zone_id = NULL` cuando duplica `region` (resuelve D6)

- Aplica `shouldDropZone` retroactivo (Fase 7).
- No toca `region_id`, `admin3_id`, `locality_id`, ni columnas textuales `country/region/zone`.
- Idempotente.

### B4 — Drop placeholders (resuelve D7)

- Set NULL en columnas estructuradas que matchean `^\(sin .+\)$`.
- Limpiar las mismas keys en `enriched_data.datos_geograficos` (jsonb `-` por key).
- No cambia `enrichment_status` ni `geo_health` (B2 ya lo cubre si procede).
- Auditar consumidores UI antes (breadcrumb / popup) por si alguno aún lee textual.

### B5 — Re-encolar a `geocoding-job` (resuelve raíz de D1+D2+D3+D4)

- Lotes pequeños vía `geocoding-job` existente, respetando cooldown.
- Sólo reverse-geocode (rellena `raw_geocode`, cadena admin, FKs). **NO re-enriquece IA.**
- Para D1/D2/D3 sin coords recuperables: dejar como `pending_validation` para que el usuario aporte coords (no auto-relocate).

### B6 — Verificación post-B5

- Re-correr SELECTs §2 para confirmar que los conteos bajan.
- El trigger de Fase 5 ya re-evalúa `geo_health` en cada UPDATE; B6 sólo documenta la verificación.

## 6. Riesgos

- **D6 falsos positivos** por homonimia legítima (raro: ciudad con el mismo nombre que su región). B3 puede dropear `zone_id` legítimos en estos casos. Mitigación: revisar muestra D6 manualmente antes de B3.
- **D7 ruptura UI**: si componentes legacy leen `country/region` textual en lugar de `*_id`, B4 deja los breadcrumbs vacíos. Auditar `getBreadcrumb`/popup territorial antes de B4.
- **B5 satura Nominatim**: respetar cooldown de `geocoding-job`. Cota razonable: ≤ 1 req/s.
- **B2 explosión visual**: reclasificar masivamente a `hardError` enciende anillos rojos en mapa. Aceptable como señal real; coordinar con el owner antes.
- **Sin backup granular**: recomendar snapshot lógico del subset afectado antes de cada batch (vía `COPY ... TO STDOUT` por subset de IDs).
- **B1 huérfanos**: locations que dependían de filas trunk envenenadas pueden quedar sin `trunk_id`. R7 ya las protege de re-lookup contaminado, pero conviene auditar volumen antes de purgar.
- **`unaccent`** puede no estar instalada. Si no, los SELECTs D6/D7 omiten matches por tildes.

## 7. Orden recomendado de ejecución

```
B1 → B2 → B3 → B4 → B5 → B6
```

Razón:

1. **B1 primero** — sanea `places_trunk` antes de que B5 haga reverse-geocodes que podrían reusar filas trunk corruptas.
2. **B2** — devuelve honestidad inmediata al mapa (markers verdes mentirosos pasan a hardError visible).
3. **B3** — limpia FK redundante; barato y no destructivo.
4. **B4** — limpia placeholders; revisar consumidores UI antes.
5. **B5** — único costoso (red + tiempo). Procesar en background con `geocoding-job`.
6. **B6** — verificación, no acción.

Cada paso debe poder pausarse y reanudarse. Cada paso debe poder ejecutarse en dry-run (SELECT del predicado) antes del UPDATE real.

## 8. Restricciones del documento

- No UPDATE. No DELETE. No migraciones. No re-enrich. No runtime tocado. No bump de versión.
- Sólo SELECTs documentados. Ningún SQL ejecutado por este documento.
- Sin cambios en `src/`, `supabase/migrations/`, `supabase/functions/`, `package.json`, `README.md`, `app-version.ts`.
- `.lovable/plan.md` no editado por este turno.
- **Version impact: none.**
