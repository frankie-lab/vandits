# B5-L0 — Muestra de calibración (25 POIs)

**Status:** 📋 Calibración (no se ejecuta, no se modifica nada)
**Fecha:** 2026-05-20
**Predecesores:** `docs/audits/b5-poi-maturity-distribution.md`
**Scope B5 candidato:** `geo_health = 'hardError'` ∪ (`enrichment_status = 'enriched'` ∧ `raw_geocode` vacío). Total = 394 POIs (393 POI-3 + 1 POI-2).

> Esta nota selecciona 25 POIs representativos para revisión humana **antes** de cualquier `resolve-coordinates` o `UPDATE`. Sirve para detectar falsos positivos del enrichment LLM y decidir si B5 puede ejecutarse de forma segura sobre el resto del scope.

## Buckets de muestreo

| Bucket | n | Por qué |
|---|---:|---|
| `NULL_ISLAND` | 1 | Único caso POI-2; aislado fuera del lote masivo |
| `SYNTH_ES` | 8 | Nombres sintéticos en España (mayor masa del scope) |
| `SYNTH_FR` | 4 | Nombres sintéticos en Francia (segundo país por volumen) |
| `SYNTH_INTL` | 2 | Nombres sintéticos fuera ES/FR (Portugal) |
| `MUNI_ES` | 2 | Topónimos cortos compatibles con municipio real (ES) |
| `MUNI_FR` | 3 | Topónimos cortos compatibles con municipio real (FR) |
| `MULTI_ES` | 3 | Frases multi-palabra ES sin sufijos sintéticos obvios |
| `OTHER` | 2 | Resto internacional (Portugal/Italia) |
| **Total** | **25** | |

## Tabla canon (decisión humana pendiente por fila)

Columnas: `bucket`, `id`, `name`, `lat`, `lng`, `country`, `region`, `zone`, `geo_health`, `enrichment_status`, `riesgo`, `verificar`, `decisión`.

`decisión ∈ { approve | reject | needs-name-fix | needs-coord-fix }` — todas vacías en este lote, a rellenar manualmente.

### NULL_ISLAND (POI-2)

| id | name | lat | lng | country | region | zone | geo_h | enr |
|---|---|---:|---:|---|---|---|---|---|
| `89867d20-bc1e-4a12-82fa-ba4820a5cdab` | Antarctica Roundabout | 0 | 0 | España | Castilla-La Mancha | – | hardError | enriched |

- **Riesgo:** Null Island puro + nombre absurdo + país/región incoherentes con el topónimo "Antarctica". POI inservible.
- **Verificar (humano):** ¿existe alguna referencia legítima? Casi seguro no. Confirmar que es residuo de enrichment LLM.
- **Decisión esperada:** `reject` (purge o flag `geo_irrecoverable`). NO mandar a re-geocode.
- **Pendiente:** ☐

### SYNTH_ES (8)

| id | name | lat | lng | region | zone | geo_h | enr |
|---|---|---:|---:|---|---|---|---|
| `4fc18bfc-3108-45a2-832a-3a03adbbc1e0` | Plaza Mayor de Albacete de la Sierra | 39.068463 | −1.97694 | – | – | hardError | enriched |
| `f977e226-da17-4485-96d2-a5483b26f03e` | Faro de Valladolid de la Sierra | 41.748043 | −4.736602 | – | – | hardError | enriched |
| `49e2c8ee-8ba7-4fb8-89a4-05bbb3f61ba2` | Mirador de Sevilla de la Sierra | 37.495945 | −5.944128 | – | – | hardError | enriched |
| `fd36530c-357d-47af-a4de-a6c3ffa72aa4` | Monasterio de Toledo del Valle | 39.879549 | −4.088325 | – | – | hardError | enriched |
| `974c3222-a775-4ca4-95f0-87cc3c1b5365` | Playa Secreta de Valencia de la Sierra | 39.522641 | −0.424223 | – | – | hardError | enriched |
| `a4b87810-5326-4f00-a2fb-eebe395ef8af` | Plaza Mayor de Valladolid Nuevo | 41.767396 | −4.672094 | – | – | hardError | enriched |
| `da120e15-b8fc-4b0b-948c-7025f75a150b` | Pueblo Encantado Alicante Alto | 38.331242 | −0.437729 | – | – | hardError | enriched |
| `af0f976c-f6b0-443a-9c93-64565d577058` | Ruta de Senderismo Oviedo del Valle | 43.65799 | −5.765541 | – | – | hardError | enriched |

- **Riesgo común:** Nombre = `<tipoGenérico> de <ciudadReal> <sufijoFantasma>`. Patrón típico de "alucinación geográfica" del LLM: el sufijo (`de la Sierra`, `Alto`, `Nuevo`, `del Valle`) no corresponde a un topónimo real, pero las coordenadas suelen caer cerca de la ciudad mencionada (Valladolid en `41.748,−4.74` es coherente con la ciudad). El re-geocode forzaría a Nominatim a inventar resultados o devolver la ciudad base — **promoviendo el nombre falso a coordenadas "validadas"**.
- **Verificar (humano):**
  1. ¿Existe el lugar bajo ese nombre exacto? (Búsqueda Wikipedia/OSM).
  2. Si no existe, ¿es estructurado como "ficha turística inventada"?
  3. ¿La descripción enriched_data.descripcion confirma o niega la existencia?
