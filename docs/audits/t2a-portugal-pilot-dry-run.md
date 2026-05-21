# T2A — Portugal pilot dry-run (canon territorial)

**Fecha:** 2026-05-21 UTC
**Tipo:** Dry-run. Solo lectura (SELECT) + propuesta. **Sin** migraciones, **sin** código, **sin** datos tocados, **sin** bump.
**Lote:** T2.1 (`T2A`) según `docs/audits/t2-territorial-canon-application-plan.md §5`.
**Referencias:**
- [`docs/contracts/territorial-equivalence-canon.md`](../contracts/territorial-equivalence-canon.md) §1 fila Portugal, §5 reglas `resolveAllFks`, §7 reglas `GeographyTree`.
- [`docs/audits/t2-territorial-canon-application-plan.md`](./t2-territorial-canon-application-plan.md) §0–§3.
- [`docs/audits/t1-geography-tree-postfix-visual-audit.md`](./t1-geography-tree-postfix-visual-audit.md) §2.1 (origen del síntoma).

---

## 0. TL;DR

- **250 POIs PT** (`country_code='PT'`, `deleted_at IS NULL`).
- **100 %** apuntan a `region_id = cbeeecd6-…` = placeholder `"(sin región)"` depth=2.
- **223 / 250 (89 %)** ya apuntan a un **distrito real** vía `zone_id` (depth=3). Mapeo distrito → CCDR es canónico y resoluble sin geocoder.
- **27 / 250 (11 %)** apuntan a `zone_id = b50666f4-…` = otro placeholder `"(sin región)"` depth=3, sin distrito útil. Quedan en backlog `geo_health='partial'` hasta segundo pase (no bloquean T2A).
- **Catálogo `admin_areas` Portugal** ya contiene los 7 CCDR canónicos (`Norte` PT-01, `Centro` PT-02, `Lisboa` PT-03, `Alentejo` PT-04, `Algarve` PT-05, `Açores` PT-20, `Madeira` PT-30) en depth=2. **No requiere upsert nuevo.**
- **Acción de datos propuesta:** (a) re-parent 18 distritos mainland depth=3 desde placeholder → CCDR canónica; (b) remap `locations.region_id` desde placeholder → CCDR derivada de su `zone_id` (distrito). Idempotente, reversible vía `location_geo_provenance`.
- **Acción de código propuesta:** crear mirror técnico `src/shared/geography/territorial-canon.ts` + lookup ISO2 + cableado en `resolveAllFks`/`getLocationHierarchy`/`GeographyTree`. **Cero `if (country === 'PT')`** — todo se resuelve por lookup uniforme.
- **Impacto esperado UI:** desaparece nodo Portugal → `(sin región)` × 249. Sustituido por 6 nodos CCDR reales (Norte, Centro, Lisboa, Alentejo, Algarve, ¿Açores/Madeira?). Los 27 sin distrito real quedan colgados de Portugal → `(sin región)` × 27.

---

## 1. Estado actual (conteos exactos)

```sql
SELECT COUNT(*), COUNT(*) FILTER (WHERE region_id IS NOT NULL) region,
       COUNT(*) FILTER (WHERE region_id='cbeeecd6-…') placeholder_region,
       COUNT(*) FILTER (WHERE zone_id IS NOT NULL) zone,
       COUNT(*) FILTER (WHERE admin3_id IS NOT NULL) a3,
       COUNT(*) FILTER (WHERE locality_id IS NOT NULL) loc,
       COUNT(*) FILTER (WHERE zone IS NULL AND zone_id IS NOT NULL) zone_text_null
FROM locations WHERE deleted_at IS NULL AND country_code='PT';
```

| Métrica | Valor |
|---|---:|
| Total POIs PT | 250 |
| con `region_id` poblado | 250 |
| con `region_id` = placeholder `(sin región)` | **250 (100 %)** |
| con `zone_id` poblado | 250 |
| con `admin3_id` poblado | 242 |
| con `locality_id` poblado | 240 |
| con `zone` (texto) NULL pero `zone_id` poblado | 27 |

