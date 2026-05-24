# Contrato — Coherencia coordenadas ↔ enriquecimiento

Documento docs-only. Formaliza el contrato que el pipeline debe cumplir para que un POI con coords inválidas o incoherentes con su geografía textual no pueda terminar persistido como `enriched + geo_health='ok'`.

No modifica `src/`, `supabase/`, datos, tests, `package.json`, `README`, versión. tests/lint not run: docs-only critical audit. Version impact: none.

Diagnóstico: ver [`docs/audits/enrichment-coord-coherence-audit.md`](../audits/enrichment-coord-coherence-audit.md).

## 1. Principios

1. Coords = verdad geográfica. IA = verdad literaria. Nunca al revés.
2. Toda escritura geográfica estructurada (`country/region/zone/locality/continent` + `*_id`) procede exclusivamente del reverse-geocode canónico (`resolve-coordinates` / `reverseGeocodeCanonical`).
3. La IA puede leer la geografía resuelta como contexto; no puede sobrescribirla.
4. Cualquier incoherencia IA↔reverse-geocode bloquea la persistencia: el POI va a `quarantine`, no a `enriched`.
5. Sin coords válidas no hay enriquecimiento.
6. Identidad del POI = nombre compatible + coordenadas compatibles. Coordenadas válidas no bastan; nombre válido no basta. Sin identidad confirmada no hay enriquecimiento.

## 2. Definiciones

- **Coordenada WGS84 válida** = `isFinite(lat) AND isFinite(lng) AND -90 ≤ lat ≤ 90 AND -180 ≤ lng ≤ 180 AND NOT (lat=0 AND lng=0)`. Helper canónico: `isValidWgs84Coord(lat, lng)`.
- **Cadena admin canónica** = `{country, region, zone, admin3, locality}` resuelta por `reverse-geocode → resolve-admin-area`.
- **Cadena admin narrativa** = lo que el LLM redacta en `enriched_data.descripcion` y `enriched_data.datos_geograficos.*`.
- **Quarantine** = `enrichment_status='quarantine'` + `custom_data.enrichment_block = { reason, expected, got, source }`. Aparece en panel admin; no se renderiza como POI sano.
- **Identidad nombre↔coords** = par `(name, lat, lng)` cuya verificación cruzada (reverse-geocode + nearby + name-search) devuelve match con confianza alta.
- **`name_coordinate_mismatch`** = razón canónica cuando coords son válidas pero el nombre declarado no aparece cerca.
- **`name_found_elsewhere`** = razón canónica cuando el nombre existe con alta confianza en una o más ubicaciones distintas a las coords aportadas.
- **`pending_validation`** = `enrichment_status='pending_validation'` + `custom_data.enrichment_block = { reason, candidates, source }`. Estado pre-LLM (no es `quarantine`, que es post-LLM).

## 3. Reglas duras

### R1 — Entry gate único
Toda función que reciba `lat/lng` para enriquecer DEBE invocar `isValidWgs84Coord` como primer paso. Si falla: POI NO enriquece, se enruta a `geocoding-job` (forward-geocode por `name+country/region`), respuesta `{ validation_required: true, reason: 'invalid_coordinates' }`.

### R2 — `(0,0)` es siempre `hardError`
`geo_health` devuelve `'hardError'` si:
- `latitude IS NULL OR longitude IS NULL`
- `latitude=0 AND longitude=0`
- `ABS(latitude)>90 OR ABS(longitude)>180`
- coords válidas pero `raw_geocode IS NULL AND enrichment_status='enriched'`

### R3 — `resolve-coordinates` es source-of-truth geográfico
`batch-enrich` y cualquier edge de enriquecimiento DEBE:
1. Llamar `resolve-coordinates(lat,lng)` ANTES del LLM.
2. Pasar `CanonicalGeo` al LLM como CONTEXTO (lectura).
3. Persistir `country/region/zone/continent/country_code/admin1_iso/postal_code/timezone` + todos los `*_id` exclusivamente desde el reverse-geocode.
4. Persistir `geo_source='nominatim'`, `geo_confidence`, `geo_resolved_at=now()`, `raw_geocode=CanonicalGeo`.