- **Decisión esperada:** mayoría `reject` o `needs-name-fix`. Pocas (si alguna) `approve`.
- **Pendiente:** ☐ × 8

### SYNTH_FR (4)

| id | name | lat | lng | region | zone | geo_h |
|---|---|---:|---:|---|---|---|
| `0d54fe36-97a6-483b-9ccd-f0e1747a136b` | Bodega Artesanal de Bastia del Valle | 42.817943 | 9.525423 | – | – | hardError |
| `38a8e45b-1641-42cc-83a9-53364c67d000` | Casco Antiguo de Aviñón (Sur) | 44.063021 | 4.865375 | – | – | hardError |
| `d44956ff-29d7-412d-8416-f52fea1a0ceb` | Faro de Burdeos del Valle | 44.870907 | −0.686602 | – | – | hardError |
| `51fdbbf2-e323-4526-bdc2-72ca7c0d1f9a` | Plaza Mayor de Nantes del Valle | 47.269234 | −1.451042 | – | – | hardError |

- **Riesgo:** Mismo patrón que SYNTH_ES con doble sospecha: "Bodega Artesanal en Bastia" (Córcega) es geográficamente incoherente (Bastia no es región vinícola conocida); "Plaza Mayor" es término hispánico, no francés.
- **Verificar:** existencia real + coherencia cultural/lingüística del nombre con el país.
- **Decisión esperada:** mayoría `reject`. `Casco Antiguo de Aviñón (Sur)` podría `needs-name-fix` si existe barrio real.
- **Pendiente:** ☐ × 4

### SYNTH_INTL (2)

| id | name | lat | lng | country |
|---|---|---:|---:|---|
| `13b6ac67-83d9-447b-bba9-7326cb3bcd30` | Jardín Botánico de Beja Nuevo | 38.061739 | −7.93713 | Portugal |
| `5a977f93-ecc8-4d6f-85a8-9070e0ad0588` | Puente Medieval de Almada Nuevo | 38.872186 | −9.113203 | Portugal |

- **Riesgo:** Sufijo "Nuevo" en español sobre topónimo portugués (Beja, Almada). Marca clara de LLM hispanohablante inventando ficha sobre país vecino.
- **Verificar:** ¿existe jardín botánico en Beja? ¿puente medieval en Almada con ese nombre?
- **Decisión esperada:** probable `reject` o `needs-name-fix`.
- **Pendiente:** ☐ × 2

### MUNI_ES (2)

| id | name | lat | lng | region | zone | geo_h | enr |
|---|---|---:|---:|---|---|---|---|
| `f43da01c-c22c-4db3-95c5-930626ba6b2b` | Níjar | 36.966 | −2.206 | Andalucía | Almería | **partial** | enriched |
| `07f548c8-7619-411d-938e-d38aade79e13` | Zuheros | 37.543 | −4.316 | Andalucía | Córdoba | **partial** | enriched |

- **Por qué:** Topónimos cortos verificables (Níjar y Zuheros son municipios reales). `geo_health='partial'` (no hardError) pero entran al scope por `enriched ∧ ¬raw_geocode`.
- **Riesgo:** Coordenadas redondeadas (3 decimales) sugieren centroide municipal aproximado. El re-geocode debería **mejorar** precisión y poblar `raw_geocode` sin riesgo de drift.
- **Verificar:** comparar lat/lng actuales contra Nominatim → distancia esperada < 2 km.
- **Decisión esperada:** `approve` (estos son el "caso ideal" de B5).
- **Pendiente:** ☐ × 2

### MUNI_FR (3)

| id | name | lat | lng | region | zone | geo_h |
|---|---|---:|---:|---|---|---|
| `e623d113-596d-45e9-9bcd-763ecb4cffe7` | Autoire | 44.8532525 | 1.8205118 | Occitanie | Lot | hardError |
| `fa4cec93-d7d4-4303-9893-668c57bda226` | Belcastel | 44.3879029 | 2.3365474 | Occitanie | Aveyron | hardError |
| `1c1f98f3-564d-4e1c-9e31-6dcc76cbac2f` | Sant'Antonino | 42.5883511 | 8.9048052 | Corse | Upper Corsica | hardError |

- **Por qué:** Comunas reales francesas (todas en listas oficiales). Coordenadas con 7 decimales (≠ centroide redondeado), sugiere origen distinto (KML, Wikipedia infobox).
- **Riesgo bajo:** topónimos verificables. `hardError` probablemente proviene de un fallo previo de geocoding contra Nominatim (timeout/rate-limit), no de invalidez intrínseca.
- **Verificar:** Nominatim → encontrar coincidencia exacta. Distancia esperada < 500 m.
- **Decisión esperada:** `approve`.
- **Pendiente:** ☐ × 3

