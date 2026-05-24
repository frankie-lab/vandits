# T2 — Plan de aplicación transversal del canon territorial

**Fecha:** 2026-05-21 UTC
**Tipo:** Plan / arquitectura. Solo lectura. Sin código, sin datos, sin migraciones, sin re-enrich, sin bump.
**Referencias obligatorias:**
- [`docs/contracts/territorial-equivalence-canon.md`](../contracts/territorial-equivalence-canon.md) (los 38 países + reglas duras §1–§10).
- [`docs/audits/territorial-equivalence-global-implementation-audit.md`](./territorial-equivalence-global-implementation-audit.md) (estado actual por país).
- [`docs/audits/t1-geography-tree-postfix-visual-audit.md`](./t1-geography-tree-postfix-visual-audit.md) (caso piloto Portugal + bug fallback continente).
- Norma raíz: `mem://geography/canonical-tree-spec`.

**Version impact futuro (al ejecutar):** `patch` por cada lote.
**Version impact de este plan:** `none`.

---

## 0. Principio rector

> El canon territorial es **una sola tabla data-driven** consultada por todos los puntos del pipeline. Portugal es **el primer país que valida el contrato**, no una excepción hardcoded. Cualquier rama `if (country === 'PT')` que aparezca en el código durante la ejecución de T2 es por definición un bug del plan.

Cinco invariantes:

1. **Una sola fuente de verdad funcional** = `docs/contracts/territorial-equivalence-canon.md §1` (PDF de 38 países).
2. **Un solo mirror técnico** = `src/shared/geography/territorial-canon.ts` (+ espejo Deno `supabase/functions/_shared/territorial-canon.ts`). Contract test paritario obligatorio.
3. **Un solo punto de consulta** por capa: `resolveAllFks` (writer), `getLocationHierarchy` / `GeographyTree` (reader UI), parsers de import (writer), `compute-geo-health` (validator).
4. **Datos siguen siendo SoT estructurada** vía `admin_areas` + `v_locations_resolved`. El canon decide qué FKs son legítimas, no inventa datos.
5. **Cero hardcode por país.** Toda decisión `has_provincia`, `municipio_field`, `locality_field`, `region_eq_zone` se resuelve por lookup ISO2.

---

## 1. Arquitectura transversal

### 1.1 Mirror técnico del canon

Fichero único TypeScript:

```ts
// src/shared/geography/territorial-canon.ts
export type CountryCanon = {
  iso2: string;                        // 'PT', 'ES', 'NL', …
  hasProvincia: boolean;               // §1 col. has_provincia
  municipioField: 'admin3' | 'locality';
  localityField: 'locality' | 'sublocality';
  regionEqZoneWhitelist: ReadonlyArray<string>; // §4 — nombres/ids legítimos
  notes?: string;                      // referencia §3/§4 cuando aplique
};

export const TERRITORIAL_CANON: Readonly<Record<string, CountryCanon>>;
export function getCountryCanon(iso2: string | null | undefined): CountryCanon | null;
export function hasProvincia(iso2: string | null | undefined): boolean;       // default true salvo lookup
export function municipioField(iso2: string): 'admin3' | 'locality';
export function isRegionEqZoneLegit(iso2: string, regionName: string): boolean;
```

Espejo Deno bit-a-bit en `supabase/functions/_shared/territorial-canon.ts` para que edge functions (`compute-geo-health`, futuros validadores de import server-side) consuman la misma matriz.

Contract tests:
- `territorial-canon-parity.test.ts` — TS ↔ Deno (mismo JSON serializable para los 38 países).
- `territorial-canon-pdf-conformance.test.ts` — el mirror coincide línea a línea con §1 del contrato.

### 1.2 Puntos de consumo

