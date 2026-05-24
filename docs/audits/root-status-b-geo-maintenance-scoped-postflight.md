# Root Status B → Geo Maintenance scoped — POSTFLIGHT

> **Tipo**: implementation postflight · docs + UI bridge.
> **Plan**: `docs/audits/root-status-b-geo-maintenance-scoped-plan.md`
> **Contrato**: `docs/contracts/root-status-resolution-contract.md`
> **Estado**: **APROBADO**.

---

## 1. Resumen

Se ha implementado el puente operativo seguro entre el **grupo B (deuda de sistema)** de `HealthRepairPreviewDialog` y el panel canónico `GeographyBackfillPanel`, respetando la regla DURA: **no se ejecuta backfill desde el modal de triage**. El click sólo preselecciona y exige confirmación humana en el panel destino.

## 2. Cambios

### Nuevos archivos

| Archivo | Propósito |
|---|---|
| `src/shared/events/geo-maintenance-handoff.ts` | Bridge tipado: evento `lovable:open-geo-maintenance-scoped`, `pendingHandoff` para mount tardío, helpers `dispatch / consume / subscribe / navigate`. |
| `src/test/root-status-b-geo-maintenance-handoff.test.tsx` | 8 tests del puente (T1–T8). |
| `docs/audits/root-status-b-geo-maintenance-scoped-postflight.md` | Este documento. |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/components/discovery/HealthRepairPreviewDialog.tsx` | Botón `Abrir en Geo Maintenance` en grupo B, gated por `useCapability('view_geo_maintenance')` AND `useCapability('run_geo_backfill')`. Handler `handleOpenGeoMaintenance` despacha evento + navega a `/admin/geography` + cierra modal. Actualizada `GROUP_META.systemDebt.help` y `recommendation` para reflejar el flujo real. |
| `src/components/admin/GeographyBackfillPanel.tsx` | Listener mount-level (`consumePendingGeoMaintenanceHandoff` + `subscribeGeoMaintenanceHandoff`). Estado `handoff` + re-aplicación a `selectedIds` con `handoffAppliedAtRef`. Banner ámbar `data-testid="geo-maintenance-handoff-banner"` arriba del modo, con botón `Descartar`. **No** arranca job automáticamente. |
| `src/test/health-repair-triage-dialog.test.tsx` | Mock `useCapability` (default-deny) + test 13 reescrito ("SIN capability, no aparece botón"). |
| `src/test/health-repair-dialog.test.tsx` | Mock `useCapability` añadido. |
| `src/test/health-repair-resolve-button-wiring.test.tsx` | Mock `useCapability` añadido. |

### NO tocado

- Schema / migraciones / RPC.
- Backend / edge functions.
- `enqueue_health_repair` (D repair sigue como único flujo automático del diálogo).
- Marker fill, POI-N, health rings.
- `PR-EXPORT-2` core, Nominatim.
- Datos.

## 3. Comportamiento UX

**Origen (Resolver deuda → grupo B)**:
- Sin capability `run_geo_backfill` o `view_geo_maintenance` → botón NO se renderiza. Grupo B mantiene `Exportar` y `Mapa`.
- Con ambas capabilities y `ids.length > 0` → aparece botón `[Wrench] Abrir en Geo Maintenance`.
- Click → despacha evento con `{ locationIds, source: 'health-repair-triage', label, emittedAt }`, cierra modal, navega a `/admin/geography` (idempotente vía `history.pushState` + `popstate`).
- Click **NO** llama `supabase.rpc`. **NO** dispara `enqueue_health_repair`.

**Destino (`GeographyBackfillPanel`)**:
- Recibe handoff vía mount-drain + suscripción live.
- Pinta banner ámbar: `"Resolver deuda · Deuda de sistema (B) · N puntos"`, count en strong, mensaje explícito `"Nada se ha escrito todavía"`, botón `Descartar`.
- Preselecciona `selectedIds = new Set(locationIds)`. El usuario revisa modo y pulsa `Lanzar sobre selección (N)` (CTA existente) — único punto que llama `useGeocodingJobStore.start` y encola job.
- `handoffAppliedAtRef` evita re-aplicación en bucle pero permite re-aplicar tras `mode` change si el handoff sigue vivo.

## 4. Cumplimiento del contrato (`root-status-resolution-contract.md`)

| Regla | Estado |
|---|---|
| §3 No escritura directa desde triage | OK · click sólo despacha evento. |
| §4 Preview + confirmación en destino | OK · banner + CTA "Lanzar sobre selección" existente. |
| §6 No botón sin destino real, sin capability, sin scope-IDs | OK · doble gate de capability + `ids.length > 0`. |
| Mantener D como único estado automático | OK · `enqueue_health_repair` intacto; tests T8 + regresión en suites previas verde. |
| Sin mezcla con D repair | OK · payload `B_IDS ∩ NON_B = ∅`, verificado en T5. |
| Audit log | OK · `useOperationHistory(operationKeyForCapability('run_geo_backfill'))` ya cableado en el panel. |

## 5. Tests

`bunx vitest run src/test/root-status-b-geo-maintenance-handoff.test.tsx src/test/health-repair-triage-dialog.test.tsx src/test/health-repair-dialog.test.tsx src/test/health-repair-resolve-button-wiring.test.tsx`

Resultado: **34/34 PASS** (8 nuevos + 26 regresión).

| Test | Cobertura |
|---|---|
| T1 | sin capability → botón ausente. |
| T2 | con capability → botón presente. |
| T3 | click despacha evento con IDs B exactos y `source='health-repair-triage'`; `pendingHandoff` persiste para mount tardío. |
| T4 | click NO llama `supabase.rpc`. |
| T5 | payload excluye A/C/D/no-reparables (`a1, c1, dp1, dh1, dn1`). |
| T6 | click cierra modal. |
| T7 | scope sin Bs → grupo systemDebt no se renderiza, botón ausente. |
| T8 | regresión D repair: `enqueue_health_repair` jamás recibe IDs de B. |

## 6. Criterios APROBADO

- [x] Botón aparece SOLO con `view_geo_maintenance` + `run_geo_backfill`.
- [x] Click abre Geo Maintenance scoped vía evento + navegación.
- [x] No ejecuta escritura directa desde triage.
- [x] Payload contiene SOLO IDs B del scope actual.
- [x] Tests pasan (34/34).
- [x] UX explicita que la confirmación ocurre en Geo Maintenance ("Nada se ha escrito todavía" + CTA "Lanzar sobre selección").

## 7. Notas operativas

- El handoff se persiste en módulo (`pendingHandoff`) hasta que el panel lo consume → robusto frente a navegación asíncrona.
- `navigateToGeoMaintenance()` usa `pushState + popstate` (compatible react-router) e es idempotente si ya estás en `/admin/geography`.
- El banner es **descartable** (`X`) → limpia `selectedIds` y oculta banner.
- Sin riesgo de doble-aplicación: `handoffAppliedAtRef` compara `emittedAt`.
- Si el usuario cambia de `mode` en el panel destino, el handoff se re-aplica porque la selección explícita bypassea `healthFilter` (línea ya existente en el job runner del panel).
