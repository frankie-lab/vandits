# T2A — Portugal pilot post-flight (canon territorial)

**Fecha:** 2026-05-21 UTC
**Tipo:** Post-flight. Solo lectura + acta. **Sin** código, **sin** migraciones, **sin** datos tocados, **sin** bump, **sin** re-enrich.
**Lote:** T2.1 (`T2A-data`) según [`docs/audits/t2-territorial-canon-application-plan.md §5`](./t2-territorial-canon-application-plan.md).
**Referencias:**
- [`docs/contracts/territorial-equivalence-canon.md`](../contracts/territorial-equivalence-canon.md) §1 fila Portugal.
- [`docs/audits/t2a-portugal-pilot-dry-run.md`](./t2a-portugal-pilot-dry-run.md) (plan aprobado).
- [`docs/tech-debt.md`](../tech-debt.md) entrada T2A.

---

## 0. TL;DR

- **T2A-data aplicado** en una sola transacción idempotente.
- **223 POIs PT** remapeados desde `region_id = (sin región) placeholder` → CCDR canónica derivada de su `zone_id` (distrito).
- **18 distritos mainland** re-parenteados en `admin_areas` desde placeholder depth=2 → CCDR correspondiente (Norte, Centro, Lisboa, Alentejo, Algarve). `path[]` regenerado.
- **27 POIs residuales** preservados intactos (sin distrito real, siguen colgando del placeholder depth=2 / depth=3 hasta T2A-bis).
- **Rollback disponible** vía `location_geo_provenance WHERE source='t2-canon-lote-1-pt-pilot'` (223 filas snapshot del `region_id` original).
- **Validación visual:** `GeographyTree` ahora muestra `Portugal → CCDR → Distrito → Concelho → Freguesia`. Nodo `Portugal → (sin región) × 249` desapareció; quedan **27** bajo `(sin región)` (residual irreducible documentado).
- **Sin cambios de código**, **sin bump**, **sin re-enrich**. T2A-code (mirror canon TS/Deno) ya estaba en `1.3.13` desde el lote anterior; T2A-wire (consumo en `resolveAllFks`/`getLocationHierarchy`) sigue **pendiente** y se trata por separado.

---

## 1. Operación ejecutada

### 1.1 Snapshot de provenance (pre-UPDATE)

```sql
INSERT INTO location_geo_provenance
  (location_id, field_type, original_value, normalized_value, source, confidence, created_at)
SELECT l.id, 'region', l.region_id::text, NULL, 't2-canon-lote-1-pt-pilot', 100, now()
FROM locations l
WHERE l.country_code='PT'
  AND l.deleted_at IS NULL
  AND l.region_id = 'cbeeecd6-a4b8-4b06-ac15-c40532da63d7' -- placeholder (sin región)
  AND l.zone_id <> 'b50666f4-…'                            -- excluye 27 residuales sin distrito real
;
-- Filas insertadas: 223
```

### 1.2 Re-parent `admin_areas` (18 distritos)

| CCDR (depth=2, padre nuevo) | Distritos re-parenteados (depth=3) | Filas |
|---|---|---:|
| Norte `0e0cd77d-…` (PT-01) | Braga, Bragança, Oporto, Viana do Castelo, Vila Real | 5 |
| Centro `969ee249-…` (PT-02) | Aveiro, Castelo Branco, Coímbra, Guarda, Leiria, Viseu | 6 |
| Lisboa `9574cd33-…` (PT-03) | Lisboa, Santarém, Setúbal | 3 |
| Alentejo `c568ed08-…` (PT-04) | Beja, Évora, Portalegre | 3 |
| Algarve `1dab62f3-…` (PT-05) | Faro | 1 |
| **Total** | | **18** |

`path[]` regenerado para los 18 desde `[Europe, Portugal, (sin región), distrito]` → `[Europe, Portugal, CCDR, distrito]`.

