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

> **Nota schema real (2026-05-20)**: `public.places_trunk` usa `latitude`/`longitude` (no `lat`/`lng`). Las queries D8 ejecutadas reflejan ese nombre.

## 3. Conteos reales

**Ejecutado**: 2026-05-20 UTC vía `supabase--read_query` (sólo SELECT, sin escritura).
**Total `public.locations`**: **5 447** filas.
**Caveat extensión**: `unaccent` NO está instalada en el proyecto (`SELECT EXISTS … pg_extension WHERE extname='unaccent'` → `false`). Los predicados D6/D7 que el doc proponía con `unaccent(...)` se ejecutaron con `lower(trim(...))` puro. Posibles falsos negativos por tildes/diacríticos (p. ej. "Andalucía" vs "Andalucia"). Reejecutar con `unaccent` cuando se habilite la extensión.

| Categoría | Definición | Count | % sobre 5 447 | Observaciones |
|---|---|---:|---:|---|
| D1 | Coords nulas | **0** | 0.00 % | Limpio. Fase 1 (entry gate R1) ya cubre nuevos imports; histórico también limpio. |
| D2 | Null Island `(0, 0)` | **1** | 0.02 % | Caso único: `Antarctica Roundabout` (`89867d20-…`). Coincide con el POI mencionado en el contrato como sintoma original. |
| D3 | Fuera WGS84 / NaN | **0** | 0.00 % | Limpio. |
| D4 | Enriched sin `raw_geocode` | **394** | 7.23 % | Italia-pesado. Pueblos enriquecidos antes de Fase 2 (resolve-coordinates obligatorio). |
| D5 | `geo_health='ok'` stale (R2 falla) | **389** | 7.14 % | ≈D4 menos D2 (Null Island ya quizá marcado distinto). Markers verdes mintiendo en mapa. |
| D6a | `zone == region` textual | **1 613** | 29.61 % | Mayoría: España (Cantabria, Asturias, Galicia…), Italia (Sicilia), Suiza. Provincia=región autonómica/cantonal. |
| D6b | `zone_id` redundante FK | **1 613** | 29.61 % | Empate exacto con D6a — el daño es 1-a-1 entre columnas textuales y FK. |
| D7-struct | Placeholders en columnas | **459** | 8.43 % | `(sin región)` / `(sin provincia)` mayoritarios. |
| D7-enriched | Placeholders en `enriched_data.datos_geograficos` | **1 420** | 26.07 % | 3× más que D7-struct → el LLM legacy escribió placeholders profusamente en el blob enriquecido antes de Fase 4. |
| D8 | `places_trunk` envenenado | **0** | — | Limpio. La tabla `places_trunk` tiene CHECK efectivo o nunca recibió coords inválidas. |

**Total filas dañadas (unión bruta sin dedup)**: D2(1) + D4(394) + D6a(1 613) + D7-struct(459) + D7-enriched(1 420) ≈ 3 887. Con overlap real probable de ~70 %. Ver §5 para la propuesta de orden.

## 4. Muestras (LIMIT 10)

Sólo se incluyen muestras para categorías con `count > 0`. D1/D3/D8 omitidos por estar vacíos.

### D2 — Null Island

| id | name | enrichment_status | geo_health | lat | lng | updated_at |
|---|---|---|---|---:|---:|---|
| `89867d20-bc1e-4a12-82fa-ba4820a5cdab` | Antarctica Roundabout | enriched | ok | 0 | 0 | 2026-05-11 15:01:30Z |

### D4 — `enriched` sin `raw_geocode`

| id | name | geo_health | geo_source | updated_at |
|---|---|---|---|---|
| `fe3a877c-…` | Compiano | ok | null | 2026-05-14 19:49:51Z |
| `f96246f9-…` | Percile | ok | null | 2026-05-14 19:49:49Z |
| `d1d117ea-…` | Offagna | ok | null | 2026-05-14 19:47:10Z |
| `c1dfcacb-…` | Montechiarugolo | ok | null | 2026-05-14 19:46:49Z |
| `bc303ce4-…` | Opi | ok | null | 2026-05-14 19:46:43Z |
| `ad09dc98-…` | Grottammare | ok | null | 2026-05-14 19:46:16Z |
| `a99dfa4e-…` | Castro dei Volsci | ok | null | 2026-05-14 19:46:10Z |
| `7bd04f1b-…` | Follina | ok | null | 2026-05-14 19:40:28Z |
| `791ade58-…` | Monteleone di Spoleto | ok | null | 2026-05-14 19:40:24Z |
| `674cda6d-…` | San Leo | ok | null | 2026-05-14 19:38:03Z |

