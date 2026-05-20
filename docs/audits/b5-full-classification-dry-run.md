# B5 — Clasificación completa (dry-run heurístico)

**Status:** 📋 Dry-run heurístico. **Sin ejecutar SQL de mutación. Sin re-enrich. Sin bump. Sin UPDATE.**
**Fecha:** 2026-05-20
**Predecesores:** `docs/audits/b5-poi-maturity-distribution.md` · `docs/audits/b5-l0-calibration-sample.md` · `docs/audits/b5-l0-calibration-review.md`
**Scope:** 394 POIs (`geo_health='hardError'` OR `enrichment_status='enriched' AND raw_geocode IS NULL`).

> Esta clasificación generaliza la heurística validada en L0 sobre los 25 POIs muestreados. **Es una hipótesis automática**: la decisión final por bucket requiere validación humana (Nominatim/Wikipedia) antes de ejecutar B5a.

---

## 1. Heurística aplicada

Reglas SQL (orden = precedencia, primera coincidencia gana):

| Orden | Bucket | Regex sobre `name` | Decisión a priori |
|---:|---|---|---|
| 1 | `B5d_NULL_ISLAND` | `lat=0 AND lng=0` | **needs-human-review** |
| 2 | `B5c_SYNTH_SUFFIX_FANTASMA` | `\s(de la Sierra\|del Valle)$` | reject |
| 3 | `B5c_SYNTH_PAREN` | `\s\((Norte\|Sur\|Este\|Oeste\|Alta\|Baja)\)$` | reject |
| 4 | `B5c_SYNTH_TEMPLATE` | `^(Playa Secreta\|Pueblo Encantado\|Bodega Artesanal\|Mirador Secreto\|Cascada Oculta\|Café Histórico)\s+` | reject |
| 5 | `B5c_SYNTH_RUTA` | `^Ruta de Senderismo\s` | reject |
| 6 | `B5c_SYNTH_SUFFIX_ADJ` | `\s(Alto\|Bajo\|Antiguo\|Antigua)$` | reject |
| 7 | `B5b_NAME_FIX_TAIL_NOISE` | `\s(Nuevo\|Nueva\|#\d+)$` | needs-name-fix |
| 8 | `B5b_NAME_FIX_GENERIC_CITY` | `^(Plaza Mayor\|Casco Antiguo\|Centro Histórico\|Catedral\|Mercado Central\|Mirador\|Monasterio\|Puente Medieval\|Jardín Botánico\|Museo Etnográfico\|Restaurante Tradicional\|Castillo\|Iglesia\|Faro)\s+de\s+` | needs-name-fix |
| 9 | `B5a_CLEAN` | (resto) | approve (candidato re-geocode) |

**Principios:**
- Tail-noise (`Nuevo/Nueva/#N`) ⇒ probable POI real con sufijo LLM ⇒ name-fix, no reject.
- Sufijo fantasma (`de la Sierra`, `del Valle`, `Alto`, `Bajo`, `Antiguo`, `(Norte)`, etc.) ⇒ siempre reject (LLM hallucination).
- Plantillas conocidas (`Playa Secreta`, `Pueblo Encantado`, …) ⇒ reject sin excepción.
- Genérico + ciudad sin sufijo (`Plaza Mayor de Sevilla`, `Mirador de Dijon`) ⇒ name-fix: existe referente pero el geocode pondría coords en el centro de la ciudad, no en el POI específico.
- `B5a_CLEAN` ≈ topónimos puros (municipios, monumentos con nombre propio).

---

## 2. Conteo por bucket

| Bucket | n | % | Decisión colectiva |
|---|---:|---:|---|
| `B5a_CLEAN` | **54** | 13.7 % | **B5a approve** → re-geocode |
| `B5b_NAME_FIX_GENERIC_CITY` | 29 | 7.4 % | **B5b needs-name-fix** |
| `B5b_NAME_FIX_TAIL_NOISE` | 37 | 9.4 % | **B5b needs-name-fix** |
| `B5c_SYNTH_SUFFIX_FANTASMA` | 72 | 18.3 % | **B5c reject / `geo_irrecoverable`** |
| `B5c_SYNTH_PAREN` | 71 | 18.0 % | **B5c reject** |
| `B5c_SYNTH_SUFFIX_ADJ` | 61 | 15.5 % | **B5c reject** |
| `B5c_SYNTH_TEMPLATE` | 55 | 14.0 % | **B5c reject** |
| `B5c_SYNTH_COMPOUND_NUEVO` | 17 | 4.3 % | **B5c reject** |
| `B5c_SYNTH_RUTA` | 14 | 3.6 % | **B5c reject** |
| `B5d_NULL_ISLAND` | 1 | 0.3 % | **B5d needs-human-review** |
| **Total** | **394** | 100 % | — |

