# PR-INLINE-3.1 — Postflight: Footer "Con deuda" sin reparables ya no abre HealthRepairPreviewDialog

**Versión**: v1.4.4 (patch desde v1.4.3)
**Fecha**: 2026-05-24
**Decisión**: APROBADO

## Contexto

En la captura del usuario, pulsar "Resolver deuda" abría `HealthRepairPreviewDialog`
con "Reparables: 0 / N", contradiciendo la UX inline (modal = solo confirmación
de escritura).

## Regla dura aplicada

`HealthRepairPreviewDialog` solo se abre si `repairableIds.length > 0`,
donde `repairableIds = D ∩ {partial, chain}` (vía
`partitionRepairScopeByRootStatus(locations, 'debt')`).

## Matriz de primary (mode='debt')

| activeSet | capability | Primary | Acción |
|---|---|---|---|
| repairableCount > 0 | — | **Reparar N** (Wrench) | `onResolveDebt()` → abre `HealthRepairPreviewDialog` |
| 0 reparables + todo B | view+run geo | **Geo Maintenance** (Wrench) | `dispatchGeoMaintenanceHandoff` + `navigateToGeoMaintenance` |
| 0 reparables + resto | — | **Exportar** (Download) | `onExportClick` |

## "Más acciones" en debt sin reparables

- `footer-menu-focus-map` — usa `requestSubsetFit(ids, { mode: 'always', reason: 'health-filter' })` (helper canónico ya cableado y testeado; **no se introduce evento nuevo no contractual**).
- `footer-menu-geo-maintenance-b` — handoff scoped con `systemDebt.ids` (solo si capability).
- `footer-menu-export-non-repairable` — exporta `nonRepairableByType ∪ review ∪ identityIncomplete ∪ systemDebt` (excluye D + partial/chain).

## Hint visible

- Con alternativas: `"No hay POIs reparables automáticamente en este subconjunto."`
- Sin alternativas: `"No hay reparación automática disponible."`
- Suprimido cuando primary = Geo Maintenance (acción positiva).

## Archivos modificados

- `src/components/filters/EffectiveActionFooter.tsx` — partition + primary dinámico + hint + items extra.
- `src/components/FilterBar.tsx` — `DebtAwareFooter` lee `useCapability('view_geo_maintenance')` + `useCapability('run_geo_backfill')` y los pasa al footer.
- `src/test/inline-footer-pr-inline-3.test.tsx` — añade mock `getPointHealthRings` para que el fixture D del test legacy siga teniendo primary "Reparar".
- `src/test/effective-action-footer.test.tsx` — añade mocks `classifyPoiRootStatusForLocation` + `getPointHealthRings` (siempre D + partial) para preservar contrato legacy de mode='debt'.
- `src/test/inline-footer-pr-inline-3-1.test.tsx` — **NUEVO** (12 tests).
- `package.json`, `src/lib/app-version.ts`, `docs/releases/version-history.md` — bump v1.4.4.

## Tests (76/76 pass)

12 nuevos cubriendo:
1. 0 reparables + todo B + capability → primary Geo Maintenance; click NO invoca `onResolveDebt`; handoff despachado.
2. 0 reparables + sin capability → primary Exportar (NUNCA Geo Maintenance).
3. Mixto B/C/no-rep → primary Exportar + hint visible.
4. Más acciones incluye Geo Maintenance B + Abrir en mapa + Exportar no reparables.
5. Abrir en mapa usa `requestSubsetFit` con reason canon (`health-filter`).
6. Con reparables → primary Reparar N; click abre dialog.
7. 0 reparables → `onResolveDebt` NUNCA invocado en ningún flujo.
8. 0 reparables → `supabase.rpc` NUNCA invocado.
9. Primary NUNCA dice "Resolver deuda" cuando `repairableCount = 0`.
10. Con reparables, "Exportar no reparables" NO aparece (showDebtExtras requiere 0 reparables).
11. Sin reparables, "Exportar no reparables" emite event excluyendo D+partial/chain.
12. D repair intacto: con reparables, Geo Maintenance NO aparece como primary; hint suprimido.

Más regresión: `inline-footer-pr-inline-3` (6/6), `effective-action-footer` (12/12), `debt-panel-selection-pr-inline-2` (15/15), `tree-poi-row-pr-inline-1` (5/5), `health-repair-triage-dialog` (13/13), `health-repair-partition` (18/18).

## Checklist APROBADO

- [x] Situación "Reparables 0/N" NO abre modal.
- [x] Footer no dice "Resolver deuda" si reparables = 0.
- [x] Usuario ve acción útil: Exportar / Geo Maintenance / Mapa.
- [x] `HealthRepairPreviewDialog` queda solo para confirmar escritura real.
- [x] Tests pasan (76/76).
- [x] No se introduce evento nuevo no contractual (`requestSubsetFit` canónico).
- [x] Geo Maintenance solo aparece con capability.
- [x] B nunca entra en D repair.
- [x] v1.4.4 sincronizada (`package.json` / `app-version.ts` / `version-history.md`).
- [x] Postflight creado.

## Fuera de alcance (no tocado)

- `DebtResolutionPanel`, `HealthRepairPreviewDialog`, `partitionRepairScopeByRootStatus`.
- Backend, schema, datos, RLS.
- Marker fill, POI-N, health rings.
- PR-EXPORT-2 core, serializers.
