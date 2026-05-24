# DebtResolutionPanel — Fase 1 · Postflight

**Versión**: v1.4.2
**Plan referencia**: `docs/audits/search-filter-debt-resolution-sidepanel-ux-plan.md`
**Contrato relacionado**: `docs/contracts/root-status-resolution-contract.md`
**Fecha**: 2026-05-24

---

## 1. Objetivo

Convertir "Resolver deuda" en una **subvista lateral** dentro de Buscar y Filtrar (`DebtResolutionPanel`), en lugar de depender del modal central `HealthRepairPreviewDialog` como vista primaria. El modal queda como **fallback / confirmación de escritura** exclusivamente para D repair.

## 2. Archivos tocados

| Archivo | Acción |
|---|---|
| `src/components/discovery/DebtResolutionPanel.tsx` | **nuevo** — subvista lateral |
| `src/components/FilterBar.tsx` | edit: `debtPanelOpen`, render condicional del subpanel, redirige primary del footer al subpanel, oculta footer mientras subpanel activo, modal sólo abierto vía `onOpenRepairConfirm` |
| `src/test/debt-resolution-sidepanel-phase1.test.tsx` | **nuevo** — 11 tests |
| `package.json` | bump `1.4.1 → 1.4.2` |
| `src/lib/app-version.ts` | bump `1.4.1 → 1.4.2` |
| `docs/releases/version-history.md` | entrada `v1.4.2` + árbol general actualizado |
| `docs/audits/debt-resolution-sidepanel-phase1-postflight.md` | **nuevo** — este documento |

**No tocado**: datos, schema, backend, RLS, edge functions, Nominatim, marker fill, POI-N, health rings, `health-repair-partition.ts`, capabilities, `geo-maintenance-handoff.ts` (sólo se usa el bridge existente), `HealthRepairPreviewDialog` (intacto).

## 3. Mapeo criterios APROBADO ↔ test

| Criterio | Test |
|---|---|
| click Resolver deuda abre subpanel | wiring en `FilterBar` (footer `onResolveDebt → setDebtPanelOpen(true)`) + tests del componente verifican render directo |
| click Resolver deuda **no** abre modal central | mismo wiring: `setDebtModalOpen` ya no se llama desde el footer |
| abrir subpanel no llama `supabase.rpc` ni `supabase.functions.invoke` | `abrir el subpanel NO llama supabase.rpc ni supabase.functions.invoke` |
| abrir subpanel no llama `requestSubsetFit` automáticamente | `abrir el subpanel NO llama requestSubsetFit automáticamente` |
| grupos y counts correctos | `renderiza grupos con counts correctos` (7 puntos, 2 reparables, 1 A, 2 B, 1 C, 1 no-reparable) |
| exportar grupo B exporta sólo B | `exportar grupo B envía SÓLO los IDs de B` (verifica `scope: 'internal'` + `ids === ['b-1','b-2']`) |
| mapa grupo → `requestSubsetFit` IDs grupo | `mapa grupo llama requestSubsetFit con SÓLO los IDs del grupo` (`reason: 'debt-sidepanel-group-fit'`) |
| mapa POI → `requestSubsetFit` con ese ID | `mapa POI llama requestSubsetFit con [id] único` (`reason: 'debt-sidepanel-row-focus'`) |
| popup POI → `setFocusedLocation` | `popup POI llama setFocusedLocation(id)` |
| sin capability no aparece Geo Maintenance | `SIN capability: no aparece Geo Maintenance en B` |
| con capability aparece sólo en B | `CON capability: aparece SÓLO en B y despacha handoff sin escribir` |
| Geo Maintenance despacha handoff + no ejecuta backfill | mismo test (verifica `handoffMock` + `rpcMock`/`invokeMock` no llamados) |
| Reparar grupo abre `HealthRepairPreviewDialog` | `Reparar grupo invoca onOpenRepairConfirm (sin escribir)` — el callback en `FilterBar` setea `debtModalOpen=true` |
| D repair sigue llamando `enqueue_health_repair` sólo al confirmar | 26 tests de regresión en `health-repair-dialog`, `health-repair-resolve-button-wiring`, `health-repair-triage-dialog` siguen verdes |

## 4. Invariantes confirmadas

1. **Cero RPC al abrir el subpanel**. Verificado por test directo y por ausencia de `useEffect` con llamadas red en `DebtResolutionPanel`.
2. **Cero `requestSubsetFit` al abrir**. El subpanel NO replica el efecto auto-fit del modal (línea 197-206 de `HealthRepairPreviewDialog`); sólo se invoca desde handlers de click.
3. **Modal como fallback**. El único punto que abre `HealthRepairPreviewDialog` desde el subpanel es el botón "Reparar grupo" del grupo Reparable (callback `onOpenRepairConfirm`). El modal mantiene su lógica de confirmación + `enqueue_health_repair` sin cambios.
4. **B handoff gated**. El botón "Geo Maintenance" sólo se renderiza si `useCapability('view_geo_maintenance').allowed && useCapability('run_geo_backfill').allowed`. Sin capability → 0 botones en el DOM.
5. **B handoff no escribe**. El click despacha `dispatchGeoMaintenanceHandoff` (bridge existente, source `health-repair-triage`) y navega a `/admin/geography`. No invoca RPC ni edge functions.
6. **Export `scope: 'internal'`** (subset propio de trabajo interno, no público). Consistente con el modal.
7. **Sin doble CTA**. `EffectiveActionFooter` se oculta mientras `debtPanelOpen === true` (gate `{!debtPanelOpen && (...)}` en `FilterBar`). El subpanel reemplaza también el bloque de chips/tabs/trees mientras está activo.
8. **Auto-cierre al cambiar de universo**. `useEffect` en `FilterBar` cierra `debtPanelOpen` si `activeModeUniverse !== 'debt'`.

## 5. Resultados de tests

```
src/test/debt-resolution-sidepanel-phase1.test.tsx        11/11
src/test/health-repair-dialog.test.tsx                     8/8
src/test/health-repair-resolve-button-wiring.test.tsx      5/5
src/test/health-repair-triage-dialog.test.tsx             13/13
src/test/root-status-b-geo-maintenance-handoff.test.tsx    8/8
                                                          ─────
Total                                                     45/45
```

## 6. Pendientes Fase 2 (fuera de alcance)

- Selección múltiple en el subpanel (checkbox por POI + tri-state por grupo + acciones globales).
- Footer contextual dentro del subpanel (`Reparar grupo (N)` global, `Exportar selección`, etc.) que pueda reemplazar a `EffectiveActionFooter` con un footer propio.
- Eliminación definitiva del modal `HealthRepairPreviewDialog` una vez el subpanel pase QA en producción.
- Confirmaciones tipadas (`<DestructiveConfirmDialog>`) para acciones masivas iniciadas desde el subpanel.
- Integración con `popup-persist-on-rebuild` cuando se abra popup sin cerrar el subpanel (la implementación actual ya respeta el listener canónico de `setFocusedLocation`).

## 7. Decisión

**APROBADO**.

- Subpanel visible en preview (`/`, modo Buscar y Filtrar → Mantener → Con deuda → Resolver deuda).
- Modal NO es vista primaria.
- 0 RPC al abrir.
- 0 movimiento de cámara al abrir.
- Grupos y acciones funcionan; B handoff gated por capability; D repair intacto.
- 45/45 tests pass (11 nuevos + 34 regresión).
- Bump v1.4.2 sincronizado SÓLO al cierre con tests verdes.
