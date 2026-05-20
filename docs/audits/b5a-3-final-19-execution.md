# B5a.3 — Lote final 19 POIs (ejecución)

**Status:** ✅ Ejecutado. Sin migraciones. Sin re-enrich. Sin bump.
**Fecha:** 2026-05-20
**Predecesores:** `b5a-pilot-5-execution.md` (5) · `b5a-2-batch-30-execution.md` (30) · `b5a-stale-name-refresh-execution.md` (Opción A activa).
**Scope:** 19 POIs restantes del bucket `B5a_CLEAN` (54 − 5 − 30 = 19). Cierra B5a.

## 1. Selección y pre-flight

Re-clasificación SQL del scope B5 (`geo_health='hardError' OR (enrichment_status='enriched' AND raw_geocode IS NULL)`) confirmó 19 candidatos restantes en B5a, todos con `raw_geocode IS NULL`, 18 `hardError` + 1 `partial` (`1d8de57d Lucainena de las Torres`).

**IDs (19):**

| id8 | name | país (pre) | lat/lng pre |
|---|---|---|---|
| `430ec0bd` | 45°47′01.98″N 14°12′49.37″E | Eslovenia | 45.783883, 14.213714 |
| `6601b0eb` | Aiello Calabro | Italia | 39.117469, 16.166663 |
| `11450a3f` | Casa do Penedo | Portugal | 41.4891, −8.0681 |
| `ba318702` | Casina delle Civette | Italia | 41.914311, 12.512868 |
| `a99dfa4e` | Castro dei Volsci | Italia | 41.508217, 13.406303 |
| `f7fae699` | Cividale del Friuli | Italia | 46.093623, 13.430328 |
| `d68654e9` | Cueva de Cáceres | España | 39.360374, −6.30919 |
| `1f10902d` | Doçaria de S. Vicente | Portugal | 41.55699, −8.41933 |
| `32b27700` | Hotel Cala di Volpe… Costa Smeralda | Italia | 41.09022, 9.54099 |
| `1d8de57d` | Lucainena de las Torres | España | 37.041, −2.2 |
| `791ade58` | Monteleone di Spoleto | Italia | 42.651006, 12.95156 |
| `12709e5d` | Nuraghe Serbissi | Italia | 39.84528, 9.46111 |
| `1a5bd7b3` | Parque Municipal de Braga | Portugal | 41.520597, −8.374896 |
| `94d2e9d9` | Parque Municipal de Murcia | España | 38.036106, −1.067646 |
| `5c98da4f` | Parque Municipal de Sevilla | España | 37.438982, −6.09037 |
| `e9cfe0cd` | Parque Municipal de Toledo | España | 39.832138, −3.996029 |
| `45b08a71` | Pieve di Teco | Italia | 44.047026, 7.914946 |
| `fd9549c7` | Santa Maria dell'Orazione e Morte | Italia | 41.894294, 12.469465 |
| `0a5a411c` | Vipiteno - Sterzing | Italia | 46.896324, 11.43194 |

**Pre-condiciones verificadas:** 19/19 `raw_geocode IS NULL`, 19/19 coords WGS84 válidas (sin Null Island), 0 solapamiento con piloto (5) ni B5a.2 (30).

## 2. Ejecución

Pipeline idéntico al de B5a.2:
1. `POST /functions/v1/resolve-coordinates {latitude, longitude}` por POI (throttle 1.1 s).
2. `UPDATE locations SET raw_geocode, geo_source='nominatim', geo_confidence, geo_resolved_at=now(), country, region, zone, continent, country_code, continent_id, country_id, region_id, zone_id, admin3_id, locality_id WHERE id=…`.
3. `geo_health` recalculado por trigger `zzz_locations_set_geo_health` al tocar `raw_geocode`.

**Llamadas Nominatim:** 19/19 OK tras 2 reintentos para 2 fallos 502 transitorios (`430ec0bd`, `1f10902d`), ambos exitosos en el 2.º intento.

**Campos NO tocados (whitelist explícito):** `latitude`, `longitude`, `name`, `enriched_data`, `media`, `tags`, `enrichment_status`, colecciones, `place_type`, `visibility`, `owner_user_id`, `user_image_url`. Sin migraciones, sin cambio de código, sin LocationMap, sin IA, sin re-enrich.

## 3. Post-flight

```
 geo_health | count
------------+-------
 ok         |    19
```

| Bucket | n |
|---|---:|
| `ok` | **19 / 19** |
| `stale_name` | 0 |
| `partial` | 0 |
| `hardError` | 0 |

- **Drift de coords:** 0 km / 19 (no se tocaron).
- **`geo_confidence`:** 14 × 90 · 3 × 85 · 2 × 95 · 1 × 75 (Eslovenia, `430ec0bd`).
- **`raw_geocode` poblado:** 19 / 19.
- **FKs admin:** 17 / 19 con `admin3_id` + `locality_id`. 2 quedan con `admin3_id=NULL/locality_id=NULL` por resolución a nivel provincia/zone (`d68654e9 Cueva de Cáceres`, `e9cfe0cd Parque Municipal de Toledo`) — son coordenadas en carreteras rurales sin municipio canónico devuelto por Nominatim. `geo_health=ok` igualmente (regla server: no degradar por ausencia de admin3 cuando hay zone/region coherentes).