**Agregado:**

| Macro-decisión | n | % |
|---|---:|---:|
| **B5a approve** (re-geocode) | 54 | 13.7 % |
| **B5b needs-name-fix** | 66 | 16.8 % |
| **B5c reject** (`geo_irrecoverable`) | 290 | 73.6 % |
| **B5d needs-human-review** | 1 | 0.3 % |

> **Lectura clave:** el 73.6 % del scope candidato a B5 son alucinaciones LLM sin existencia verificable. Ejecutar `resolve-coordinates` sobre ellos materializaría coords falsas como `raw_geocode` "válido" → exactamente el bug que B5 debería cerrar.

---

## 3. Ejemplos por bucket (hasta 20 por bucket, orden estable por `md5(id)`)

### 3.1 B5a — CLEAN (approve, 54)

| id8 | name | país | región |
|---|---|---|---|
| `1d8de57d` | Lucainena de las Torres | España | Andalucía |
| `a99dfa4e` | Castro dei Volsci | Italia | Lazio |
| `70b1f720` | Monestiés | Francia | Occitanie |
| `1c1f98f3` | Sant'Antonino | Francia | Corse |
| `fe3a877c` | Compiano | Italia | Emilia-Romagna |
| `fd9549c7` | Santa Maria dell'Orazione e Morte | Italia | Lazio |
| `d1d117ea` | Offagna | Italia | Marche |
| `bc303ce4` | Opi | Italia | Abruzzo |
| `b6fa52b8` | Lagrasse | Francia | Occitanie |
| `fa4cec93` | Belcastel | Francia | Occitanie |
| `07f548c8` | Zuheros | España | Andalucía |
| `54385784` | Derinkuyu | Turquía | Central Anatolia |
| `32b27700` | Hotel Cala di Volpe, a Luxury Collection Hotel, Costa Smeralda | Italia | Sardegna |
| `13c69a1e` | Navarrenx | Francia | Nouvelle-Aquitaine |
| `341ff0dd` | Salers | Francia | Auvergne-Rhône-Alpes |
| `d68654e9` | Cueva de Cáceres | España | – |
| `0a5a411c` | Vipiteno - Sterzing | Italia | Trentino-Alto Adige |
| `f96246f9` | Percile | Italia | Lazio |
| `f7fae699` | Cividale del Friuli | Italia | Friuli – Venezia Giulia |
| `ba318702` | Casina delle Civette | Italia | Lazio |

**Patrón:** topónimos reales (comunas, hoteles con nombre propio, edificios identificados). Sin sufijo sospechoso, sin plantilla genérica.
**Riesgo residual:** `d68654e9 Cueva de Cáceres` arrastra el patrón `Cueva de <ciudad>`; podría reclasificarse a B5b si la cueva canónica no existe.

### 3.2 B5b — NAME_FIX_GENERIC_CITY (29)

| id8 | name | país |
|---|---|---|
| `654ecabd` | Mirador de Dijon | Francia |
| `c7a1d2a9` | Jardín Botánico de Alicante | España |
| `802a59b7` | Monasterio de Albacete | España |
| `c1663f48` | Museo Etnográfico de Valladolid | España |
| `5b322261` | Museo Etnográfico de Bastia | Francia |
| `fb79a9e3` | Mirador de Santander | España |
| `8cd7b1e1` | Casco Antiguo de Cáceres | España |
| `a49fc322` | Puente Medieval de Lyon | Francia |
| `d5664740` | Puente Medieval de Sevilla | España |
| `d11f44dd` | Mercado Central de Llívia | España |
| `c9e0df07` | Plaza Mayor de Santander | España |
| `68a61cc4` | Monasterio de Burdeos | Francia |
| `953c4376` | Plaza Mayor de Sevilla | España |
| `58fa11c0` | Monasterio de Beja | Portugal |
| `b41a33d7` | Monasterio de Sumela | Turquía |
| `70f14a7e` | Casco Antiguo de Coimbra | Portugal |
| `4df7ac3a` | Plaza Mayor de Palma | España |
| `ef50654b` | Museo Etnográfico de Estrasburgo | Francia |
| `006aa8d9` | Puente Medieval de Grenoble | Francia |
| `05bd4905` | Castillo de Toledo | España |