### MULTI_ES (3)

| id | name | lat | lng | region | zone | geo_h |
|---|---|---:|---:|---|---|---|
| `ced0df03-3b53-47dd-8592-109de4018ce4` | Ruta de Senderismo Valencia | 39.459049 | −0.334821 | – | – | hardError |
| `2cc8afab-6b1c-4530-a1c8-fbab3a06d002` | Cueva de Cáceres (Norte) | 39.411383 | −6.34871 | – | – | hardError |
| `adeefb3c-8739-4d0d-94ee-478032791b23` | Ruta de Senderismo Palma | 39.597357 | 2.755573 | – | – | hardError |

- **Riesgo medio:** sin sufijo `Nuevo/Alto/Valle/Sierra`, pero nombres siguen siendo descripciones genéricas ("Ruta de Senderismo + Ciudad"). Coordenadas caen en pleno centro urbano (Valencia 39.46,−0.33 = Plaza Ayuntamiento), no en una ruta real. Patrón LLM más sutil.
- **Verificar:** ¿hay una ruta GR/PR oficial con ese nombre? ¿la cueva existe al norte de Cáceres?
- **Decisión esperada:** probable `reject` para los 2 "Ruta de Senderismo + ciudad" (centro urbano ≠ ruta). `Cueva de Cáceres (Norte)` requiere búsqueda específica.
- **Pendiente:** ☐ × 3

### OTHER (2)

| id | name | lat | lng | country |
|---|---|---:|---:|---|
| `0f731bdd-7093-49a8-ac21-cf244d14d51f` | Playa Secreta de Lisboa | 38.690841 | −9.189317 | Portugal |
| `069b515b-19da-4d51-b606-6584860d2998` | Ruta de Senderismo Roma | 42.022697 | 12.537748 | Italia |

- **Riesgo:** "Playa Secreta de Lisboa" suena a click-bait LLM (Lisboa no es destino playero canónico); "Ruta de Senderismo Roma" cae en periferia romana sin ruta oficial conocida.
- **Verificar:** existencia documental.
- **Decisión esperada:** `reject`.
- **Pendiente:** ☐ × 2

## Resumen por decisión esperada (a priori, antes de revisión)

| Decisión a priori | n estimado | Cobertura del scope |
|---|---:|---|
| `approve` | ~5 (MUNI_ES + MUNI_FR) | re-geocode seguro |
| `needs-name-fix` | ~2–4 | revisar nombre antes de tocar coords |
| `reject` | ~14–17 (SYNTH + NULL_ISLAND + MULTI sospechosos) | flag `geo_irrecoverable` o purge |
| `needs-coord-fix` | 0 esperados | (B5 toca coords, no es la acción) |

> Estas estimaciones se confirmarán/refutarán en la revisión humana. Son la hipótesis de trabajo, no el resultado.

## Protocolo de revisión (sugerido, no ejecutado)

Para cada fila el revisor humano debe:

1. **Buscar el nombre exacto** en Wikipedia ES/FR/EN y en Nominatim (`https://nominatim.openstreetmap.org/search?q=<name>`).
2. **Comparar lat/lng** actuales contra el primer resultado de Nominatim; si distancia > 5 km, marcar como sospechoso.
3. **Leer `enriched_data.descripcion`** y verificar si admite explícitamente "no se ha encontrado información" (ya filtrado por `isUnverifiableDescription`, pero conviene confirmar).
4. **Decidir** entre las 4 opciones y anotar 1 línea de justificación.
5. **No tocar la fila** — esto es sólo calibración.

## Salida esperada de L0

Tras revisar las 25 filas:

- Si ≥ 90 % de `MUNI_*` quedan en `approve` y ≥ 80 % de `SYNTH_*` quedan en `reject` → **B5 puede proceder con dos sub-lotes**:
  - B5a: re-geocode sólo de POIs con nombre verificado (criterio a definir tras L0).
  - B5b: flag `geo_irrecoverable` sobre POIs con nombre rechazado.
- Si la distribución no es nítida (mezcla aleatoria de approve/reject en SYNTH) → **abortar B5 hasta diseñar un filtro de nombre más fino** (heurística de "ciudad real + sufijo sospechoso" en SQL, p.ej.).

## Trazabilidad

- Predecesor: `docs/audits/b5-poi-maturity-distribution.md` (393 POI-3 + 1 POI-2 = 394).
- Helper aplicado para clasificación: `computePoiMaturity` (v1.2.17).
- Overlay admin disponible para inspección visual: v1.2.18 (`MaturityBadgeLayer`).
- Sin SQL ejecutado contra la base más allá de `SELECT` de muestreo.
- No `UPDATE`, no re-enrich, no bump.