### Distribución por `zone_id` (depth=3, distrito)

| Distrito (depth=3) | POIs | CCDR canónica destino |
|---|---:|---|
| Lisboa | 52 | **Lisboa** (PT-03) |
| Oporto | 29 | **Norte** (PT-01) |
| `(sin región)` *(placeholder depth=3)* | **27** | — (no resoluble en T2A) |
| Faro | 26 | **Algarve** (PT-05) |
| Leiria | 15 | **Centro** (PT-02) |
| Guarda | 13 | **Centro** (PT-02) |
| Évora | 12 | **Alentejo** (PT-04) |
| Braga | 12 | **Norte** (PT-01) |
| Coímbra | 10 | **Centro** (PT-02) |
| Viana do Castelo | 9 | **Norte** (PT-01) |
| Portalegre | 8 | **Alentejo** (PT-04) |
| Castelo Branco | 7 | **Centro** (PT-02) |
| Santarém | 7 | **Lisboa** (PT-03) [^1] |
| Setúbal | 7 | **Lisboa** (PT-03) [^1] |
| Aveiro | 4 | **Centro** (PT-02) |
| Vila Real | 4 | **Norte** (PT-01) |
| Beja | 3 | **Alentejo** (PT-04) |
| Viseu | 3 | **Centro** (PT-02) |
| Bragança | 2 | **Norte** (PT-01) |

**Resoluble en T2A:** 250 − 27 = **223 POIs** (89,2 %).

[^1]: Mapeo simplificado canon-T2A (distritos Santarém y Setúbal asignados íntegros a CCDR Lisboa siguiendo NUTS II Área Metropolitana de Lisboa). El reparto fino municipio→CCDR queda fuera de T2A; revisión en T2A-bis si aparece ruido en Alentejo/Lisboa.

### Catálogo `admin_areas` bajo Portugal (depth=2)

41 entradas. Composición real:

| Categoría | Cuenta | Estado |
|---|---:|---|
| CCDR canónicas (PT-01..PT-05, PT-20, PT-30) | 7 | **OK, presentes y no-placeholder.** Norte, Centro, Lisboa, Alentejo, Algarve, Açores, Madeira. |
| Placeholder `(sin región)` | 1 | A vaciar de hijos en T2A; **no** borrar el nodo (sigue siendo sumidero legítimo para los 27 huérfanos). |
| Distritos mal-colocados a depth=2 (debían ir a depth=3) | ~18 | Aveiro, Beja, Braga, Bragança, Castelo Branco, Coimbra, "Coimbra District", Évora, "Évora District", Faro, Guarda, "Guarda District", Leiria, "Lisbo" (typo), Lisboa (PT-03), "Lisbon", Portalegre, Porto (PT-13), "Porto District", Santarém, Setúbal, Viana do Castelo, Vila Real, Viseu. |
| Concelhos mal-colocados a depth=2 | ~10 | Arouca, Calheta, Funchal, Machico, Ourém, Ponta Delgada, Porto Moniz, Povoação, Angra do Heroísmo. |
| Duplicados con nombre alternativo | 4 | "Región Norte" ≡ Norte; "Región Autónoma de Madeira" ≡ Madeira; "Coimbra District" ≡ Coímbra; "Évora District" ≡ Évora; "Lisbon"/"Lisbo" ≡ Lisboa. |

**Decisión T2A:** **no tocar** las 28 entradas mal-colocadas/duplicadas a depth=2. Ninguna tiene POIs (`poi_count=0` en cruce `zone_id/admin3_id/locality_id`). Quedan como deuda de catálogo (residual T2A-bis: limpieza de noise). No bloquean el piloto.

### Distritos depth=3 actuales

19 distritos a depth=3 **todos** colgando del placeholder `(sin región)` depth=2:

```
Aveiro · Beja · Braga · Bragança · Castelo Branco · Coímbra · Évora · Faro ·
Guarda · Leiria · Lisboa · Oporto · Portalegre · Santarém · Setúbal ·
Viana do Castelo · Vila Real · Viseu · (sin región)
```