| Capa | Fichero | Consulta al canon |
|---|---|---|
| FK writer (cliente + servidor) | `src/shared/geography/resolve-admin-fks.ts` | Antes de asignar `zone_id`/`admin3_id`. Si falla cualquier regla dura, descarta + emite warning estructurado. |
| FK writer (edge enrichment / scrape) | `supabase/functions/_shared/resolve-admin-fks.ts` (si existe; si no, importar mirror) | Mismas reglas. |
| Hierarchy SoT (lectura UI) | `src/shared/geography/hierarchy.ts` (`getLocationHierarchy` + `getFilledLocationHierarchy`) | Colapsa nivel `zone` cuando `!hasProvincia`. Colapsa `region==zone` en lista blanca. Suprime placeholders. |
| Tree UI | `src/components/filters/GeographyTree.tsx` + scope tree + FilterBar geo facets | Construye nodos **exclusivamente** desde `getFilledLocationHierarchy`. Cero agrupación por `loc.zone` crudo. |
| Imports (parsers) | `src/shared/import/*` (KML/GPX/GeoJSON/CSV/web/scrape/manual) | Antes de aceptar `zone`/`zone_id` o `admin3_id`, validar contra canon ISO2 del POI. |
| Health validator | `supabase/functions/compute-geo-health/*` + helper cliente equivalente | Reclassifica `partial` ↔ `ok` según `hasProvincia` y `municipioField`. |
| QA / admin panels | `GeoMaintenancePanel`, `GeographyHealthPanel` | Surfacing por país de violaciones del canon, **sin** lógica de negocio propia. |

### 1.3 Pipeline canónico (orden inmutable)

```text
import/geocode raw payload
      │
      ▼
country_code (ISO2)  ──►  TERRITORIAL_CANON lookup
      │                          │
      ▼                          ▼
resolveAllFks ◄──── reglas duras (hasProvincia, municipioField, regionEqZone whitelist)
      │
      ▼
locations (FK) + admin_areas
      │
      ▼
v_locations_resolved (texto derivado, *_resolved)
      │
      ▼
dbLocationToGeoLocation → *Resolved (SoT textual cliente, ya implementado por T1-fix)
      │
      ▼
getLocationHierarchy → canon-aware (colapsa zone si !hasProvincia, dedupe region==zone)
      │
      ▼
GeographyTree / breadcrumbs / FilterBar geo facets
```

---

## 2. Por qué no hardcodear Portugal

Tres razones no negociables:

1. **No es el único país con el síntoma.** El audit global muestra ya hoy `partial` en FR, ES, IT, US, GR, MA, GR, CH, UA, etc. y NULLs estructurales en NL/SE/NO/FI/MX/BR/AU/JP/CO. Hardcodear PT enmascararía la causa y obligaría a añadir 9 hardcodes más en cuanto se mire otro país.
2. **El PDF es prescriptivo y cerrado** (38 países + Rusia). El canon ya está versionado en `docs/contracts/territorial-equivalence-canon.md §1` con todas las columnas necesarias (`has_provincia`, `municipio_field`, `locality_field`, `region_eq_zone`). No queda nada que "decidir" sobre PT que no aplique al resto: simplemente PT es el primero con un nº alto de POIs visibles afectados.
3. **El bug operativo de PT no es "Portugal"**, es **catálogo `admin_areas` con placeholder `(sin región)` en nivel 2**. Mismo bug puede aparecer en cualquier país cuyo geocoder pierda `admin_level_1` y se apoye en placeholder. La solución debe ser "el writer no acepta placeholders como FK reales" + "el reader colapsa placeholders en UI", no "si país=PT, hacer X".

Prohibido durante la ejecución de T2:
- `if (country === 'PT' | 'pt' | 'Portugal')` en cualquier capa de negocio.
- Tablas paralelas por país.
- Branches en `GeographyTree` por nombre de país.
- Fixtures de test que sólo cubran PT (cada test que cubre PT cubre al menos un país representativo de cada categoría — ver §10).

---

## 3. Cómo se aplica a todos los países

Único patrón: **lookup ISO2 → regla declarativa → decisión uniforme**. Tres categorías derivadas mecánicamente de §1:

| Categoría | Definición | Países |
|---|---|---|
| **A. con provincia administrativa** | `hasProvincia=true`, `municipioField='admin3'` | ES, FR, IT, GB, US, PT, RO, DE, TR, MA, PL, GR, NG, CH, AT, UA, CN, AR, CA, CL, NZ, ZA, BE, EG, ID, KR, PH, IN, RU |
| **B. sin provincia** | `hasProvincia=false`, `municipioField='locality'` | FI, NO, NL, SE, BR, AU, JP, MX, CO |
| **C. uniprovinciales legítimos** | sub-conjunto de A con whitelist `region_eq_zone` | ES (CCAA uniprov.), DE (Stadtstaaten), AT (Wien), BE (BXL), PL (powiat-cities), CH (cantones sin Bezirk), AR (CABA), CN (municip. directas), EG (5), ID (Jakarta), KR (7), PH (HUC), IN (UT sin distrito), RU (3 fed.), US (DC) |