### R4 — La IA no escribe geografía estructurada
Prompt + schema validator PROHÍBEN que el LLM emita:
- `datos_geograficos.coordenadas`
- `datos_geograficos.pais`
- `datos_geograficos.admin_nivel_1|2|3`
- `datos_geograficos.continente`
- `datos_geograficos.localidad`
- `datos_geograficos.sublocalidad`

Permitido: `datos_geograficos.lugar_interes`, `descripcion`, `datos_clave`, `tags`. Validador rechaza payload IA que infrinja. Backend NUNCA hace merge silencioso de campos prohibidos.

### R5 — Placeholders no se persisten
`(sin región)`, `(sin provincia)`, `(sin comarca)`, `(sin localidad)` y similares SE PROHÍBEN en columnas estructuradas y en `enriched_data.datos_geograficos.*`. Valor canónico de "no resuelto" = `NULL`. Alinea con [`docs/audits/geography-tree-taxonomy-audit.md`](../audits/geography-tree-taxonomy-audit.md).

### R6 — Gate de coherencia IA ↔ coords
Antes de persistir, `assertGeoCoherence(canonical, aiNarrative)`:
- Extrae topónimos de país/región/ciudad de `descripcion` + `datos_geograficos.lugar_interes`.
- País mencionado ≠ `canonical.country` → **incoherente**.
- Región mencionada ≠ `canonical.region` (cuando exista) → **incoherente** salvo tolerancia explícita de admin1 vecina.
- `incoherent` → `enrichment_status='quarantine'`, NO se escribe `enriched_data` final, se registra en `custom_data.enrichment_block`.

### R7 — `places_trunk` rechaza coords inválidas
`lookup_trunk_place` y `upsert_trunk_place` rechazan requests donde `(_lat,_lng)` no pasa `isValidWgs84Coord`.

### R8 — `zone ≠ region.parent_name`
El resolver de FKs admin rechaza `zone_id` si su nombre coincide con `region`. Si solo hay candidata coincidente con la región padre, `zone_id` queda NULL. Alinea con el core memory `Árbol geográfico canónico`.

### R9 — Name-coordinate identity gate (pre-LLM)
Antes de invocar la IA, además de R1, el pipeline DEBE ejecutar `assertNameCoordinateIdentity({ name, lat, lng })`:

1. Validar coords (R1).
2. Reverse-geocode + nearby lookup desde `(lat, lng)` → conjunto `C_coords` de candidatos cercanos (radio configurable, p.ej. ≤ 250 m exacto / ≤ 1 km warning según tipo).
3. Cuando el nombre es resoluble (no genérico), búsqueda por nombre → conjunto `C_name` de candidatos con coords.
4. Comparar `name` declarado contra `C_coords` (fuzzy + normalización topónimos, tolerancia a acentos/artículos/idioma).
5. Decisión:
   - **Match alto** — `name ∈ C_coords` o `dist(name_best, coords) ≤ ε` → continuar enriquecimiento.
   - **Coords válidas, nombre no aparece cerca** → `validation_required` con `reason='name_coordinate_mismatch'`. POI queda en `pending_validation`. NO se enriquece. NO se mueven coords.
   - **Nombre existe lejos** (`C_name ≠ ∅` y todos están lejos de `coords`) → devolver `C_name` como **candidatos** al usuario (con sus coords), `reason='name_found_elsewhere'`. NO mover el POI automáticamente. NO enriquecer como `enriched`. POI queda en `pending_validation`.
   - **Coords inválidas** (R1 falla) → forward-geocode por nombre + contexto (`country/region`) para sugerir coords candidatas, pero NO enriquecer hasta que el usuario confirme.
6. Toda decisión distinta de "match alto" se registra en `custom_data.enrichment_block = { reason, candidates, source }` y deja `enrichment_status='pending_validation'`.

R9 es **pre-LLM** y **complementaria** a R6 (post-LLM): R9 garantiza identidad del POI antes de gastar IA; R6 garantiza coherencia narrativa después.

## 4. Fases (plan incremental, NO se ejecutan en este documento)

### Fase 1 — Entry gates duros
Crear `isValidWgs84Coord` en `src/shared/geography/coord-validity.ts` + espejo Deno `supabase/functions/_shared/coord-validity.ts`. Sustituir `normalizeLocation` en `enrich-location`. Aplicar en `batch-enrich` y `scrape-tick`. Tests contrato (válido, `(0,0)`, `null`, out-of-WGS84). Aplica R1.

