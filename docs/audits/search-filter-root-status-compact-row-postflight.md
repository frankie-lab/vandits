# Search & Filter — Root Status A/B/C/D (fila compacta) · Postflight de cierre

**Estado:** ✅ Cerrado como filtro transversal.
**Fecha:** 2026-05-24
**PRs relacionadas:** PR-FILTER-ROOTSTATUS-2, PR-FILTER-ROOTSTATUS-2.0.1,
PR-FILTER-ROOTSTATUS-2.1, PR-FILTER-ROOTSTATUS-2.2 (opción C).

Este documento consolida la decisión y cierra el eje **Root Status A/B/C/D**
como filtro transversal del árbol de búsqueda. No se abre la 5ª tab Identity.

---

## 1. Decisión UX

**Opción C — fila compacta de chips sobre el árbol.**

Descartadas:

- **A** · 5ª tab Identity global — sobrecargaba la navegación para un eje
  derivado y ya disponible vía `filters.rootStatus`.
- **B** · Mantener A/B/C/D sólo en Con deuda — insuficiente; el eje es útil
  como filtro transversal (auditoría, export, selección).

Resultado: una **fila compacta** (`<RootStatusChipRow>`) renderizada sobre
los ejes Geo / Tipo / Tags / Legacy del árbol de filtros, con counts
derivados del universo activo.

## 2. Dónde aparece

La fila se monta dentro del `UniverseBaseProvider` de `FilterBar.tsx` y es
visible en los siguientes contextos:

| Contexto | Universo (scope de counts) |
|---|---|
| **Explorar** | catálogo completo visible |
| **Mantener · Con deuda** | `universeBase('debt')` |
| **Mantener · Sin enriquecer** | `universeBase('unenriched')` |
| **Selección activa** (cualquiera de los anteriores) | `universeBase(activeUniverse) ∩ selectedLocations` |

`hideWhenEmpty` oculta el row cuando el universo está vacío.

## 3. Comportamiento

- **Click / toggle** sobre un chip A, B, C o D añade o quita esa letra del
  array `filters.rootStatus`.
- **Multi-select** soportado (ej: `['A','D']` ⇒ matchea POIs cuyo
  rootStatus ∈ {A, D}).
- Si la selección queda en `length === 0`, el setter **elimina la clave**
  `rootStatus` del objeto `filters` (no array vacío) para que
  `matchesLocationFilters` no aplique el eje.
- Atributos QA: `data-testid="root-status-chip-row"`,
  `data-scope-total`, `data-selection-active`,
  `data-testid="root-status-chip-{A|B|C|D}"`, `data-active`.

## 4. Combinación con otros ejes

El eje `rootStatus` se aplica en `matchesLocationFilters` **en AND** con el
resto de ejes del árbol:

- ✅ **Geo** (region / zone / admin3 / locality).
- ✅ **Tipo** (place type).
- ✅ **Tags** (personal y semánticos).
- ✅ **Legacy** (colecciones, búsqueda de texto, healthFilter).

Toggle de un chip A/B/C/D **no muta** ningún otro eje (test
`toggle no toca otros ejes de filters`).

## 5. ExportPanel y "Seleccionar todo"

- **ExportPanel**: lee el subset filtrado vía `matchesLocationFilters`, que
  ya respeta `filters.rootStatus`. La eligibilidad final sigue gobernada
  por `evaluatePoiExport` (PR-EXPORT-1) — `rootStatus` es un filtro de
  scope, **no** una excepción al contrato de export.
- **"Seleccionar todo"** (`SelectionActions` + `effectiveActionSet`):
  opera sobre el mismo subset filtrado. Si el usuario tiene
  `rootStatus=['D']` activo, "Seleccionar todo" añade únicamente POIs D.

Confirmado por inspección: ambos call sites consumen `filteredLocations`
derivado de `matchesLocationFilters(loc, filters)`.

## 6. Resolver deuda — gating intacto (PR-FILTER-ROOTSTATUS-2.1)

El diálogo `HealthRepairPreviewDialog` sigue usando
`partitionRepairScopeByRootStatus`:

- Solo `D ∩ {partial, chain}` entra en `repairableIds` → único conjunto
  enviado a `enqueue_health_repair`.
- A → `identityIncomplete` (nunca a RPC).
- B → `systemDebt` (nunca a RPC).
- C → `review` (nunca a RPC).
- D + `{hardError, review}` → `nonRepairableByType` (nunca a RPC).
- `repairableCount === 0` ⇒ botón de confirmación deshabilitado.

La fila compacta puede pre-acotar el scope (ej: marcar `B` para auditarlo)
pero **no relaja** el gating server-side ni el client-side.

## 7. Tests ejecutados

| Suite | Resultado |
|---|---|
| `src/test/root-status-chip-row.test.tsx` (2.2) | ✅ 5/5 |
| `src/test/health-repair-partition.test.ts` (2.1) | ✅ 10/10 |
| `src/test/poi-identity-root-status-client-parity.test.ts` (2 + 2.0.1) | ✅ 23/23 |

Regresiones de 2.1 y 2.0.1 verdes. Paridad cliente↔Deno al 100%.

## 8. No tocado (fuera de alcance)

Confirmación explícita de que este cierre **no toca**:

- ❌ Backend (RPCs, edge functions, jobs).
- ❌ Datos (no migraciones de datos, no recomputo masivo).
- ❌ Schema (no columnas nuevas, no índices, no enums).
- ❌ **Marker fill** (sigue `marker-fill-canon-v3.md`).
- ❌ **POI-N** (`computePoiMaturity` intacto).
- ❌ **Health rings** (`getPointHealthRings` intacto).
- ❌ RLS / visibilidad / share / export contract core.
- ❌ 5ª tab Identity (descartada explícitamente).

## 9. Siguiente paso (opcional)

Ninguno planificado. Si emerge necesidad futura de exponer A/B/C/D como
navegación de primer nivel, reabrir como **PR-FILTER-ROOTSTATUS-3** con
nuevo dossier UX. Hasta entonces, la fila compacta es la SoT de
interacción para el eje Root Status.
