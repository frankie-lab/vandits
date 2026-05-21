# T-CATALOG-PT-RA-CONCELHOS — Dry-run P2 (Açores / Madeira en canon PT)

**Estado:** plan / auditoría. **NO ejecuta nada.** Sin UPDATE / INSERT / DELETE. No toca `locations`. No Nominatim. No re-enrich. No código. No bump.

**Referencias:**
- `docs/contracts/territorial-equivalence-canon.md` §1 fila #6 (PT) y §0 reglas duras 1 y 2.
- `docs/audits/t-catalog-pt-districts-plan.md` §3 y §8 (`T-CATALOG-PT-RA-CONCELHOS` queda fuera de P1).
- `docs/audits/t-catalog-pt-districts-p1-postflight.md` (P1 ejecutado, 7 CCDR §1.A intactas).
- `mem://geography/canonical-tree-spec` y `mem://geography/territorial-canon`.

---

## 0. Decisión canónica que este documento codifica

El canon PT (§1#6) declara `has_provincia=true`, con **Distrito** como nivel `zone`. Las **Regiões Autónomas** Açores (PT-20) y Madeira (PT-30) **no tienen Distrito operativo** (NUTS-III RA no usa el nivel Distrito formal). La regla canónica raíz §0.1 prohíbe inventar provincia → **excepción insular ratificada**:

> Para POIs en RA Açores y RA Madeira, `zone_id` y `zone` deben permanecer `NULL`. El municipio aterriza directamente en `admin3_id` bajo la CCDR PT-20 / PT-30 (saltando el nivel `zone`).

Esta excepción es estructuralmente idéntica al patrón ya reconocido en §1 para CH/AT/DE/BE/AR/CN/EG/ID/RU/IL/MM (region_eq_zone o casos huérfanos de provincia). Para PT NO se promueve `region_eq_zone=sí` global — la excepción aplica **solo a las dos RA insulares**, no al continente.

**Forma final esperada por POI insular:**

```
country_id      = PT
region_id       = PT-20 (Açores) | PT-30 (Madeira)   -- CCDR canónica
zone_id         = NULL                                -- excepción insular: no hay Distrito
admin3_id       = <concelho canónico hijo de PT-20/PT-30>
locality_id     = <freguesia> (cuando exista) o NULL
sublocality_id  = preservado / NULL
```

---

## 1. Estado canónico actual de PT-20 y PT-30

| iso | name | id | depth | is_placeholder | parent | path |
|---|---|---|---:|:---:|---|---|
| PT-20 | Açores | `ee871f7d-978f-4a6c-a314-92356fca7d93` | 2 | false | PT | `Europa→PT→Açores` |
| PT-30 | Madeira | `a0553c22-733b-4eea-a0ef-589b59cd0ef0` | 2 | false | PT | `Europa→PT→Madeira` |

**Hijos canónicos actuales:**

| ccdr | hijos d=2 colgando | comentario |
|---|---|---|
| PT-20 | `Açores` (d=2, placeholder), `São Miguel` (d=2, no placeholder, 0 POIs), `Vila Franca Do Campo` (d=2, no placeholder, 0 POIs) | ruido. Ningún concelho canónico cuelga aquí. |
| PT-30 | `Madeira` (d=2, placeholder) | ningún concelho canónico cuelga aquí. |

→ **Las dos CCDR insulares no tienen concelhos hijos canónicos.** Toda la jerarquía insular real vive en otro lado (placeholders + concelhos sembrados a depth 5).

---

## 2. Inventario de POIs insulares (universo objetivo)

Dos universos detectados:

| método | n POIs | descripción |
|---|---:|---|
| Por ancestría d=5 a un concelho isla conocido | **40** | POIs que ya tienen un concelho canónico isla en `admin3_id` o `locality_id` (con `d=5` bajo placeholder) |
| Por bbox (Açores ~36.8–39.9N / −31.5–−24.5W, Madeira ~32.3–33.2N / −17.4–−16.2W) y `country_code='PT'` | **36** | 23 Açores + 13 Madeira |
| Intersección | 26 | |
| Solo ancestría (sin bbox) | 14 | candidato a revisión coords / posible POI fuera de isla |
| Solo bbox (sin ancestría a concelho isla) | 10 | 9 con region NULL + 1 borde |

**Universo unión ≈ 50 POIs**, conservador: aplicar P2 **estrictamente al subconjunto ancestría d=5** (40 POIs) — son los que tienen evidencia catalogada inequívoca de pertenecer a un concelho isla concreto. Los 10 "solo bbox" se difieren a `T2.3-L1-PT-coords` (Nominatim).

### 2.1 Distribución actual del universo bbox (36 POIs)

| target_ccdr | region actual | zone actual | admin3 actual | locality actual | n |
|---|---|---|---|---|---:|
| PT-20 | (NULL) | (NULL) | (NULL) | (NULL) | 6 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Ponta Delgada d=5 | 5 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Angra do Heroísmo d=5 | 3 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Povoação d=5 | 2 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Velas d=5 | 1 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Vila Franca do Campo d=5 | 1 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | Santa Cruz da Graciosa d=4 | (NULL) | 1 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | Vila do Porto d=4 | Santa Bárbara d=5 | 1 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Calheta d=5 | 1 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Lajes do Pico d=5 | 1 |
| PT-20 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Ribeira Grande d=5 | 1 |
| PT-30 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Funchal d=5 | 4 |
| PT-30 | (NULL) | (NULL) | (NULL) | (NULL) | 3 |
| PT-30 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Porto Moniz d=5 | 2 |
| PT-30 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Santana d=5 | 1 |
| PT-30 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Machico d=5 | 1 |
| PT-30 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Câmara de Lobos d=5 | 1 |
| PT-30 | `(sin región)` d=2 ph | `(sin región)` d=3 | `(sin comarca)` d=4 | Calheta d=5 | 1 |

**Resumen:**
- 0 POIs ya en CCDR canónica (`region_id` = PT-20 o PT-30).
- 27 POIs con `region_id` apuntando al placeholder `(sin región)` d=2.
- 9 POIs con `region_id` NULL.
- 27 POIs con `zone_id` apuntando al placeholder `(sin región)` d=3.
- 27 POIs con `admin3_id` apuntando a `(sin comarca)` d=4 o similar placeholder.
- 26 POIs con `locality_id` apuntando a un concelho canónico isla a d=5.

---

## 3. Catálogo de concelhos isla existentes (a d=5, bajo placeholder)

| concelho | id (d=5) | CCDR objetivo | n_pois locality_id |
|---|---|---|---:|
| Angra do Heroísmo | `9ff3cfca-d9b0-4513-a651-3dc2988802f7` | PT-20 | 3 |
| Calheta (RA Madeira) | `596b8e70-4ea2-44bc-a678-dd1ea0119b02` | PT-30 | 2 |
| Câmara de Lobos | `0e6bab65-734b-43a2-a6d0-3ce16ff129bb` | PT-30 | 1 |
| Funchal | `6438b2c0-2505-4a07-add0-459cd16d2a9a` | PT-30 | 4 |
| Lajes do Pico | `3c3dd862-7211-4663-879f-f4533cea997d` | PT-20 | 1 |
| Machico | `50db5861-b99d-4297-90ef-47cf949933f0` | PT-30 | 1 |
| Madalena (Pico) | `c18ffee8-8dc3-4ee8-9565-3911816fbeb3` | PT-20 | 14 |
| Ponta Delgada | `3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557` | PT-20 | 5 |
| Porto Moniz | `49df8bf0-2099-42f4-bcbb-9e013226b584` | PT-30 | 2 |
| Povoação | `e28d5fef-2f8e-49f0-8854-0447104eb896` | PT-20 | 2 |
| Ribeira Grande | `572c2b43-cabb-41d5-b3a2-06e152303d1d` | PT-20 | 1 |
| Santana | `849c8814-8d84-4b98-80ac-97db2a31daf4` | PT-30 | 1 |
| Velas | `54cea6f2-d96b-40cb-9dd5-a7d44168be0d` | PT-20 | 1 |
| Vila Franca do Campo | `ff077b8a-869c-4ad9-8c51-739005f4a550` | PT-20 | 1 |
| Vila do Porto | `2ccad713-4ef4-4288-8f53-f23a8203abcb` (d=4) | PT-20 | 1 |
| Angra do Heroísmo (d=5 dup) | `20a4b502-efbc-4ed2-973e-88c3b2174777` | PT-20 | 0 |

→ **Existen 16 nodos concelho isla en el catálogo** (15 con POIs + 1 duplicado vacío). Todos cuelgan de placeholders `(sin comarca)` / `(sin región)`, **no de la CCDR canónica**.

También existen 9 huellas concelho a d=2 (`Funchal`, `Ponta Delgada`, `Angra do Heroísmo`, `Machico`, `Calheta`, `Porto Moniz`, `Povoação`, `Câmara de Lobos`, etc.) **ya marcadas `is_placeholder=true` por P1** — son el espejo muerto desactivado y NO deben usarse como destino.

---

## 4. Propuesta canónica de reparación (NO EJECUTAR)

### 4.1 Sobre `admin_areas` — reparenting de concelhos isla a CCDR

Para cada concelho isla d=5 listado en §3:

| campo | acción propuesta |
|---|---|
| `parent_id` | UPDATE → CCDR objetivo (`ee871f7d…` PT-20 o `a0553c22…` PT-30) |
| `depth` | UPDATE → `3` (era 5; al saltarse zone y reparentar a d=2, el hijo directo de CCDR queda a d=3 según convención `depth = parent.depth + 1`) |
| `path` | RECOMPUTAR = `[Europa, PT, CCDR]` + `[concelho]` (3 ancestros + self) |
| `name` | sin cambios |
| `iso_code` / `aliases` / `is_placeholder=false` | sin cambios |

**Pero el plan P1 prohibió "reparent" y "recomputar path"** porque el alcance era estrictamente la fase de desactivación. **Este P2 sí requiere reparent + path recompute** explícitamente; es su objeto, no un side-effect.

Filas de catálogo afectadas: **~16** (los concelhos d=5/d=4 con POIs + el dup vacío para mantener consistencia).

Freguesias (d=6) bajo Madalena (ej. `São Miguel` d=6) heredarían recálculo de `path` automáticamente si se hace en cascade SQL recursivo; queda para fase siguiente.

### 4.2 Sobre `locations` — re-FK al canon

Para los **40 POIs vía ancestría d=5** (universo conservador):

| campo | acción propuesta |
|---|---|
| `region_id` | UPDATE → CCDR objetivo (PT-20 o PT-30) según concelho hijo |
| `zone_id` | UPDATE → **NULL** (excepción insular §0) |
| `admin3_id` | UPDATE → id del concelho canónico (el reparented de §4.1) |
| `locality_id` | preservar si existe freguesia, NULL si lo único era el concelho |
| `sublocality_id` | preservar |
| `country_id`, `country_code` | sin cambios |
| `raw_geocode`, `geo_*`, `enriched_data`, `tags`, colecciones, media, `name`, coords | **sin cambios** |

Nota sobre `zone_id`: el canon §0.1 lo exige NULL. Si algún POI tenía `zone_id` apuntando al placeholder `(sin región)` d=3, **debe quedar NULL** tras P2 — no preservarse — porque preservar el placeholder reintroduce ruido en GeographyTree.

### 4.3 Lo que NO toca P2

- Los 10 POIs "solo bbox" con `region_id` NULL → diferidos a `T2.3-L1-PT-coords` (necesitan reverse geocoding).
- Los 14 POIs "solo ancestría" sin bbox → diferidos a auditoría de coords (posible POI fuera de isla o coords mal seteadas).
- Concelhos d=2 ya marcados `is_placeholder=true` por P1 → permanecen así. NO se reparentan (son el espejo muerto destinado a `T-CATALOG-PT-DISTRICTS-CLEANUP`).
- Placeholders `(sin región)` d=2/d=3 y `(sin comarca)` d=4 → permanecen. Su drenado total requiere completar L1-PT-coords + revisión continental.
- Continente PT → invariante.

---

## 5. Estructura final esperada

Después de P2:

```
Europa
└── Portugal (d=1)
    ├── PT-01 Norte (d=2)        … continente, sin cambios
    ├── PT-02 Centro (d=2)       … continente, sin cambios
    ├── PT-03 Lisboa (d=2)       … continente, sin cambios
    ├── PT-04 Alentejo (d=2)     … continente, sin cambios
    ├── PT-05 Algarve (d=2)      … continente, sin cambios
    ├── PT-20 Açores (d=2)
    │   ├── Angra do Heroísmo (d=3, ex d=5)
    │   ├── Ponta Delgada (d=3, ex d=5)
    │   ├── Vila Franca do Campo (d=3, ex d=5)
    │   ├── Povoação (d=3, ex d=5)
    │   ├── Ribeira Grande (d=3, ex d=5)
    │   ├── Lajes do Pico (d=3, ex d=5)
    │   ├── Madalena (d=3, ex d=5)
    │   ├── Velas (d=3, ex d=5)
    │   └── Vila do Porto (d=3, ex d=4)
    ├── PT-30 Madeira (d=2)
    │   ├── Funchal (d=3, ex d=5)
    │   ├── Câmara de Lobos (d=3, ex d=5)
    │   ├── Calheta (d=3, ex d=5)
    │   ├── Machico (d=3, ex d=5)
    │   ├── Porto Moniz (d=3, ex d=5)
    │   └── Santana (d=3, ex d=5)
    └── (sin región) (d=2, placeholder, drenado por L1-PT-coords)
```

**Invariantes:**
- `zone` queda implícito NULL para todo POI bajo PT-20/PT-30. Excepción insular única.
- Continente PT: regla canónica region→zone→admin3→locality intacta.
- `is_placeholder=false` solo en CCDR §1.A + concelhos isla reparented. El resto (espejo muerto + placeholders) sigue como está.

---

## 6. Rollback (cuando se ejecute, no ahora)

### Snapshot mínimo (recomendado)

```sql
CREATE TABLE public._catalog_pt_ra_concelhos_snapshot_TBD AS
SELECT id, parent_id, depth, path, is_placeholder, updated_at
FROM public.admin_areas
WHERE id IN (<lista 16 concelhos isla>);

CREATE TABLE public._locations_ra_concelhos_snapshot_TBD AS
SELECT id, region_id, zone_id, admin3_id, locality_id, sublocality_id, updated_at
FROM public.locations
WHERE id IN (<universo 40 POIs ancestría d=5>);
```

### Rollback

```sql
-- catálogo
UPDATE public.admin_areas a
SET parent_id=s.parent_id, depth=s.depth, path=s.path,
    is_placeholder=s.is_placeholder, updated_at=s.updated_at
FROM public._catalog_pt_ra_concelhos_snapshot_TBD s WHERE a.id=s.id;
-- locations
UPDATE public.locations l
SET region_id=s.region_id, zone_id=s.zone_id, admin3_id=s.admin3_id,
    locality_id=s.locality_id, sublocality_id=s.sublocality_id, updated_at=s.updated_at
FROM public._locations_ra_concelhos_snapshot_TBD s WHERE l.id=s.id;
```

---

## 7. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Reparentar concelhos d=5 → d=3 invalida `path` denormalizado en hijos d=6+ (ej. `São Miguel` d=6 bajo `Madalena`) | Recalcular `path` recursivo en la misma transacción o anotar limitación y aceptar que freguesias siguen colgando consistentes por `parent_id` |
| R2 | Algún concelho tenga POIs en `admin3_id` ya correctos (no detectados aquí) y P2 los altere | El UPDATE de `locations.admin3_id` SOLO se aplica al subconjunto que viene del placeholder. Filtro `WHERE admin3_id IN (<placeholders>) OR admin3_id IN (<concelhos d=5 a reparentar>)` antes del UPDATE |
| R3 | Universo bbox subestima POIs (10 POIs `region_id` NULL no se tocan en P2) | Aceptado: difieren a L1-PT-coords. Documentado §4.3 |
| R4 | Universo ancestría sobreestima (14 POIs fuera de bbox apuntan a concelho isla) | Cross-check coords antes de UPDATE; si `dist(POI, centroid_concelho) > 50 km` → preserve + flag review |
| R5 | Excepción insular `zone=NULL` rompe validadores cliente que asumen PT⇒zone obligatorio | Auditar `resolveAllFks()` y `v_locations_resolved` antes de ejecutar. Out of scope dry-run |
| R6 | `is_placeholder=false` en concelho reparented sin freguesias hijo → puede aparecer como hoja con muy pocos POIs | Aceptado. Es la realidad insular. La sidebar lo mostrará bajo CCDR insular |
| R7 | Doble nodo `Angra do Heroísmo` d=5 (uno con 3 POIs, otro con 0) y otros dups en d=3/d=4/d=5 | Plan elige UN id canónico por concelho (el más poblado) y marca los otros `is_placeholder=true`. Tabla §3 ya selecciona el id activo |

---

## 8. Impacto en GeographyTree

**Antes (post-P1):**
- Bajo PT: 7 CCDR + 1 placeholder `(sin región)`. PT-20 y PT-30 aparecen vacíos (0 POIs directos).
- POIs insulares colgando bajo `(sin región)` → indistinguibles del continente sin región.

**Después (post-P2):**
- Bajo PT-20 Açores: 9 concelhos canónicos como hijos, con sus POIs.
- Bajo PT-30 Madeira: 6 concelhos canónicos como hijos, con sus POIs.
- `(sin región)` reduce su carga ~36–40 POIs.
- Si la UI agrupa por `zone_id`, los POIs insulares aparecerán bajo "Sin distrito" → render canónico de la excepción insular. La UI debería detectar `region.iso_code IN ('PT-20','PT-30')` y omitir el nivel zone.

---

## 9. Impacto en POI-N (curation levels)

- **Ninguno por construcción.** `geo_health` se recalcula igual si los FK pasan de placeholder→CCDR canónica (mejora típica: `partial → ok`).
- `health rings` que dependan de "región placeholder" desaparecerán para los 27 POIs hoy con `region_id` placeholder → mejora visible en mapa.
- `isPointEnriched(loc)` no se ve afectado (depende solo de `enriched_data.descripcion`).
- `shareability` no cambia (depende de POI-9/10).
- `getPointVisualState(loc)` invariante.

---

## 10. Pendiente fuera de P2

| ID | Alcance | Bloqueado por |
|---|---|---|
| `T2.3-L1-PT-coords` | 10 POIs insulares con `region_id` NULL (solo bbox) + 65 POIs continente PT con region placeholder | Tabla de alias L1-PT dry-run ratificada + Nominatim aprobado |
| `T-CATALOG-PT-DISTRICTS-CLEANUP` | DELETE de los 34 nodos d=2 marcados placeholder por P1 + concelhos isla d=2 ya placeholder | Ventana de validación 30 días sobre P1 |
| `T-CATALOG-PT-FREGUESIAS` | Auditar freguesias d=6 bajo concelhos reparented + reparent de hijos | Tras P2 ejecutado |
| `T-CATALOG-PT-FOREIGN-LEAK` | Fuga FR en subárbol PT (`Loir y Cher`, `Indre`, etc.) | Identificación origen del bug de import |
| `T-CATALOG-CANON-EXCEPCION-INSULAR` (memoria) | Actualizar `territorial-equivalence-canon.md` §3 con excepción RA PT (zone NULL) + extender espejo Deno | Aprobación P2 antes de ejecutar |

---

## 11. Recomendación

1. **Ratificar §0 (excepción insular: `zone=NULL` para PT-20/PT-30)** como contrato canónico.
2. **Aprobar el alcance §4 (reparenting de 16 concelhos isla + re-FK de 40 POIs)** como fase única `T-CATALOG-PT-RA-CONCELHOS` separada de cualquier otra (P3 placeholder, P4 fuga FR, L1-PT-coords).
3. Antes de ejecutar: añadir snapshots §6, validar dup id por concelho §7-R7, cross-check coords §7-R4, auditar consumidores `zone_id` PT §7-R5.
4. NO mezclar con Nominatim. Este sub-lote es **catalog-only + re-FK determinista**, sin llamadas externas.
