# Geo Resolution Flags — Application Dry-Run (B5b/B5c)

**Status:** 📋 Dry-run. **NO ejecutado.** Read-only. Sin UPDATE/DELETE, sin re-enrich, sin migraciones, sin código, sin bump.
**Fecha:** 2026-05-20
**Predecesores:** `geo-resolution-flags-contract.md`, `b5b-human-review-queue.md`, `b5b-needs-name-fix-dry-run.md`.
**Version impact:** none.

> Este documento **mapea** los 70 POIs del backlog B5b al contrato de flags. No persiste nada. Las cifras y el JSON propuesto son sólo referencia para la futura ejecución.

---

## 1. Reglas de mapeo aplicadas

| Bucket origen (queue B5b) | n | `status` | `reason` |
|---|---:|---|---|
| §1.1 GENERIC ambiguos | 14 | `pending_review` | `generic_name` |
| §1.2 TAIL `Nuevo`/`Nueva`/`#N` | 37 | `needs_name_fix` | `tail_suffix_artifact` |
| §2 R4 fabricados (no Parque Municipal) | 15 | `geo_irrecoverable` | `synthetic_or_unverifiable_name` |
| §2 R5 `Parque Municipal de <ciudad>` (cosméticos B5a.3) | 4 | `pending_review` | `manual_review_required` |
| **Total** | **70** | — | — |

**Notas clave:**

- Los 4 `Parque Municipal` reciben `pending_review` (no `geo_irrecoverable`) por el riesgo #5 documentado en `b5b-needs-name-fix-dry-run.md §7`: ya tienen `geo_health='ok'` con `raw_geocode` poblado tras B5a.3. Degradarlos a `geo_irrecoverable` requiere coordinar antes con un flag que evite romper la contabilidad de B5a; mientras tanto, `pending_review + manual_review_required` declara el problema sin tocar el dato resuelto.
- **No hay coordenadas Null Island** (`(0,0)`) en el scope. Inspección directa de las 70 filas confirma `lat ∈ [-118.18, 39.66]`, `lon ∈ [-118.18, 39.66]` no coinciden con `(0,0)`. Por tanto `needs_coord_fix / null_island` no se aplica a este lote.
- `d11f44dd Mercado Central de Llívia` se trata aquí como GENERIC ambiguo (`pending_review`) siguiendo §1.1 de la queue, donde el revisor humano decidirá si bajarlo a `geo_irrecoverable` tras inspección.

---

## 2. Conteo por `status`

| `status` | n | % |
|---|---:|---:|
| `pending_review`     | 18 | 25.7% |
| `needs_name_fix`     | 37 | 52.9% |
| `geo_irrecoverable`  | 15 | 21.4% |
| `needs_coord_fix`    | 0  | 0.0% |
| `approved_for_geocode` | 0 | 0.0% |
| `resolved`           | 0  | 0.0% |
| **Total**            | **70** | 100% |

## 3. Conteo por `reason`

| `reason` | n |
|---|---:|
| `tail_suffix_artifact`          | 37 |
| `synthetic_or_unverifiable_name`| 15 |
| `generic_name`                  | 14 |
| `manual_review_required`        | 4 |
| `null_island`                   | 0 |
| `name_coordinate_mismatch`      | 0 |
| `invalid_coordinates`           | 0 |
| `missing_raw_geocode`           | 0 |
| `admin_alias_mismatch`          | 0 |
| `other`                         | 0 |
| **Total**                       | **70** |

---

## 4. Lista completa de IDs afectados

### 4.1 `pending_review` / `generic_name` (14)

```
b41a33d7  Monasterio de Sumela
8cd7b1e1  Casco Antiguo de Cáceres
70f14a7e  Casco Antiguo de Coimbra
1637941c  Casco Antiguo de Niza
05bd4905  Castillo de Toledo
0c56e1c9  Catedral de A Coruña
6bfda188  Catedral de Niza
c7a1d2a9  Jardín Botánico de Alicante
d8151dd1  Jardín Botánico de Vigo
5b74c902  Mercado Central de Málaga
4df7ac3a  Plaza Mayor de Palma
c9e0df07  Plaza Mayor de Santander
953c4376  Plaza Mayor de Sevilla
d11f44dd  Mercado Central de Llívia
```

### 4.2 `needs_name_fix` / `tail_suffix_artifact` (37)

