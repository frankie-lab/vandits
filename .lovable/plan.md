## Alcance

Docs-only crítico. Crea 2 archivos nuevos y añade 1 ítem a `docs/tech-debt.md`. No toca `src/`, `supabase/`, datos, tests, `package.json`, `README` ni versión. tests/lint not run: docs-only critical audit. Version impact: none.

Archivos:

1. `docs/audits/enrichment-coord-coherence-audit.md` — nuevo.
2. `docs/contracts/enrichment-coord-coherence-contract.md` — nuevo.
3. `docs/tech-debt.md` — añadir ítem 7 "Coherencia coordenadas-enriquecimiento" en la tabla de estado auditado y como sección priorizada al final.

---

## 1) `docs/audits/enrichment-coord-coherence-audit.md` (nuevo)

````markdown
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

Distancia entre el POI y su ubicación esperada (Azuqueca de Henares, 40.5686 / -3.2667): **≈ 4.700 km**.

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
  COUNT(*) FILTER (WHERE latitude=0 AND longitude=0 AND geo_health='ok')         AS null_island_marked_ok,
  COUNT(*) FILTER (WHERE latitude=0 AND longitude=0 AND enrichment_status='enriched') AS null_island_enriched
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

## 5. Síntesis

> **El enriquecimiento literario y la verdad geográfica son flujos desacoplados. El segundo nunca audita al primero, y el primero puede escribir en territorio del segundo.**

Las 7 anomalías son manifestaciones de esa misma ausencia de gate. El contrato vive en `docs/contracts/enrichment-coord-coherence-contract.md`.

## 6. Restricciones del documento

- No modifica datos, Supabase, runtime, tests, `package.json`, `README`, versión.
- tests/lint not run: docs-only critical audit. Version impact: none.
````

---

## 2) `docs/contracts/enrichment-coord-coherence-contract.md` (nuevo)

````markdown
# Contrato — Coherencia coordenadas ↔ enriquecimiento

Documento docs-only. Formaliza el contrato que el pipeline debe cumplir para que un POI con coords inválidas o incoherentes con su geografía textual no pueda terminar persistido como `enriched + geo_health='ok'`.

No modifica `src/`, `supabase/`, datos, tests, `package.json`, `README`, versión. tests/lint not run: docs-only critical audit. Version impact: none.

Diagnóstico: ver `docs/audits/enrichment-coord-coherence-audit.md`.

## 1. Principios

1. Coords = verdad geográfica. IA = verdad literaria. Nunca al revés.
2. Toda escritura geográfica estructurada (`country/region/zone/locality/continent` + `*_id`) procede exclusivamente del reverse-geocode canónico (`resolve-coordinates` / `reverseGeocodeCanonical`).
3. La IA puede leer la geografía resuelta como contexto; no puede sobrescribirla.
4. Cualquier incoherencia IA↔reverse-geocode bloquea la persistencia: el POI va a `quarantine`, no a `enriched`.
5. Sin coords válidas no hay enriquecimiento.

## 2. Definiciones

- **Coordenada WGS84 válida** = `isFinite(lat) AND isFinite(lng) AND -90 ≤ lat ≤ 90 AND -180 ≤ lng ≤ 180 AND NOT (lat=0 AND lng=0)`. Helper canónico: `isValidWgs84Coord(lat, lng)`.
- **Cadena admin canónica** = `{country, region, zone, admin3, locality}` resuelta por `reverse-geocode → resolve-admin-area`.
- **Cadena admin narrativa** = lo que el LLM redacta en `enriched_data.descripcion` y `enriched_data.datos_geograficos.*`.
- **Quarantine** = `enrichment_status='quarantine'` + `custom_data.enrichment_block = { reason, expected, got, source }`. Aparece en panel admin; no se renderiza como POI sano.

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
`(sin región)`, `(sin provincia)`, `(sin comarca)`, `(sin localidad)` y similares SE PROHÍBEN en columnas estructuradas y en `enriched_data.datos_geograficos.*`. Valor canónico de "no resuelto" = `NULL`. Alinea con `docs/audits/geography-tree-taxonomy-audit.md`.

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

## 4. Fases (plan incremental, NO se ejecutan en este documento)

### Fase 1 — Entry gates duros
Crear `isValidWgs84Coord` en `src/shared/geography/coord-validity.ts` + espejo Deno `supabase/functions/_shared/coord-validity.ts`. Sustituir `normalizeLocation` en `enrich-location`. Aplicar en `batch-enrich` y `scrape-tick`. Tests contrato (válido, `(0,0)`, `null`, out-of-WGS84). Aplica R1.

### Fase 2 — `resolve-coordinates` obligatorio antes del LLM
`batch-enrich`: llamar `resolve-coordinates` PRIMERO, fallar duro si `error`. Pasar `CanonicalGeo` al LLM solo como contexto. Persistir geografía estructurada y `raw_geocode/geo_source/geo_confidence/geo_resolved_at` solo desde reverse-geocode. Aplica R3.

### Fase 3 — Prompt y validator: IA fuera de geografía estructurada
Rediseñar prompt de `enrich-location` (no pedir país/región/admin/coordenadas). Schema validator rechaza campos R4. Limpia placeholders R5. Aplica R4 + R5.

### Fase 4 — `geo_health` honesto
Reescribir `compute_geo_health(loc)` para cubrir R2. Bandera `enriched_without_raw_geocode → hardError`. Sin migración de datos. Aplica R2.