18 son distritos reales (los 18 distritos mainland de Portugal continental). El nº 19 es el placeholder depth=3.

---

## 2. Mapeo canónico distrito → CCDR (sin geocoder, sin IA)

Fuente: Decreto-Lei 228/2012 (CCDR) + correspondencia NUTS II ↔ distritos. Estable, público, no negociable.

| Distrito (depth=3, id en BD) | CCDR (depth=2, id en BD) | iso_code CCDR |
|---|---|---|
| Braga `114fd8e0…` | Norte `0e0cd77d-36ee-4caf-a022-708ed2d109ef` | PT-01 |
| Bragança `807b33d7…` | Norte | PT-01 |
| Oporto (=Porto) `d1f0141b…` | Norte | PT-01 |
| Viana do Castelo `2355d050…` | Norte | PT-01 |
| Vila Real `c5dfda1b…` | Norte | PT-01 |
| Aveiro `27040b00…` | Centro `969ee249-484e-452a-9402-f26df5a0ae4e` | PT-02 |
| Castelo Branco `3b71b482…` | Centro | PT-02 |
| Coímbra `7df2ea81…` | Centro | PT-02 |
| Guarda `6e701bcc…` | Centro | PT-02 |
| Leiria `4305ed37…` | Centro | PT-02 |
| Viseu `bd10939a…` | Centro | PT-02 |
| Lisboa `2ae3db46…` | Lisboa `9574cd33-65ad-4e25-943b-ac4bcf46fdfb` | PT-03 |
| Santarém `8e900674…` | Lisboa [^1] | PT-03 |
| Setúbal `f675faf7…` | Lisboa [^1] | PT-03 |
| Beja `a6d8a5bb…` | Alentejo `c568ed08-f88b-4f45-b17f-7f0a32ed3a8e` | PT-04 |
| Évora `51f8cef9…` | Alentejo | PT-04 |
| Portalegre `b50d6066…` | Alentejo | PT-04 |
| Faro `de152986…` | Algarve `1dab62f3-e593-4c81-b911-10d251f44de9` | PT-05 |

Açores (PT-20) y Madeira (PT-30) son regiones autónomas sin distritos vigentes; no entran en este mapeo. POIs en archipiélagos hoy aterrizan en concelhos depth=2 mal-colocados (Funchal, Calheta, Ponta Delgada, etc.) — quedan fuera de T2A, se cubren en T2A-bis.

---

## 3. Acciones de datos propuestas (a aprobar antes de migración)

### 3.1 Re-parent distritos depth=3 (catálogo `admin_areas`)

```sql
-- 18 updates (uno por distrito). Idempotente. Sin borrar el placeholder.
UPDATE admin_areas SET parent_id = '0e0cd77d-…' /* Norte */
  WHERE id IN ('114fd8e0…','807b33d7…','d1f0141b…','2355d050…','c5dfda1b…');
UPDATE admin_areas SET parent_id = '969ee249-…' /* Centro */
  WHERE id IN ('27040b00…','3b71b482…','7df2ea81…','6e701bcc…','4305ed37…','bd10939a…');
UPDATE admin_areas SET parent_id = '9574cd33-…' /* Lisboa */
  WHERE id IN ('2ae3db46…','8e900674…','f675faf7…');
UPDATE admin_areas SET parent_id = 'c568ed08-…' /* Alentejo */
  WHERE id IN ('a6d8a5bb…','51f8cef9…','b50d6066…');
UPDATE admin_areas SET parent_id = '1dab62f3-…' /* Algarve */
  WHERE id IN ('de152986…');
-- path[] regenera vía trigger existente o backfill en mismo step
```

**Filas afectadas:** 18 admin_areas. **Sin** modificar `(sin región)` depth=2 ni depth=3 (sumidero residual).

### 3.2 Remap `locations.region_id` (223 POIs)

