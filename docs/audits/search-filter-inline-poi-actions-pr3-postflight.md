# PR-INLINE-3 — Footer inline + DebtResolutionPanel fuera del flujo principal

Estado: APROBADO
Versión: `v1.4.3` (patch desde `v1.4.2`)
Fecha: 2026-05-24
Refs:
- Plan: `docs/audits/search-filter-inline-poi-actions-plan.md`
- Postflights previos: `docs/audits/search-filter-inline-poi-actions-pr1-postflight.md`,
  `docs/audits/search-filter-inline-poi-actions-pr2-postflight.md`
- Política: `docs/contracts/release-versioning-policy.md`

## Objetivo

Cerrar la UX inline de **Buscar y Filtrar → Mantener → Con deuda**: el
árbol/lista actual es la superficie operativa primaria. El botón primario
**"Resolver deuda"** deja de abrir la pantalla secundaria "Volver · Resolver
deuda · N puntos" (`DebtResolutionPanel`) como flujo principal y pasa a
abrir directamente el modal de confirmación `HealthRepairPreviewDialog`,
operando sobre el `activeSet` derivado de la selección local (si existe) o
del subconjunto activo.

## Cambios

### Código
- **`src/components/FilterBar.tsx`**
  - Se eleva `UniverseBaseProvider` + `DebtSelectionProvider` al wrapper
    exterior del panel (antes envolvían sólo el bloque del árbol), para que
    el footer y el dialog vivan dentro del mismo contexto de selección
    local debt.
  - Se expone `treeFilteredBase = universeBase ∩ treeSelection` como
    `useMemo` independiente, separado de `effectiveActionSet` (que sigue
    intersectando con `selectedLocations` global para el resto del panel).
  - Se sustituye el bloque inline `<EffectiveActionFooter …>` +
    `<HealthRepairPreviewDialog …>` por un componente interno
    `DebtAwareFooter` que:
    - lee `useDebtSelection()`;
    - en `mode === 'debt'` con `debt.size > 0`, define
      `activeSet = treeFilteredBase.filter(l => debt.isSelected(l.id))`;
    - en cualquier otro caso, usa la lógica previa
      (`treeFilteredBase` intersectado con `selectedLocations` global);
    - cablea `onResolveDebt={() => setDebtModalOpen(true)}`;
    - `onClearSelection` limpia la selección **local** debt si está activa;
    - el dialog se mueve dentro del wrapper para que su `scope` use el
      mismo `activeSet`.
  - **La ruta `setDebtPanelOpen(true)` ya no se invoca desde el primary
    "Resolver deuda".** `DebtResolutionPanel` permanece montado en código
    (gated por `debtPanelOpen`), reservado como fallback/debug futuro.

### Tests
- **Nuevo**: `src/test/inline-footer-pr-inline-3.test.tsx` (6 casos):
  1. Click "Resolver deuda" abre `HealthRepairPreviewDialog` y **no**
     renderiza `[data-testid="debt-resolution-panel"]`.
  2. Abrir el dialog **no** llama `supabase.rpc`.
  3. Con `debt.size > 0`, el `scope` del dialog y `data-footer-count` del
     footer reflejan **sólo** los ids seleccionados localmente.
  4. Sin selección local, `scope = treeFilteredBase` completo.
  5. Label del footer cambia a `seleccionados` cuando hay selección local.
  6. Label del footer muestra `POIs con deuda` sin selección local.
- **Regresión verde** (mismas suites, sin cambios):
  - `debt-resolution-sidepanel-phase1` (11) — el panel sigue siendo
    válido en aislado, sólo no se monta desde la ruta principal.
  - `debt-panel-selection-pr-inline-2` (15) — selección local sigue
    aislada de `selectedLocations` global.
  - `tree-poi-row-pr-inline-1` (5) — filas POI, popup y mapa intactos.
  - `effective-action-footer` (12).
  - `health-repair-dialog` (8).
  - `health-repair-resolve-button-wiring` (5).
  - `health-repair-partition` (8).
- **Total: 75/75 pass**.

### Versionado
- `package.json`: `1.4.2 → 1.4.3` (patch).
- `src/lib/app-version.ts`: `APP_VERSION = '1.4.3'`.
- `docs/releases/version-history.md`: entrada `v1.4.3` añadida al árbol y
  al apartado narrativo.

## Política de release (per `release-versioning-policy.md`)

| Campo | Valor |
|---|---|
| `user_visible` | yes (el primary "Resolver deuda" deja de abrir un
panel secundario y abre directamente el modal de confirmación) |
| `contract_change` | no (mismo `enqueue_health_repair`, mismas
capabilities, mismo bridge `geo-maintenance-handoff`) |
| `version_history_required` | yes |
| `bump_required` | yes |
| `recommended_bump` | patch |
| `release_impact` | yes |

## Criterios APROBADO (todos cumplidos)

- "Resolver deuda" **ya NO** abre `DebtResolutionPanel` desde el footer.
- Acciones individuales siguen llegando por popup del POI
  (regresión PR-INLINE-1 verde).
- Acciones de lote viven en el footer; primary "Resolver deuda" abre el
  modal de confirmación.
- Footer usa **selección local debt** si existe; si no, usa el
  subconjunto activo (`universeBase ∩ treeSelection`).
- D repair sigue siendo el ÚNICO camino de escritura, vía confirmación
  humana en `HealthRepairPreviewDialog`.
- `selectedLocations` global intacto (regresión PR-INLINE-2 verde).
- Tests verdes (75/75).
- Postflight creado.

## Fuera de alcance (preservado intacto)

- `enqueue_health_repair` / `health-repair-partition` (sin cambios).
- Bridge `geo-maintenance-handoff` y `GeographyBackfillPanel` (sin cambios).
- Schema, datos, RLS, backend, Nominatim.
- Marker fill, POI-N, health rings.
- PR-EXPORT-2 core, serializers.
- Capabilities.

## Notas operativas

- `DebtResolutionPanel` no se ha eliminado: queda como código alcanzable
  sólo si en el futuro se decide exponerlo como acción secundaria
  "Ver desglose avanzado" dentro del menú "Más acciones" del footer.
  Para ese cambio se abriría un nuevo PR aparte.
- El `useEffect` que cierra `debtPanelOpen` al salir de `mode='debt'` se
  mantiene como defensa: si alguna ruta externa abriera el panel, sigue
  cerrándose al cambiar de modo.
