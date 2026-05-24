# Root Status Resolution — Current Gaps Audit

Status: AUDIT (docs-only, descriptivo). Sin código, datos, schema, backend ni bump.

Referencia normativa: `docs/contracts/root-status-resolution-contract.md`.

## 1. Resumen ejecutivo

El patrón común A/B/C/D se cumple **parcialmente** hoy:

- **D** cumple el patrón end-to-end en `HealthRepairPreviewDialog` (clasificar,
  agrupar, explicar, listar, preview, confirmar, RPC con allowlist, audit,
  progreso vía `GeocodingLane`).
- **A, B, C** cumplen los pasos 1–4 + Exportar/Mapa, pero **no tienen acción
  recomendada operativa real**. Aparecen como "futuro" con salida sólo de
  inspección (ver, exportar, mapa).
- **Ninguna superficie escribe datos al hacer click directo** — la regla
  dura §4 del contrato se respeta.

Riesgo principal: si A/B/C siguen creciendo sin flujo dedicado, la presión
para añadir "botones rápidos" puede romper el patrón común.

## 2. Flujo actual por grupo

### A — Incompleto real

| Aspecto | Estado |
|---------|--------|
| Clasificación | OK (`classifyPoiRootStatusForLocation`, paridad Deno). |
| Agrupación | OK (`partitionRepairScopeByRootStatus`). |
| Explicación | OK (texto en `HealthRepairPreviewDialog`). |
| Lista expandible | OK. |
| Acción recomendada | "Completar identidad" como texto, sin entrada operativa. |
| Acción por grupo | **Ausente** — no hay editor de identidad batch ni inline. |
| Acción por POI | Abrir popup (open-on-map) OK. |
| Exportar grupo | OK (vía `evaluatePoiExport`, típicamente `internal-only`). |
| Abrir grupo en mapa | OK (`requestSubsetFit` con `reason='triage-group:A'`). |
| Confirmar antes de escribir | N/A (no escribe). |
| Audit / progreso | N/A. |

**Gap principal**: no hay editor de identidad inline ni cola "Completar
identidad". Hoy el usuario debe abrir POI a POI desde el mapa.

### B — Sistema / canon / backfill

| Aspecto | Estado |
|---------|--------|
| Clasificación | OK. |
| Agrupación | OK. |
| Explicación | OK ("Deuda de sistema / canon"). |
| Lista expandible | OK. |
| Acción recomendada | "Backfill futuro" (texto). |
| Acción por grupo | **Ausente desde triage**. `GeographyBackfillPanel` existe pero opera **global**, no por subset de IDs. No hay navegación cableada desde el modal. |
| Acción por POI | Abrir popup OK. |
| Exportar grupo | OK. |
| Abrir grupo en mapa | OK. |
| Confirmar antes de escribir | N/A. |
| Audit / progreso | Cuando se ejecuta desde `GeographyBackfillPanel`: `useOperationHistory` para `run_geo_backfill` / `run_geo_canonicalize` (PR-BACKOFFICE-DEAD-SURFACES-1). Desde triage: N/A. |

**Gap principal**: `GeographyBackfillPanel` no acepta scope por IDs. Hasta
que exista runner scoped, el grupo B no puede tener botón "Enviar a Geo
Maintenance" honesto. La salida hoy es inspección (export/mapa).

### C — Revisión / incoherencia

| Aspecto | Estado |
|---------|--------|
| Clasificación | OK (`geo_health ∈ {broken, stale_name, empty, hard_error}`). |
| Agrupación | OK. |
| Explicación | OK. |
| Lista expandible | OK. |
| Acción recomendada | "Revisión manual" (texto). |
| Acción por grupo | **Ausente** — no hay cola de revisión dedicada. |
| Acción por POI | Abrir popup OK. El popup permite editar nombre/coords manualmente. |
| Exportar grupo | OK. |
| Abrir grupo en mapa | OK. |
| Confirmar antes de escribir | N/A. |
| Audit / progreso | N/A. |

**Gap principal**: no existe UI dedicada de "Cola de revisión 1-a-1". El
usuario debe iterar a mano desde el mapa.

### D — Coherente

| Aspecto | Estado |
|---------|--------|
| Clasificación | OK. |
| Agrupación | OK + sub-split `partial`/`chain` (`repairablePartialIds`, `repairableChainIds`). |
| Explicación | OK. |
| Lista expandible | OK. |
| Acción recomendada | "Reparar deuda" — botón real. |
| Acción por grupo | **OK**: `enqueue_health_repair(_action, _scope_mode, _location_ids)` con allowlist `repairableIds`. |
| Acción por POI | OK. |
| Exportar grupo | OK (incluye públicos POI-9/10 enriched). |
| Abrir grupo en mapa | OK (`requestSubsetFit` con `reason='repair-preview'`). |
| Confirmar antes de escribir | OK (botón "Confirmar reparación"). |
| Audit / progreso | OK: `health_repair_actions` + `GeocodingLane`. |