```sql
-- Idempotente: re-ejecutar deja todo igual.
UPDATE locations l
SET region_id = a3_to_ccdr.ccdr_id, updated_at = now()
FROM (
  -- VALUES (distrito_id, ccdr_id) según §2
) AS a3_to_ccdr(distrito_id, ccdr_id)
WHERE l.country_code='PT'
  AND l.deleted_at IS NULL
  AND l.zone_id = a3_to_ccdr.distrito_id
  AND l.region_id = 'cbeeecd6-…' -- placeholder solamente
;
```

**Filas afectadas:** 223 POIs. **No tocados:** los 27 con `zone_id` = placeholder depth=3 (quedan apuntando a placeholder region — comportamiento correcto hasta segundo pase).

### 3.3 Provenance + reversibilidad

Cada UPDATE escribe una fila en `location_geo_provenance`:
- `field_type='region_id'`
- `original_value` = `'cbeeecd6-…'`
- `normalized_value` = CCDR id
- `source='t2-canon-lote-1-pt-pilot'`
- `confidence=100` (mapeo distrito→CCDR es canon, no probabilístico)

Rollback (script inverso) reconstruye el set original leyendo provenance `source='t2-canon-lote-1-pt-pilot'`.

### 3.4 Lo que NO se toca en T2A

- `enriched_data.*`, `name`, `latitude`, `longitude`, `raw_geocode`, tags, colecciones, ratings.
- `admin3_id`, `locality_id` de PT POIs (correctos para concelho/freguesia salvo placeholders, fuera de scope T2A).
- 28 entradas `admin_areas` depth=2 mal-colocadas/duplicadas (deuda T2A-bis).
- Otros países (FR, ES, IT, GB, US, …) — sus datos quedan inalterados.

---

## 4. Acciones de código propuestas (a implementar tras aprobar dry-run)

### 4.1 Mirror técnico del canon (transversal)

Crear:

```
src/shared/geography/territorial-canon.ts          ← SoT TS
supabase/functions/_shared/territorial-canon.ts    ← espejo Deno
src/test/territorial-canon-parity.test.ts          ← contract test TS ↔ Deno
src/test/territorial-canon-pdf-conformance.test.ts ← coincide con §1 contrato
```

Forma según plan T2 §1.1:

```ts
export type CountryCanon = {
  iso2: string; hasProvincia: boolean;
  municipioField: 'admin3' | 'locality';
  localityField: 'locality' | 'sublocality';
  regionEqZoneWhitelist: ReadonlyArray<string>;
};
export const TERRITORIAL_CANON: Readonly<Record<string, CountryCanon>>;
export function getCountryCanon(iso2): CountryCanon | null;
export function hasProvincia(iso2): boolean;
export function municipioField(iso2): 'admin3' | 'locality';
export function isRegionEqZoneLegit(iso2, regionName): boolean;
```

Poblado para los 39 países del canon §1. **No** hardcode adicional, no shortcut PT.

### 4.2 Cableado en `resolveAllFks` (`src/shared/geography/resolve-admin-fks.ts`)

- Antes de asignar `zone_id` ⇒ `if (!hasProvincia(iso2)) return null;` (regla dura §5).
- Antes de asignar `admin3_id` ⇒ `if (municipioField(iso2)==='locality') route to locality_id`.
- Whitelist `regionEqZoneWhitelist` para permitir `zone_id = region_id` en CABA/Wien/etc.
- Warning estructurado `geo_health.review='zone-equals-region-unlisted'` cuando geocoder devuelve `region==zone` fuera de whitelist.

PT cae en categoría A (con provincia) sin modificaciones adicionales: el cableado se ejercita pero no cambia el comportamiento para PT en este lote. **Cero código PT-específico.**

### 4.3 Cableado en `getLocationHierarchy` (`src/shared/geography/hierarchy.ts`)

- Si `!hasProvincia(iso2)` ⇒ omitir nivel `zone` del array de niveles devuelto (categoría B; no afecta a PT).
- Si `isRegionEqZoneLegit(iso2, regionName)` y `region_id == zone_id` ⇒ colapsar a 1 nivel etiquetado (categoría C; no afecta a PT).
- T2A no introduce ninguna rama PT. PT funciona porque `*Resolved` (T1-fix) ya consume `region_resolved` correcto **después** del backfill 3.2.