Las tres categorías se materializan **sin if-por-país**: derivan del lookup en `TERRITORIAL_CANON`. La whitelist `regionEqZoneWhitelist` es una lista de nombres normalizados consultada por `isRegionEqZoneLegit(iso2, regionName)`.

---

## 4. Portugal como piloto

Portugal es **el caso visible** que valida que el canon funciona end-to-end. No es excepción.

Razones para ser piloto:
- Vol. alto (315 POIs) y bug visible en UI (`(sin región)` × 249 en captura).
- Cubre 3 deudas distintas en un solo país: placeholder en `admin_areas` nivel-2, FK `region_id` correcta pero apunta a placeholder, `municipio_field='admin3'` aún por validar.
- Es categoría A "normal": si funciona en PT, funciona en ES/FR/IT/GB/US sin cambios.

Salida esperada del piloto:
- `admin_areas` Portugal nivel-2 poblado con las 7 regiones canónicas (Norte, Centro, Lisboa, Alentejo, Algarve, Açores, Madeira) — backfill catálogo, no de POIs.
- Job de remapeo `locations.region_id` desde placeholder → región real (no toca enriched_data, no re-enrich).
- `GeographyTree` muestra Portugal → Norte/Centro/… → distrito → concelho → freguesia.
- Métrica `(sin región)` en PT cae a 0.

---

## 5. Lotes de ejecución

### Lote 1 — Piloto Portugal (valida arquitectura completa)
**Alcance:** mirror canon + cableado en `resolveAllFks`/`hierarchy`/`GeographyTree`/`imports`/`compute-geo-health` + backfill catálogo PT + remapeo PT.
**Entrega:** PR `T2.1-canon-mirror-and-pt-pilot` (patch).
**Criterio de salida:**
- Tests `territorial-canon-parity` y `territorial-canon-pdf-conformance` en verde.
- 0 ramas `country === 'PT'` en código de negocio.
- 0 POIs PT con `region_resolved='(sin región)'`.
- `GeographyTree` muestra jerarquía PT canónica.

### Lote 2 — Países sin provincia (categoría B)
**Países:** FI, NO, NL, SE, BR, AU, JP, MX, CO (104 POIs hoy; MX/CO sin POIs hoy se incluyen para readiness).
**Alcance:** aplicar regla `hasProvincia=false` end-to-end. Limpiar `zone`/`zone_id` espurios poblados por geocoder (FI/NO/NL/SE muestran zone presente pese al PDF — ver audit global §1, líneas 58, 61, 67, 69). Reclasificar `geo_health` de `partial→ok` cuando la única deuda era `zone NULL` legítima.
**Entrega:** PR `T2.2-no-provincia-cleanup` (patch).
**Criterio de salida:**
- `zone_id IS NOT NULL` en categoría B → 0 (o documentado como excepción geocoder).
- `GeographyTree` no renderiza nivel "Provincia" para estos países.
- Imports que traen `zone` en estos países emiten warning y descartan campo, sin abortar.

### Lote 3 — Países con `municipio_field='locality'` o admin3 bajo
**Países:** Chile (`locality_field='locality'` sin `sublocality`), Algeria (idem), Filipinas (HUC sin provincia caen también en regla región-uniprov.), Reino Unido (Borough/Council a `admin3`, pero parishes raramente pobladas), Estados Unidos (`A3 < 80%`).
**Alcance:** validar que el municipio aterriza en el campo correcto. Cero remapeo si ya está bien. Limpiar casos donde `admin3_id` se llenó con datos censales (audit señala BR mesorregión, AU county obsoleto — ya cubiertos en lote 2; aquí lo extendemos a US Census Designated Place).
**Entrega:** PR `T2.3-municipio-field-normalization` (patch).
**Criterio de salida:** `compute-geo-health` no marca `partial` por `admin3_id NULL` cuando `municipio_field='locality'`.