```
97994320  Casco Antiguo de Leiria Nuevo
2719e6b9  Casco Antiguo de Lisboa Nuevo
94a05278  Casco Antiguo de Viana do Castelo Nuevo
5626ab6c  Castillo de Estrasburgo Nuevo
d3587fb9  Castillo de Évora Nuevo
2309c116  Castillo de Zaragoza Nuevo
b3cf9399  Catedral de Rennes Nuevo
8e932821  Cueva de Alicante Nuevo
1bdb4c0b  Cueva de Consuegra Nuevo
294219ec  Faro de Llívia Nuevo
13b6ac67  Jardín Botánico de Beja Nuevo
568df858  Jardín Botánico de Valencia Nuevo
34fad56f  Mercado Central de Aveiro Nuevo
451c596f  Mercado Central de Granada Nuevo
28cf0c27  Mercado Central de Málaga Nuevo
40b287bf  Mercado Central de Montpellier Nuevo
932084b0  Mercado Central de Santander Nuevo
8dbef3a0  Mirador de Grenoble Nuevo
49f4b495  Monasterio de Albacete Nuevo
664e5d8b  Monasterio de Burdeos #2
e86188df  Monasterio de Burdeos Nuevo
1813cd8c  Monasterio de Le Havre Nuevo
373a3fd9  Monasterio de Valencia Nuevo
898b7fef  Museo Etnográfico de Los Ángeles Nuevo
272393af  Parque Municipal de Lille Nuevo
cc5fc42b  Parque Municipal de Marrakech Nuevo
6de248f1  Parque Municipal de Valladolid Nuevo
d25504ac  Parque Municipal de Vigo Nuevo
b35a79fc  Plaza Mayor de A Coruña Nuevo
e280fafd  Plaza Mayor de Le Havre Nuevo
a4b87810  Plaza Mayor de Valladolid Nuevo
5a977f93  Puente Medieval de Almada Nuevo
7e25339f  Puente Medieval de Burdeos Nuevo
2b405059  Puente Medieval de Cáceres Nuevo
0eee796e  Puente Medieval de Santiago de Compostela Nuevo
48139cf5  Restaurante Tradicional Burdeos Nuevo
4859aff1  Restaurante Tradicional Grenoble Nuevo
```

### 4.3 `geo_irrecoverable` / `synthetic_or_unverifiable_name` (15)

```
654ecabd  Mirador de Dijon
1b2b47d2  Mirador de Nueva York
fb79a9e3  Mirador de Santander
802a59b7  Monasterio de Albacete
58fa11c0  Monasterio de Beja
68a61cc4  Monasterio de Burdeos
63036654  Faro de Atenas
5b322261  Museo Etnográfico de Bastia
ef50654b  Museo Etnográfico de Estrasburgo
c1663f48  Museo Etnográfico de Valladolid
1b17cb4a  Puente Medieval de Alicante
006aa8d9  Puente Medieval de Grenoble
a49fc322  Puente Medieval de Lyon
d5664740  Puente Medieval de Sevilla
3a407d77  Puente Medieval de Viana do Castelo
```

### 4.4 `pending_review` / `manual_review_required` — Parque Municipal cosméticos B5a.3 (4)

```
1a5bd7b3  Parque Municipal de Braga      (geo_health=ok, raw_geocode poblado — NO TOCAR)
94d2e9d9  Parque Municipal de Murcia     (geo_health=ok, raw_geocode poblado — NO TOCAR)
5c98da4f  Parque Municipal de Sevilla    (geo_health=ok, raw_geocode poblado — NO TOCAR)
e9cfe0cd  Parque Municipal de Toledo     (geo_health=ok, raw_geocode poblado — NO TOCAR)
```

---

## 5. 10 ejemplos por `status`

### 5.1 `pending_review` (10 de 18)

```
b41a33d7  Monasterio de Sumela          → generic_name           (referente único; conservar)
8cd7b1e1  Casco Antiguo de Cáceres      → generic_name
1637941c  Casco Antiguo de Niza         → generic_name
05bd4905  Castillo de Toledo            → generic_name
6bfda188  Catedral de Niza              → generic_name
5b74c902  Mercado Central de Málaga     → generic_name           (colisión con 28cf0c27)
4df7ac3a  Plaza Mayor de Palma          → generic_name
1a5bd7b3  Parque Municipal de Braga     → manual_review_required (cosmético B5a.3, no tocar raw_geocode)
94d2e9d9  Parque Municipal de Murcia    → manual_review_required (cosmético B5a.3, no tocar raw_geocode)
d11f44dd  Mercado Central de Llívia     → generic_name           (candidato a reject tras revisión)
```

