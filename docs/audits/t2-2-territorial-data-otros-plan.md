# T2.2 — Plan de remapeo data-otros (dry-run)

> **Estado**: planificación. NO ejecuta UPDATE/backfill/re-enrich/migraciones.
> **Versión**: sin bump. T2A-wire (`1.3.14`) ya cubre flujos futuros.
> **Regla dura**: no hardcodear países en código. La corrección debe justificarse
> exclusivamente por `TERRITORIAL_CANON[iso2]`. El agrupamiento por país en este
> documento es presentacional, no normativo.

---

## 1. Contexto y garantías heredadas

T2A-wire conectó el canon territorial a:
- `resolveAllFks` (post-sanitización `applyCanonToResolvedFks`)
- `getLocationHierarchy` + `GeographyTree` (omisión/colapso de zone)
- Imports KML/GPX/GeoJSON/CSV/web (`applyCanonToParsed`)

**Por tanto, todo POI nuevo o re-resuelto a partir de `1.3.14` queda canónicamente
correcto sin intervención.** T2.2 ataca únicamente la deuda histórica anterior al
wire en POIs que no han pasado por re-resolución desde entonces.

---

## 2. Auditoría inicial (snapshot)

Conteo directo sobre `public.locations` (`deleted_at IS NULL`, agrupado por
`country_code` y cruzado contra el canon). Sólo se listan países con deuda > 0
o cobertura relevante.

### 2.1 Países `hasProvincia=false` con `zone_id` residual (deuda C1)

| ISO2 | POIs totales | `zone_id` residual | `admin3_id` residual | `locality_id` ya poblado |
|---|---:|---:|---:|---:|
| FI  | 49 | **44** | **49** | 49 |
| NO  | 41 | **38** | **38** | 24 |
| NL  | 13 |  **9** | **13** | 13 |
| SE  |  8 |  **8** |  **8** |  7 |
| BR  |  3 |  **3** |  **3** |  3 |
| AU  |  2 |  **2** |  **2** |  2 |
| JP  |  1 |  **1** |  **1** |  1 |
| MX  |  1 |   0    |   0    |  0 |
| CO  |  1 |   0    |   0    |  0 |

**Total deuda C1 = 105 POIs con `zone_id` que el canon prohíbe.**

### 2.2 Países `municipioField='locality'` con `admin3_id` residual (deuda C2)

Mismos países que C1 (FI/NO/NL/SE/BR/AU/JP). El canon exige promover
`admin3_id → locality_id` cuando `locality_id` esté libre, o anular `admin3_id`
en caso contrario.

**Total deuda C2 = 114 POIs con `admin3_id` que debe colapsarse.**

> Solapamiento: la mayoría de POIs C1 también son C2 (mismo punto, dos columnas
> a sanear). El recuento físico de POIs únicos afectados ≈ **117**.

### 2.3 `region == zone` no-whitelisted (deuda C3)

| ISO2 | text-level (`region`=`zone`) | id-level (`region_id`=`zone_id`) |
|---|---:|---:|
| PT  | 52 | 0 |
| resto | 0 | 0 |

**Conclusión C3**: el catálogo está limpio a nivel de FK. La colisión PT es
puramente textual (columnas legacy `region`/`zone`) y ya no impacta el árbol
porque `GeographyTree` lee `region_id`/`zone_id`. **No requiere acción de datos**;
queda como cleanup cosmético opcional (sección 7).

### 2.4 Cobertura admin3/locality en países `hasProvincia=true`

| ISO2 | POIs | `admin3_id` NULL | `locality_id` NULL |
|---|---:|---:|---:|
| ES  | 1313 | 36 | 51 |
| FR  | 1067 | 21 | 48 |
| IT  |  989 |  6 | 19 |
| GB  |  402 | 54 | 45 |
| US  |  349 | 78 | 73 |
| PT  |  250 |  8 | 10 |
| CH  |   16 |  3 |  3 |
| MA  |   36 |  5 |  5 |
| GR  |   21 |  0 |  2 |
| CA  |    3 |  1 |  1 |
| NZ  |    3 |  1 |  1 |
| IE  |   55 |  3 | 36 |

Esta cobertura **NO es deuda del canon** — es deuda de geocoding (resolver no
encontró FK). T2.2 la documenta pero **no la corrige** (fuera de alcance,
pertenece a `run_geo_backfill`). Se incluye para que la priorización futura no
mezcle conceptos.

