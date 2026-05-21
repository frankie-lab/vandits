# T-CATALOG-PT-DISTRICTS — Plan de reparación del catálogo `admin_areas` PT

**Estado:** plan. **No ejecuta nada.** Sin UPDATE / INSERT / DELETE. No toca `locations`. No Nominatim. No re-enrich. No código. No bump.

**Referencias:**
- `docs/audits/t2-3-l1-pt-catalog-dedup-dry-run.md` (catálogo PT depth=2)
- `docs/audits/t2-3-l1-pt-pre-postflight.md` (motivo de este plan: parent-chain pure no resuelve por desconexión catalógica)
- `docs/contracts/territorial-equivalence-canon.md` fila #6 (PT: region=CCDR, zone=Distrito, admin3=Concelho, locality=Freguesia)

---

## 0. Hallazgo principal (re-auditoría)

El dry-run inicial era **incompleto**. La inspección real del subárbol PT (`'cb47a8fd…' = ANY(path)`) revela que **la jerarquía canónica PT → CCDR(d=2) → Distrito(d=3) → Concelho(d=4..5) → Freguesia(d≥5) YA EXISTE y está EN USO** para la mayor parte de los POIs PT. El problema NO es ausencia de jerarquía; es que **coexiste con un "espejo muerto" a depth=2** que captura los CCDR placeholders, los distritos sin parent CCDR, los concelhos isla mal sembrados y las duplicaciones textuales.

### Inventario por capa (POIs referenciando cada nodo en cualquier campo geo)

| depth | placeholder? | nodos | POIs total |
|---:|:---:|---:|---:|
| 1 (PT) | no | 1 | 315 |
| 2 (real CCDR + ruido) | no | 41 | 221 |
| 2 | sí | 1 | 29 |
| 3 (distritos reales bajo CCDR + dups) | no | 130 | 223 |
| 3 | sí | 5 | 27 |
| 4 | no | 134 | 22 |
| 4 | sí | 23 | 220 |
| 5 (concelhos/freguesias reales) | no | 202 | 207 |
| 5 | sí | 25 | 33 |
| 6 | no | 123 | 109 |

### Top nodos depth=2 con POIs

| name | iso | placeholder | n_pois | rol canónico |
|---|---|:---:|---:|---|
| **Lisboa** | PT-03 | no | **66** | CCDR §1.A — OK |
| **Norte** | PT-01 | no | **54** | CCDR §1.A — OK |
| **Centro** | PT-02 | no | **52** | CCDR §1.A — OK |
| **(sin región)** | — | **sí** | **29** | placeholder cbeeecd6, drenar |
| **Algarve** | PT-05 | no | **26** | CCDR §1.A — OK |
| **Alentejo** | PT-04 | no | **23** | CCDR §1.A — OK |
| **Açores** | PT-20 | no | **0** | CCDR §1.A — sin POIs (isla huérfana) |
| **Madeira** | PT-30 | no | **0** | CCDR §1.A — sin POIs (isla huérfana) |
| 18 distritos d=2 (Faro, Coimbra, Porto, …) | PT-06..PT-18 | no | **0 cada uno** | ESPEJO MUERTO |
| 9 concelhos d=2 (Funchal, Ponta Delgada, …) | — | no | **0 cada uno** | mal sembrados, dups en d=5 |
| 5 dups textuales (Lisbon, Lisbo, Coimbra District, Región Norte, Región Autónoma de Madeira) | — | no | **0 cada uno** | ESPEJO MUERTO |

### Top nodos depth=3 con POIs (los REALES, bien parentados)

Estos nodos d=3 ya están enganchados a la CCDR correcta y son los que el motor de filtrado de POIs usa de facto:

| name d=3 | parent name d=2 | parent iso | n_pois |
|---|---|---|---:|
| Lisboa | Lisboa | PT-03 | 52 |
| Oporto | Norte | PT-01 | 28 |
| (sin región) | (sin región) | — | 27 |
| Faro | Algarve | PT-05 | 26 |
| Leiria | Centro | PT-02 | 15 |
| Guarda | Centro | PT-02 | 13 |
| Évora | Alentejo | PT-04 | 12 |
| Braga | Norte | PT-01 | 11 |
| Coímbra | Centro | PT-02 | 10 |
| Viana do Castelo | Norte | PT-01 | 9 |
| Portalegre | Alentejo | PT-04 | 8 |
| Setúbal | Lisboa | PT-03 | 7 |
| Castelo Branco | Centro | PT-02 | 7 |
| Santarém | Lisboa | PT-03 | 7 |
| Aveiro | Centro | PT-02 | 4 |
| Vila Real | Norte | PT-01 | 4 |
| Viseu | Centro | PT-02 | 3 |
| Beja | Alentejo | PT-04 | 3 |
| Bragança | Norte | PT-01 | 2 |
| Braga | (sin región) | — | 1 |
| Oporto | (sin región) | — | 1 |

**217 POIs (de 250)** usan distrito d=3 bajo CCDR correcta. **2 POIs** usan distrito d=3 bajo placeholder. **31 POIs** usan otro distrito d=3 (Madeira/Açores) bajo placeholder.

### Conclusión del hallazgo

1. **Las 7 CCDR §1.A funcionan canónicamente en continente PT.** No hay deuda real para Lisboa/Norte/Centro/Algarve/Alentejo en cuanto a jerarquía: distritos d=3 cuelgan correctamente, POIs referencian correctamente.
2. **El problema real son 4 sub-problemas independientes:**
   - **P1. Espejo muerto d=2** (32 nodos sin POIs: 18 distritos + 9 concelhos + 5 dups). Estructuralmente inertes.
   - **P2. Açores PT-20 y Madeira PT-30 huérfanas:** no tienen distritos hijo (no aplica canon — RA no tiene distrito) ni concelhos hijo. Sus POIs (~31) cuelgan vía `(sin región)` d=2 → `(sin región)` d=3 → `(sin comarca)` d=4 → `<concelho>` d=5.
   - **P3. Placeholder d=2 cbeeecd6 `(sin región)`** captura 29 POIs como `region_id` directo + transitivamente 31 POIs isla.
   - **P4. Contaminación internacional**: nodos como `Loir y Cher`, `Indre y Loira`, `Eure-y-Loir`, `Cher`, `Loiret`, `Indre` aparecen en el subárbol PT por bug de import. Out of scope T-CATALOG-PT.

---

## 1. Las 7 CCDR canónicas — estado y acción

| iso | name | id | parent_id actual | path actual | depth | acción |
|---|---|---|---|---|---:|---|
| PT-01 | Norte | `0e0cd77d-…` | `cb47a8fd-…` (PT) | `Europa→PT→Norte` | 2 | **ninguna** (correcto) |
| PT-02 | Centro | `969ee249-…` | `cb47a8fd-…` (PT) | `Europa→PT→Centro` | 2 | **ninguna** (correcto) |
| PT-03 | Lisboa | `9574cd33-…` | `cb47a8fd-…` (PT) | `Europa→PT→Lisboa` | 2 | **ninguna** (correcto) |
| PT-04 | Alentejo | `c568ed08-…` | `cb47a8fd-…` (PT) | `Europa→PT→Alentejo` | 2 | **ninguna** (correcto) |
| PT-05 | Algarve | `1dab62f3-…` | `cb47a8fd-…` (PT) | `Europa→PT→Algarve` | 2 | **ninguna** (correcto) |
| PT-20 | Açores | `ee871f7d-…` | `cb47a8fd-…` (PT) | `Europa→PT→Açores` | 2 | **ninguna** (correcto a nivel CCDR; tiene 0 hijos canónicos) |
| PT-30 | Madeira | `a0553c22-…` | `cb47a8fd-…` (PT) | `Europa→PT→Madeira` | 2 | **ninguna** (correcto a nivel CCDR; tiene 0 hijos canónicos) |

Las 7 CCDR son **estructuralmente correctas**. No requieren UPDATE.

---

## 2. Los 18 distritos portugueses reales (NUTS-III) — estado y acción

Los 18 distritos están **duplicados en dos capas**:

### Capa A — `iso-seed` a depth=2 (ESPEJO MUERTO)