### 5.2 `needs_name_fix` (10 de 37)

```
97994320  Casco Antiguo de Leiria Nuevo                    → tail_suffix_artifact
2719e6b9  Casco Antiguo de Lisboa Nuevo                    → tail_suffix_artifact
5626ab6c  Castillo de Estrasburgo Nuevo                    → tail_suffix_artifact
664e5d8b  Monasterio de Burdeos #2                         → tail_suffix_artifact (colisión 68a61cc4 + e86188df)
e86188df  Monasterio de Burdeos Nuevo                      → tail_suffix_artifact (colisión 68a61cc4 + 664e5d8b)
28cf0c27  Mercado Central de Málaga Nuevo                  → tail_suffix_artifact (colisión 5b74c902)
49f4b495  Monasterio de Albacete Nuevo                     → tail_suffix_artifact (colisión 802a59b7)
b35a79fc  Plaza Mayor de A Coruña Nuevo                    → tail_suffix_artifact
a4b87810  Plaza Mayor de Valladolid Nuevo                  → tail_suffix_artifact
48139cf5  Restaurante Tradicional Burdeos Nuevo            → tail_suffix_artifact (template)
```

### 5.3 `geo_irrecoverable` (10 de 15)

```
654ecabd  Mirador de Dijon                  → synthetic_or_unverifiable_name
1b2b47d2  Mirador de Nueva York             → synthetic_or_unverifiable_name
fb79a9e3  Mirador de Santander              → synthetic_or_unverifiable_name
802a59b7  Monasterio de Albacete            → synthetic_or_unverifiable_name
63036654  Faro de Atenas                    → synthetic_or_unverifiable_name
5b322261  Museo Etnográfico de Bastia       → synthetic_or_unverifiable_name
ef50654b  Museo Etnográfico de Estrasburgo  → synthetic_or_unverifiable_name
1b17cb4a  Puente Medieval de Alicante       → synthetic_or_unverifiable_name
a49fc322  Puente Medieval de Lyon           → synthetic_or_unverifiable_name
d5664740  Puente Medieval de Sevilla        → synthetic_or_unverifiable_name
```

---

## 6. JSON exacto propuesto para `custom_data.geo_resolution`

Cada UPDATE futuro escribirá el objeto **completo**, no parcial. `at` = timestamp de ejecución real, `source` = `b5b-human-review-queue`, `notes` opcional.

### 6.1 Plantilla `pending_review / generic_name`

```json
{
  "geo_resolution": {
    "status": "pending_review",
    "reason": "generic_name",
    "source": "b5b-human-review-queue",
    "at": "2026-05-20T00:00:00Z",
    "notes": "GENERIC ambiguous — revisor decide rename canónico o reject"
  }
}
```

### 6.2 Plantilla `needs_name_fix / tail_suffix_artifact`

```json
{
  "geo_resolution": {
    "status": "needs_name_fix",
    "reason": "tail_suffix_artifact",
    "source": "b5b-human-review-queue",
    "at": "2026-05-20T00:00:00Z",
    "notes": "TAIL Nuevo/Nueva/#N — strip + dedup obligatorio antes de re-geocode"
  }
}
```

### 6.3 Plantilla `geo_irrecoverable / synthetic_or_unverifiable_name`

```json
{
  "geo_resolution": {
    "status": "geo_irrecoverable",
    "reason": "synthetic_or_unverifiable_name",
    "source": "b5b-human-review-queue",
    "at": "2026-05-20T00:00:00Z",
    "notes": "R4 fabricated name — no Wikipedia/OSM referent; exclude from B5/B5a permanently"
  }
}
```

### 6.4 Plantilla `pending_review / manual_review_required` (Parque Municipal cosméticos)

```json
{
  "geo_resolution": {
    "status": "pending_review",
    "reason": "manual_review_required",
    "source": "b5b-human-review-queue",
    "at": "2026-05-20T00:00:00Z",
    "notes": "R5 LLM template — geo_health=ok preservado tras B5a.3; revisar nombre sin tocar raw_geocode"
  }
}
```

---

## 7. SQL UPDATE propuesto (COMENTADO — NO EJECUTAR)

> Plantillas referenciales. La ejecución real debe usar un timestamp dinámico (`now()`) y, opcionalmente, agrupar por bucket en un único `UPDATE … WHERE id IN (…)`.