### 4.4 Cableado en parsers de import

Validador genérico en `src/shared/import/canon-validator.ts` consultado por todos los parsers (KML/GPX/GeoJSON/CSV/web/scrape/manual). Descarta `zone`/`admin3` que violen el canon. PT no genera warnings en T2A (todos sus campos son válidos).

### 4.5 Lint anti-hardcode CI

Grep que falla si aparece literal `'PT'|'pt'|'Portugal'|'portugal'` (o cualquier otro ISO2 país-del-canon) en switch/if dentro de `src/shared/geography/**` o `src/components/filters/Geography*.tsx`, salvo:
- `territorial-canon.ts` (la SoT).
- Tests bajo `src/test/**`.

---

## 5. Impacto esperado en `GeographyTree`

### Antes de T2A (estado actual)

```
Europe
└── Portugal (250)
    └── (sin región) (250)    ← bug visible captura
        ├── Lisboa (52)
        ├── Oporto (29)
        ├── Faro (26)
        ├── … (16 distritos más)
        └── (sin región) (27)
```

### Después de T2A (acciones 3.1 + 3.2 + 4.x aplicadas)

```
Europe
└── Portugal (250)
    ├── Norte (56)            ← Braga + Bragança + Oporto + Viana + Vila Real
    │   ├── Oporto (29)
    │   ├── Braga (12)
    │   ├── Viana do Castelo (9)
    │   ├── Vila Real (4)
    │   └── Bragança (2)
    ├── Centro (52)
    │   ├── Leiria (15) · Guarda (13) · Coímbra (10) · Castelo Branco (7) · Aveiro (4) · Viseu (3)
    ├── Lisboa (66)
    │   ├── Lisboa (52) · Santarém (7) · Setúbal (7)
    ├── Alentejo (23)
    │   ├── Évora (12) · Portalegre (8) · Beja (3)
    ├── Algarve (26)
    │   └── Faro (26)
    └── (sin región) (27)      ← residual irreducible en T2A
```

**Métrica clave:** nodo `(sin región)` cae de **249 → 27** (−89 %).

### `getLocationHierarchy` y breadcrumbs

- `region` (texto) leído vía `regionResolved` (T1-fix) muestra `"Norte" | "Centro" | "Lisboa" | "Alentejo" | "Algarve"` para los 223 reasignados.
- `zone` (texto) ya correcto desde T1-fix para los 223 con distrito real.
- 27 residuales: breadcrumb `Portugal · (sin región) · (sin región)` con renderizado silenciado en cursiva (regla preexistente `/^\(sin /i`).

---

## 6. Impacto esperado en POI-N (curation levels)

Regla: **estado personal no afecta health**. Salud objetiva sí cambia con `region_id` real.

| Bucket | Antes T2A | Después T2A | Delta |
|---|---:|---:|---:|
| PT con `geo_health='ok'` | depende: cualquier POI con region_id válido (placeholder cuenta como id válido pero no canónico, hoy contado como `ok` si zone_id real) | igual (no se introduce nuevo gating) | 0 |
| PT con `geo_health='partial'` por `region` faltante | 0 (ya tienen FK, sólo placeholder) | 0 | 0 |
| POI-9 → POI-10 promoción | sin cambio | sin cambio | 0 |
| Health rings amber | sin cambio | sin cambio | 0 |

**Conclusión POI-N:** **0 promociones/degradaciones**. T2A repara texto/jerarquía sin tocar el cálculo de `geo_health`. La promoción real de `partial→ok` (categoría B países sin provincia) es de **T2.2**, no de T2A.

---

## 7. Impacto esperado en otras superficies