> **IE (Irlanda)** aparece con 55 POIs pero no está en `TERRITORIAL_CANON`.
> Pre-requisito antes de cualquier T2.2 para IE: extender el canon. Bloqueante
> documentado, **no incluido en este plan**.

---

## 3. Tipo de deuda × severidad × impacto

| Código | Deuda | Severidad | Impacto `GeographyTree` | Impacto POI-N / `geo_health` |
|---|---|---|---|---|
| C1 | `zone_id` ≠ NULL en país `!hasProvincia` | **Alta** | Crea nodo Provincia fantasma con 1–N hijos. Wire ya lo oculta vía `collapseZoneForCountriesWithoutProvincia`, pero el dato fósil persiste y reaparece en cualquier consumer que no use el wire (export, SQL ad hoc, vistas de admin). | Neutro: `geo_health` no se recomputa. POI-N no se recalcula. |
| C2 | `admin3_id` ≠ NULL en país `municipioField='locality'` | **Alta** | El árbol pinta nivel Comarca/3 inexistente. Idéntico al C1 a nivel UX. | Neutro. |
| C3 | `region`=`zone` no-whitelisted (text-level) | **Baja** | Ninguno (el árbol lee IDs, no texto). | Neutro. |
| C4 | Cobertura FK incompleta | **Media** | Subárbol con placeholder "(sin …)" hasta resolver. | `geo_health` puede marcar `partial`. **No es T2.2.** |

---

## 4. Lotes propuestos (orden de ejecución)

Cada lote = país × tipo. Justificación inmutable: `TERRITORIAL_CANON[iso2]`
evaluado en tiempo de migración. La migración debe iterar `TERRITORIAL_CANON`
en runtime y NO codificar el listado en SQL.

### Lote 0 — Snapshot de provenance (prerequisito de todos los lotes)

Por cada POI afectado, escribir fila en `location_geo_provenance` con
`field_type='zone_id_pre_t22'` o `'admin3_id_pre_t22'`, `original_value=<uuid>`,
`source='t2.2-pre'`. **Permite rollback granular por lote.**

### Lote 1 — C1 + C2 en países `hasProvincia=false` (orden por volumen ↓)

| Orden | ISO2 | POIs únicos | Operaciones |
|---:|---|---:|---|
| 1.1 | FI |  49 | `zone_id=NULL` ×44 + `admin3_id → locality_id` ×49 |
| 1.2 | NO |  41 | `zone_id=NULL` ×38 + `admin3_id → locality_id` ×38 |
| 1.3 | NL |  13 | `zone_id=NULL` ×9  + `admin3_id → locality_id` ×13 |
| 1.4 | SE |   8 | `zone_id=NULL` ×8  + `admin3_id → locality_id` ×8  |
| 1.5 | BR |   3 | idem ×3 |
| 1.6 | AU |   2 | idem ×2 |
| 1.7 | JP |   1 | idem ×1 |

**Sub-total Lote 1 ≈ 117 POIs únicos, ~219 column-writes.**

Orden interno por lote: primero C1 (`zone_id=NULL`), luego C2 (`admin3 → locality`).
C2 debe respetar regla: si `locality_id IS NOT NULL` ya, anular `admin3_id` sin
sobreescribir; si `locality_id IS NULL`, mover `admin3_id` a `locality_id` y
poner `admin3_id=NULL`.

### Lote 2 — C3 cleanup textual (opcional, low-prio)

PT × 52 POIs: limpiar columna `zone` (text) donde `lower(zone)=lower(region)` y
no esté en `regionEqZoneWhitelist['PT']` (vacía → todos). No toca IDs.
**Cosmético. Recomendación: posponer indefinidamente.**

### Lote 3 — Pre-requisito IE (fuera de T2.2)

Extender `TERRITORIAL_CANON` con `IE`. Tarea separada de gobernanza del canon,
**no migración**.

---

## 5. Campos tocados por la migración

| Tabla | Columna | Operación | Lote |
|---|---|---|---|
| `locations` | `zone_id`     | `SET NULL` cuando `!hasProvincia(iso2)` | 1 |
| `locations` | `admin3_id`   | `SET NULL` y promoción condicional      | 1 |
| `locations` | `locality_id` | `SET = admin3_id` si está libre         | 1 |
| `location_geo_provenance` | `*` | `INSERT` pre-snapshot por POI       | 0 |
| `locations` | `zone` (text) | `SET NULL` (sólo PT, opcional)          | 2 |