### Lote 4 — Países uniprovinciales (colapso UI)
**Alcance:** UI-only. `GeographyTree` colapsa nodos `region_id==zone_id` legítimos en categoría C (un nodo con tooltip "Región + Provincia"). `getLocationHierarchy` deduplica en breadcrumbs.
**Entrega:** PR `T2.4-region-eq-zone-collapse` (patch).
**Criterio de salida:** nodos "Comunidad de Madrid · Comunidad de Madrid" desaparecen del árbol global.

### Lote 5 — Bug fallback continente (acoplado)
**Alcance:** mover `?? continentFallback` dentro de `canonicalContinent` (1 línea, ya documentado en `t1-geography-tree-postfix-visual-audit.md §4`). No es estrictamente canon territorial pero comparte el principio "el reader no inventa, normaliza".
**Estado:** **YA APLICADO** en PR `continent-fallback-canonical` (ver `src/test/continent-fallback-canonical.test.ts`). Documentado aquí por completitud del flujo.

---

## 6. Política de datos durante la ejecución

- **Cero re-enrich.** Cambios de FK no disparan IA.
- **Backfills permitidos:** `admin_areas` (catálogo) y `locations.{country_id, region_id, zone_id, admin3_id, locality_id}` (remapeos por canon).
- **Backfills prohibidos:** `enriched_data.*`, `name`, `latitude`, `longitude`, `raw_geocode`, tags, colecciones, ratings.
- **Idempotencia obligatoria.** Cada job de remapeo debe poder re-ejecutarse sin efecto secundario adicional.
- **Trazabilidad.** Cada remapeo escribe en `location_geo_provenance` (`source='t2-canon-lote-N'`).
- **Sin migración masiva en un solo paso.** Cada lote en su PR, con métrica antes/después en el audit acompañante.

---

## 7. Política de imports durante la ejecución

Sin cambios al lifecycle (`import_lifecycle_by_channel` sigue: web/manual auto-aprueban, kml/gpx/geojson/csv quedan `normalized`). El canon restringe **qué FKs** se aceptan en `normalized`, no cuándo se aprueban:

1. Si el origen trae `zone`/`zone_id` y `!hasProvincia(country)` → descarte silencioso del campo + warning en `documents.metadata.import_warnings`.
2. Si el origen trae `admin3_id` y `municipioField==='locality'` → mover a `locality_id` si no choca, descartar si choca, warning siempre.
3. Si el origen trae `zone_name == region_name` y país no en whitelist `regionEqZoneWhitelist` → poblar solo `region_id`, marcar `geo_health.review='zone-equals-region-unlisted'`.
4. POIs sin `country_code` resoluble → `geo_health='empty'`, backlog geo-repair. Sin invento.

---

## 8. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Catálogo `admin_areas` incompleto en países distintos a PT (p.ej. FR départements, IT province) → backfill PT no extrapolable. | Auditoría por país antes de cada lote. Backfill catálogo se hace por país, no en bloque. |
| R2 | Geocoder devuelve `admin_level_2` plausible en países `hasProvincia=false` → tentación de aceptarlo. | Regla dura `resolveAllFks`: descarte incondicional + warning estructurado. |
| R3 | Whitelist `region_eq_zone` incompleta → falsos warnings en CABA, Wien, etc. | Whitelist viene del canon §4 (lista cerrada). Casos nuevos requieren PR `canon-change`. |
| R4 | Fixtures E2E con `country=''` rompen el árbol. | Mantener fixtures sandbox como están (`sandbox-agent@vandits.test`); UI ya tolera con placeholder `(sin país)`. |
| R5 | `compute-geo-health` baja `partial→ok` masivamente sin pasar por QA. | Cada lote audita delta antes/después y publica diff en `docs/audits/t2-lote-N-postfix.md`. |
| R6 | Cambios FK invalidan caches en cliente (`useLocationsStore`). | Realtime + bump `updated_at` por POI tocado. No requiere full reload. |
| R7 | Hardcode oculto reaparece en PR (regresión cultural). | Lint check (grep CI) que falla si aparece `country === 'PT'` (o cualquier ISO2 hardcoded en `src/shared/geography/**` fuera de `territorial-canon.ts`). |

---

## 9. Rollback

Por lote:

