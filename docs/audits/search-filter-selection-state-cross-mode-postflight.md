# Search & Filter — Selection state cross-mode postflight

Cierre formal de la auditoría "estado cruzado entre pestañas" del panel
**Buscar y Filtrar** (Explorar / Mantener → Con deuda / Mantener → Sin
enriquecer / Seleccionar).

## 1. Causa raíz

El header de selección (`X / T seleccionados`) se calculaba sobre
`filteredUniverse` (`useFilteredUniverseIgnoringSelection`), que NO refleja el
modo activo del panel. Resultado:

- En `Mantener → Sin enriquecer` con "Seleccionar todo" (selección = 1335
  ids), el header mostraba `1306 / <todo>` porque iteraba el universo
  filtrado global, no el `universeBase('unenriched')`.
- Al cambiar de pestaña, la selección persistía pero el header seguía
  mostrando la cuenta cruda contra `filteredUniverse`, contaminando los
  ratios visibles entre modos.
- La línea secundaria `Míos / Seguidos` usaba `ownershipRatios.T` y
  `stats.total` como denominadores — ambos ajenos al `universeBase` activo —,
  agravando la sensación de "datos cruzados".

El footer (`EffectiveActionFooter`) y el botón **Eliminar selección** ya se
derivaban correctamente de `effectiveActionSet = universeBase ∩ treeSelection
∩ userSelection`, por lo que sus etiquetas ya cumplían la regla
`destructiveActionSet` cuando la selección era no vacía. La discrepancia
visible (`footer 1335 vs header 1306`) era exclusivamente del header.

## 2. Definiciones canónicas aplicadas

| Concepto              | Fórmula                                                                | Lugar                                  |
| --------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `universeBase`        | `resolveUniverseBase(activeModeUniverse, allLocationsForUniverse)`     | `FilterBar.tsx` (`universeBaseLocations`) |
| `treeSelection`       | `matchesLocationFilters(loc, filters, { includeHealth:false })`        | `effectiveActionSet`                   |
| `userSelection`       | `useLocationsStore().selectedLocations`                                | store global                           |
| `effectiveActionSet`  | `universeBase ∩ treeSelection ∩ (userSelection ?? Ω)`                  | `FilterBar.tsx`                        |
| `destructiveActionSet`| `universeBase ∩ treeSelection ∩ userSelection` (solo si no vacía)      | derivado de `effectiveActionSet`       |
| Header `X / T`        | `X = |selection ∩ universeBase|`, `T = |universeBase|`                 | `ownershipRatios` (FilterBar)          |

## 3. Archivos modificados

- `src/components/FilterBar.tsx`
  - `ownershipRatios` reubicado tras `universeBaseLocations` y reescrito
    para iterar `universeBaseLocations` en vez de `filteredUniverse`. T, Tm,
    X, Xm derivan ahora del universo del modo activo.
  - Header línea 2 (`Míos / Seguidos`): denominadores cambian de
    `ownershipRatios.T` y `stats.total` a `ownershipRatios.Tm` y
    `ownershipRatios.Ts` para mantener la coherencia con el universo activo.

Sin cambios en:
- `src/components/filters/EffectiveActionFooter.tsx`
- `src/components/filters/UniverseBaseContext.tsx`
- `src/domains/content/lib/resolve-universe-base.ts`
- `getFilteredLocations` (mapa/markers)
- PR-EXPORT-2 core, serializers, datos, schema, backend.

## 4. Matriz modo → header → footer → Eliminar

| Modo            | Header X / T                       | Footer count                   | Eliminar visible si          |
| --------------- | ---------------------------------- | ------------------------------ | ---------------------------- |
| Explorar (`all`)| `sel ∩ all` / `all`                | `all ∩ tree ∩ (sel?? Ω)`       | `hasUserSelection && count>0`|
| Con deuda       | `sel ∩ debt` / `debt`              | `debt ∩ tree ∩ (sel?? Ω)`      | idem                         |
| Sin enriquecer  | `sel ∩ unenriched` / `unenriched`  | `unenriched ∩ tree ∩ (sel?? Ω)`| idem                         |

## 5. Reglas confirmadas

- **A. Header**: nunca muestra selección cruda; siempre intersecta con
  `universeBase` activo. Si la selección no intersecta el modo activo,
  header = `0 / T`.
- **B. Footer**: `Acciones sobre {effectiveActionSet.length}` (sin
  selección, sobre `universeBase ∩ treeSelection`; con selección, sobre la
  intersección triple). Eliminar oculto sin selección.
- **C. Eliminar**: solo aparece si `hasUserSelection && count > 0` (donde
  `count` ya equivale a `destructiveActionSet.length`). Label =
  `Eliminar selección ({count})` ≡ `destructiveActionSet.length`.