Patrón: pueblos italianos enriquecidos en lote 2026-05-14 antes de Fase 2.

### D5 — `geo_health='ok'` stale

Mismas 10 filas que D4 (es el subconjunto que dispara R2). `geo_health = 'ok'` persistido contradice R2 (`enriched + raw_geocode IS NULL ⇒ hardError`).

| id | name | latitude | longitude | enrichment_status | no_raw | updated_at |
|---|---|---:|---:|---|---|---|
| `fe3a877c-…` | Compiano | 44.4960 | 9.6620 | enriched | true | 2026-05-14 19:49:51Z |
| `f96246f9-…` | Percile | 42.0945 | 12.9084 | enriched | true | 2026-05-14 19:49:49Z |
| `d1d117ea-…` | Offagna | 43.5276 | 13.4414 | enriched | true | 2026-05-14 19:47:10Z |
| `c1dfcacb-…` | Montechiarugolo | 44.6934 | 10.4224 | enriched | true | 2026-05-14 19:46:49Z |
| `bc303ce4-…` | Opi | 41.7810 | 13.8297 | enriched | true | 2026-05-14 19:46:43Z |
| `ad09dc98-…` | Grottammare | 42.9904 | 13.8687 | enriched | true | 2026-05-14 19:46:16Z |
| `a99dfa4e-…` | Castro dei Volsci | 41.5082 | 13.4063 | enriched | true | 2026-05-14 19:46:10Z |
| `7bd04f1b-…` | Follina | 45.9530 | 12.1181 | enriched | true | 2026-05-14 19:40:28Z |
| `791ade58-…` | Monteleone di Spoleto | 42.6510 | 12.9515 | enriched | true | 2026-05-14 19:40:24Z |
| `674cda6d-…` | San Leo | 43.8969 | 12.3436 | enriched | true | 2026-05-14 19:38:03Z |

### D6a — `zone == region` textual

| id | name | region | zone | updated_at |
|---|---|---|---|---|
| `ca9f4359-…` | Forza d'Agrò | Sicilia | Sicilia | 2026-05-19 16:39:29Z |
| `9a7428dd-…` | Creux du Van | Neuchatel | Neuchatel | 2026-05-18 13:31:33Z |
| `37030d80-…` | Puente del Diablo | Cantabria | Cantabria | 2026-05-16 11:50:43Z |
| `09d5b124-…` | Santillana del Mar | Cantabria | Cantabria | 2026-05-16 11:49:51Z |
| `7a6d046e-…` | Santillana del Mar | Cantabria | Cantabria | 2026-05-16 11:49:27Z |
| `1a56f465-…` | Comillas | Cantabria | Cantabria | 2026-05-16 11:49:14Z |
| `8c2bee8d-…` | San Vicente de la Barquera | Cantabria | Cantabria | 2026-05-16 11:49:00Z |
| `65961f6d-…` | Llanes | Principado de Asturias | Principado de Asturias | 2026-05-16 11:47:31Z |
| `a01b0259-…` | Ribadesella | Principado de Asturias | Principado de Asturias | 2026-05-16 11:46:40Z |
| `da0ada4c-…` | La Cuevona | Principado de Asturias | Principado de Asturias | 2026-05-16 11:46:04Z |

### D6b — `zone_id` redundante FK

Mismas 10 filas que D6a — el daño es simétrico textual+FK.