```sql
-- ===========================================================================
-- B5b — Apply geo_resolution flags (DRY-RUN, NO EJECUTAR)
-- ===========================================================================

-- 7.1 pending_review / generic_name (14)
-- UPDATE locations
-- SET custom_data = COALESCE(custom_data, '{}'::jsonb) || jsonb_build_object(
--   'geo_resolution', jsonb_build_object(
--     'status', 'pending_review',
--     'reason', 'generic_name',
--     'source', 'b5b-human-review-queue',
--     'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
--     'notes', 'GENERIC ambiguous — revisor decide rename canónico o reject'
--   )
-- )
-- WHERE substring(id::text,1,8) IN (
--   'b41a33d7','8cd7b1e1','70f14a7e','1637941c','05bd4905','0c56e1c9',
--   '6bfda188','c7a1d2a9','d8151dd1','5b74c902','4df7ac3a','c9e0df07',
--   '953c4376','d11f44dd'
-- );

-- 7.2 needs_name_fix / tail_suffix_artifact (37)
-- UPDATE locations
-- SET custom_data = COALESCE(custom_data, '{}'::jsonb) || jsonb_build_object(
--   'geo_resolution', jsonb_build_object(
--     'status', 'needs_name_fix',
--     'reason', 'tail_suffix_artifact',
--     'source', 'b5b-human-review-queue',
--     'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
--     'notes', 'TAIL Nuevo/Nueva/#N — strip + dedup obligatorio antes de re-geocode'
--   )
-- )
-- WHERE substring(id::text,1,8) IN (
--   '97994320','2719e6b9','94a05278','5626ab6c','d3587fb9','2309c116',
--   'b3cf9399','8e932821','1bdb4c0b','294219ec','13b6ac67','568df858',
--   '34fad56f','451c596f','28cf0c27','40b287bf','932084b0','8dbef3a0',
--   '49f4b495','664e5d8b','e86188df','1813cd8c','373a3fd9','898b7fef',
--   '272393af','cc5fc42b','6de248f1','d25504ac','b35a79fc','e280fafd',
--   'a4b87810','5a977f93','7e25339f','2b405059','0eee796e','48139cf5',
--   '4859aff1'
-- );

-- 7.3 geo_irrecoverable / synthetic_or_unverifiable_name (15)
-- UPDATE locations
-- SET custom_data = COALESCE(custom_data, '{}'::jsonb) || jsonb_build_object(
--   'geo_resolution', jsonb_build_object(
--     'status', 'geo_irrecoverable',
--     'reason', 'synthetic_or_unverifiable_name',
--     'source', 'b5b-human-review-queue',
--     'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
--     'notes', 'R4 fabricated name — no Wikipedia/OSM referent; exclude from B5/B5a permanently'
--   )
-- )
-- WHERE substring(id::text,1,8) IN (
--   '654ecabd','1b2b47d2','fb79a9e3','802a59b7','58fa11c0','68a61cc4',
--   '63036654','5b322261','ef50654b','c1663f48','1b17cb4a','006aa8d9',
--   'a49fc322','d5664740','3a407d77'
-- );

-- 7.4 pending_review / manual_review_required — Parque Municipal cosméticos (4)
-- UPDATE locations
-- SET custom_data = COALESCE(custom_data, '{}'::jsonb) || jsonb_build_object(
--   'geo_resolution', jsonb_build_object(
--     'status', 'pending_review',
--     'reason', 'manual_review_required',
--     'source', 'b5b-human-review-queue',
--     'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
--     'notes', 'R5 LLM template — geo_health=ok preservado tras B5a.3; revisar nombre sin tocar raw_geocode'
--   )
-- )
-- WHERE substring(id::text,1,8) IN (
--   '1a5bd7b3','94d2e9d9','5c98da4f','e9cfe0cd'
-- );
```

**Whitelist de columnas tocadas (en ejecución real):** SOLO `custom_data`. Ninguna otra.

---

## 8. Rollback plan

Si tras la ejecución real se detecta un mapeo incorrecto:

### 8.1 Rollback total (remover `geo_resolution` de los 70)

```sql
-- COMENTADO — NO EJECUTAR
-- UPDATE locations
-- SET custom_data = custom_data - 'geo_resolution'
-- WHERE substring(id::text,1,8) IN ( <70 ids del §4> );
```

### 8.2 Rollback parcial por bucket

Mismo patrón, restringido al subset (`§4.1`, `§4.2`, `§4.3` o `§4.4`).

### 8.3 Rollback granular por POI

