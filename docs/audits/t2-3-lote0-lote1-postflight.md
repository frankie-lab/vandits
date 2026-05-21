# T2.3 Lote 0 + Lote 1 PT — Postflight

> **Estado:** Lote 0 ejecutado. Lote 1 PT **diferido** (ver §3). Sin código, sin re-enrich, sin bump.

---

## 0. Resumen

| Lote | Estado | POIs applied | preserved | canon_gap | canon_gap_blocked (IE) | human_review |
|------|--------|--------------|-----------|-----------|------------------------|--------------|
| L0 (parent-chain, global canon) | DONE | **11** | 126 sin depth=2 derivable | ~135 ISO2 fuera canon | 55 (IE) | 0 |
| L1 PT (Class B' piloto) | **DEFERRED** | 0 | 65 | 0 | 0 | 65 |

Total snapshots `source='t23_snapshot'` en `location_geo_provenance`: **11**.

---

## 1. Incidente y corrección (Lote 0 v1 → v2)

- **v1 (revertido):** primer intento usó `aa.depth = 1` asumiendo "depth=1 = región". El esquema real de `admin_areas` es `depth=0=continente`, `depth=1=país`, `depth=2=región`. Resultado: 137 POIs se actualizaron poniendo `region = country_name` (ej. PT → "Portugal", NO → "Noruega").
- **Detección:** validación post-UPDATE comparando `region_id.depth` reveló depth=1 en todas las filas tocadas.
- **Rollback:** ejecutado vía snapshot `t23_snapshot` (137 filas restauradas a su estado original NULL/empty; snapshot table vaciada).
- **v2 (canon):** corregido a `aa.depth = 2`, filtrando `is_placeholder=false` y `name <> '(sin región)'`. Aplicado limpiamente.

Lección documentada: el contrato `mem://geography/canonical-tree-spec` describe `region_id=región`, pero el esquema físico `admin_areas.depth` no es el mismo eje semántico — la región vive en depth=2, no depth=1. Cualquier futura migración debe usar depth=2 como nivel "región" en `admin_areas`.

---

## 2. Lote 0 — resultados (v2 final)

### 2.1 POIs actualizados (11)

| País | N | Regiones asignadas |
|------|---|--------------------|
| NO   | 6 | Vestland (4), Telemark (1), Nordland (1) |
| RO   | 3 | Brașov, Sibiu, Suceava |
| PL   | 1 | Malbork County |
| SE   | 1 | Skåne County |

Todas las asignaciones son `admin_areas.depth = 2`, no-placeholder. Verificado por SQL post-UPDATE.

### 2.2 Campos tocados

Solo `region` y `region_id`. Verificación cruzada: cero diffs en `name`, `latitude`, `longitude`, `raw_geocode`, `country_id`, `country_code`, `zone_id`, `admin3_id`, `locality_id`, `enriched_data`, `enrichment_status`, `tags`, colecciones, media, `geo_health`.

### 2.3 Gate canónico §0bis

- TERRITORIAL_CANON 39 ISO2 aplicado: `{AR,AT,AU,BE,BR,CA,CH,CL,CN,CO,DE,DZ,EG,ES,FI,FR,GB,GR,ID,IN,IT,JP,KR,MA,MX,NG,NL,NO,NZ,PH,PL,PT,RO,RU,SE,TR,UA,US,ZA}`.
- IE bloqueado explícitamente (`country_code <> 'IE'`).
- Países fuera canon (HR, RS, IS, SI, EE, LV, ME, etc.) **preservados**, marcados `canon_gap`.

### 2.4 Preservados

- **126 POIs canon** sin ancestro depth=2 no-placeholder en path (`leaf` solo encadena hasta país/continente o solo enlaza con `(sin región)` placeholder). Quedan para Lote 1+ (Class B' con Nominatim).
- **~135 POIs canon_gap** en países no canonizados → diferidos a backfill de canon territorial.
- **55 POIs IE** → `canon_gap_blocked='IE'`. Bloqueados hasta prerequisito T2.3-IE.

### 2.5 Rollback disponible

```sql
UPDATE public.locations l
SET region    = s.original_value,
    region_id = s.area_id
FROM public.location_geo_provenance s
WHERE s.location_id = l.id
  AND s.source = 't23_snapshot'
  AND s.field_type = 'region';
DELETE FROM public.location_geo_provenance WHERE source = 't23_snapshot';
```

---

## 3. Lote 1 PT — DEFERIDO

No ejecutado en esta tanda. Razones:

1. La ejecución del Lote 0 requirió un ciclo extra (v1 incorrecto + rollback + v2) que consumió la ventana de tiempo de esta tanda.
2. Lote 1 PT exige llamadas Nominatim reverse secuenciales (1 req/s × 65 POIs ≈ 70-90s) más matching contra catálogo `admin_areas` PT depth=2, que tiene **duplicados textuales** (`Coimbra` / `Coimbra District`, `Évora` / `Évora District`, `Lisboa` / `Lisbon` / `Lisbo`) que requieren decisión canónica antes de auto-asignar.

Estado PT: 65 POIs siguen `region` empty / `region_id` NULL. Sin cambios. Sin snapshot. Listo para retomar como tanda independiente (T2.3-L1-PT-exec) con:

- Pre-flight: deduplicación catálogo PT depth=2 (proponer `is_placeholder=true` para `*District` duplicados de PT-XX ISO ó reglas de preferencia por `iso_code IS NOT NULL`).
- Resolución determinista Nominatim → match único contra catálogo limpio.

---

## 4. Impacto en GeographyTree

- Nodos "(sin región)" del árbol bajan en 11 (los POIs reasignados a Vestland, Telemark, Nordland, Brașov, Sibiu, Suceava, Malbork County, Skåne County).
- Resto del árbol sin cambios.
- POI-N: cero alteraciones (solo cambia nodo padre regional).
- `geo_health`: sin trigger esperado (no se tocaron coords ni nombre).

---

## 5. Prerequisitos abiertos

- **T2.3-IE** (bloqueante para 55 POIs IE): añadir `IE` a `docs/contracts/territorial-equivalence-canon.md` + mirrors TS/Deno antes de cualquier corrección.
- **T2.3-L1-PT-exec** (diferido): ejecutar Lote 1 PT cuando se apruebe deduplicación catálogo PT depth=2.
- **T2.3-catalog-gap** (nuevo): países fuera canon con POIs sin región (HR, RS, IS, SI, EE, LV, ME, MD, XK, otros) requieren entrada en TERRITORIAL_CANON antes de procesarse.
- **T2.3-L2..L5** (Class B' resto canon): para los 126 POIs canon preservados, mismo pipeline que L1-PT cuando esté validado.

---

## 6. Aislamiento confirmado

- Cero cambios en código, migraciones de schema, edge functions, RLS, `app-version`.
- Cero re-enrich, cero IA, cero scraping.
- Una sola fuente de UPDATE: migración SQL determinista bajo gate canónico.