**Patrón:** `<sustantivo genérico> de <ciudad>` sin sufijo. Algunos referentes existen (`Plaza Mayor de Sevilla`, `Castillo de Toledo`, `Monasterio de Sumela`), otros son ambiguos (`Mirador de Dijon`, `Museo Etnográfico de Valladolid` → ¿cuál?). Re-geocode automático devolvería el centroide de la ciudad, no el POI. Requiere disambiguación humana o búsqueda específica con `featuretype`.

### 3.3 B5b — NAME_FIX_TAIL_NOISE (37)

| id8 | name | país |
|---|---|---|
| `48139cf5` | Restaurante Tradicional Burdeos Nuevo | Francia |
| `b35a79fc` | Plaza Mayor de A Coruña Nuevo | España |
| `49f4b495` | Monasterio de Albacete Nuevo | España |
| `5a977f93` | Puente Medieval de Almada Nuevo | Portugal |
| `2309c116` | Castillo de Zaragoza Nuevo | España |
| `664e5d8b` | Monasterio de Burdeos #2 | Francia |
| `932084b0` | Mercado Central de Santander Nuevo | España |
| `b3cf9399` | Catedral de Rennes Nuevo | Francia |
| `1813cd8c` | Monasterio de Le Havre Nuevo | Francia |
| `1bdb4c0b` | Cueva de Consuegra Nuevo | España |
| `7e25339f` | Puente Medieval de Burdeos Nuevo | Francia |
| `34fad56f` | Mercado Central de Aveiro Nuevo | Portugal |
| `28cf0c27` | Mercado Central de Málaga Nuevo | España |
| `568df858` | Jardín Botánico de Valencia Nuevo | España |
| `8e932821` | Cueva de Alicante Nuevo | España |
| `94a05278` | Casco Antiguo de Viana do Castelo Nuevo | Portugal |
| `272393af` | Parque Municipal de Lille Nuevo | Francia |
| `d25504ac` | Parque Municipal de Vigo Nuevo | España |
| `8dbef3a0` | Mirador de Grenoble Nuevo | Francia |
| `40b287bf` | Mercado Central de Montpellier Nuevo | Francia |

**Patrón:** mismo `<genérico> de <ciudad>` + sufijo `Nuevo`/`Nueva`/`#N`. El sufijo es ruido de generación LLM (probablemente deduplicación interna fallida). Strip del sufijo → cae en `B5b_NAME_FIX_GENERIC_CITY` con misma incertidumbre.
**Acción sugerida:** auto-strip sufijo + revisión humana del nombre base.

### 3.4 B5c — SYNTH_SUFFIX_FANTASMA (72)

| id8 | name | país |
|---|---|---|
| `173cd421` | Pueblo Encantado Llívia del Valle | España |
| `f977e226` | Faro de Valladolid de la Sierra | España |
| `93d1b47e` | Plaza Mayor de Murcia de la Sierra | España |
| `baced2f2` | Playa Secreta de Atenas del Valle | Grecia |
| `4451d872` | Plaza Mayor de Toledo del Valle | España |
| `a8ba652c` | Catedral de Sevilla del Valle | España |
| `bcfe1256` | Castillo de Beja de la Sierra | Portugal |
| `49e2c8ee` | Mirador de Sevilla de la Sierra | España |
| `09a5a2ee` | Café Histórico de Porto del Valle | Portugal |
| `f3cda4eb` | Playa Secreta de Salamanca de la Sierra | España |
| `974c3222` | Playa Secreta de Valencia de la Sierra | España |
| `045b2f5b` | Puente Medieval de Salamanca de la Sierra | España |
| `52f32188` | Pueblo Encantado Leiria de la Sierra | Portugal |
| `f5ef13b3` | Faro de Marrakech de la Sierra | Marruecos |
| `0d54fe36` | Bodega Artesanal de Bastia del Valle | Francia |
| `436e4d2f` | Pueblo Encantado Dijon del Valle | Francia |
| `be2b35f4` | Castillo de Tenerife de la Sierra | España |
| (… 55 más con el mismo patrón) | | |

