# Postflight — Wiring "Resolver deuda" (fix de regresión)

PR: PR-FILTER-ROOTSTATUS-2.x · Fecha: 2026-05-24

## Causa raíz

El botón **"Resolver deuda"** del footer en `Buscar y Filtrar → Mantener → Con deuda` quedaba como noop:

1. `EffectiveActionFooter` (mode='debt') invoca `onResolveDebt`.
2. `FilterBar` pasaba `onResolveDebt = () => openHealthRepairRef.current()`.
3. `openHealthRepairRef` se rellenaba EXCLUSIVAMENTE via
   `HealthFilterActionCTA.registerOpen(...)`.
4. `HealthFilterActionCTA` retorna `null` si `!filters.healthFilter`.
5. En el universo agregado "Con deuda" no hay un `healthFilter` puntual ⇒ el
   componente nunca monta ⇒ el ref queda noop ⇒ el botón parecía pulsable
   pero no abría modal.

Adicionalmente, `HealthRepairPreviewDialog` no modelaba el caso agregado: su
`filter: HealthFilter` sólo aceptaba partial/chain/hardError/review.

## Decisión funcional

`FilterBar` se convierte en **dueño del modal agregado** (estado local
`debtModalOpen`). La apertura ya no depende de que `HealthFilterActionCTA`
esté montado. `HealthFilterActionCTA` se conserva para el caso de
`healthFilter` puntual (no es la fuente del opener del footer).

`HealthRepairPreviewDialog` acepta `filter: HealthFilter | 'debt'`. En modo
agregado el partitioner intersecta D con rings reales y splittea por bucket
(`repairablePartialIds` / `repairableChainIds`). El confirm dispara una
RPC por bucket. Partial gana si coexisten partial+chain (evita doble enqueue).

## Archivos modificados

- `src/components/discovery/health-repair-partition.ts`
  - Nuevo tipo `RepairFilterMode = HealthFilter | 'debt'`.
  - Modo `'debt'`: lectura per-loc de `getPointHealthRings(loc)` para
    decidir bucket. D sin partial/chain → `nonRepairableByType`.
  - Nuevos arrays `repairablePartialIds` / `repairableChainIds`.
- `src/components/discovery/HealthRepairPreviewDialog.tsx`
  - `filter` ampliado a `RepairFilterMode`; tablas FILTER_TITLES /
    FILTER_CSS_VAR / FILTER_HELP con entrada `'debt'`.
  - `handleConfirm` con loop por buckets (corta en primer error).
  - `attachToJob(firstJobId)` con el primer `job_id` no-null.
  - Data-attrs nuevos: `data-filter-mode`, `data-repairable-partial-count`,
    `data-repairable-chain-count`.
- `src/components/FilterBar.tsx`
  - `useState(debtModalOpen)` + `debtScope` derivado de `effectiveActionSet`
    (`mode='selection'` si `hasUserSelection`, sino `'filtered'`).
  - Footer `onResolveDebt={activeModeUniverse==='debt' ? () => setDebtModalOpen(true) : undefined}`.
  - `<HealthRepairPreviewDialog filter="debt" .../>` montado siempre que
    `activeModeUniverse === 'debt'`.
  - `openHealthRepairRef` se conserva (cableado de `HealthFilterActionCTA`
    para el caso puntual), pero ya no lo invoca el footer.
- `src/test/health-repair-partition.test.ts` — 8 tests nuevos modo `'debt'`.
- `src/test/health-repair-resolve-button-wiring.test.tsx` — NUEVO, 5 tests.

## Tests ejecutados

| Archivo | Resultado |
|---|---|
| `health-repair-partition.test.ts` | **18/18** PASS (10 previos + 8 nuevos debt) |
| `health-repair-dialog.test.tsx` | **8/8** PASS (regresión) |
| `health-repair-resolve-button-wiring.test.tsx` | **5/5** PASS (nuevo) |
| `effective-action-footer.test.tsx` | **12/12** PASS (regresión) |
| `poi-identity-root-status-client-parity.test.ts` | **23/23** PASS (regresión) |
| **TOTAL** | **66/66 PASS** |

Cobertura clave verificada por los tests nuevos:

- Footer mode='debt' click primary llama `onResolveDebt`.
- Click "Resolver deuda" abre `HealthRepairPreviewDialog` con
  `data-filter-mode="debt"`.
- Abrir el modal **NO llama `supabase.rpc`** (assert directo).
- Sin reparables: modal abre, confirm disabled con label "No hay POIs
  reparables", click confirm no dispara RPC.
- Con reparables mixtos (partial/chain/both): partial gana, RPC partial
  recibe `['db1','dp1','dp2']`, RPC chain recibe `['dc1']`, A/B/C/review/
  hardError/sin-rings NUNCA aparecen en `_location_ids`.
- `attachToJob` llamado UNA vez con el primer `job_id`.
- Error en primera RPC: segunda RPC NO se dispara, `attachToJob` NO se
  llama, `toast.error` mostrado, modal queda abierto y actionable.

## Validación visual (preview)

Flujo `Buscar y Filtrar → Mantener → Con deuda`:

1. Pulsar "Resolver deuda" en el footer.
2. `HealthRepairPreviewDialog` se abre con `data-filter-mode="debt"`.
3. Título y badges muestran total del scope y `Reparables: N / total`.
4. Desglose A/B/C/D visible (5 grupos): repairable, identityIncomplete,
   systemDebt, review, nonRepairableByType.
5. Si no hay reparables → confirm disabled, label "No hay POIs reparables
   automáticamente".
6. Cerrar sin confirmar → ninguna RPC ejecutada (verificado en tests).

## Fuera de alcance (sin tocar)

Backend / schema / datos / marker fill / POI-N / health rings (lectura sólo) /
PR-EXPORT-2 core / Nominatim. Sin bump. Sin ejecución real de reparación.

---

## DECISIÓN: APROBADO

Cumple todos los criterios:

- Pulsar "Resolver deuda" abre el modal en preview (wiring vía
  `setDebtModalOpen(true)`, independiente de `HealthFilterActionCTA`).
- Todos los tests pasan (66/66).
- Abrir el modal NO llama RPC (assert explícito).
- Confirmar sólo envía `repairableIds` (D ∩ {partial, chain}); A/B/C/
  review/hardError NUNCA aparecen en `_location_ids`.
- `onResolveDebt` ya NO puede quedar noop en universo debt.
- El modal NO depende de `HealthFilterActionCTA` montado.
