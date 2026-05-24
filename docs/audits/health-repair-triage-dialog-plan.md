# Health Repair · Triage Dialog · Plan

**Estado:** APROBADO COMO PLAN (con matiz obligatorio sobre grupo B).
**Scope:** Rediseño de `HealthRepairPreviewDialog` como triage operativo por grupos.
**No implementa todavía.** No toca backend, schema, datos, marker fill, POI-N, health rings ni bump.

---

## 1. Objetivo

`HealthRepairPreviewDialog` deja de ser un confirm-modal de un solo flujo y pasa a ser un **triage por grupos**. Cada grupo del scope recibe acciones reales (Exportar grupo, Abrir grupo en mapa, Abrir POI en mapa). La reparación automática sigue limitada estrictamente a `D ∩ {partial, chain}` y es la única vía que llama `enqueue_health_repair`.

---

## 2. Grupos y acciones

Partition canónica viene de `partitionRepairScopeByRootStatus(scope, 'debt')` (ya existente desde el fix de wiring anterior).

| Grupo | Criterio | Acciones por grupo | Acción por POI |
|---|---|---|---|
| **Reparable** | `D ∩ {partial, chain}` | Confirmar reparación N (primary global) · Exportar grupo · Abrir grupo en mapa | Abrir en mapa |
| **Sistema (B)** | `rootStatus === 'B'` | Exportar grupo · Abrir grupo en mapa | Abrir en mapa |
| **Revisión (C)** | `rootStatus === 'C'` | Exportar grupo · Abrir grupo en mapa | Abrir en mapa |
| **Incompleto (A)** | `rootStatus === 'A'` | Exportar grupo · Abrir grupo en mapa | Abrir en mapa |
| **No reparable por tipo** | `D` con `hardError`/`review`/sin rings o tipo no repairable | Exportar grupo · Abrir grupo en mapa | Abrir en mapa |

### Acciones globales (footer)

- **Reparar automáticamente N** — primary; disabled si `repairableIds.length === 0` (label: "No hay POIs reparables automáticamente"). Mantiene gating actual (`canConfirm`, `submitting`, `exhausted`, `aria-busy`).
- **Exportar todo el scope** — `scope.locations` completo.
- **Exportar no reparables** — todo el scope menos `repairableIds`.
- **Cerrar**.

### Disclaimer fijo bajo el header

> "Solo los reparables automáticamente se encolan. El resto requiere flujo específico."

---

## 3. Matiz obligatorio · grupo B

**NO se añade botón "Ir a Geo Maintenance" en el grupo Sistema (B).**

Razón: no está verificado que exista hoy un evento/navegación cliente que abra el panel Geo Maintenance de forma fiable con `view_geo_maintenance`. Mostrar un botón sin destino real haría parecer que B se resuelve, cuando no es así.

Acción futura (fuera de este PR), condicionada a:

1. `useCapability('view_geo_maintenance')` retorna `true`.
2. Existe un evento/ruta verificada que abre el panel (`GeographyBackfillPanel`).
3. Test de integración que confirma que el click abre el destino correcto.

Hasta entonces, grupo B mantiene únicamente: **Exportar grupo · Abrir grupo en mapa · Abrir POI en mapa**.

---

## 4. APIs reutilizadas (sin código nuevo de bus)

| Acción | API |
|---|---|
| Abrir grupo / POI en mapa | `requestSubsetFit(ids, { mode: 'always', reason: 'health-triage-open-group' \| 'health-triage-open-poi' })` |
| Exportar (grupo / no reparables / todo) | `window.dispatchEvent(new CustomEvent('lovable:open-export-panel', { detail: { locations, label, scope: 'internal' } }))` |
| Reparar automáticamente | `supabase.rpc('enqueue_health_repair', { _location_ids: repairableIds, _kind })` — loop por bucket partial/chain en modo `'debt'` (sin cambios respecto al fix anterior) + `attachToJob(job_id)` en el primer job_id devuelto |

No se crean nuevos eventos globales. No se toca `global-events.ts`.

---

## 5. UI · estructura

- Sustituir el render plano por `<TriageGroupCard>` (componente local en el mismo archivo).
- `<Collapsible>` (shadcn/radix) por grupo:
  - Header siempre visible: título · count badge · acciones de grupo · chevron.
  - Body con lista completa de POIs del grupo (eliminar `PREVIEW_LIMIT=5`).
- Estado de colapso local: grupo **Reparable** abierto por defecto si `N > 0`; resto cerrado.
- Fila por POI:
  - Nombre + breadcrumb territorial (ya presente).
  - Badge `rootStatus` (A/B/C/D).
  - Chips de rings activos (`partial`/`chain`/`review`/`hardError`).
  - Texto "Acción recomendada" derivado del grupo.
  - Botón icon-only `Mapa` (tooltip "Abrir en mapa") → `requestSubsetFit([loc.id], …)` + `onOpenChange(false)`.
- Acciones de grupo cierran el modal (`onOpenChange(false)`) tras disparar el efecto.
- Acción **Confirmar reparación** NO cierra el modal hasta que termine el flujo actual (sin cambios).

### Tokens / accesibilidad

- Sin colores hardcodeados. Tokens semánticos del design system (`bg-card`, `text-muted-foreground`, `border-border`, etc.).
- `aria-busy={submitting}` ya cableado se mantiene.
- `aria-live="polite"` en zona de estado del modal ya cableado se mantiene.
- Sin emojis. Iconos Lucide vía `icon-utils.tsx`.