| Superficie | Impacto |
|---|---|
| Mapa global | Ninguno (markers no se mueven; coords inalteradas). |
| Popup canónico | Breadcrumb territorial muestra CCDR + Distrito + Concelho + Freguesia en lugar de `(sin región) → distrito → concelho`. |
| Filtros (`FilterBar` geo facets) | Se añaden 5 facetas `Norte/Centro/Lisboa/Alentejo/Algarve` con counts reales. Faceta `(sin región)` cae a 27. |
| Selección territorial | Operativa: filtrar por "Lisboa CCDR" devuelve 66 POIs (era 0). |
| Realtime | Se emiten 223 eventos `postgres_changes UPDATE` sobre `locations`. Cliente consume vía suscripción existente — sin reload, sin pérdida de estado. |
| Compute-geo-health | Ejecución no se dispara automáticamente (cambio FK no triggea IA). Si se ejecuta manualmente post-T2A, no cambia resultado (ver §6). |
| Exports KML/GeoJSON | POI-9/10 elegibles no cambian set (mismo `geo_health='ok'`). Campo `region` exportado pasa a CCDR canónica. |

---

## 8. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Mitigación |
|---|---|:-:|---|
| R1 | Mapeo Santarém/Setúbal → Lisboa CCDR introduce ruido si algún POI debería caer en Alentejo (concelhos del sur de Setúbal) | baja | Aceptable en piloto. Reparto fino municipio→CCDR en T2A-bis. Reversible vía provenance. |
| R2 | Algún POI tiene `zone_id` apuntando a distrito que NO está en la lista §2 | nula | Verificado: las 18 filas de la lista cubren los 18 distritos reales con POIs (ver §1 tabla). |
| R3 | Re-parent admin_areas rompe `path[]` denormalizado | media | Regenerar `path[]` en el mismo step con `array_prepend` o trigger existente. Verificar pre-merge. |
| R4 | UI cachea jerarquía vieja (`useLocationsStore`) | baja | Realtime emite UPDATE → store invalida POIs afectados. `updated_at` cambia → cache miss natural. |
| R5 | Algún call site legacy lee `region` texto sin pasar por `*Resolved` | baja | T1-fix ya migró cliente. Inventario tech-debt cubre los 30 legacy `.from('locations')` restantes (no bloquean, no son rama caliente). |
| R6 | Hardcode PT introducido por error en código | media | Lint CI §4.5 + revisión PR explícita. |

---

## 9. Rollback

1. **Datos:** script inverso lee `location_geo_provenance WHERE source='t2-canon-lote-1-pt-pilot'` y restaura `region_id := original_value`. Re-ejecutable. Sin pérdida de información.
2. **Catálogo:** revertir los 18 `UPDATE admin_areas SET parent_id` a `cbeeecd6-…` (placeholder). Mantenemos snapshot del `parent_id` previo en migración (comentario o tabla `admin_areas_backup_t2a`).
3. **Código:** `git revert` del PR `T2.1-canon-mirror-and-pt-pilot`. Mirror canon queda inerte si nadie lo consume; no daña.
4. **Kill-switch runtime:** `app_settings.feature.territorial_canon_enforcement = false` apaga el cableado en `resolveAllFks` sin revert.

---

## 10. Criterios de aprobación para pasar a ejecución

Marcar todos antes de abrir migración:

- [ ] Mapeo distrito→CCDR §2 validado por humano (especialmente Santarém/Setúbal nota [^1]).
- [ ] Confirmación que **no** se tocan los 27 POIs con `zone_id`=placeholder depth=3.
- [ ] Confirmación que **no** se tocan los 28 admin_areas mal-colocados/duplicados a depth=2 (residual T2A-bis).
- [ ] Lint anti-hardcode aceptado en CI.
- [ ] Plan de provenance + rollback aceptado.
- [ ] Sin re-enrich, sin tocar enriched_data.

---

## 11. Restricciones respetadas

- Solo SELECT al schema + escritura de este documento.
- Sin migraciones, sin código, sin re-enrich, sin bump.
- Sin `if country === 'PT'` propuesto; el cableado es lookup ISO2 uniforme para 39 países.
- Documento autocontenido: cualquier siguiente iteración puede arrancar desde aquí sin re-auditar BD.