| name | iso | id | parent_id | n_pois directos | rol |
|---|---|---|---|---:|---|
| Faro | PT-08 | `4dd40b05-…` | PT | 0 | huérfano (canon: hijo de PT-05 Algarve) |
| Coimbra | PT-06 | `d03410fd-…` | PT | 0 | huérfano (canon: hijo de PT-02 Centro) |
| Évora | PT-07 | `2024b15b-…` | PT | 0 | huérfano (canon: hijo de PT-04 Alentejo) |
| Guarda | PT-09 | `bd8a2101-…` | PT | 0 | huérfano (canon: hijo de PT-02 Centro) |
| Leiria | PT-10 | `366b6044-…` | PT | 0 | huérfano (canon: hijo de PT-02 Centro) |
| Portalegre | PT-12 | `7ae84830-…` | PT | 0 | huérfano (canon: hijo de PT-04 Alentejo) |
| Porto | PT-13 | `dbca7207-…` | PT | 0 | huérfano (canon: hijo de PT-01 Norte) |
| Santarém | PT-14 | `74c642df-…` | PT | 0 | huérfano (canon: hijo de PT-03 Lisboa) |
| Setúbal | PT-15 | `7e4d2551-…` | PT | 0 | huérfano (canon: hijo de PT-03 Lisboa) |
| Viana do Castelo | PT-16 | `aaf15712-…` | PT | 0 | huérfano (canon: hijo de PT-01 Norte) |
| Vila Real | PT-17 | `2d57fba6-…` | PT | 0 | huérfano (canon: hijo de PT-01 Norte) |
| Viseu | PT-18 | `e9ee4724-…` | PT | 0 | huérfano (canon: hijo de PT-02 Centro) |
| Aveiro | — | `f2ecab5b-…` | PT | 0 | huérfano sin iso (canon: hijo de PT-02 Centro) |
| Beja | — | `b56b3c2d-…` | PT | 0 | huérfano sin iso (canon: hijo de PT-04 Alentejo) |
| Braga | — | `188d3579-…` | PT | 0 | huérfano sin iso (canon: hijo de PT-01 Norte) |
| Bragança | — | `17d116c9-…` | PT | 0 | huérfano sin iso (canon: hijo de PT-01 Norte) |
| Castelo Branco | — | `90c02cd1-…` | PT | 0 | huérfano sin iso (canon: hijo de PT-02 Centro) |

### Capa B — distritos d=3 con parent CCDR (LOS REALES, EN USO)

Mismos nombres a depth=3 con parent CCDR correcto y POIs referenciándolos (217 POIs entre todos). Estos son los que el motor usa.

### Acción propuesta para los 17 distritos d=2 (Capa A)

**Opción 1 (recomendada para T-CATALOG-PT-DISTRICTS): marcar como placeholder y desactivar.**

Se rellenaría `is_placeholder=true` para los 17 huérfanos d=2. **No se reparenta**, no se borra, no se mueve. El parent sigue siendo PT. El path se mantiene. El cliente debería filtrar `is_placeholder=true` al elegir destinos. Lossless: ningún POI los referencia.

**Opción 2 (más limpia, mayor scope): DELETE en una fase posterior.**

Borrado de los 17 huérfanos d=2. Requiere confirmar `n_pois=0` y ausencia de FK externas (no hay FK declarada en `locations` hacia `admin_areas`). Queda **fuera del alcance de este plan** (este plan prohíbe DELETE). Se documenta para `T-CATALOG-PT-DISTRICTS-CLEANUP`.

**No procede reparentarlos a CCDR d=2→d=3**, porque ya existe el mismo distrito en d=3 (Capa B) con POIs. Sería duplicación dura.

---

## 3. Concelhos mal clasificados a depth=2 — estado y acción

9 concelhos isla (Açores/Madeira) sembrados a depth=2 con parent PT, todos con `n_pois=0`:

| name | id | dups en otras depth (con POIs) |
|---|---|---|
| Angra do Heroísmo | `6cfc3ede-…` | d=5 `9ff3cfca-…` con 3 POIs |
| Calheta | `dc2000ce-…` | d=5 `596b8e70-…` con 2 POIs |
| Funchal | `c3943135-…` | d=5 `6438b2c0-…` con 4 POIs |
| Machico | `d95b18bc-…` | d=5 `50db5861-…` con 1 POI |
| Ponta Delgada | `9f738838-…` | d=5 `3aaa13b7-…` con 5 POIs |
| Porto Moniz | `0b920b00-…` | d=5 `49df8bf0-…` con 2 POIs |
| Povoação | `9173c6e9-…` | d=5 `e28d5fef-…` con 2 POIs |
| Arouca | `16145488-…` | (sin dup confirmado) |
| Ourém | `ea2258c1-…` | (sin dup confirmado) |

**Acción T-CATALOG-PT-DISTRICTS:** marcar `is_placeholder=true` (igual que distritos d=2). Los concelhos isla "reales" viven en d=5 bajo `(sin comarca)` → `(sin región)` placeholders. **NO reparentar** desde aquí: hay ambigüedad de canon para RA (las islas no tienen distrito intermedio formal NUTS-III; el canon PT marca `zone=Distrito` pero RA Açores/Madeira no tienen distrito).

La reasignación correcta de Açores/Madeira (P2 + concelhos d=5 → reparentar bajo PT-20/PT-30) requiere **decisión canónica explícita** sobre si:
- (a) saltar nivel `zone` (RA sin distrito) y enganchar concelho d=? directo a CCDR, o
- (b) crear capas sintéticas `RA Açores - Distrito` para mantener el invariant `region→zone→admin3→locality`.

Queda **fuera del alcance** y se anota como `T-CATALOG-PT-RA-CONCELHOS`.

---

## 4. Placeholders — estado y acción

### Inventario

| id | name | depth | parent | n_pois directos | n_hijos | acción |
|---|---|---:|---|---:|---:|---|
| `cbeeecd6-…` | `(sin región)` | 2 | PT | 29 (region_id) | 6 | **drenar** (objetivo: 0 POIs) |
| `b50666f4-…` | `(sin región)` | 3 | `cbeeecd6-…` | 27 (region_id) | 4 | drenar |
| `2dea768c-…` | `(sin comarca)` | 4 | `b50666f4-…` | ? | muchos | drenar (transitivo) |
| `cd8cc23b-…` | `(sin comarca)` | 4 | `da6059a5-…` Oporto d=3 | ? | varios | drenar (transitivo) |
| `acd00460-…` | `(sin comarca)` | 4 | `55b38c31-…` Braga d=3 | ? | varios | drenar (transitivo) |
| + 18 placeholders más a d≥3 | — | — | — | — | — | dejar (no son destino canónico) |

### Acción T-CATALOG-PT-DISTRICTS

**Ninguna sobre placeholders directamente.** No se reparentan, no se borran. La regla operativa es:

1. Cualquier UPDATE futuro de `locations.region_id` debe usar exclusivamente las 7 CCDR §1.A.
2. Cuando los 29+ POIs que referencian placeholders sean migrados a CCDR canónica (vía L1-PT-coords + Nominatim, FUERA de este plan), los placeholders quedarán con `n_pois=0` y podrán ser purgados en un follow-up `T-CATALOG-PT-PLACEHOLDERS-CLEANUP`.
3. Mientras tanto, **marcar también `is_placeholder=true`** todos los nodos `(sin región)` / `(sin comarca)` que aún no lo tengan, para garantizar que el cliente los filtre como destinos elegibles.

---

## 5. Propuesta de UPDATE — alcance mínimo aprobable

**Único cambio:** marcar `is_placeholder=true` en 17 distritos d=2 huérfanos + 9 concelhos d=2 huérfanos + 5 duplicados textuales d=2 (Lisbon, Lisbo, Coimbra District, Évora District, Guarda District, Porto District, Región Norte, Región Autónoma de Madeira — actualizar conteo a 8 dups). Total: **34 filas** con UPDATE de UNA columna.

### SQL propuesto (NO EJECUTAR)

