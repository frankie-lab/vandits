# Post-v1.3.19 — Functional Closure (Administrative)

**Scope.** This document administratively closes every functional block shipped after
release `v1.3.19`. It is a documentation-only artifact: no code, schema, data, or
backend mutation is associated with this closure. No bump is requested.

For each block we record: state, relevant files/postflights, tests executed,
decision, and release impact.

---

## 1. PR-COUNTS-1 — Top bar ⇄ FilterBar counter unification

- **State:** implementado.
- **Files / postflights:**
  - `src/components/FloatingToolbar.tsx` (consumer of `getBucketStats`)
  - `src/lib/buckets/get-bucket-stats.ts` (single source of truth)
  - `src/components/FilterBar.tsx` (counter wiring)
  - `docs/audits/poi-visible-counts-unification-postflight.md`
  - `docs/audits/poi-counts-global-sources-audit.md`
  - `docs/audits/poi-counts-visual-validation-post-pr-counts-1-2.md`
- **Key invariants closed:**
  - `catalogVisibleUniverse` shared between top bar and FilterBar.
  - Historical 5.100 vs 5.095 gap reconciled (root cause: divergent universe filters).
- **Tests executed:** `get-bucket-stats.test.ts`, counters parity tests in the
  post-PR-COUNTS visual validation doc.
- **Decision:** APROBADO.
- **Release impact:** no (already inside the running release line).

---

## 2. PR-COUNTS-2 — Subtabs "Mantener" alignment

- **State:** implementado.
- **Files / postflights:**
  - `src/components/discovery/MaintainSubtabs.tsx`
  - `src/components/FilterBar.tsx` (subtab → universe wiring)
  - `docs/audits/pr-counts-2-1-debt-runtime-delta-audit.md`
  - `docs/audits/pr-counts-2-1-revalidation-clean-closure.md`
- **Key invariants closed:**
  - Header / CTA / tree / footer share the same `universeBase` per subtab.
  - "Con deuda" revalidated, no real gap remaining (residuals were stale-cache only).
  - "Sin enriquecer" returns the same population across all surfaces.
- **Tests executed:** revalidation suite documented in
  `pr-counts-2-1-revalidation-clean-closure.md`.
- **Decision:** APROBADO.
- **Release impact:** no.

---

## 3. Árbol unificado en Buscar y Filtrar

- **State:** implementado.
- **Files / postflights:**
  - `src/components/discovery/UniverseTree.tsx`
  - `src/components/FilterBar.tsx`
  - `docs/audits/search-filter-maintain-tree-universe-plan.md`
  - `docs/audits/search-filter-maintain-tree-universe-counts-unification-postflight.md`
  - `docs/audits/search-filter-maintain-tree-universe-visual-validation.md`
- **Key invariants closed:**
  - Explorar, Con deuda y Sin enriquecer renderizan los cuatro ejes:
    Geo / Tipo / Tags / Legacy.
  - Counts calculados sobre `universeBase`, sin recortes ocultos.
- **Tests executed:** universe-tree count parity tests referenced in the
  unification postflight.
- **Decision:** APROBADO.
- **Release impact:** no.

---

## 4. Footer contextual ("Acción efectiva")

- **State:** implementado.
- **Files / postflights:**
  - `src/components/discovery/EffectiveActionFooter.tsx`
  - `src/components/discovery/effective-action-set.ts`
  - `docs/audits/search-filter-effective-action-footer-postflight.md`
- **Key invariants closed:**
  - Una sola acción principal por modo (Explorar / Con deuda / Sin enriquecer).
  - Menú "Más acciones" para secundarias.
  - "Eliminar" únicamente disponible con selección manual explícita.
- **Tests executed:** `effective-action-footer.test.tsx` (12/12 verde).
- **Decision:** APROBADO.
- **Release impact:** no.

---

## 5. Root Status A/B/C/D

- **State:** implementado.
- **Files / postflights:**
  - `src/domains/content/lib/poi-identity-root-status.ts` (cliente)
  - `supabase/functions/_shared/poi-identity-root-status.ts` (Deno mirror)
  - `src/components/discovery/RootStatusCompactRow.tsx`
  - `docs/audits/poi-identity-root-status-dry-run.md`
  - `docs/audits/poi-identity-root-status-execution-plan.md`
  - `docs/audits/search-filter-root-status-filter-plan.md`
  - `docs/audits/search-filter-root-status-compact-row-postflight.md`