### 1.3 Remap `locations.region_id` (223 POIs)

```sql
UPDATE locations l
SET region_id = m.ccdr_id, updated_at = now()
FROM (VALUES /* 18 (distrito_id, ccdr_id) */) AS m(distrito_id, ccdr_id)
WHERE l.country_code='PT'
  AND l.deleted_at IS NULL
  AND l.region_id = 'cbeeecd6-…'
  AND l.zone_id = m.distrito_id
;
-- Filas afectadas: 223
```

Distribución resultante por CCDR:

| CCDR | POIs |
|---|---:|
| Lisboa (PT-03) | 66 |
| Norte (PT-01) | 56 |
| Centro (PT-02) | 52 |
| Algarve (PT-05) | 26 |
| Alentejo (PT-04) | 23 |
| **Total reasignados** | **223** |
| `(sin región)` residual | 27 |
| **Total PT** | **250** |

---

## 2. Residuales preservados (27 POIs)

- Apuntan a `zone_id = b50666f4-…` = placeholder `(sin región)` depth=3.
- **No** tienen distrito real resoluble sin geocoder/IA.
- Quedan intactos: `region_id` sigue siendo placeholder depth=2, `zone_id` sigue siendo placeholder depth=3, breadcrumb se renderiza en cursiva silenciada (regla `/^\(sin /i`).
- **No** se promueven a `geo_health='partial'` en T2A. Quedan en backlog T2A-bis (segundo pase con resolución por coords).

---

## 3. Rollback

### 3.1 Datos

Procedimiento idempotente, sin pérdida:

```sql
BEGIN;

-- 3.1.a Revertir locations.region_id (223 filas)
UPDATE locations l
SET region_id = p.original_value::uuid, updated_at = now()
FROM location_geo_provenance p
WHERE p.location_id = l.id
  AND p.source = 't2-canon-lote-1-pt-pilot'
  AND p.field_type = 'region';

-- 3.1.b Revertir admin_areas.parent_id (18 distritos al placeholder depth=2)
UPDATE admin_areas
SET parent_id = 'cbeeecd6-a4b8-4b06-ac15-c40532da63d7'
WHERE id IN (
  /* 18 ids distritos PT mainland — ver dry-run §2 */
);

-- 3.1.c Regenerar path[] de los 18 distritos revertidos
-- (trigger o backfill; mismo step)

-- 3.1.d Opcional: limpiar snapshot de provenance del lote
DELETE FROM location_geo_provenance WHERE source='t2-canon-lote-1-pt-pilot';

COMMIT;
```

### 3.2 Catálogo

Snapshot implícito: el `parent_id` previo de los 18 distritos era uniformemente `cbeeecd6-…` (placeholder `(sin región)` depth=2). No requiere tabla de backup adicional.

### 3.3 Código

N/A en T2A-data. No se modificó código. Mirror canon `1.3.13` queda inerte (no consumido aún por `resolveAllFks`/`getLocationHierarchy` — eso es T2A-wire).

### 3.4 Kill-switch runtime

N/A en T2A-data. No hay flag de `app_settings` que activar/desactivar; el cambio es puramente datos.

---

## 4. Validación visual

### 4.1 GeographyTree — estado post-flight

```
Europe
└── Portugal (250)
    ├── Norte (56)
    │   ├── Oporto (29)
    │   ├── Braga (12)
    │   ├── Viana do Castelo (9)
    │   ├── Vila Real (4)
    │   └── Bragança (2)
    ├── Centro (52)
    │   ├── Leiria (15)
    │   ├── Guarda (13)
    │   ├── Coímbra (10)
    │   ├── Castelo Branco (7)
    │   ├── Aveiro (4)
    │   └── Viseu (3)
    ├── Lisboa (66)
    │   ├── Lisboa (52)
    │   ├── Santarém (7)
    │   └── Setúbal (7)
    ├── Alentejo (23)
    │   ├── Évora (12)
    │   ├── Portalegre (8)
    │   └── Beja (3)
    ├── Algarve (26)
    │   └── Faro (26)
    └── (sin región) (27)   ← residual T2A-bis
```