---

## 6. Data hooks (contrato de tests)

Añadir en `HealthRepairPreviewDialog.tsx`:

- `data-triage-group="repairable | identityIncomplete | systemDebt | review | nonRepairableByType"` en el `<Collapsible>` raíz de cada grupo.
- `data-triage-group-count="N"` en el header de cada grupo.
- `data-triage-group-action="export | map"` en los botones de acción de grupo.
- `data-triage-poi-action="map"` en el botón per-POI.
- `data-triage-export-target="all | non-repairable"` en el dropdown global.
- Mantener `data-action="confirm"` actual del primary.

---

## 7. Tests obligatorios

### Nuevo · `src/test/health-repair-triage-dialog.test.tsx`

Mocks: `supabase.rpc`, `useLocationsStore`, `sonner`, `getPointHealthRings`, `classifyPoiRootStatusForLocation`, `requestSubsetFit`, `window.dispatchEvent` (capturar `lovable:open-export-panel`), `useHealthRepairJob.attachToJob`.

Fixture scope: `[a1, b1, c1, dp1, dp2, dh1, dn1]` → counts esperados Reparable=2, A=1, B=1, C=1, no-reparable=2.

Casos:

1. Modal abierto muestra los 5 `data-triage-group` con `data-triage-group-count` correctos.
2. Abrir el modal **no** llama `supabase.rpc`.
3. Click "Reparar automáticamente N" llama `supabase.rpc('enqueue_health_repair', …)` y `_location_ids` ⊆ `{dp1, dp2}` (A/B/C/no-rep excluidos).
4. Click acción `export` en header de grupo B → `lovable:open-export-panel` con `detail.locations` = solo `[b1]` y `scope: 'internal'`. NO llama `rpc`.
5. Click acción `export` en header de grupo C → idem con `[c1]`.
6. Click acción `export` en header de grupo A → idem con `[a1]`.
7. Click "Exportar no reparables" → `detail.locations` = `[a1, b1, c1, dh1, dn1]` (excluye reparables).
8. Click "Exportar todo el scope" → `detail.locations` contiene los 7.
9. Click acción `map` en header de grupo C → `requestSubsetFit` con `[c1.id]` y `reason: 'health-triage-open-group'`.
10. Click acción `map` per-POI en `dp1` → `requestSubsetFit` con `[dp1.id]` y `reason: 'health-triage-open-poi'`.
11. Scope sin reparables (`[a1, b1, c1, dh1]`): primary disabled con label "No hay POIs reparables automáticamente"; grupos no-reparables siguen mostrando acciones funcionales `export`/`map`.
12. Click acción `export` o `map` cierra el modal (`onOpenChange(false)` llamado).
13. NO existe ningún `data-triage-group-action="geo-maintenance"` ni botón "Ir a Geo Maintenance" en el grupo B (contract test del matiz obligatorio).

### Regresiones a mantener verdes

- `src/test/health-repair-partition.test.ts` (18/18).
- `src/test/health-repair-dialog.test.tsx` (8/8) — flujo `filter='partial'` y gating.
- `src/test/health-repair-resolve-button-wiring.test.tsx` (5/5) — wiring footer→dialog y "abrir modal sin RPC".
- `src/test/effective-action-footer.test.tsx` (12/12).
- `src/test/poi-identity-root-status-client-parity.test.ts` (23/23).

---

## 8. Fuera de alcance

- Backend, schema, datos, RLS.
- `enqueue_health_repair` y `partitionRepairScopeByRootStatus` (sin cambios).
- Marker fill, POI-N, health rings, palette.
- Wiring `FilterBar → onResolveDebt → setDebtModalOpen(true)` (ya fixed).
- Cualquier nuevo evento global o ruta nueva.
- Botón "Ir a Geo Maintenance" en grupo B (acción futura, ver §3).
- Bump de versión.

---

## 9. Criterios de aceptación

**APROBADO** si y solo si:

- Cada uno de los 5 grupos expone al menos `Exportar grupo` + `Abrir grupo en mapa`.
- Cada POI listado expone `Abrir en mapa`.
- `Exportar grupo` envía únicamente los POIs de ese grupo.
- `Exportar no reparables` excluye `repairableIds`.
- `Exportar todo` incluye todo el scope.
- Abrir el modal **no** llama `supabase.rpc`.
- `Confirmar reparación` llama `rpc` con `_location_ids ⊆ repairableIds` (D ∩ {partial, chain}).
- A/B/C y no-reparables **nunca** entran en `_location_ids`.
- No existe botón "Ir a Geo Maintenance" en grupo B en este PR.
- Tests nuevos (13/13) + regresiones listadas pasan.

**NO APROBADO** si:

- Algún grupo queda como texto sin acción.
- A/B/C/no-reparables entran a `enqueue_health_repair`.
- Abrir el modal dispara RPC.
- Faltan tests de export/mapa por grupo.
- Aparece botón "Geo Maintenance" sin capability + navegación + test verificados.

---

## 10. Archivos afectados (en implementación posterior)

- `src/components/discovery/HealthRepairPreviewDialog.tsx` — refactor a triage por grupos + data hooks.
- `src/test/health-repair-triage-dialog.test.tsx` — nuevo (13 casos).
- `docs/audits/health-repair-triage-dialog-postflight.md` — postflight tras implementar.

Sin cambios en: `health-repair-partition.ts`, `FilterBar.tsx`, `EffectiveActionFooter.tsx`, `global-events.ts`, RPCs, schema.
