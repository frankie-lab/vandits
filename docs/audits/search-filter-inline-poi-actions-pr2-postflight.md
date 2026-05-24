# Postflight — PR-INLINE-2: Selección inline en Mantener → Con deuda

> **Plan**: `docs/audits/search-filter-inline-poi-actions-plan.md`
> **Decisión**: APROBADO
> **Versión**: sin bump (bump diferido al cierre del paquete inline).

## 1. Alcance entregado

- Hook + contexto de selección **local** aislado del store global:
  - `DebtSelectionProvider` envuelve los árboles dentro de `UniverseBaseProvider` en `FilterBar`.
  - `useDebtSelection()` expone API: `isSelected`, `toggle`, `selectMany`, `deselectMany`, `groupState`, `toggleGroup`, `clear`, `size`, `selectedIds`.
  - Estado interno = `Set<string>`. **Nunca** llama a `setSelectedLocations` / `toggleGeoBranchSelection` / cualquier setter del store global.
- Checkbox por POI en `TreePoiRow`:
  - Render condicional: sólo si hay provider (es decir, sólo en `Mantener → Con deuda`).
  - `onClick` con `stopPropagation` → no abre popup.
  - Click en fila sigue invocando `setFocusedLocation` + `requestSubsetFit` (regresión PR-INLINE-1 verde).
  - Atributo `data-tree-poi-selected="0|1"` para tests.
- Checkbox tri-state por grupo/nodo en `GeographyTree`:
  - En modo `debt` con provider activo, el `Checkbox` del nodo opera la selección **local** (`debtSel.groupState(ids)` / `debtSel.toggleGroup(ids)`).
  - Fuera de `debt`: comportamiento **legacy global intacto** (`toggleGeoBranchSelection`).
  - `ids` = `node.ids` = ids de POIs ya recortados por `filteredLocations` (que aplica `matchesLocationFilters`, incluyendo `rootStatusFilter`/`treeSelection`/no-geo). Por construcción, "grupo selecciona todos los visibles bajo el nodo".
  - Atributo `data-tree-group-checkbox="local|global"` para tests.
- Invariantes vigiladas por efectos en `DebtSelectionProvider`:
  - **Salir de `mode='debt'`** → `clear()` automático.
  - **Cambio de `universeBaseIds`** (causado por `rootStatusFilter`, `treeSelection`, `universeBase`) → **intersección** O(n) con la selección actual. Lo que ya no es visible se descarta.
- `DebtSelectionStatusBar`:
  - Muestra `N seleccionados` + botón `Limpiar selección` (llama `clear()`).
  - **Sin CTA de lote**. Sin Exportar / Reparar / Geo Maintenance / "Más acciones". Eso queda para PR-INLINE-3.
  - Se monta dentro del provider, debajo de los árboles.

## 2. Fuera de alcance (confirmado)

- Footer inline de acciones sobre selección.
- Exportar / Reparar / Geo Maintenance desde la selección local.
- Cableado en `ClassificationTree`, `TagsTree`, `PlaceTypeFilter` (sólo `GeographyTree` en esta fase).
- Eliminación / degradación de `DebtResolutionPanel`.
- Backend, schema, datos, RLS, edge functions, Nominatim.
- Marker fill, POI-N, health rings, PR-EXPORT-2 core.
- Bump de versión.

## 3. Archivos modificados / creados

- **Creado** `src/components/filters/DebtSelectionContext.tsx` — provider + hook + API; efectos de clear-on-mode e intersect-on-universe-change.
- **Creado** `src/components/filters/DebtSelectionStatusBar.tsx` — contador + botón limpiar (sin CTAs de lote).
- **Editado** `src/components/filters/TreePoiRow.tsx` — checkbox condicional (`stopPropagation`), `data-tree-poi-selected`, `aria-label`.
- **Editado** `src/components/filters/GeographyTree.tsx` — checkbox de grupo ramifica entre selección local (modo `debt`) vs legacy global; sin tocar render legacy en otros modos.
- **Editado** `src/components/FilterBar.tsx` — wrap de los árboles con `<DebtSelectionProvider>` dentro de `<UniverseBaseProvider>`; render de `<DebtSelectionStatusBar />` al final.
- **Creado** `src/test/debt-panel-selection-pr-inline-2.test.tsx` — 10 contract tests.
- **Creado** este postflight.

No se ha modificado ningún archivo de schema, store, edge function o backend.

