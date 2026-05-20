# B5a — Dry-run de normalización admin_areas / Nominatim para los 3 `stale_name` del piloto

**Status:** 🔎 Dry-run. **Sin UPDATE. Sin re-enrich. Sin bump. Sin migración. Sin código.**
**Fecha:** 2026-05-20
**Predecesor:** `docs/audits/b5a-pilot-5-execution.md`
**Objetivo:** Determinar si los 3 `stale_name` del piloto son **traducción/alias** o **conflicto real** antes de autorizar B5a.2 (n=30).

---

## 1. IDs analizados

| # | id | name | país | geo_health | geo_source | geo_conf |
|---|---|---|---|---|---|---:|
| 1 | `e623d113-596d-45e9-9bcd-763ecb4cffe7` | Autoire        | Francia | `stale_name` | nominatim | 100 |
| 2 | `fa4cec93-d7d4-4303-9893-668c57bda226` | Belcastel      | Francia | `stale_name` | nominatim | 100 |
| 3 | `1c1f98f3-564d-4e1c-9e31-6dcc76cbac2f` | Sant'Antonino  | Francia | `stale_name` | nominatim | 100 |

FKs ya resueltos correctamente: los 3 apuntan al `region_id`/`zone_id` canónico del admin_area correcto (mismo UUID que sus gemelos `ok`).

---

## 2. Valores Nominatim (persistidos en `raw_geocode`)

Resolver = `reverse-geocode.ts` con `accept-language=es,en` → devuelve nombres traducidos al español y los persiste tal cual en `locations.region` / `locations.zone`.

| POI | `raw_geocode.region` | `raw_geocode.zone` | `raw_geocode.admin3` | `raw_geocode.locality` |
|---|---|---|---|---|
| Autoire        | **Occitania** | Lot     | Figeac | Autoire |
| Belcastel      | **Occitania** | Aveyron | —      | Belcastel |
| Sant'Antonino  | **Córcega**   | Alta Córcega | Calvi  | Sant'Antonino |

(`region_type`/`zone_type` vienen en francés: `Région`/`Département` — confirma origen FR.)

---

## 3. Valores `admin_areas` (canónico FR + aliases)

| `admin_area_id` | `name` (canónico) | `aliases` (ya cubre ES) |
|---|---|---|
| `a49118de…36b8bcd88a77` (Autoire+Belcastel `region_id`) | **Occitanie** | `{occitanie, occitania, midi-pyrenees, languedoc-roussillon, midi-pyrénées, languedoc, …}` ✅ contiene `occitania` |
| `94a59e52…894b9593` (Sant'Antonino `region_id`)         | **Corse**     | `{fr-cor, corse, córcega, corsica}` ✅ contiene `córcega` |
| `f71aeefc…996dcd3` (Autoire `zone_id`)                  | **Lot**       | `{}` |
| `d5a939a3…1c1dbd3c759a` (Belcastel `zone_id`)           | **Aveyron**   | `{}` |
| `ecbc8222…39597d7a` (Sant'Antonino `zone_id`)           | **Alta Córcega** | `{}` |

---

## 4. Diferencia exacta

| POI | Campo | `locations.<col>` (post-piloto) | `admin_areas.name` | ¿En `aliases`? | Diff real |
|---|---|---|---|---|---|
| Autoire        | region | `Occitania` | `Occitanie` | ✅ sí (`occitania`) | **traducción ES↔FR** |
| Belcastel      | region | `Occitania` | `Occitanie` | ✅ sí (`occitania`) | **traducción ES↔FR** |
| Sant'Antonino  | region | `Córcega`   | `Corse`     | ✅ sí (`córcega`)   | **traducción ES↔FR** |
| (todos)        | zone   | coincide o vacío en aliases | — | — | sin diff de zona |

El trigger `_compute_location_geo_health_lookup` compara `lower(region_str) <> lower(admin_areas.name)` **sin consultar `aliases`**. Por eso 3/3 marcan `stale_name` aunque las FKs (`region_id`) son correctas y los aliases ya contemplan la forma ES.

---

## 5. ¿Traducción/alias o conflicto real?

**Traducción/alias en 3/3.** Cero conflictos semánticos:
- `region_id` y `zone_id` apuntan al admin_area correcto.
- Las 3 cadenas españolas ya existen como alias del admin_area canónico francés.
- Las coords no cambiaron y `locality` coincide con `name` del POI en los 3.
- Mismos POIs gemelos en la BD (mismas coords) están en `ok` porque su `region` se persistió como `Occitanie`/`Corse`. Confirma que el único factor que mueve el health es el string persistido.

---

## 6. Propuesta de canon (3 alternativas, ninguna se ejecuta aquí)

| Opción | Qué hace | Toca datos | Toca código | Riesgo | Tiempo |
|---|---|---|---|---|---|
| **A. Trigger reconoce aliases** | Modificar `_compute_location_geo_health_lookup` para comparar contra `name ∪ aliases` (+ `name_translations`). | No | Sí (1 función SQL) | Bajo. Los aliases ya cubren los 3 casos sin tocar `locations`. | S |
| **B. Persistir canónico** | Cambiar pipeline de `resolve-coordinates` para escribir `admin_areas.name` (no el string Nominatim) cuando el FK resuelve. | Sí (futuros) | Sí (edge) | Medio. Cambia la semántica de `locations.region/zone`. | M |
| **C. Forzar `accept-language=local`** | Pedir a Nominatim respuesta en idioma local (FR para FR). | Sí (futuros) | Sí (edge) | Alto. Rompe coherencia ES en todo el catálogo ES/HISP. | M |

**Recomendación:** **Opción A**. Es la mínima invasiva, cierra los 3 casos sin UPDATE sobre `locations`, no altera la convención ES, y deja `raw_geocode` intacto como auditoría. Los 3 stale_name pasarían a `ok` en el próximo recompute (manual o re-trigger) sin tocar el POI.

> Sub-opción A.1 (opcional, fuera de B5a): añadir `Lot`, `Aveyron`, `Alta Córcega` no requieren alias nuevo porque ya coinciden con el string persistido. **No se necesita poblar aliases adicionales para cerrar este lote.**

---

## 7. ¿Puede continuar B5a.2?

**Condicional. Recomendación: NO continuar hasta aplicar Opción A** (o aceptar formalmente `stale_name` como cosmético).

Razones:
- B5a.2 son 30 POIs, mayoría municipios reales en países no-hispanohablantes (FR, IT, PT, DE). Por la misma ruta Nominatim-ES, se espera que **~60–80% queden en `stale_name`** por el mismo motivo (traducción de regiones/comarcas).
- Si se aplica Opción A antes de B5a.2, el lote cerrará con health real (ok / stale_name solo cuando haya conflicto semántico genuino, no traducción).
- Si no se aplica, B5a.2 funcionará igualmente — coords intactas, FKs correctas — pero el dashboard de salud quedará ruidoso y el criterio "stale_name como señal de error" pierde valor.

**Bloqueo blando, no duro.** El piloto demostró que el pipeline B5a es seguro; el `stale_name` es informativo, no daño. La decisión de continuar es producto.

---

## 8. Checklist de no-mutación (este dry-run)

- [x] 0 `UPDATE` ejecutado.
- [x] 0 llamada a `resolve-coordinates`.
- [x] 0 cambio de schema / migración / código.
- [x] 0 re-enrich.
- [x] 0 bump de versión.
- [x] Solo `SELECT` sobre `locations` y `admin_areas`.

**No bump. No B5a.2. Esperar decisión de canon (A / B / C) o aceptación explícita del ruido.**