```sql
-- T-CATALOG-PT-DISTRICTS — fase 1: desactivar espejo muerto d=2
-- Snapshot previo recomendado en una tabla aparte t_catalog_pt_districts_snapshot
-- (no en location_geo_provenance, que es de POIs).

UPDATE public.admin_areas
SET is_placeholder = true,
    updated_at = now()
WHERE depth = 2
  AND parent_id = 'cb47a8fd-fe71-48b3-81fd-7b1047260149'  -- PT
  AND is_placeholder = false
  AND id NOT IN (
    '0e0cd77d-36ee-4caf-a022-708ed2d109ef', -- Norte PT-01
    '969ee249-484e-452a-9402-f26df5a0ae4e', -- Centro PT-02
    '9574cd33-65ad-4e25-943b-ac4bcf46fdfb', -- Lisboa PT-03
    'c568ed08-f88b-4f45-b17f-7f0a32ed3a8e', -- Alentejo PT-04
    '1dab62f3-e593-4c81-b911-10d251f44de9', -- Algarve PT-05
    'ee871f7d-978f-4a6c-a314-92356fca7d93', -- Açores PT-20
    'a0553c22-733b-4eea-a0ef-589b59cd0ef0'  -- Madeira PT-30
  )
  -- Defensa adicional: nunca tocar nodos con POIs referenciándolos
  AND id NOT IN (
    SELECT DISTINCT a.id
    FROM admin_areas a
    JOIN locations l ON
         l.region_id    = a.id
      OR l.zone_id      = a.id
      OR l.admin3_id    = a.id
      OR l.locality_id  = a.id
      OR l.sublocality_id = a.id
      OR l.country_id   = a.id
      OR l.continent_id = a.id
  );
```

### Filas esperadas afectadas

≤ 34 (probablemente 32–34 según conteo exacto de dups en el momento de ejecución).

### Lo que NO se toca

- `parent_id`: sin cambios → no hay recálculo de `path`.
- `depth`: sin cambios.
- `name`, `iso_code`, `aliases`, `name_translations`: sin cambios.
- Las 7 CCDR §1.A: invariantes.
- Distritos d=3 reales (los EN USO): invariantes.
- Concelhos d=5 reales: invariantes.
- Placeholders existentes: invariantes (ya tienen `is_placeholder=true`).
- `locations`: **NADA**.

---

## 6. Rollback

### Estrategia A — snapshot tabla dedicada (recomendada)

Antes del UPDATE, crear y rellenar:

```sql
CREATE TABLE IF NOT EXISTS public._catalog_pt_districts_snapshot_2026_05_21 AS
SELECT id, is_placeholder, updated_at
FROM admin_areas
WHERE depth = 2
  AND parent_id = 'cb47a8fd-fe71-48b3-81fd-7b1047260149';
```

Rollback:

```sql
UPDATE public.admin_areas a
SET is_placeholder = s.is_placeholder,
    updated_at = s.updated_at
FROM public._catalog_pt_districts_snapshot_2026_05_21 s
WHERE a.id = s.id;
```

### Estrategia B — lista explícita

Si A no se crea, rollback alternativo: `UPDATE admin_areas SET is_placeholder=false WHERE id IN (<lista 34 IDs>)`.

---

## 7. Postflight esperado

Tras ejecutar la fase 1 (NO ahora):

1. **Las 7 CCDR §1.A siguen como únicas filas d=2 con `is_placeholder=false`** bajo PT.
2. **34 filas d=2** ahora con `is_placeholder=true` (espejo muerto desactivado).
3. **Distritos d=3 reales**: sin cambios. Siguen con 217 POIs canalizados correctamente.
4. **Placeholders `(sin región)` d=2 y d=3**: siguen como están, con sus POIs todavía colgando — su drenado requiere L1-PT-coords (Nominatim, fuera de alcance).
5. **POIs**: 0 cambios. `n_pois` por nodo invariante.
6. **GeographyTree cliente**: si filtra `is_placeholder=true` (comportamiento canónico), la sidebar PT deja de ver los 34 nodos basura y queda limpia con las 7 CCDR + placeholder `(sin región)` durante el período de transición.

### Cómo verificar postflight (SELECT-only)

