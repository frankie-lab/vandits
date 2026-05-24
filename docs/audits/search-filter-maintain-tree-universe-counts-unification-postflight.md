# Postflight — Unificación de counts en Mantener (BLOQUEANTE)

Fecha: 2026-05-23
Ref: `docs/audits/search-filter-maintain-tree-universe-plan.md`,
`docs/audits/search-filter-maintain-tree-universe-visual-validation.md`.

## Causa raíz

Los tres widgets de Mantener leían fuentes distintas:

| Widget | Fuente previa | Predicado |
|---|---|---|
| Chip subtab (Con deuda / Sin enriquecer) | `filteredLocations` (post-tree filters, post-selection) | `getPoiCurationLevel` con buckets de curación (POI-5 / POI-0+1) |
| CTA "ACCIÓN SOBRE …" | `filteredLocations ∩ universeBaseIds` | `isLocationInDebtUniverse` / `isLocationInUnenrichedUniverse` (vía `resolveUniverseBase`) sobre `getAllLocations()` |
| Árbol Geo/Tipo/Tags/Legacy | `UniverseBaseProvider(getAllLocations())` | `resolveUniverseBase` sobre `getAllLocations()` |

Tres divergencias acumuladas:

1. **Predicado distinto en subtab**: `getPoiCurationLevel` (POI-0/1 vs POI-5) ≠ `isLocationInDebtUniverse`/`isLocationInUnenrichedUniverse`. POI-5 exige enriched + deuda, mientras que el universo `debt` incluye también no-enriquecidos con `geoHealth ∈ {partial, stale_name, empty}`.
2. **Pool fuente distinto entre CTA y árbol**:
   - CTA partía de `filteredLocations` (que pasa por `_computeFiltered`: dedupe annotated + detached + visibility/share-boundary).
   - Árbol partía de `getAllLocations()` (sólo `documents.flatMap(...)`, sin `detachedVisibleLocations`, sin filtrado de visibilidad / share boundary).
3. **Doble filtrado**: el CTA además intersectaba con `filteredLocations`, que ya recortaba por selección (`getFilteredLocations` aplica `ignoreSelection:false`).

Resultado: subtab=13 / CTA=15 / árbol=22 en Con deuda; 1302/1306/1335 en Sin enriquecer.

## Fix aplicado

SoT única para el universo activo: **`getVisibleUniverseLocations()`** (annotated filtrado por `isLocationVisibleInGlobalMap` + `detachedVisibleLocations`, dedup). Esta fuente alimenta:

1. `curationBuckets.conDeuda` = `resolveUniverseBase('debt', source).length`
2. `curationBuckets.sinEnriquecer` = `resolveUniverseBase('unenriched', source).length`
3. `UniverseBaseProvider` consumido por los 4 árboles (`GeographyTree`, `ClassificationTree`, `TagsTree`, `PlaceTypeFilter`)
4. `effectiveActionSet` (CTA + "Seleccionar todo")

`effectiveActionSet` se reescribe partiendo de `universeBaseLocations` y aplicando los ejes del árbol vía `matchesLocationFilters(loc, filters, { includeHealth: false })`. Sin `treeSelection` ni `userSelection`, `effectiveActionSet = universeBase`. No depende de `filteredLocations`.

`handleSelectAllInMode` usa el mismo predicado para garantizar paridad con el CTA.

## Archivos modificados

- `src/components/FilterBar.tsx`
  - Eliminado `import getPoiCurationLevel` (legacy predicate).
  - Añadido `import matchesLocationFilters`.
  - Nuevo `allLocationsForUniverseSource = getVisibleUniverseLocations()`.
  - `curationBuckets` recalculado vía `resolveUniverseBase`.
  - `effectiveActionSet` parte de `universeBaseLocations` + matcher (sin health, sin selection si está vacía).
  - `handleSelectAllInMode` usa misma fuente.

## Archivos creados

- `src/test/filterbar-counts-unification.test.ts` — 5 tests de invariante:
  - debt: subtab == CTA == universeBase.length
  - unenriched: subtab == CTA == universeBase.length
  - followed consistency (POI seguido con deuda cuenta igual en universe/CTA)
  - geo-orphan consistency (POI sin geo con `geoHealth=empty` cuenta igual)
  - source guard (matcher con filters vacíos no excluye ningún POI del universe)

## Tests ejecutados

```
✓ src/test/resolve-universe-base.test.ts (9 tests)
✓ src/test/filterbar-counts-unification.test.ts (5 tests)
Test Files  2 passed (2)
Tests       14 passed (14)
```

## Invariantes confirmadas

Para todo `mode ∈ {'debt', 'unenriched'}` y sin `treeSelection` ni `userSelection`:

```
subtabCount == ctaCount == Σ rootCounts(Geo) == universeBase.length
```

Garantizado algebraicamente porque las tres lecturas derivan de
`resolveUniverseBase(mode, getVisibleUniverseLocations())`.

## Counts antes/después (esperados)

| Modo | Antes (subtab/CTA/Geo) | Después (subtab=CTA=Geo) |
|---|---|---|
| Con deuda | 13 / 15 / 22 | igual valor único (= `\|universeBase('debt')\|`) |
| Sin enriquecer | 1302 / 1306 / 1335 | igual valor único (= `\|universeBase('unenriched')\|`) |

El valor único se estabiliza en el resultado de `resolveUniverseBase` sobre `getVisibleUniverseLocations()` (incluye followed con deuda + orphans geo en `empty/partial/stale_name`). Verificación visual en preview pendiente del próximo deploy del sandbox.

## Followed / propios / huérfanos geo — decisión

- **Followed con deuda/sin enriquecer**: SÍ cuentan (entran vía `isLocationVisibleInGlobalMap` + detached), en los TRES widgets a la vez.
- **Orphans geo (sin país/región resuelta) con `geoHealth ∈ {partial, stale_name, empty}`**: SÍ cuentan en universe, CTA y nodo "Sin geo / Sin clasificar" del árbol Geo.
- **`sourceKind ∈ {app, external}`** en universe `unenriched`: NO cuentan (lo decide `isLocationInUnenrichedUniverse`), en los tres widgets a la vez.

Una sola decisión: si un POI está en `universeBase`, cuenta en todos. Si no, no cuenta en ninguno.

## Release-ready

**SÍ**, condicionado a verificación visual del próximo preview:
- Subtab "Con deuda" == número junto a "ACCIÓN SOBRE CON DEUDA" == suma de raíces Geo.
- Subtab "Sin enriquecer" == número junto a "ACCIÓN SOBRE SIN ENRIQUECER" == suma de raíces Geo.

Tests automatizados ya cubren la invariante algebraica.

## Restricciones respetadas

- No tocado: `ExportPanel`, PR-EXPORT-2 core, serializers, datos, schema, backend.
- Sin bump de versión.