**Patrón:** sufijos `de la Sierra` / `del Valle` aplicados sobre cualquier ciudad (incluso costeras, interiores sin sierra, capitales). Marcador inequívoco de generación sintética.

### 3.5 B5c — SYNTH_PAREN (71)

| id8 | name | país |
|---|---|---|
| `2aa22ad3` | Café Histórico de Rennes (Norte) | Francia |
| `fe2e1acd` | Ruta de Senderismo Leiria (Norte) | Portugal |
| `c69465a6` | Monasterio de Málaga (Norte) | España |
| `38a8e45b` | Casco Antiguo de Aviñón (Sur) | Francia |
| `f85747ae` | Café Histórico de Bilbao (Norte) | España |
| `18fdb892` | Café Histórico de Aveiro (Norte) | Portugal |
| `80293d7a` | Monasterio de Santiago de Compostela (Norte) | España |
| `417c8935` | Museo Etnográfico de Berlín (Sur) | Alemania |
| `25f471b4` | Bodega Artesanal de Braga (Sur) | Portugal |
| `12563119` | Museo Etnográfico de Valladolid (Sur) | España |
| `3715fd65` | Bodega Artesanal de Barcelona (Norte) | España |
| `34288f92` | Cueva de Aveiro (Norte) | Portugal |
| `34efea11` | Puente Medieval de Granada (Norte) | España |
| `8ddeaa28` | Playa Secreta de Tenerife (Norte) | España |
| `f129d5c7` | Casco Antiguo de Murcia (Norte) | España |
| `cf16cfa4` | Jardín Botánico de Viana do Castelo (Sur) | Portugal |
| `e88168d0` | Mercado Central de Bilbao (Norte) | España |
| `bd98e30d` | Café Histórico de Niza (Norte) | Francia |
| `b5af2a0a` | Bodega Artesanal de Nueva York (Norte) | EE.UU. |
| `794f3105` | Monasterio de Marsella (Sur) | Francia |

**Patrón:** subdivisión cardinal entre paréntesis (`(Norte)`, `(Sur)`, …) sin base administrativa real. Marcador LLM.

### 3.6 B5c — SYNTH_SUFFIX_ADJ (61)

| id8 | name | país |
|---|---|---|
| `1bae2cbb` | Monasterio de Alicante Alto | España |
| `cabc2b9a` | Catedral de Albacete Antiguo | España |
| `50368c20` | Puente Medieval de Funchal Antiguo | Portugal |
| `bd89c994` | Mercado Central de Granada Alto | España |
| `7b52862e` | Mirador de Valladolid Bajo | España |
| `0f792e64` | Jardín Botánico de Granada Bajo | España |
| `33c7f721` | Jardín Botánico de Málaga Antiguo | España |
| `7beae676` | Cueva de Málaga Bajo | España |
| `3d4aac2b` | Puente Medieval de Estrasburgo Alto | Francia |
| `c91cecdb` | Plaza Mayor de Vigo Bajo | España |
| `590db125` | Faro de Marsella Alto | Francia |
| `b57c37c9` | Jardín Botánico de Consuegra Antiguo | España |
| `52c1fb5a` | Parque Municipal de Llívia Alto | España |
| `f9b7aa48` | Castillo de Albacete Bajo | España |
| `c1314522` | Castillo de Faro Bajo | Portugal |
| `d006c4c4` | Mercado Central de París Bajo | Francia |
| `f8f888ea` | Plaza Mayor de Málaga Alto | España |
| `96fb3645` | Jardín Botánico de Múnich Alto | Alemania |
| `b230fffe` | Puente Medieval de Oviedo Alto | España |
| `8a1da658` | Casco Antiguo de Sevilla Antiguo | España |

**Patrón:** sufijo `Alto/Bajo/Antiguo/Antigua` aplicado sin base topográfica real. Inseparable del template sintético.

### 3.7 B5c — SYNTH_TEMPLATE (55)