| Lote | Rollback |
|---|---|
| L1 (mirror + piloto PT) | Revert PR. `admin_areas` PT nivel-2 puede quedar poblado (no daña). Remapeo `region_id` reversible: job inverso desde `location_geo_provenance` (`source='t2-canon-lote-1'`). |
| L2 (sin provincia) | Revert PR. Limpieza de `zone_id` espurios reversible desde `location_geo_provenance`. |
| L3 (municipio_field) | Revert PR. Remapeos `admin3_id ↔ locality_id` reversibles desde provenance. |
| L4 (UI collapse) | Revert PR. Sin impacto en datos. |
| L5 (continente fallback) | Ya aplicado y reversible con `git revert` del PR aislado. |

Kill-switch global: feature flag `feature.territorial_canon_enforcement` en `app_settings` para apagar el `resolveAllFks` canon-aware sin revert (solo si emerge incidencia masiva). Cliente y edge consumen el flag. Default ON tras L1 verde.

---

## 10. Tests

Por capa:

| Test | Cobertura mínima |
|---|---|
| `territorial-canon-parity` | TS ↔ Deno mirror byte-equivalent para los 39 países. |
| `territorial-canon-pdf-conformance` | Cada fila de §1 del contrato presente y consistente en el mirror. |
| `resolve-admin-fks.canon.test` | (a) PT/ES/FR/IT/GB/US categoría A → asigna `zone_id`. (b) NL/SE/NO/FI/BR/AU/JP/MX/CO categoría B → descarta `admin_level_2`. (c) Whitelist `region_eq_zone`: CABA, Wien, Madrid uniprov., BXL, DC. (d) Geocoder devuelve `region==zone` fuera de whitelist → warning. |
| `hierarchy.canon.test` | (a) `getLocationHierarchy` omite `zone` en categoría B. (b) Colapsa `region==zone` legítimo. (c) Lee `*Resolved` antes que legacy (regresión T1-fix). |
| `geography-tree.canon.test` | (a) Render Portugal sin `(sin región)` post-piloto. (b) Render Países Bajos sin nodo "Provincia". (c) Render España sin "Madrid · Madrid" duplicado. |
| `import.canon.test` | KML con `zone` en NL → descarte + warning. CSV con `admin3` en MX → mueve a `locality`. |
| `compute-geo-health.canon.test` | NL/SE con `zone NULL` → `geo_health='ok'` (no `partial`). |
| `e2e-geography-tree.spec` | Smoke E2E con fixtures sandbox: árbol carga, expande Europa, expande Portugal, no aparece `(sin región)`. |

Lint check CI (grep): falla si aparece literal ISO2 de país en switch/if dentro de `src/shared/geography/**` (excluido `territorial-canon.ts` y tests).

---

## 11. Entregables documentales

| Doc | Cuándo |
|---|---|
| Este plan | T2 kickoff (ahora). |
| `docs/audits/t2-lote-1-pt-pilot-postfix.md` | Tras L1 mergeado. Delta antes/después PT + verificación cero hardcodes. |
| `docs/audits/t2-lote-2-no-provincia-postfix.md` | Tras L2. Delta por país categoría B. |
| `docs/audits/t2-lote-3-municipio-field-postfix.md` | Tras L3. |
| `docs/audits/t2-lote-4-region-eq-zone-postfix.md` | Tras L4. |
| `docs/tech-debt.md` | Actualizar en cada lote: marcar T2.x cerrado, mover residuales. |
| `mem://geography/territorial-canon-application` | Crear al merge de L1 con: "Canon territorial es lookup ISO2 único; prohibido hardcode por país; lotes B → C tras piloto PT". |

---

## 12. Lo que **NO** está en T2

- Re-enrich de POIs (descripciones, ratings, imágenes).
- Cambios a `enriched_data.*`, `tags`, colecciones, follows.
- Cambios a `places` / `places_trunk` / `containment` (canon containment v2 ya cubierto en `geo-territorial-canon.md`, ortogonal).
- Cambios a `app_settings.icon_library`, paletas, design tokens.
- Cambios a RBAC, RLS, edge functions de auth.
- Nuevos países fuera de los 38+RU del PDF (requiere PR `canon-change`).

---

## 13. Restricciones respetadas en este documento

- Solo escritura de `docs/audits/t2-territorial-canon-application-plan.md`.
- Sin cambios en datos, código, migraciones, edge functions, re-enrich, `package.json`, `.lovable/plan.md`, `docs/tech-debt.md` ni mirrors `mem://`.
- Sin bump de versión.