### Fase 2 — `resolve-coordinates` obligatorio antes del LLM
`batch-enrich`: llamar `resolve-coordinates` PRIMERO, fallar duro si `error`. Pasar `CanonicalGeo` al LLM solo como contexto. Persistir geografía estructurada y `raw_geocode/geo_source/geo_confidence/geo_resolved_at` solo desde reverse-geocode. Aplica R3.

### Fase 3 — Name-coordinate identity gate (R9)
Crear helper `assertNameCoordinateIdentity({ name, lat, lng })` que consume `resolve-coordinates` (Fase 2) + nearby lookup + name-search. Integrarlo en `enrich-location` y `batch-enrich` **después** de Fase 2 y **antes** de cualquier llamada al LLM. Estados de salida: `ok` / `name_coordinate_mismatch` / `name_found_elsewhere` / `invalid_coordinates`. Persistir `pending_validation` + `custom_data.enrichment_block` cuando proceda. UI de validación reutiliza panel de unresolved (extensión, no panel nuevo). Aplica R9.

### Fase 4 — Prompt y validator: IA fuera de geografía estructurada
Rediseñar prompt de `enrich-location` (no pedir país/región/admin/coordenadas). Schema validator rechaza campos R4. Limpia placeholders R5. Aplica R4 + R5.

### Fase 5 — `geo_health` honesto
Reescribir `compute_geo_health(loc)` para cubrir R2. Bandera `enriched_without_raw_geocode → hardError`. Sin migración de datos. Aplica R2.

### Fase 6 — `assertGeoCoherence` + quarantine
Implementar helper. Añadir `enrichment_status='quarantine'` + `custom_data.enrichment_block`. Panel admin (extensión `UnresolvedLocationsPanel` o nuevo). Aplica R6.

### Fase 7 — `places_trunk` saneado + guard `zone≠region`
RPCs `lookup/upsert_trunk_place`: rechazo coords inválidas. Resolver admin: guard `zone_id IS NULL si zone_name == region_name`. Aplica R7 + R8.

### Backfill — fuera de scope
Rehabilitación de POIs históricamente corruptos (re-encolar, purgar trunk, migrar `Espana→España`, eliminar literales `(sin …)`) en plan independiente posterior.

## 5. Riesgos

- Cambio del contrato LLM (Fase 4): consumers en popup/breadcrumb pueden leer `datos_geograficos.pais` en lugar de columnas estructuradas. Auditar antes.
- Fase 5 reclasifica masivamente POIs como `hardError` → explosión de anillos rojos en mapa. Aceptable como señal real.
- Fase 6 puede mandar a quarantine POIs con tolerancia geográfica ambigua ("cerca de Madrid" en un POI de Toledo). El umbral necesita iteración.
- Fase 7 no es retroactiva: trunk envenenado sigue sirviendo hasta backfill. Mitigación: Fase 1 corta la entrada nueva.
- Coste IA y storm de realtime al re-enriquecer cuarentena masiva. Rate-limit por usuario.
- Cobertura Nominatim limitada en remoto/oceánico: `resolve-coordinates` puede devolver `error` legítimo. R3 distingue retry vs quarantine.
- Fase 3 puede frenar imports masivos legítimos con nombres genéricos ("Parking", "Mirador", "Iglesia"). Umbral de "match alto" y exenciones por tipo deben iterarse.
- `name_found_elsewhere` requiere UI de candidatos; sin ella, los POIs quedan atascados en `pending_validation`. Mínimo viable: panel admin reutilizado.
- R9 NO mueve coords del POI automáticamente — siempre requiere acción del usuario.

## 6. Fuera de scope (explícito)

- Tocar datos del POI "Glorieta de la Antártida".
- Cambios en RLS, RBAC, UI popup/sharing.
- Backfill masivo de POIs históricos.
- Migración del canon ES (`España` vs `Spain`) — vive en [`docs/audits/geography-tree-taxonomy-audit.md`](../audits/geography-tree-taxonomy-audit.md).
- Bump versión, `package.json`, `README`, tests.
- Auto-relocate de POIs cuando R9 detecta `name_found_elsewhere` — la decisión es del usuario.

## 7. Restricciones del documento

- No modifica datos, Supabase, runtime, tests, `package.json`, `README`, versión.
- tests/lint not run: docs-only critical audit. Version impact: none.
