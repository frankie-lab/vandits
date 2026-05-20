
# Fase 2 — `resolve-coordinates` obligatorio antes del LLM

Cumple R3 del contrato `docs/contracts/enrichment-coord-coherence-contract.md`. Tras Fase 1 (gates WGS84 ya cableados), añadimos un único gate canónico de reverse-geocode antes de cualquier llamada al LLM. La IA queda fuera de la geografía estructurada.

## Arquitectura

`enrich-location` es el **único** punto donde se invoca el LLM. Por tanto el gate vive ahí (single source of truth). `batch-enrich` no duplica la llamada Nominatim — sólo mapea el nuevo error estructurado a su `errorMessages`. Esto evita doble hit a Nominatim, respeta el rate-limit y mantiene una sola responsabilidad.

```text
batch-enrich
   └── (R1 ya cableado: isValidWgs84Coord)
   └── fetch enrich-location
            └── R1: isValidWgs84Coord
            └── R3 (NUEVO): resolve-coordinates(lat,lng)
                    ├── error  → return { validation_required:true, reason:'reverse_geocode_failed' }
                    └── ok     → CanonicalGeo + ids + confidence + raw_geocode
            └── LLM (recibe CanonicalGeo como CONTEXTO read-only)
            └── persist enriched_data (sin geo estructurada) + _geocoded(canonical) en response
   └── update locations SET country/region/zone/continent/*_id/country_code/postal_code/timezone/geo_source/geo_confidence/geo_resolved_at/raw_geocode FROM _geocoded
```

## Cambios

### 1. `supabase/functions/enrich-location/index.ts`
- Tras el gate R1 (`inspectWgs84Coord`, ya presente) y antes de cualquier `Promise.all` de fuentes / antes del LLM: invocar `resolve-coordinates` vía `fetch ${SUPABASE_URL}/functions/v1/resolve-coordinates` con `{ latitude, longitude, place_type_code }` y `Bearer SERVICE_ROLE_KEY`.
- Si `!res.ok` o `canonical == null` → return 200 con `{ success:false, validation_required:true, reason:'reverse_geocode_failed', message, providedName, coords:{lat,lng} }`. No se llama LLM, no se persiste nada.
- Sustituir el bloque actual `Promise.all([reverseGeocodeLocation(...), ...])`: usar `canonical` como única fuente de `country/region/zone/continent`. Eliminar la rama condicional `useNominatim && (!location.country || !location.region)` para geografía estructurada (Wikipedia/Wikidata/GeoNames siguen ejecutándose para extractos y enriquecimiento literario; sólo se les retira la capacidad de poblar `geoData`).
- `geoData` se construye exclusivamente desde `canonical`:
  ```
  geoData = { country, region, zone, continent, country_code, postal_code, timezone, ids, geo_source:'nominatim', geo_confidence, raw_geocode, geo_resolved_at:new Date().toISOString() }
  ```
- Pasar `geoData` al prompt **sólo como contexto** (string read-only). Ya está marcado por R4 que la IA no escribe campos geo estructurados; aquí simplemente nos aseguramos de que el prompt diga "Geografía resuelta (no la sobrescribas): …".
- En la respuesta final, sustituir el `enrichedData._geocoded` actual (parcial) por el snapshot canónico completo, para que `batch-enrich` lo persista íntegro.
- Marcar `reverseGeocodeLocation` como deprecated (mantener para no romper imports; no llamarlo en el path principal).

### 2. `supabase/functions/batch-enrich/index.ts`
- Mapear nueva respuesta: si `enrichData.validation_required && enrichData.reason === 'reverse_geocode_failed'` → push en `errorIds` con `errorMessages[id] = { kind:'reverse_geocode_failed', message, reason:'reverse_geocode_failed' }`. No reintento, no contar como `no_credits`.
- Extender el `updateData` cuando viene `geocodedData` para persistir el set canónico completo: además de `country/region/zone/continent`, también `country_code`, `postal_code`, `timezone`, `geo_source`, `geo_confidence`, `geo_resolved_at`, `raw_geocode`, y los `*_id` (`continent_id`, `country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`, `sublocality_id`). Sólo se escriben los campos presentes (sin sobrescribir con `null` si vienen `undefined`).
- No tocar `upsert_trunk_place` (vive en Fase 7).

### 3. Tests
- `supabase/functions/enrich-location/index.test.ts`: añadir test "POST con coords válidas pero `resolve-coordinates` caído devuelve `validation_required:true, reason:'reverse_geocode_failed'` y NO llama al LLM" — usando `coords` reales pero forzando el escenario mediante un test con mock no es viable en Deno test real; en su lugar añadimos un test de **contrato** que verifica que cuando la función devuelve `validation_required`, la respuesta cumple el shape `{ success:false, validation_required:true, reason:'reverse_geocode_failed' }`. Para cubrir el path positivo, test de smoke con coords WGS84 válidas (Torre Eiffel ya existe) que asserta presencia de `_geocoded` con `canonical.country` y `geo_source==='nominatim'` en el payload — sin asumir éxito del LLM (puede no tener API key en CI).
- Tests existentes Fase 1 (`src/test/coord-validity.test.ts`) siguen verdes — no se tocan.

### 4. Documentación y versión (patch 1.2.10 → 1.2.11)
- `package.json`: `"version": "1.2.11"`.
- `src/lib/app-version.ts`: `APP_VERSION = '1.2.11'`.
- `README.md`: nuevo entry changelog v1.2.11 (Fase 2: gate `resolve-coordinates` obligatorio pre-LLM, IA sin geografía estructurada, batch-enrich propaga `reverse_geocode_failed`).
- `docs/releases/version-history.md`: añadir v1.2.11 con alcance y archivos.
- `docs/tech-debt.md` ítem 7: status → "En progreso — Fase 2 aplicada"; añadir nota de qué cubre (R3) y qué falta (Fases 3–7).

## Fuera de scope (explícito)
- Migraciones SQL, datos históricos, re-enrich de POIs.
- `LocationMap.tsx`, RLS/RBAC, UI de mapa, `places_trunk`.
- Fase 3 (R9 name-coordinate identity), Fase 4 (prompt + validator IA), Fases 5–7.
- Eliminar `reverseGeocodeLocation` / `CONTINENT_MAP` / `inferContinentFromCoordinates` (se quedan dormant; cleanup en una fase posterior para no inflar este diff).

## Validación
- `bunx vitest run src/test/coord-validity.test.ts` → 7/7 verde.
- Deno tests `enrich-location` actualizados → verdes (smoke + contract shape).
- Lectura manual de `batch-enrich` para confirmar que `reverse_geocode_failed` no se cuenta como `no_credits` ni dispara backoff infinito.

## Flujo protegido tras Fase 2
- Ningún POI con coords WGS84 válidas puede entrar al LLM sin antes haber resuelto `CanonicalGeo` desde Nominatim.
- Ningún campo geográfico estructurado (`country/region/zone/continent/*_id/country_code/postal_code/timezone/raw_geocode/geo_source/geo_confidence/geo_resolved_at`) se persiste desde la IA ni desde el cliente: sólo desde `resolve-coordinates`.
- Fallo de reverse-geocode → POI **no** se enriquece, **no** se gasta IA, respuesta canónica `validation_required:true, reason:'reverse_geocode_failed'`.

## Version impact
patch — 1.2.10 → 1.2.11.
