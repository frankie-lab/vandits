# Postflight — PR-COUNTS-1: Unificación de `catalogVisibleUniverse`

> Status: **DONE**. Cierra el gap Top bar 5.095 vs FilterBar 5.100.
>
> Companions:
> - [`../contracts/poi-counts-canon.md`](../contracts/poi-counts-canon.md) §3.A
> - [`./poi-counts-global-sources-audit.md`](./poi-counts-global-sources-audit.md) (filas #1, #5; cierra H1)
> - [`./search-filter-selection-state-cross-mode-postflight.md`](./search-filter-selection-state-cross-mode-postflight.md)
>
> Owner doc-set: Content domain.

---

## 1. Causa raíz

`FilterBar` (modo Explorar) derivaba el universo base desde
`getVisibleUniverseLocations()` del store, que es la **fuente B
(`mapVisibleUniverse`)** según el canon: `annotated.filter(
isLocationVisibleInGlobalMap) ∪ detachedVisibleLocations`. Esa fuente
incluye 5 POIs detached que **no pertenecen al catálogo visible**
(seguidos sin `is_approved` o ajenos sin documento accesible).

El top bar (`FloatingToolbar`) consume `getBucketStats(getAllLocations(),
uid)` y reporta `catalogTotal = myCatalog + followedCatalog` (sólo
aprobados). Esa es la **fuente A (`catalogVisibleUniverse`)**.

Resultado: misma etiqueta visible (`ubicaciones`/`POIs`) sobre dos
universos distintos → violación del canon §5.

## 2. Decisión de producto

El header de **Buscar y Filtrar → Explorar**, `Míos`, `Seguidos`,
subtabs de Mantener, árbol y footer **deben** usar la misma SoT que el
top bar: `catalogVisibleUniverse` (sólo aprobados, sin detached
ajenos). El mapa sigue consumiendo `mapVisibleUniverse` para markers
(no se toca).

Etiqueta única "catálogo visible" para ambas superficies.

## 3. Helper / fuente SoT

Nuevo helper canónico:

- `src/domains/content/lib/visible-catalog-universe.ts` →
  `getVisibleCatalogUniverse<T>(locations, currentUserId)`
- Predicado: `getLocationBucket(loc, uid) ∈ {myCatalog,
  followedCatalog}` (reutiliza el bucket matrix; sin lógica nueva).

Consumidores legítimos:

- `FloatingToolbar` indirectamente vía `getBucketStats` (ya
  alineado, sin cambio).
- `FilterBar` directamente (cableado en este PR).

## 4. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/domains/content/lib/visible-catalog-universe.ts` | **creado** — helper SoT |
| `src/components/FilterBar.tsx` | `allLocationsForUniverseSource` ahora deriva de `getVisibleCatalogUniverse(getAllLocations(), user?.id)`; quitadas dependencias a `getVisibleUniverseLocations` y `detachedVisibleLocations` para esta superficie |
| `src/test/visible-catalog-universe-unification.test.ts` | **creado** — 9 tests de contrato |

Sin cambios en: `locations-store.ts`, `FloatingToolbar.tsx`,
`location-bucket.ts`, `resolve-universe-base.ts`,
`getFilteredLocations` (markers), serializers, edge functions, schema.

## 5. Counts antes / después

| Superficie | Antes | Después |
|---|---|---|
| Top bar verde (`myCatalog`) | 4.739 | 4.739 |
| Top bar azul (`catalogTotal`) | 5.095 | 5.095 |
| FilterBar header total | **5.100** | **5.095** |
| FilterBar Míos | 4.739 | 4.739 |
| FilterBar Seguidos | **361** | **356** |
| Gap visible | **5** | **0** |

Subtabs/árbol de Mantener: derivan del mismo `universeBaseLocations` →
caen los mismos hasta 5 POIs si esos detached cumplían el predicado de
deuda/sin-enriquecer (sin impacto sobre la regla, sólo sobre la
cifra).

## 6. Tests ejecutados

```
bunx vitest run visible-catalog-universe-unification
  → 9 passed (9)

bunx vitest run filterbar floating-toolbar location-bucket
  → src/test/filterbar-counts-unification.test.ts (5 tests) PASS
```

Assertions clave (todas `toBe`, sin tolerancias):

- `getVisibleCatalogUniverse` excluye propios borrador, seguidos no
  aprobados y detached ajenos no aprobados.
- `getVisibleCatalogUniverse` incluye `myCatalog + followedCatalog`.
- `topBarStats.catalogTotal === FilterBar T`.
- `topBarStats.myCatalog === FilterBar Tm`.
- `topBarStats.followedCatalog === FilterBar Ts`.
- `T === myCatalog + followedCatalog` (no gap).

## 7. Confirmación de no redondeo

No se introduce `Math.round/ceil/floor`, `toFixed`, `toPrecision`, ni
lenguaje aproximado en ninguno de los archivos modificados. El único
formateo aplicado a counts es `Intl.NumberFormat('es-ES')`
preexistente para separador de miles. Cumple `poi-counts-canon.md`
§2.1 y §9.

## 8. Dónde quedan los 5 detached ajenos no aprobados

- **Fuera** del catálogo visible (`catalogVisibleUniverse`): no se
  cuentan en top bar, FilterBar header, Míos, Seguidos, subtabs ni
  árbol.
- **Dentro** de `mapVisibleUniverse` (`getVisibleUniverseLocations()`):
  siguen visibles en el mapa si superan los zoom gates y la
  configuración de capas — su render no se ha tocado.
- Mantenimiento técnico (`UsersSidebar`, `IncompleteLocationsPanel`,
  etc.) sigue consumiendo `mapVisibleUniverse` y los ve.

Conclusión: 0 POIs perdidos del sistema; sólo se reclasifican fuera de
la etiqueta "catálogo visible" donde no pertenecían.

## 9. Confirmación de no-impacto

No se ha tocado:

- datos (ninguna migración, ninguna mutación).
- schema (ninguna `supabase/migrations/`).
- backend (ninguna edge function).
- `PR-EXPORT-2 core` (ni `evaluatePoiExport` ni `runPoiExport`).
- serializers (`kml-parser`, etc.).
- `getFilteredLocations` (markers/mapa).
- `getVisibleUniverseLocations` (mapa/markers/UsersSidebar).

## 10. Próximos PRs

- `PR-COUNTS-2` (subtab "Con deuda" 22 vs 18). No abierto en este PR.
- `PR-COUNTS-3` (tests de contrato §8 del canon).
- `PR-COUNTS-4..6` según prioridad en
  [`./poi-counts-global-sources-audit.md`](./poi-counts-global-sources-audit.md) §5.