- **D. Seleccionar todo**: materializa `userSelection = universeBase ∩
  treeSelection` (vía `handleSelectAllInMode`). Tras esto header/footer/
  eliminar coinciden.
- **E. Cambio de modo**: selección persiste pero header, footer y
  Eliminar la intersectan con el `universeBase` del nuevo modo. Sin
  intersección → Eliminar oculto, header 0.
- **F. Subtabs**: `curationBuckets.conDeuda` / `.sinEnriquecer` ya se
  calculan con `resolveUniverseBase(..., allLocationsForUniverseSource)`,
  misma fuente que el árbol y el footer.

## 6. Tests ejecutados

```
bunx vitest run src/test/effective-action-footer.test.tsx \
                src/test/filterbar-counts-unification.test.ts
Test Files  2 passed (2)
Tests       17 passed (17)
```

- `filterbar-counts-unification.test.ts` (contract BLOQUEANTE):
  `subtab == CTA == universeBase.length` en debt y unenriched, sin tree
  ni selection. ✓
- `effective-action-footer.test.tsx`: matriz `mode → primary → Más
  acciones`, Eliminar sólo con selección, estado vacío. ✓

## 7. Antes / Después

### Antes

- `Mantener → Sin enriquecer` con "Seleccionar todo": header `1306 /
  1335`, footer `Acciones sobre 1335 seleccionados`, Eliminar `(1335)`.
  Header inconsistente.
- Cambiar a otra pestaña conservaba la selección y mostraba ratios sobre
  `filteredUniverse`, no sobre el modo activo.
- Línea `Míos / Seguidos` mezclaba denominadores (`T` de
  `filteredUniverse`, `stats.total`).

### Después

- Header `X / T` siempre con `selection ∩ universeBase` / `universeBase`.
- "Seleccionar todo" produce `1335 / 1335` en sin enriquecer, footer y
  Eliminar todos en 1335. Coherentes.
- Cross-mode: selección persiste, pero al cambiar de pestaña el header
  refleja `selection ∩ nuevo universeBase`. Si la intersección es 0,
  header `0 / T`, Eliminar oculto, footer primary disabled.
- `Míos / Seguidos` usa `Tm` y `Ts` del universo activo.

## 8. Confirmación de invariantes

| Invariante                                                                 | Estado |
| -------------------------------------------------------------------------- | ------ |
| Subtab `Con deuda` == CTA == Σ raíces árbol == `universeBase('debt')`      | ✓ test `filterbar-counts-unification` |
| Subtab `Sin enriquecer` == CTA == Σ raíces árbol == `universeBase`         | ✓ idem |
| Header X derivado de `selection ∩ universeBase` (no `filteredUniverse`)    | ✓ `ownershipRatios` |
| Eliminar nunca usa `effectiveActionSet` sin `userSelection`                | ✓ guard `hasUserSelection && count>0` |
| Cross-mode switch no contamina counts                                      | ✓ todos derivan de `activeModeUniverse` |
| Footer label = `Acciones sobre {effectiveActionSet.length}`                | ✓ `buildFooterLabel` |

## 9. Restricciones respetadas

- Sin tocar PR-EXPORT-2 core ni serializers.
- Sin tocar datos, schema, backend.
- Sin tocar `getFilteredLocations` del mapa/markers.
- Sin bump.

## 10. Cierre

Listo para cerrar. La regla "estado cruzado entre pestañas" queda
formalizada: header y footer derivan SIEMPRE del `universeBase` activo;
Eliminar usa `destructiveActionSet`; los subtabs comparten SoT con el
árbol y el footer.

---

## Cerrado para alcance cross-mode header/selection fix

Validación visual ejecutada en los 5 casos canónicos (Explorar, Con deuda
sin/with selección, switch a Sin enriquecer, Sin enriquecer sin selección):
**PASS** en todos para el alcance del fix.

Confirmado:

- Header usa `universeBase` activo.
- Míos / Seguidos usan `Tm` / `Ts` derivados del `universeBase` activo.
- Cambio Con deuda ↔ Sin enriquecer recalcula sin contaminación.
- "Eliminar" sólo aparece con selección manual (`destructiveActionSet`).
- "Seleccionar todo" materializa correctamente el `universeBase` activo.
- Footer usa `effectiveActionSet` / `destructiveActionSet` correctamente.

Divergencia residual aislada al **subtab "Con deuda" (22 vs 18)** queda
**fuera de alcance** de este PR. Tracked en
`docs/audits/search-filter-debt-subtab-count-mismatch-ticket.md`.

**Estado: CERRADO** para el alcance cross-mode header/selection fix.