**Explícitamente NO tocados** en T2.2: `enriched_data`, `geo_health`,
`geo_confidence`, `geo_resolved_at`, `name`, `description`, `place_type`,
`raw_geocode`, `external_refs`, `region_id`, `country_id`, `continent_id`,
`pioneer_user_id`, `owner_user_id`, `visibility`, `is_approved`.

---

## 6. Rollback por lote

**Mecanismo**: `location_geo_provenance` con `field_type IN ('zone_id_pre_t22',
'admin3_id_pre_t22', 'locality_id_pre_t22')` permite reconstruir el estado pre-T2.2.

**SQL rollback por lote** (plantilla, no se ejecuta ahora):
```sql
UPDATE locations l SET zone_id = p.original_value::uuid
FROM location_geo_provenance p
WHERE p.location_id=l.id
  AND p.field_type='zone_id_pre_t22'
  AND p.source='t2.2-pre'
  AND UPPER(l.country_code) = :iso2;
-- equivalente para admin3_id_pre_t22 / locality_id_pre_t22
```

Rollback es **idempotente** y por país.

---

## 7. Prioridad recomendada

1. **Lote 1.1 + 1.2 (FI + NO)** — concentran 90 POIs (77 % del total). ROI máximo.
2. **Lote 1.3 (NL)** — 13 POIs, complejidad baja.
3. **Lote 1.4–1.7 (SE/BR/AU/JP)** — 14 POIs, batch único agrupable.
4. **Lote 2 (PT cosmético)** — postergar.
5. **Lote 3 (IE pre-req)** — abrir ticket de gobernanza del canon, fuera de T2.2.

---

## 8. Casos que deben quedar como revisión humana

- **Países no presentes en `TERRITORIAL_CANON`** (IE, IS, HR, BG, HU, SK, CZ, SI,
  RS, ML, …): el resolver y el wire los tratan como passthrough. La sanitización
  T2.2 los respeta. Revisión humana = decidir si extender canon o dejar legacy.
- **POIs con `zone_id` pero `region_id IS NULL`** (huérfano de jerarquía) en
  países `!hasProvincia`: anular `zone_id` no rompe nada pero conviene loguear.
- **POIs con `admin3_id` apuntando a un `admin_areas.depth` incompatible** con la
  promoción a locality: si `admin3_id` resuelve a un área de tipo "comarca" real
  (no municipio), promoverlo a `locality_id` semánticamente es incorrecto. **Hard
  guard requerida**: validar `admin_areas.type_id` ≡ tipo municipio antes de
  promover. Si no lo es, anular `admin3_id` sin promoción y marcar
  `location_geo_provenance.normalized_value='canon-admin3-discarded-not-municipality'`.
- **POIs ya re-resueltos post-`1.3.14`** (detectable por `geo_resolved_at >
  '2026-05-20'` aproximadamente, fecha del wire): excluir del batch — ya pasaron
  por el canon en runtime.

---

## 9. Confirmación T2A-wire cubre el futuro

- `applyCanonToResolvedFks` en `resolveAllFks`: toda nueva resolución pasa por
  canon.
- `applyCanonToParsed` en `src/lib/parsers/shared.ts`: todo import KML/GPX/
  GeoJSON/CSV/web filtra niveles prohibidos antes de persistir.
- `GeographyTree` colapsa visualmente la deuda histórica residual hasta que se
  ejecute T2.2.

**Sin T2.2, la deuda no crece. Con T2.2, se limpia el fósil de 117 POIs.**

---

## 10. Out of scope explícito

- Re-enrich (`enriched_data.*` intacto).
- Recálculo de `geo_health` histórico.
- Migraciones de schema.
- Backfills de geocoding (cobertura admin3/locality faltante — sección 2.4).
- Cambios POI-N / curation levels.
- POIs ya corregidos por T2A-data (PT pilot, 223 POIs).
- Extensión del canon a nuevos países (IE, IS, etc.).

---

## 11. Próximos pasos (planificación, no ejecución)

1. Validar este plan con stakeholder.
2. Generar migración Lote 0 + Lote 1.1 (FI) como primer batch real.
3. Postflight FI análogo a `t2a-portugal-pilot-postflight.md`.
4. Iterar 1.2 → 1.7.
5. Cierre T2.2: actualizar `mem://geography/territorial-canon` con la deuda
   liquidada y dejar Lote 2/3 como tickets separados.

**Total estimado T2.2 completo**: 7 migraciones data-only sucesivas, ~117 POIs
únicos, 0 cambios de código, 0 schema, 0 re-enrich.