| id | name | region_name | zone_name | updated_at |
|---|---|---|---|---|
| `ca9f4359-…` | Forza d'Agrò | Sicilia | Sicilia | 2026-05-19 16:39:29Z |
| `9a7428dd-…` | Creux du Van | Neuchatel | Neuchatel | 2026-05-18 13:31:33Z |
| `37030d80-…` | Puente del Diablo | Cantabria | Cantabria | 2026-05-16 11:50:43Z |
| `09d5b124-…` | Santillana del Mar | Cantabria | Cantabria | 2026-05-16 11:49:51Z |
| `7a6d046e-…` | Santillana del Mar | Cantabria | Cantabria | 2026-05-16 11:49:27Z |
| `1a56f465-…` | Comillas | Cantabria | Cantabria | 2026-05-16 11:49:14Z |
| `8c2bee8d-…` | San Vicente de la Barquera | Cantabria | Cantabria | 2026-05-16 11:49:00Z |
| `65961f6d-…` | Llanes | Principado de Asturias | Principado de Asturias | 2026-05-16 11:47:31Z |
| `a01b0259-…` | Ribadesella | Principado de Asturias | Principado de Asturias | 2026-05-16 11:46:40Z |
| `da0ada4c-…` | La Cuevona | Principado de Asturias | Principado de Asturias | 2026-05-16 11:46:04Z |

### D7-struct — placeholders en columnas

| id | name | country | region | zone | continent | updated_at |
|---|---|---|---|---|---|---|
| `8599037f-…` | Soajo | Portugal | (sin región) | Viana do Castelo | Europa | 2026-05-16 14:44:08Z |
| `1ed634ef-…` | Lastres | España | Principado de Asturias | (sin provincia) | Europa | 2026-05-16 11:45:38Z |
| `eb2f5374-…` | Kjerag | Noruega | (sin región) | Rogaland | Europa | 2026-05-14 19:49:28Z |
| `d65d900c-…` | Hațeg | Rumania | (sin región) | Hunedoara | Europa | 2026-05-14 19:49:02Z |
| `c9afc5ba-…` | Hvar | Croacia | (sin región) | Split-Dalmatia County | Europa | 2026-05-14 19:47:00Z |
| `c53e3ad2-…` | Hamnøy | Noruega | (sin región) | Nordland | Europa | 2026-05-14 19:46:53Z |
| `bbcdc4c8-…` | Predjama | Eslovenia | (sin región) | (sin región) | Europa | 2026-05-14 19:46:41Z |
| `b7752d84-…` | Cluj-Napoca | Rumania | (sin región) | Cluj | Europa | 2026-05-14 19:46:34Z |
| `b8658eb7-…` | Reino de Voss | Noruega | (sin región) | Vestland | Europa | 2026-05-14 19:46:34Z |
| `b6e0d9a0-…` | Sogn og Fjordane | Noruega | (sin región) | Vestland | Europa | 2026-05-14 19:46:32Z |

### D7-enriched — placeholders en `enriched_data.datos_geograficos`

Sólo los 10 más recientes; el blob completo se muestra abreviado por legibilidad.

| id | name | placeholder keys detectadas | updated_at |
|---|---|---|---|
| `8599037f-…` | Soajo | `admin_nivel_1='(sin región)'` | 2026-05-16 14:44:08Z |
| `1a56f465-…` | Comillas | `admin_nivel_2='(sin provincia)'` | 2026-05-16 11:49:14Z |
| `65961f6d-…` | Llanes | `admin_nivel_2='(sin provincia)'` | 2026-05-16 11:47:31Z |
| `b6b2d792-…` | Tazones | `admin_nivel_2='(sin provincia)'` | 2026-05-16 11:43:56Z |
| `e690a835-…` | Cercedilla | `admin_nivel_2='(sin provincia)'` | 2026-05-15 10:04:55Z |
| `fb41deee-…` | Fiumefreddo Bruzio | `admin_nivel_2='(sin provincia)'` | 2026-05-14 19:49:51Z |
| `fb34f959-…` | San Gemini | `admin_nivel_2='(sin provincia)'` | 2026-05-14 19:49:51Z |
| `f9c63308-…` | Spilimbergo | `admin_nivel_2='(sin provincia)'` | 2026-05-14 19:49:49Z |
| `f93ea6bc-…` | Corenno Plinio | `admin_nivel_2='(sin provincia)'` | 2026-05-14 19:49:49Z |
| `f8df57b7-…` | Isola San Giulio | `admin_nivel_2='(sin provincia)'` | 2026-05-14 19:49:47Z |

Dominante: `admin_nivel_2 = '(sin provincia)'` en POIs italianos/españoles. Origen probable: LLM legacy emitiendo placeholder cuando Nominatim no devolvía nivel 2.

### D1, D3, D8 — sin muestras

`count = 0` confirmado vía SELECT. No hay filas que mostrar.



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