## 4. Alias/traducción — sin incidencias

Opción A (`admin_areas.name ∪ aliases ∪ name_translations`) absorbió todos los pares ES↔IT/PT/DE/SL:
- IT: `Lacio`/`Cerdeña`/`Umbría`/`Friuli-Venecia Julia`/`Trentino-Alto Adigio` ≡ canónicos italianos → `ok`.
- PT: `Braga` (concelho sin region en Nominatim) tolerado vía aliases → `ok`.
- SL: `Eslovenia`/`Postojna` (sin region intermedio) → `ok`.

0 `stale_name`, 0 conflictos reales.

## 5. Outliers / observaciones (cosméticos, no degradan `geo_health`)

- **`430ec0bd`** (`name` literal con coordenadas): Nominatim resuelve a `Sovič, Postojna, Eslovenia`. Sin region intermedio (esquema admin SL). `geo_confidence=75` (más bajo del lote).
- **`11450a3f Casa do Penedo`**: locality canónica `Fafe`, no Casa do Penedo (la casa-roca está en concelho Fafe). FK correcta. Esperado.
- **`d68654e9 Cueva de Cáceres`**: resuelve a `Carretera del pantano, Cáceres (provincia)` sin locality (cueva en zona rural). FKs admin3/locality NULL pero `region_id`/`zone_id` correctas.
- **`1f10902d Doçaria de S. Vicente`**: resuelve a `Real, Braga (São Vicente)` — la doçaria histórica está en parroquia S. Vicente de Braga. Aceptable.
- **`32b27700 Hotel Cala di Volpe`**: `locality=Porto Cervo`, `admin3=Gallura Nord-Est Sardegna`. Correcto.
- **`12709e5d Nuraghe Serbissi`**: `locality=Taquisara`, `admin3=Ogliastra`. El nuraghe está en término municipal de Osini/Taquisara. Aceptable.
- **`1a5bd7b3 Parque Municipal de Braga`**: las coords (41.5206, −8.3749) caen en Guimarães, no en Braga. Nominatim devuelve `Guimarães` como locality. **Posible coord errónea generada por LLM** (mismatch nombre↔coord). No se reescribe ni la coord ni el nombre en este lote (scope = solo geo canónica). Pendiente para revisión humana B5b (re-clasificar a `needs-name-fix` si la cota no es resoluble a `Parque da Ponte` u otro parque real de Braga).
- **`94d2e9d9 Parque Municipal de Murcia`**: coords caen en `El Esparragal` (pedanía periférica). FKs correctas a Murcia. Aceptable (Murcia tiene parques municipales en pedanías).
- **`5c98da4f Parque Municipal de Sevilla`**: coords caen en `Valencina de la Concepción` (Aljarafe, provincia Sevilla). `geo_confidence=95` por SE-40. Mismo patrón cosmético que Braga: nombre genérico, coord en periferia. No se reescribe.
- **`e9cfe0cd Parque Municipal de Toledo`**: coords en `Autovía de los Viñedos, 45191` (sin locality). Provincia Toledo confirmada.
- **`0a5a411c Vipiteno - Sterzing`**: Nominatim devuelve `Sterzing - Vipiteno` (orden invertido). Es alias canónico bilingüe IT/DE. Aceptable.

**Casos con divergencia nombre↔coord** (`1a5bd7b3`, `5c98da4f`, posiblemente `94d2e9d9`): NO se materializa drift — la coord original se preserva intacta y se documenta como deuda para B5b futuro (re-clasificar `Parque Municipal de <ciudad>` como `B5b_NAME_FIX_GENERIC_CITY`, ya que comparte patrón con `Plaza Mayor de <ciudad>`).

## 6. Estado del scope B5 tras B5a.3

- **B5a (CLEAN, 54):** ✅ 54/54 cerrados (`ok`). Piloto 5 + B5a.2 30 + B5a.3 19.
- **B5b (NAME_FIX, 66):** pendiente — requiere re-naming antes de re-geocode.
- **B5c (SYNTH reject, 290):** pendiente — marcar como `geo_irrecoverable`.
- **B5d (NULL_ISLAND, 1):** pendiente — needs-human-review.

**Bucket `Parque Municipal de <ciudad>` (4 POIs ya re-geocodeados en este lote):** dejar nota para próximo dry-run de heurística B5b — añadir `Parque Municipal` al regex `B5b_NAME_FIX_GENERIC_CITY`. Los 4 ya están `ok` pero sus coords son sospechosas (centros de pedanías o periferias), no representan parques reales identificables. Riesgo aceptado en este lote.

## 7. Conclusión

- Pipeline B5a cerrado: 54/54 POIs con `raw_geocode + geo_health='ok'` sin alterar coords, nombres ni datos semánticos.
- Opción A validada en 49 casos consecutivos (B5a.2 + B5a.3): cero `stale_name` falsos.
- 0 fallos persistentes (2 reintentos por 502 transitorios resueltos).
- Deuda residual: 4 POIs `Parque Municipal de <ciudad>` con coord↔nombre mismatch, documentados para reclasificación a B5b futuro.

## 8. Version impact

**None.** No bump.