- **Key invariants closed:**
  - Helper cliente con paridad Deno (contract test).
  - Fila compacta A/B/C/D integrada en Mantener.
  - "Resolver deuda" gating sobre clases D ∩ {partial, chain}.
  - No se introduce 5ª pestaña Identity.
- **Tests executed:**
  `poi-identity-root-status-client-parity.test.ts` (23/23 verde).
- **Decision:** APROBADO.
- **Release impact:** no.

---

## 6. Resolver deuda — wiring, modal y triage

- **State:** implementado.
- **Files / postflights:**
  - `src/components/FilterBar.tsx` (`debtModalOpen` owner)
  - `src/components/discovery/HealthRepairPreviewDialog.tsx` (triage por grupos)
  - `src/components/discovery/health-repair-partition.ts`
  - `docs/audits/health-repair-resolve-button-wiring-postflight.md`
  - `docs/audits/health-repair-feedback-progress-postflight.md`
  - `docs/audits/health-repair-triage-dialog-plan.md`
- **Key invariants closed:**
  - Footer abre siempre `HealthRepairPreviewDialog` cuando
    `activeModeUniverse === 'debt'`; `onResolveDebt` no puede quedar noop.
  - Spinner / progreso visibles durante reparación.
  - Triage por grupos: Reparable, Sistema B, Revisión C, Incompleto A,
    No reparables por tipo — todos con acciones funcionales
    (exportar grupo / abrir grupo en mapa / abrir POI en mapa).
  - RPC `enqueue_health_repair` recibe **únicamente** `repairableIds`
    (D ∩ {partial, chain}). A / B / C / no-reparables jamás entran al RPC.
  - Abrir el modal no dispara RPC.
- **Tests executed:**
  - `health-repair-partition.test.ts` (18/18 verde)
  - `health-repair-dialog.test.tsx` (8/8 verde)
  - `health-repair-resolve-button-wiring.test.tsx` (5/5 verde)
  - `health-repair-triage-dialog.test.tsx` (13/13 verde)
  - `effective-action-footer.test.tsx` (12/12 verde, regresión)
- **Decision:** APROBADO.
- **Release impact:** no.

---

## 7. PR-EXPORT-2 — referencia previa

- **State:** ya cerrado en v1.3.19. Se menciona como base de los bloques 1–6.
- **Files / postflights (informativos):**
  - `docs/audits/poi-export-existing-logic-audit.md`
  - `docs/audits/pr-export-2-exportpanel-current-behavior-audit.md`
  - `docs/audits/pr-export-2-exportpanel-ux-redesign-plan.md`
  - `docs/audits/pr-export-2-implementation-plan.md`
  - `docs/audits/pr-export-2-qa-e2e.md`
- **Decision:** APROBADO (heredado de v1.3.19).
- **Release impact:** no (ya consumido por la release previa).

---

## Resumen ejecutivo

| # | Bloque | Estado | Decisión | Release impact |
|---|---|---|---|---|
| 1 | PR-COUNTS-1 | implementado | APROBADO | no |
| 2 | PR-COUNTS-2 | implementado | APROBADO | no |
| 3 | Árbol unificado Buscar y Filtrar | implementado | APROBADO | no |
| 4 | Footer contextual | implementado | APROBADO | no |
| 5 | Root Status A/B/C/D | implementado | APROBADO | no |
| 6 | Resolver deuda (wiring + triage) | implementado | APROBADO | no |
| 7 | PR-EXPORT-2 | base previa | APROBADO (v1.3.19) | no |

**Pendientes reales tras este cierre:** ninguno dentro del alcance listado.
Los siguientes elementos quedan explícitamente **fuera** de este cierre y
abiertos para PRs posteriores (no se inician aquí):

- Botón "Ir a Geo Maintenance" en grupo Sistema B (bloqueado hasta que la
  capability `view_geo_maintenance` y la navegación queden cableadas).
- Cualquier ampliación de marker fill, POI-N, health rings, o
  re-bump de versión.

---

## Decisión final

**DECISIÓN: APROBADO.**

Todos los bloques implementados post-v1.3.19 quedan listados, cada uno con
estado, archivos/postflights, tests, decisión y release impact. No se mezclan
pendientes futuros con implementados, no se marca como pendiente nada ya
implementado, y no se abre ninguna nueva feature en este documento.