**Cumple el patrón completo.** Único estado con escritura automática.

## 3. Puntos donde el patrón se cumple

- Partición canónica A/B/C/D (`health-repair-partition.ts`) garantiza no
  solapes, no fugas.
- `enqueue_health_repair` recibe **sólo** `repairableIds` (D ∩ {partial, chain}).
  A/B/C nunca entran. Defensa en profundidad: server-side filtering en la RPC.
- Ningún botón en `HealthRepairPreviewDialog` escribe sin preview +
  confirmación.
- Paridad cliente↔Deno del clasificador
  (`poi-identity-root-status-client-parity`).
- D usa lanes de progreso canónicos (`mem://logic/health/repair-progress-attach`).

## 4. Gaps por grupo

| Grupo | Gap | Impacto | Prioridad |
|-------|-----|---------|-----------|
| A | No editor de identidad batch ni inline desde triage. | Usuario debe abrir POI a POI. Fricción alta si N grande. | **P1** |
| B | `GeographyBackfillPanel` no acepta scope por IDs; no hay navegación desde triage. | La bolsa típicamente mayor de deuda queda sin flujo operativo. | **P1** |
| C | No cola de revisión 1-a-1 dedicada. | Incoherencias se resuelven sólo si el usuario abre POI manualmente. | **P2** |
| D | Validación operativa real pequeña pendiente (smoke 1–2 POIs). | Confirma que ciclo cerrado en producción coincide con preview. | **P2** |
| Global | No hay contract tests genéricos del patrón común (no-RPC-para-A/B/C ya cubierto; no-botón-fantasma y preview-antes-de-escribir no formalizados). | Drift futuro si se añaden superficies nuevas. | **P3** |

## 5. Riesgos si no se unifica

- **Proliferación de botones ad-hoc**: cada PR futuro tentado a añadir
  "su botón" para resolver su bolsa específica, fuera del patrón.
- **Escrituras directas**: regresión silenciosa donde un click dispara
  RPC sin preview.
- **Drift cliente/Deno**: si nuevas superficies clasifican A/B/C/D con su
  propia heurística en vez del SoT.
- **Botones fantasma**: acciones que abren paneles inexistentes o pasan
  scope que el destino ignora (efecto = escritura global encubierta).

## 6. Prioridad de implementación sugerida (sin implementar aún)

- **P1 · Editor de identidad inline para A**: permitir editar nombre/coords
  mínimos desde el triage sin abrir el popup completo. Preview + confirmación.
- **P1 · Preview canon/backfill por subset para B**: extender
  `GeographyBackfillPanel` (o crear runner adjunto) para aceptar
  `location_ids[]` como scope, con preview de counts por país/región y
  typed-token de confirmación. Requiere `run_geo_backfill` (admin+master).
- **P2 · Cola de revisión C dedicada**: panel 1-a-1 con next/prev, edición
  inline de nombre/coords, descarte explícito.
- **P2 · Validación real D**: smoke test operativo con 1–2 POIs reales.
- **P3 · Tests de contrato del patrón común**: formalizar
  `no-botón-fantasma`, `preview-antes-de-escribir`, `scope-por-IDs` como
  contract tests genéricos.

## 7. Bloques fuera de alcance de esta auditoría

- Backend / RPC nuevas.
- Schema (no nuevas columnas, no nuevos enums).
- Datos (no migraciones).
- Marker fill / POI-N visual.
- Health rings.
- Bump de versión.
- Roadmap producto más allá de A/B/C/D.

## 8. Referencias

- `docs/contracts/root-status-resolution-contract.md` (contrato).
- `docs/contracts/poi-identity-root-status-contract.md` (clasificación).
- `docs/audits/health-repair-triage-dialog-plan.md` (primer caso aplicado).
- `src/components/discovery/HealthRepairPreviewDialog.tsx`.
- `src/components/discovery/health-repair-partition.ts`.
- `src/domains/content/lib/poi-identity-root-status-client.ts`.
- `supabase/functions/_shared/poi-identity-root-status.ts`.
- `src/test/health-repair-partition.test.ts`.
- `src/test/health-repair-triage-dialog.test.tsx`.
- `src/test/poi-identity-root-status-client-parity.test.ts`.