### Fase 5 — `assertGeoCoherence` + quarantine
Implementar helper. Añadir `enrichment_status='quarantine'` + `custom_data.enrichment_block`. Panel admin (extensión `UnresolvedLocationsPanel` o nuevo). Aplica R6.

### Fase 6 — `places_trunk` saneado + guard `zone≠region`
RPCs `lookup/upsert_trunk_place`: rechazo coords inválidas. Resolver admin: guard `zone_id IS NULL si zone_name == region_name`. Aplica R7 + R8.

### Backfill — fuera de scope
Rehabilitación de POIs históricamente corruptos (re-encolar, purgar trunk, migrar `Espana→España`, eliminar literales `(sin …)`) en plan independiente posterior.

## 5. Riesgos

- Cambio del contrato LLM (Fase 3): consumers en popup/breadcrumb pueden leer `datos_geograficos.pais` en lugar de columnas estructuradas. Auditar antes.
- Fase 4 reclasifica masivamente POIs como `hardError` → explosión de anillos rojos en mapa. Aceptable como señal real.
- Fase 5 puede mandar a quarantine POIs con tolerancia geográfica ambigua ("cerca de Madrid" en un POI de Toledo). El umbral necesita iteración.
- Fase 6 no es retroactiva: trunk envenenado sigue sirviendo hasta backfill. Mitigación: Fase 1 corta la entrada nueva.
- Coste IA y storm de realtime al re-enriquecer cuarentena masiva. Rate-limit por usuario.
- Cobertura Nominatim limitada en remoto/oceánico: `resolve-coordinates` puede devolver `error` legítimo. R3 distingue retry vs quarantine.

## 6. Fuera de scope (explícito)

- Tocar datos del POI "Glorieta de la Antártida".
- Cambios en RLS, RBAC, UI popup/sharing.
- Backfill masivo de POIs históricos.
- Migración del canon ES (`España` vs `Spain`) — vive en `docs/audits/geography-tree-taxonomy-audit.md`.
- Bump versión, `package.json`, `README`, tests.

## 7. Restricciones del documento

- No modifica datos, Supabase, runtime, tests, `package.json`, `README`, versión.
- tests/lint not run: docs-only critical audit. Version impact: none.
````

---

## 3) Edición de `docs/tech-debt.md`

### 3a) En la tabla "Estado auditado" (tras la fila 6), añadir fila 7:

| Ítem | Estado | Tipo | Comentario |
|---|---|---|---|
| 7. Coherencia coordenadas-enriquecimiento | Abierto crítico | Backend / pipeline de datos | POIs con coords inválidas pueden quedar `enriched + geo_health='ok'`. Diagnóstico: [`docs/audits/enrichment-coord-coherence-audit.md`](./audits/enrichment-coord-coherence-audit.md). Contrato y fases: [`docs/contracts/enrichment-coord-coherence-contract.md`](./contracts/enrichment-coord-coherence-contract.md). |

### 3b) Al final del archivo, añadir sección priorizada:

```markdown
### 7. Coherencia coordenadas-enriquecimiento

- Severidad: crítica
- Facilidad: media (6 fases incrementales independientes)
- Riesgo de cambio: medio (toca pipeline de enriquecimiento + RPCs trunk + `geo_health`)
- Estado: abierto crítico (2026-05-20)

Motivo: POIs con coordenadas inválidas (`(0,0)`, `NULL`, fuera de rango WGS84) pueden terminar persistidos como `enrichment_status='enriched'` con `geo_health='ok'` y cadena admin textual inventada por el LLM. Caso de referencia: "Glorieta de la Antártida" / "Antarctica Roundabout" persistido en Null Island con `country='España'` y FKs admin resueltas pero `raw_geocode IS NULL`.

Causa raíz: enriquecimiento literario (IA) y verdad geográfica (reverse-geocode) son flujos desacoplados. La IA puede escribir `datos_geograficos.*` libremente, `batch-enrich` no llama a `resolve-coordinates` antes de persistir, no hay gate de coherencia, `geo_health` no detecta `(0,0)`, y `places_trunk` cachea las coords inválidas propagando la basura.

Cierre por fases (ver contrato):

1. Entry gates `isValidWgs84Coord`.
2. `resolve-coordinates` obligatorio antes del LLM.
3. Prompt + validator: IA fuera de geografía estructurada.
4. `geo_health` honesto (`(0,0)` → `hardError`).
5. `assertGeoCoherence` + `quarantine`.
6. `places_trunk` saneado + guard `zone≠region`.

Backfill de POIs corruptos históricos: fuera de scope, se aborda tras validar Fases 1–6.

No iniciar Fase 4 antes de Fase 1, ni Fase 5 antes de Fase 2 (orden de dependencia documentado en el contrato).
```

---

## Validación post-aplicación

- `docs/audits/enrichment-coord-coherence-audit.md` existe y referencia al contrato.
- `docs/contracts/enrichment-coord-coherence-contract.md` existe y referencia a la auditoría.
- `docs/tech-debt.md` tiene 7 filas en la tabla de estado y 7 secciones priorizadas.
- Ningún cambio en `src/`, `supabase/`, `package.json`, `README`, tests, datos, versión.
- tests/lint not run: docs-only critical audit. Version impact: none.
