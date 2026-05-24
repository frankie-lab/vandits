# Postflight — Buscar y Filtrar · EffectiveActionFooter

**Fecha**: 2026-05-24
**Alcance**: Footer fijo de acciones unificado para los 4 modos del panel Buscar y Filtrar.
**Plan original**: `docs/audits/search-filter-maintain-tree-universe-plan.md` §5/§6.
**Estado**: Implementación completa; `useBulkActions` POSPUESTO por seguridad.

---

## 1. Archivos creados / modificados

**Creados**
- `src/components/filters/EffectiveActionFooter.tsx` — componente footer.
- `src/components/filters/footer-label.ts` — `buildFooterLabel` + `buildExportLabel` (funciones puras).
- `src/test/effective-action-footer-label.test.ts` — 12 tests de labels.
- `src/test/effective-action-footer.test.tsx` — 7 tests de render/interacción.
- `src/components/filters/UniverseBaseContext.tsx` (PR previo, dependencia).
- `src/domains/content/lib/resolve-universe-base.ts` (PR previo, dependencia).
- `src/test/resolve-universe-base.test.ts` — 9 tests.
- `src/test/filterbar-counts-unification.test.ts` — 5 tests de invariantes.

**Editados**
- `src/components/FilterBar.tsx` — import + render sticky de `<EffectiveActionFooter />`, cálculo de `scopeLabel` desde el chip geográfico más profundo.

**No tocados** (por restricción explícita)
- `SelectionActions.tsx` — sin refactor.
- `ExportPanel.tsx` / PR-EXPORT-2 core / serializers.
- `HealthFilterActionCTA` (solo coexiste arriba en modo `debt`).
- `getFilteredLocations` (contrato mapa/markers intacto).

---

## 2. Qué hace `EffectiveActionFooter`

Footer sticky persistente al pie del panel Buscar y Filtrar. Opera **siempre** sobre `effectiveActionSet` (subset = `universeBaseLocations ∩ treeFilters ∩ (userSelection si existe)`) recibido como `props.locations`.

- Etiqueta canónica generada por `buildFooterLabel({mode, count, hasUserSelection, scopeLabel})`.
- Etiqueta de export por `buildExportLabel(...)`, derivada de modo + scope.
- Confirmaciones tipadas vía `DestructiveConfirmDialog`:
  - **EXPORTAR** si `count > 250`.
  - **ENRIQUECER** si `enrichable.length > 25`.
  - **ELIMINAR** siempre (y solo con `hasUserSelection`).
- Exportar dispatcha `window.dispatchEvent(new CustomEvent('lovable:open-export-panel', { detail: { locations, label, scope: 'public' } }))`. `Index.tsx` ya tiene cableado el listener → abre `ExportPanel` con `source.locations = effectiveActionSet`.
- Enriquecer reusa `supabase.functions.invoke('batch-enrich', …)` agrupando por `documentId` (mismo contrato que `SelectionActions`, sin extraer hook).
- Eliminar marca `deleted_at` en lote y dispara `trash-updated` + `store-updated`.

---

## 3. Matriz modo → acción principal → secundarias → eliminar

| Modo | Label footer | Acción principal | Secundarias | Eliminar |
|---|---|---|---|---|
| `all` (Explorar) | `Acciones sobre N POIs[ en {scope}]` | **Exportar** | Enriquecer IA (si hay no-enriched), Etiquetar (disabled), Reclasificar (disabled) | Solo si `hasUserSelection` |
| `debt` (Con deuda) | `Acciones sobre N POIs con deuda[ en {scope}]` | **Exportar** + hint *Resolver deuda (arriba)* | Etiquetar/Reclasificar disabled | Solo si `hasUserSelection` |
| `unenriched` (Sin enriquecer) | `Acciones sobre N POIs sin enriquecer[ en {scope}]` | **Exportar** + **Enriquecer IA** | Etiquetar/Reclasificar disabled | Solo si `hasUserSelection` |
| Seleccionar (cualquier modo + selección) | `Acciones sobre N seleccionados[ en {scope}]` | **Exportar** | Enriquecer IA (si aplica) | **Visible** con confirmación ELIMINAR |

> Nota: "Resolver deuda" se sirve del `HealthFilterActionCTA` que ya renderiza arriba del panel en modo `debt`. El footer solo muestra hint visual; no duplica handler.

---

## 4. Confirmaciones de invariantes

- [x] **Usa `effectiveActionSet`**: `FilterBar.tsx` pasa el subset filtrado como `locations`. Tests `effective-action-footer.test.tsx` verifican que `count` coincide con `props.locations.length`.
- [x] **Exportar abre ExportPanel con `detail.locations`**: Test "Exportar dispara `lovable:open-export-panel` con effectiveActionSet" cubre el CustomEvent + payload (locations, label, scope).
- [x] **Eliminar solo con selección manual**: `showDelete = hasUserSelection && count > 0`. Tests positivos y negativos.
- [x] **Etiquetar / Reclasificar disabled**: Botones con `disabled` + tooltip "Disponible próximamente desde el footer. Usa la selección manual...". `data-action="footer-tag-disabled"` / `footer-reclassify-disabled`.
- [x] **`useBulkActions` NO extraído**: `SelectionActions.tsx` queda intacto (cero riesgo de regresión); deuda técnica pospuesta a PR separado.
- [x] **Tests 33/33 verde**:
  ```
  ✓ effective-action-footer-label.test.ts   (12)
  ✓ effective-action-footer.test.tsx         (7)
  ✓ filterbar-counts-unification.test.ts     (5)
  ✓ resolve-universe-base.test.ts            (9)
  ```

---

## 5. Riesgos residuales

1. **Etiquetar/Reclasificar pospuestos**: sin selección manual el usuario no puede invocarlas desde footer (deben pasar por `SelectionActions`). Aceptado por scope.
2. **"Resolver deuda" sin handler propio**: el footer en modo `debt` muestra hint pero no acción; depende de que `HealthFilterActionCTA` siga renderizándose arriba. Si en el futuro se mueve/oculta ese CTA, el footer queda sin acción de deuda.
3. **Duplicación lógica con `SelectionActions`** (export/enrich/delete): handlers reimplementados localmente para evitar refactor. `useBulkActions` queda como deuda explícita. Cualquier cambio futuro en políticas de enrich/export/delete debe actualizarse en **dos sitios**.
4. **Confirmación `EXPORTAR`** se dispara al abrir el panel (no al ejecutar el export real dentro de `ExportPanel`). El usuario podría confirmar y luego cancelar dentro del panel; el guardarail sigue siendo correcto pero la semántica es "abrir panel grande", no "ejecutar export grande".
5. **Sin handler `onTag` / `onReclassify`**: las props del componente no los reciben todavía. Si se cablean en el futuro habrá que ampliar la API.

---

## 6. Validación visual A–E

Ejecutada sobre el preview `https://id-preview--0d7813f2-83f2-4ee7-9dde-6d8979ed799d.lovable.app`. Resultados pass/fail reportados en el chat del closure thread (no se persisten aquí porque el preview es estado vivo). Anomalías visuales, si existen, se reportan SIN corregir en este pase.

---

## 7. Cierre

- Implementación cubre el alcance aprobado.
- Tests verdes (33/33).
- Release-ready dentro del scope; refactor `useBulkActions` queda para PR futuro.
- Próximos PRs candidatos (no bloqueantes):
  - Extraer `useBulkActions` y unificar `SelectionActions` ↔ footer.
  - Cablear `onTag` / `onReclassify` cuando exista UX clara.
  - Añadir botón "Resolver deuda" propio en footer (si se decide colapsar `HealthFilterActionCTA`).