```sql
-- COMENTADO — NO EJECUTAR
-- UPDATE locations
-- SET custom_data = custom_data - 'geo_resolution'
-- WHERE substring(id::text,1,8) = '<id8>';
```

### 8.4 Reversibilidad

- El flag vive en `custom_data jsonb`. El operador `-` elimina la clave sin tocar resto del JSON.
- No hay triggers que reaccionen a cambios en `custom_data.geo_resolution` (verificado: ningún trigger en `locations` referencia esa clave).
- `geo_health`, `enrichment_status`, `raw_geocode`, `latitude`, `longitude`, `name`, `enriched_data` permanecen intactos en cualquier escenario.

---

## 9. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Mapeo incorrecto** por baja confianza en clasificación heurística (ej. `d11f44dd Mercado Central de Llívia` podría ser `geo_irrecoverable`). | El status `pending_review` permite revisión humana posterior. Rollback granular §8.3 disponible. |
| 2 | **Sobrescritura silenciosa** si `custom_data.geo_resolution` ya existe en alguna fila. | Pre-flight check: `SELECT id, custom_data->'geo_resolution' FROM locations WHERE substring(id::text,1,8) IN (<70>) AND custom_data ? 'geo_resolution';`. Si retorna >0 filas, abortar y revisar manualmente. |
| 3 | **Pérdida de `custom_data` legacy** si se usa `=` en vez de `||`. | El SQL §7 usa `COALESCE(custom_data, '{}'::jsonb) || …` que preserva claves existentes. Confirmar en ejecución real. |
| 4 | **Confusión status vs geo_health**: revisor puede pensar que `geo_irrecoverable` degradó `geo_health`. | Contrato §5 explicita que `geo_resolution.status` NO altera `geo_health`. Los 4 Parque Municipal mantienen `geo_health='ok'` y `status='pending_review'` simultáneamente. |
| 5 | **Cola de revisión huérfana**: sin UI admin para filtrar por `custom_data.geo_resolution.status`, los 18 `pending_review` quedan invisibles. | Aceptado en este dry-run. La UI admin está en el §7 "Futuro" del contrato. Mientras tanto, la queue B5b sirve como inventario. |
| 6 | **Idempotencia**: re-ejecución sobreescribe `at`. | Aceptable para B5b (caso histórico). Para flujos futuros (UI admin), el setter debe ser idempotente o preservar histórico. |
| 7 | **Colisiones intra-bucket TAIL** (Burdeos×3, Albacete×2, Málaga×2) aún sin resolver. | El flag `needs_name_fix` NO resuelve la colisión, sólo bloquea B5 hasta que un humano la trate. Dedup se aborda fuera de este lote. |

---

## 10. Confirmación de no-mutaciones colaterales

En la ejecución real (cuando se descomente §7), las únicas columnas tocadas serán:

- ✅ `locations.custom_data` (clave `geo_resolution` añadida o sobrescrita).

Las siguientes columnas **NO se tocan** bajo ninguna circunstancia:

- ❌ `locations.name`
- ❌ `locations.latitude`
- ❌ `locations.longitude`
- ❌ `locations.raw_geocode`
- ❌ `locations.geo_source`, `geo_confidence`, `geo_resolved_at`
- ❌ `locations.country`, `region`, `zone`, `country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`
- ❌ `locations.enriched_data`
- ❌ `locations.enrichment_status`
- ❌ `locations.geo_health`
- ❌ `locations.is_approved`
- ❌ `locations.tags`
- ❌ `collection_locations`, `user_places`, `places` (otras tablas)

Esto está garantizado por la whitelist `SET custom_data = …` del §7. Cualquier desviación rompe el contrato y debe abortarse.

---

## 11. Validación final del dry-run

- [x] Archivo `docs/audits/geo-resolution-flags-application-dry-run.md` creado.
- [x] Mapeo cubre 70/70 POIs del backlog B5b.
- [x] Conteo por `status` y `reason` documentado (§2 + §3).
- [x] Lista completa de IDs (§4).
- [x] 10 ejemplos por status (§5).
- [x] JSON exacto propuesto (§6).
- [x] SQL UPDATE comentado (§7).
- [x] Rollback plan (§8).
- [x] Riesgos (§9).
- [x] Confirmación no-mutación (§10).
- [x] Read-only: 0 UPDATE, 0 DELETE, 0 migración, 0 código, 0 bump.

**Próximo paso (NO en este doc):** ejecución condicionada a aprobación humana → `b5b-geo-resolution-flags-execution.md`.
