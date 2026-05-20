# B5a — Piloto de 5 POIs (ejecución)

**Status:** ✅ Ejecutado. **Sin cambios de schema. Sin migraciones. Sin re-enrich. Sin bump.**
**Fecha:** 2026-05-20
**Predecesores:** `docs/audits/b5-full-classification-dry-run.md` · `docs/audits/b5-l0-calibration-review.md`
**Scope:** 5 POIs `B5a_CLEAN` aprobados en L0 (los 5 municipios reales).
**Mutaciones:** solo campos canónicos derivados de `resolve-coordinates`. **No** se tocó `latitude`, `longitude`, `name`, `enriched_data`, `media`, `tags`, `enrichment_status`, colecciones ni código.

---

## 1. Candidatos seleccionados (criterios B5a)

| id | name | país | región (pre) | zone (pre) | lat | lng | bucket |
|---|---|---|---|---|---:|---:|---|
| `e623d113-…cffe7` | Autoire | Francia | Occitanie | Lot | 44.8532525 | 1.8205118 | B5a_CLEAN |
| `fa4cec93-…bda226` | Belcastel | Francia | Occitanie | Aveyron | 44.3879029 | 2.3365474 | B5a_CLEAN |
| `f43da01c-…ba6b2b` | Níjar | España | Andalucía | Almería | 36.966 | -2.206 | B5a_CLEAN |
| `1c1f98f3-…cbac2f` | Sant'Antonino | Francia | Corse | Upper Corsica | 42.5883511 | 8.9048052 | B5a_CLEAN |
| `07f548c8-…de79e13` | Zuheros | España | Andalucía | Córdoba | 37.543 | -4.316 | B5a_CLEAN |

**Pre-condiciones verificadas:**
- ✅ 5/5 en bucket `B5a_CLEAN` (nombres no sintéticos, sin patrones LLM).
- ✅ 5/5 coords WGS84 válidas (no Null Island, no fuera de rango).
- ✅ 5/5 `raw_geocode IS NULL`, `enrichment_status='enriched'`.
- ✅ 5/5 país/región coherentes con el topónimo.

---

## 2. Snapshot pre-ejecución

```
                  id                  |     name      | country |  region   |     zone      | country_code | geo_health | raw_geocode
 e623d113-…cffe7 | Autoire             | Francia       | Occitanie | Lot           | FR           | hardError  | NULL
 fa4cec93-…bda226| Belcastel           | Francia       | Occitanie | Aveyron       | FR           | hardError  | NULL
 f43da01c-…ba6b2b| Níjar               | España        | Andalucía | Almería       | ES           | partial    | NULL
 1c1f98f3-…cbac2f| Sant'Antonino       | Francia       | Corse     | Upper Corsica | FR           | hardError  | NULL
 07f548c8-…de79e13| Zuheros            | España        | Andalucía | Córdoba       | ES           | partial    | NULL
```

Todos sin `geo_source`, sin `geo_confidence`, sin `geo_resolved_at`.

---

## 3. Ejecución

**Pipeline (por POI):**
1. `POST /functions/v1/resolve-coordinates {latitude, longitude}` (sin `persist`).
2. Lectura del payload canónico → `raw_geocode`, `geo_source`, `geo_confidence`, `country/region/zone/continent`, `country_code`, `*_id`.
3. `UPDATE` único por id sobre `public.locations` (vía `insert` tool, sin migración).
4. `geo_resolved_at = now()`.
5. `geo_health` recalculado automáticamente por trigger `locations_set_geo_health`.

**Campos tocados (whitelist):**
`raw_geocode`, `geo_source`, `geo_confidence`, `geo_resolved_at`, `country`, `region`, `zone`, `continent`, `country_code`, `continent_id`, `country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`. **Nada más.**

**Campos NO tocados (verificado):**
`latitude`, `longitude`, `name`, `enriched_data`, `media`, `tags`, `enrichment_status`, colecciones, `user_image_url`, `place_type`, `visibility`, `owner_user_id`.

---

## 4. Snapshot post-ejecución

| name | country | region | zone | country_code | geo_health | geo_source | geo_conf | resolved | raw_set | lat (sin cambio) | lng (sin cambio) |
|---|---|---|---|---|---|---|---:|---|---|---:|---:|
| Autoire | Francia | **Occitania** | Lot | FR | **stale_name** ⚠ | nominatim | 100 | ✅ | ✅ | 44.8532525 | 1.8205118 |
| Belcastel | Francia | **Occitania** | Aveyron | FR | **stale_name** ⚠ | nominatim | 100 | ✅ | ✅ | 44.3879029 | 2.3365474 |
| Níjar | España | Andalucía | **Almeria** | ES | **ok** ✅ | nominatim | 95 | ✅ | ✅ | 36.966 | -2.206 |
| Sant'Antonino | Francia | **Córcega** | Alta Córcega | FR | **stale_name** ⚠ | nominatim | 100 | ✅ | ✅ | 42.5883511 | 8.9048052 |
| Zuheros | España | Andalucía | Córdoba | ES | **ok** ✅ | nominatim | 95 | ✅ | ✅ | 37.543 | -4.316 |