### 4.2 Checklist visual

- [x] `Portugal → (sin región) × 249` **ya no aparece**.
- [x] Aparecen 5 nodos CCDR canónicos (Norte, Centro, Lisboa, Alentejo, Algarve) con counts reales.
- [x] Cada CCDR cuelga de Portugal directamente.
- [x] Cada distrito mainland cuelga de su CCDR (no del placeholder).
- [x] Nodo `(sin región)` reducido de **249 → 27** (−89 %).
- [x] Concelhos y freguesias bajo distrito intactos (no se tocó `admin3_id` ni `locality_id`).
- [x] Breadcrumb de POI individual lee CCDR vía `regionResolved` (T1-fix ya cableado).

### 4.3 Verificación rápida (SELECT, sin escritura)

```sql
-- 0 esperado: ningún POI PT con region_id placeholder y zone_id distrito real
SELECT COUNT(*) FROM locations
WHERE country_code='PT' AND deleted_at IS NULL
  AND region_id='cbeeecd6-a4b8-4b06-ac15-c40532da63d7'
  AND zone_id <> 'b50666f4-…';

-- 27 esperado: residuales irreducibles
SELECT COUNT(*) FROM locations
WHERE country_code='PT' AND deleted_at IS NULL
  AND region_id='cbeeecd6-a4b8-4b06-ac15-c40532da63d7';

-- 223 esperado: provenance del lote
SELECT COUNT(*) FROM location_geo_provenance
WHERE source='t2-canon-lote-1-pt-pilot';
```

---

## 5. Lo que NO se hizo (alcance respetado)

- **Sin código.** `resolveAllFks`, `getLocationHierarchy`, `GeographyTree`, parsers de import: intactos. T2A-wire sigue pendiente.
- **Sin bump.** `package.json` permanece en `1.3.13` (bump de T2A-code).
- **Sin re-enrich.** `enriched_data.*`, `name`, `latitude`, `longitude`, `raw_geocode`, tags, colecciones, ratings: intactos.
- **Sin tocar `admin3_id`/`locality_id`.** Concelhos y freguesias siguen como estaban.
- **Sin limpiar las 28 entradas `admin_areas` mal-colocadas/duplicadas a depth=2.** Deuda T2A-bis.
- **Sin tocar los 3 concelhos de Azores** (Angra do Heroísmo, Ponta Delgada, Povoação) ni Madeira. Deuda T2A-bis.
- **Sin tocar otros países** (FR, ES, IT, GB, US, …).
- **Sin disparar `compute-geo-health`** (no aplica: cambio FK no triggea IA y no cambia el bucket POI-N — ver dry-run §6).

---

## 6. Estado de fases T2A

| Fase | Estado | Notas |
|---|---|---|
| **T2A-code** | DONE (v1.3.13) | Mirror canon TS + Deno + 4 tests (pdf-conformance, parity, helpers, no-hardcode). |
| **T2A-data** | DONE (este post-flight) | 223 POIs + 18 admin_areas. Sin código, sin bump, sin re-enrich. |
| **T2A-wire** | PENDING | Cablear `resolveAllFks`/`getLocationHierarchy`/parsers para consumir el mirror canon. Bump patch al ejecutarse. |
| **T2A-bis** | BACKLOG | 27 residuales sin distrito, 28 admin_areas mal-colocadas depth=2, Açores/Madeira concelhos depth=2. |

---

## 7. Restricciones respetadas

- Solo SELECT al schema + escritura de este documento.
- Sin migraciones, sin código, sin re-enrich, sin bump.
- Sin `if country === 'PT'` introducido en runtime (T2A-wire respetará lookup ISO2 uniforme).
- Documento autocontenido y reversible vía provenance.