## 4. Tests

```
bunx vitest run \
  src/test/debt-panel-selection-pr-inline-2.test.tsx \
  src/test/tree-poi-row-pr-inline-1.test.tsx
```

```
Test Files  2 passed (2)
     Tests  15 passed (15)
```

Cobertura PR-INLINE-2 (10 nuevos tests):

1. Checkbox POI marca/desmarca y no abre popup (sin `setFocusedLocation`, sin `requestSubsetFit`).
2. Click en fila sigue abriendo popup (`setFocusedLocation('p1')` + `requestSubsetFit(['p1'], 'tree-row-focus')`).
3. `toggleGroup` selecciona todos los ids visibles bajo el nodo.
4. `toggleGroup` deselecciona cuando estado es `all`.
5. Tri-state: subset seleccionado → `partial`.
6. Cambio de `universeBaseIds` (proxy de `rootStatusFilter`) intersecta la selección.
7. Cambio de `mode` de `debt` → otro → `clear()` automático.
8. Selección local NO llama `toggleGeoBranchSelection` (no contamina store global).
9. Sin provider, `TreePoiRow` no renderiza checkbox (legacy intacto).
10. Cero `supabase.rpc` / `supabase.functions.invoke` durante toda la sesión de selección.

Regresión PR-INLINE-1 (5 tests) sigue verde: contract de fila/click/botón mapa intacto.

## 5. Garantías verificadas

| Garantía                                                                  | Estado |
|---------------------------------------------------------------------------|--------|
| Checkbox POI funciona                                                     | OK     |
| Click checkbox no abre popup                                              | OK (stopPropagation + spy)   |
| Click fila sigue abriendo popup                                           | OK (regresión PR-INLINE-1)   |
| Checkbox grupo selecciona/deselecciona ids visibles bajo nodo             | OK     |
| Tri-state (`none` / `partial` / `all`) funciona                           | OK     |
| `rootStatusFilter` / `treeSelection` recortan la selección                | OK (vía intersección on `universeBaseIds`)   |
| `selectedLocations` global no muta tras interacciones inline              | OK (spy `toggleGeoBranchSelection` no llamado)   |
| Salir de `mode='debt'` limpia la selección                                | OK     |
| Sin RPC / edge functions al seleccionar                                   | OK     |
| `DebtSelectionStatusBar` sólo muestra contador + Limpiar (sin CTA lote)   | OK (componente literal, sin botones extra) |
| Geo legacy (Explorar / Sin enriquecer / Seleccionar) intacto              | OK (rama `useLocalSel=false` mantiene `toggleGeoBranchSelection`) |

## 6. Riesgos y mitigaciones

- **Selección local invisible en otros árboles**: `ClassificationTree`, `TagsTree`, `PlaceTypeFilter` aún no consumen `DebtSelectionContext`. Entra en PR-INLINE-2.bis o PR siguiente. No bloqueante (provider existe; sólo falta cableado).
- **Persistencia inter-sesión**: la selección local **no** persiste (es estado React puro). Es deseado para fase 2; PR-INLINE-3 evaluará si necesita persistencia.
- **Race entre intersección y nueva selección manual**: el `useEffect` de intersección depende sólo de `universeBaseIds`. Toggles del usuario no disparan re-intersección.

## 7. Próximos PRs (no implementados aquí)

- **PR-INLINE-2.bis** (opcional): cablear `Classification/Tags/PlaceType` con `useDebtSelection` (mismo helper, sin checkbox de grupo por ahora si no aplica).
- **PR-INLINE-3**: footer inline con CTAs de lote sobre la selección local (Exportar / Reparar / Geo Maintenance), gated por capabilities.
- **PR-INLINE-4**: degradar `DebtResolutionPanel` a `Más acciones → Ver desglose`.
- Bump de versión al cierre.

## 8. Decisión

**APROBADO**. Cumple criterios:

- Checkbox POI inline funcional, no abre popup.
- Click fila sigue abriendo popup.
- Checkbox grupo tri-state operando sobre ids visibles.
- `selectedLocations` global intacto (verificado por spy).
- Salida de modo `debt` → `clear()`; cambio de `universeBaseIds` → intersección.
- Cero RPC / edge functions.
- 15/15 tests pasan (10 nuevos + 5 regresión).
- Postflight creado.
- `DebtSelectionStatusBar` sin CTAs de lote (matiz respetado).