---

## 5. Diff antes → después

| Campo | Autoire | Belcastel | Níjar | Sant'Antonino | Zuheros |
|---|---|---|---|---|---|
| `raw_geocode` | NULL → set | NULL → set | NULL → set | NULL → set | NULL → set |
| `geo_source` | NULL → `nominatim` | NULL → `nominatim` | NULL → `nominatim` | NULL → `nominatim` | NULL → `nominatim` |
| `geo_confidence` | NULL → 100 | NULL → 100 | NULL → 95 | NULL → 100 | NULL → 95 |
| `geo_resolved_at` | NULL → now() | NULL → now() | NULL → now() | NULL → now() | NULL → now() |
| `region` | Occitanie → **Occitania** | Occitanie → **Occitania** | sin cambio | Corse → **Córcega** | sin cambio |
| `zone` | sin cambio | sin cambio | Almería → **Almeria** | Upper Corsica → **Alta Córcega** | sin cambio |
| `country`/`continent`/`country_code` | sin cambio | sin cambio | sin cambio | sin cambio | sin cambio |
| `*_id` | rellenados (6) | rellenados (6) | rellenados (6) | rellenados (6) | rellenados (6) |
| `latitude`/`longitude` | **sin cambio** | **sin cambio** | **sin cambio** | **sin cambio** | **sin cambio** |
| `geo_health` | hardError → **stale_name** | hardError → **stale_name** | partial → **ok** | hardError → **stale_name** | partial → **ok** |

**Drift de coords:** 0 km en los 5 (no se tocaron).
**Locality canónica == name del POI:** 5/5 (Autoire, Belcastel, Níjar, Sant'Antonino, Zuheros). Validación geo OK.

---

## 6. Hallazgo: `stale_name` en POIs franceses

3 de 5 POIs (Autoire, Belcastel, Sant'Antonino) cerraron en `geo_health='stale_name'`, no `ok`. **No es un fallo del piloto** — es una inconsistencia de traducción entre Nominatim y `admin_areas`:

| Caso | Resolver devolvió (es) | `admin_areas.name` (fr) | Diff |
|---|---|---|---|
| Autoire / Belcastel `region` | `Occitania` | `Occitanie` | traducción ES vs FR |
| Sant'Antonino `region` | `Córcega` | `Corse` | traducción ES vs FR |

`reverse-geocode.ts` invoca Nominatim con `accept-language=es,en`, así que devuelve nombres traducidos al español. `admin_areas` guarda los nombres oficiales en francés. El trigger `_compute_location_geo_health_lookup` compara `lower(region_str) <> lower(c_name)` y marca `stale_name`.

**Decisión:** se persistió el string del resolver (`Occitania`/`Córcega`), conforme al spec del piloto ("country/region/zone/continent si vienen del canonical"). El `stale_name` resultante es información, no daño: las FKs (`region_id`, `zone_id`) apuntan al admin_area correcto y `raw_geocode` ya está auditable.

**Fuera de scope de B5a:** alinear `admin_areas.name` con la convención de idioma esperada o cambiar `accept-language` en `reverse-geocode.ts`. Decisión a tomar antes de B5a.2 (n=30) y B5a.3 (n=19).

---

## 7. Fallos

**0 / 5.** Ninguno excluido. Los 5 candidatos completaron el pipeline sin error HTTP, sin timeout y con `geo_confidence ≥ 95`.

---

## 8. Conclusión

- Pipeline B5a aplicable y reversible: 5/5 OK, 0 coords tocadas, 0 enriquecimiento alterado.
- `raw_geocode` ahora es auditable en los 5 POIs (sale del scope B5 al estar `enriched` + `raw_geocode IS NOT NULL`).
- 3/5 quedan en `stale_name`: bug latente de traducción admin_areas/Nominatim — bloqueante recomendado antes de B5a.2 (n=30).
- 2/5 cierran en `ok` (POIs españoles, donde Nominatim y admin_areas coinciden en español).

**Próximo paso sugerido:** decidir política de traducción antes de B5a.2; no continuar B5a hasta resolver `stale_name`.

**No bump.** Version no afectada.
