# B5a.2 — Batch de 30 POIs (ejecución)

**Status:** ✅ Ejecutado. Sin migraciones. Sin re-enrich. Sin bump.
**Fecha:** 2026-05-20
**Predecesores:** `b5a-pilot-5-execution.md` · `b5a-stale-name-dry-run.md` · `b5a-stale-name-refresh-execution.md` (Opción A aplicada).
**Scope:** 30 POIs `B5a_CLEAN`, bajo riesgo (municipios reales / topónimos puros), excluidos los 5 del piloto.

## 1. Selección

Universo restante tras piloto: **49** (de 54 originales, −5 ya resueltos). De ahí se eligen 30 priorizando `spaces(name)=0` (28) + 2 con `spaces=1` (`San Leo`, `Pieve Tesino`). Excluidos: `430ec0bd` (nombre = coordenadas), `d68654e9 Cueva de Cáceres` (riesgo flagged en dry-run), `12709e5d Nuraghe Serbissi` y resto spaces≥2.

**IDs (30):** `bc303ce4 Opi · 1d63ea5b Aieta · 27d9b398 Clare · 50435a75 Najac · 661010b6 Treia · 341ff0dd Salers · 23597c49 Vannes · b3011c23 Aiguèze · 7bd04f1b Follina · d1d117ea Offagna · f96246f9 Percile · 2033aa38 Apricale · fe3a877c Compiano · b6fa52b8 Lagrasse · 79743b3d Montclus · 54385784 Derinkuyu · 70b1f720 Monestiés · 13c69a1e Navarrenx · 8cbbe011 Cardaillac · 8935e15b Moncontour · 22420254 Montagnana · ad09dc98 Grottammare · 3345f755 Saint-Suliac · c1dfcacb Montechiarugolo · 29ced175 Veules-les-Roses · f12cf26b Montbrun-les-Bains · a603c5db Rochefort-en-Terre · 92aba1aa Saint-Antoine-l'Abbaye · 674cda6d San Leo · 627a3af3 Pieve Tesino`.

**Pre-condiciones verificadas (snapshot pre-flight):**
- 30/30 `raw_geocode IS NULL`.
- 29/30 `geo_health='hardError'`, 1/30 `partial` (Derinkuyu).
- 30/30 coords WGS84 válidas, no Null Island.
- 30/30 país/región coherentes con el topónimo (auditoría visual).

## 2. Ejecución

Pipeline idéntico al piloto, por POI:
1. `POST /functions/v1/resolve-coordinates {latitude, longitude}` (sin `persist`).
2. `UPDATE locations SET raw_geocode, geo_source='nominatim', geo_confidence, geo_resolved_at=now(), country, region, zone, continent, country_code, continent_id, country_id, region_id, zone_id, admin3_id, locality_id WHERE id=…`.
3. `geo_health` recalculado por trigger `zzz_locations_set_geo_health`.

**Llamadas Nominatim:** 30/30 OK (`oks=30, errs=0`), throttling 1.1s.
**Updates:** 30 statements en un solo batch a través del tool de mutación.
**Campos NO tocados (verificado por whitelist explícito):** `latitude`, `longitude`, `name`, `enriched_data`, `media`, `tags`, `enrichment_status`, colecciones, `place_type`, `visibility`, `owner_user_id`, `user_image_url`.

## 3. Post-flight

```
 geo_health | count
------------+-------
 ok         |    30
```

| Bucket | n | Δ vs piloto |
|---|---:|---|
| `ok` | **30 / 30** | piloto: 2/5 |
| `stale_name` | 0 | piloto: 3/5 (cerrados por Opción A en `b5a-stale-name-refresh`) |
| `partial` | 0 | — |
| `hardError` | 0 | — |

**Drift de coords:** 0 km / 30 (no se tocaron).
**`geo_confidence`:** 18 × 100 · 11 × 90 · 1 × 95 (Vannes) — ver `raw_geocode` de cada fila.
**`raw_geocode` poblado:** 30 / 30.
**FKs admin rellenadas:** 30 / 30 (`country_id` + `region_id` + `zone_id` + `admin3_id` + `locality_id`).

## 4. Alias/traducción — sin incidencias

Opción A (matching contra `admin_areas.name ∪ aliases ∪ name_translations`) absorbió todos los pares ES↔FR/IT que en el piloto producían `stale_name`:
- `Occitania` (Najac, Aiguèze, Lagrasse, Montclus, Monestiés, Cardaillac) ≡ `Occitanie` (alias) → `ok`.
- `Bretaña` (Vannes, Moncontour, Saint-Suliac, Rochefort-en-Terre) ≡ `Bretagne` → `ok`.
- `Nueva Aquitania` (Navarrenx) ≡ `Nouvelle-Aquitaine` → `ok`.
- `Normandía` (Veules-les-Roses) ≡ `Normandie` → `ok`.
- `Auvergne-Rhône-Alpes` (Salers, Montbrun-les-Bains, Saint-Antoine-l'Abbaye) — sin cambio → `ok`.
- `Lacio` / `Marcas` / `Véneto` / `Abruzos` / `Emilia-Romaña` / `Trentino-Alto Adigio` (varios IT) → `ok`.

**No hay conflicto real** que separar — 0 casos requieren intervención humana.

## 5. Notas / outliers menores

Cosméticos, no degradan `geo_health`:
- **`Clare` (UK):** locality canónica devuelta = `West Suffolk` (district), no `Clare` (parish). El topónimo histórico está como `name` del POI; la jerarquía resuelta apunta al district. Aceptable.
- **`Vannes`:** sin `locality` en `raw_geocode` (calle céntrica resuelta a `sublocality=Centre - Le Port`). FKs OK; `locality_id` apunta a Vannes.
- **`Tortiano` / `Saint-Antoine l'Abbaye`:** `locality` canónica difiere del `name` del POI (Tortiano ≠ Montechiarugolo; apóstrofe simple ≠ guión). FKs correctas, `geo_health=ok`. No es deriva.
- **`Derinkuyu`:** locality canónica = `Derinkuyu İlçe Merkezi`. FKs OK.

## 6. Estado del scope B5 tras B5a.2

- B5a piloto: 5 / 5 OK (cerrado).
- B5a.2: 30 / 30 OK (este doc).
- **B5a.3 pendiente:** 19 POIs restantes (54 − 5 − 30). Mayoría son nombres compuestos / monumentos con nombre propio (`Cueva de Cáceres`, `Nuraghe Serbissi`, `Casa do Penedo`, `Castro dei Volsci`, `Cividale del Friuli`, `Vipiteno - Sterzing`, `Casina delle Civette`, `Hotel Cala di Volpe …`, `430ec0bd` con nombre = coords, etc.). Requieren auditoría humana caso a caso antes de re-geocode.

## 7. Conclusión

- Pipeline B5a estable y reversible bajo Opción A: 30 / 30 cierran en `ok` sin tocar coords, nombres ni datos semánticos.
- Validación práctica del fix de `_compute_location_geo_health_lookup`: cero `stale_name` falsos.
- B5a.3 (n=19) abrir como siguiente sub-fase, con criterios de selección revisados para nombres compuestos / monumentos.

## 8. Version impact

**None.** No bump.