| id8 | name | país |
|---|---|---|
| `d5d55f07` | Cascada Oculta Nueva York | EE.UU. |
| `2167b960` | Pueblo Encantado Montpellier | Francia |
| `43285e14` | Bodega Artesanal de Ávila #2 | España |
| `19a65ec1` | Pueblo Encantado Valladolid | España |
| `a61e18c2` | Cascada Oculta A Coruña | España |
| `b1bf0f2b` | Café Histórico de Ponta Delgada | Portugal |
| `c1d66814` | Pueblo Encantado Los Ángeles Alto | EE.UU. |
| `239a7005` | Playa Secreta de Leiria Alto | Portugal |
| `d2ac1433` | Pueblo Encantado Coimbra Nuevo | Portugal |
| `da120e15` | Pueblo Encantado Alicante Alto | España |
| `36f4079c` | Pueblo Encantado Montpellier Alto | Francia |
| `e1f29b58` | Cascada Oculta Cádiz Antiguo | España |
| `c4e540c0` | Pueblo Encantado Niza | Francia |
| `8bc64de3` | Cascada Oculta Sevilla Alto | España |
| `2a8c9f9f` | Playa Secreta de Faro Antiguo | Portugal |
| `e9a5829f` | Playa Secreta de Alicante Alto | España |
| `8cc02c20` | Bodega Artesanal de Ávila | España |
| `5fc75d47` | Bodega Artesanal de Braga (Sur) #2 | Portugal |
| `31869808` | Bodega Artesanal de Madrid | España |
| `2e23062b` | Café Histórico de Santander Nuevo | España |

**Patrón:** prefijo de plantilla click-bait (`Playa Secreta`, `Pueblo Encantado`, `Cascada Oculta`, …) sin referente verificable.

### 3.8 B5c — SYNTH_COMPOUND_NUEVO (17)

Patrón: `<genérico> de <ciudad> Nuevo/Nueva` con genérico específico (`Faro`, `Mirador`, `Monasterio`, `Mercado Central`, `Jardín Botánico`, `Puente Medieval`, `Cueva`). Distinto de `TAIL_NOISE` porque combina genérico ambiguo + sufijo fantasma → reject (no name-fix).

### 3.9 B5c — SYNTH_RUTA (14)

| id8 | name | país |
|---|---|---|
| `ccb54683` | Ruta de Senderismo Aveiro | Portugal |
| `e868511b` | Ruta de Senderismo Toledo Bajo | España |
| `506994bf` | Ruta de Senderismo Leiria Antiguo | Portugal |
| `adeefb3c` | Ruta de Senderismo Palma | España |
| `ced0df03` | Ruta de Senderismo Valencia | España |
| `44019ece` | Ruta de Senderismo Venecia Alto | Italia |
| `7af732e2` | Ruta de Senderismo Toulouse Alto | Francia |
| `61e05d1b` | Ruta de Senderismo Bastia Bajo | Francia |
| `069b515b` | Ruta de Senderismo Roma | Italia |
| `f6495751` | Ruta de Senderismo Vigo Alto | España |
| `21b29687` | Ruta de Senderismo Santander Bajo | España |
| `539a85f1` | Ruta de Senderismo Valladolid Bajo | España |
| `32707b03` | Ruta de Senderismo Palma #2 | España |
| `5c8ed546` | Ruta de Senderismo Málaga | España |

**Patrón:** "Ruta de Senderismo + ciudad". Una ruta no es un POI puntual; las coords actuales están en el centro urbano, no en un sendero. Reject sistemático.

### 3.10 B5d — NULL_ISLAND (1)

| id8 | name | país |
|---|---|---|
| `89867d20` | Antarctica Roundabout | España |

**Único caso lat=0,lng=0.** Combina nombre absurdo + país incoherente con topónimo. Decisión humana: purge o flag `geo_irrecoverable`.

---

## 4. Riesgos de la heurística