```sql
-- (1) Las 7 CCDR son las únicas no-placeholder a d=2
SELECT iso_code, name FROM admin_areas
WHERE parent_id='cb47a8fd-fe71-48b3-81fd-7b1047260149' AND depth=2 AND is_placeholder=false
ORDER BY iso_code;
-- esperado: 7 filas (PT-01..PT-05, PT-20, PT-30)

-- (2) POIs PT en CCDR vs placeholder vs nada
SELECT
  count(*) FILTER (WHERE region_id IN ('0e0cd77d-…','969ee249-…','9574cd33-…','c568ed08-…','1dab62f3-…','ee871f7d-…','a0553c22-…')) AS in_ccdr,
  count(*) FILTER (WHERE region_id IN (SELECT id FROM admin_areas WHERE is_placeholder=true)) AS in_placeholder,
  count(*) FILTER (WHERE region_id IS NULL) AS null_region
FROM locations WHERE country_code='PT';
-- esperado idéntico a pre-flight (no toca POIs).
```

---

## 8. Fases fuera de este plan (documentadas, NO ejecutar)

| ID | Alcance | Bloqueado por |
|---|---|---|
| `T-CATALOG-PT-DISTRICTS-CLEANUP` | DELETE de los 34 nodos d=2 marcados placeholder, una vez validado N=0 POIs durante 30 días | Este plan completado + ventana de validación |
| `T-CATALOG-PT-RA-CONCELHOS` | Reparentar concelhos d=5 Açores/Madeira a PT-20/PT-30 (decidir si vía capa zone sintética o salto directo) | Decisión canónica explícita |
| `T2.3-L1-PT-coords` | Migrar los 65 + 29 POIs PT con region placeholder a CCDR §1.A vía Nominatim reverse | Tabla de alias §2 del dry-run ratificada |
| `T-CATALOG-PT-FOREIGN-LEAK` | Mover nodos `Loir y Cher`, `Indre`, `Cher`, `Loiret`, `Eure-y-Loir`, `Indre y Loira` del subárbol PT al subárbol FR | Identificación de origen del bug de import |

---

## 9. Riesgos detectados

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Cliente UI que NO filtre `is_placeholder=true` seguirá mostrando los 34 nodos muertos | Auditar consumidores de `admin_areas` antes de ejecutar (out of scope plan, in scope ejecución) |
| R2 | Algún POI que NO detectamos referencia uno de los 34 nodos → quedaría apuntando a un placeholder | Defensa en SQL: `id NOT IN (SELECT … JOIN locations …)`. Si aparece, queda excluido del UPDATE. |
| R3 | Que `aliases[]` de los CCDR §1.A no cubran todos los nombres distritos cuando se ejecute L1-PT-coords | Fuera de este plan; cubierto en dry-run §2 |
| R4 | Concelhos isla d=5 huérfanos seguirán colgando de placeholders tras este plan | Conocido y documentado en §3 + `T-CATALOG-PT-RA-CONCELHOS` |
| R5 | Snapshot no es FK-cascade-safe si en el futuro se añadiera FK | Crear snapshot dedicado §6 estrategia A |

---

## 10. Recomendación

1. **Ratificar §1 (las 7 CCDR §1.A están OK estructuralmente)** como base canónica PT.
2. **Aprobar el UPDATE mínimo de §5** (marcar `is_placeholder=true` en 34 filas d=2 huérfanas) como única fase ejecutable de T-CATALOG-PT-DISTRICTS.
3. **Diferir** `T-CATALOG-PT-DISTRICTS-CLEANUP` (DELETE), `T-CATALOG-PT-RA-CONCELHOS` (reparent islas) y `T-CATALOG-PT-FOREIGN-LEAK` (limpieza FR).
4. **No ejecutar `T2.3-L1-PT-coords`** hasta que (2) esté hecho — así el catálogo deja de tener dups d=2 visibles durante la pasada Nominatim.

---

**Estado del plan:** redactado. **0 cambios ejecutados.** **0 cambios en `locations`.** **0 cambios en código.** **0 cambios en `admin_areas`.** Pendiente de aprobación.