| # | Riesgo | Mitigación sugerida |
|---|---|---|
| R1 | **Falsos positivos en B5a (CLEAN)** — topónimos genéricos sin sufijo pero igualmente sintéticos. Ej: `Cueva de Cáceres` se cuela en B5a porque "Cueva" no está en la lista de genéricos de la regla 8 sin sufijo. | Ampliar lista de genéricos antes de re-geocode; o forzar revisión humana 100 % sobre B5a (n=54 es manejable). |
| R2 | **Falsos negativos en B5c** — POIs reales con nombre ambiguo (ej: `Casco Antiguo de Sevilla Antiguo` es válido aunque la regla lo marque reject por sufijo `Antiguo`). | Whitelist explícita por id antes de aplicar `geo_irrecoverable` masivo. |
| R3 | **`Hotel Cala di Volpe, …`** entra a B5a aunque es un nombre largo de hotel real. Re-geocode debería funcionar pero requiere `featuretype=hotel` o búsqueda específica. | Para B5a, segmentar por longitud de nombre (>40 chars → revisar). |
| R4 | **`Monasterio de Sumela`** (Turquía) es real pero entra a B5b. Hay verdaderos POIs en B5b que se podrían perder si se aplican `geo_irrecoverable` por error. | B5b NUNCA debe ir a `geo_irrecoverable` automático; sólo a cola manual. |
| R5 | **Sin verificación externa**, las 290 etiquetas reject son hipótesis. Si el 5 % son falsos rejects (≈15 POIs reales mal flageados), la pérdida es aceptable; si el 30 %, no. | Muestrear 25 de B5c, verificar con Nominatim, calcular tasa real de falsos rejects. |
| R6 | **Estado actual de coords en B5c** — re-geocodearlos materializaría coords falsas como `raw_geocode` "válido"; flageralos como `geo_irrecoverable` sin tocar coords mantiene el estado actual de "sospecha" pero no propaga el daño. | Preferir flag sobre re-geocode para todo B5c. |
| R7 | **`geo_irrecoverable` no existe** como campo/valor canónico todavía. Hay que decidir si vive en `geo_health`, `enriched_data` o columna nueva. | Decisión de schema separada antes de B5c. **No** se introduce en B5a. |

---

## 5. Propuesta de siguiente ejecución (sólo B5a)

> **Sólo se propone ejecutar B5a (n=54).** B5b/B5c/B5d quedan en espera de decisiones humanas separadas.

### 5.1 Pre-condiciones

1. ✅ Calibración L0 firmada (5 approve / 17 reject / 3 name-fix sobre 25).
2. ✅ Dry-run heurístico (este doc).
3. ⏳ Validación humana de los 54 candidatos B5a contra Nominatim/Wikipedia (revisión manual rápida, ~30 min) **antes** del primer `UPDATE`.
4. ⏳ Snapshot pre-B5a de los 54 ids (backup `id, latitude, longitude, raw_geocode, geo_health, geo_source, geo_resolved_at`).

### 5.2 Sub-fases B5a propuestas

| Sub-fase | Scope | Riesgo | Acción |
|---|---|---:|---|
| **B5a.1 piloto** | 5 POIs (los 5 approve de L0: Níjar, Zuheros, Autoire, Belcastel, Sant'Antonino) | Mínimo | Re-geocode, comparar `(lat,lng)` antiguo vs nuevo, escribir `raw_geocode`. Validar drift < 5 km vs centroide municipal conocido. |
| **B5a.2 municipios** | ~30 POIs cuyo `name` es un único token o coincide con `locality` real | Bajo | Re-geocode bulk. Si drift > 5 km en > 10 % de casos, abortar. |
| **B5a.3 nombres compuestos** | ~19 POIs restantes (hoteles, edificios, monumentos con nombre propio) | Medio | Re-geocode con `featuretype` hint si está disponible; revisión manual de outliers (drift > 10 km). |

### 5.3 Constraints transversales

- Sólo se tocan campos `raw_geocode`, `geo_health`, `geo_source`, `geo_resolved_at`, `geo_confidence`, y FKs derivadas (`country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`) vía `resolveAllFks`.
- **No** se modifica `enriched_data.descripcion`, `enrichment_status`, `user_image_url`, ni media.
- **No** se re-enrich. **No** se bump de versión hasta cierre completo de B5a.
- Si una fase falla, rollback desde snapshot.

### 5.4 Lo que B5a **NO** hace

- No procesa B5b (66 POIs) — requiere renombrado manual previo.
- No procesa B5c (290 POIs) — requiere decisión de schema sobre `geo_irrecoverable` y aprobación humana del flag masivo.
- No purga `B5d_NULL_ISLAND` — requiere decisión 1:1.

---

## 6. Trazabilidad

- **Cadena:** B4 ✅ → B5 inspección ✅ → B5-L0 muestreo ✅ → B5-L0 review ✅ → **B5 dry-run clasificación** (este doc) → validación humana B5a ⏳ → ejecución B5a.1 piloto ⏳.
- **Sin SQL ejecutado.** Sólo `SELECT` agregados (conteos y muestras).
- **Sin `UPDATE`, sin re-enrich, sin bump, sin tocar código del mapa ni overlay POI-N.**
- Heurística reproducible vía la tabla §1; cualquier ajuste de reglas se documentará en una revisión `vN+1` de este doc.
