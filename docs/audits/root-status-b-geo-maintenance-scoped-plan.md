# Root Status B — Geo Maintenance scoped (plan técnico)

> **Tipo**: docs-only · plan técnico.
> **Scope**: Grupo **B** (`partial` / `stale_name` / `broken` con identidad razonable) en `HealthRepairPreviewDialog` → `GeographyBackfillPanel`.
> **No-goals**: no toca código, datos, schema, backend, no bump. No introduce flujos para A/C. No reemplaza el repair D (que sigue siendo el único estado con escritura automática vía preview→confirm dentro del propio diálogo de triage).
> **Referencias**:
> - `docs/contracts/root-status-resolution-contract.md`
> - `docs/audits/root-status-resolution-current-gaps-audit.md`
> - `docs/audits/health-repair-triage-dialog-plan.md`
> - `src/components/admin/GeographyBackfillPanel.tsx`
> - `src/components/admin/admin-tabs.tsx`
> - `src/domains/identity/capabilities.ts` (espejo Deno en `supabase/functions/_shared/capabilities.ts`)

---

## 1. Objetivo

Permitir que, desde el grupo B de `HealthRepairPreviewDialog` (modo "Resolver deuda"), un admin/master pueda **enviar exactamente los IDs del grupo B del scope actual** al panel canónico de mantenimiento geográfico para que allí se ejecute backfill/canonicalize con preview + confirmación + audit log, **sin escritura directa desde el modal de triage** y **sin mezclar con D repair**.

## 2. Auditoría del flujo destino (estado real, hoy)

| Pregunta | Hallazgo |
|---|---|
| 1. ¿Existe panel destino? | **Sí.** `src/components/admin/GeographyBackfillPanel.tsx`, montado como tab `geography` en `admin-tabs.tsx`. |
| 2. Capabilities canónicas | **Sí.** `view_geo_maintenance` (gating tab, admin+master), `run_geo_backfill` (admin+master), `run_geo_canonicalize` (master). Catálogo en `src/domains/identity/capabilities.ts` con espejo Deno. |
| 3. Navegación real al panel | **Parcial.** Tab existe vía sidebar BackOffice; **no hay evento ni ruta deep-link** que abra el panel con un payload externo de IDs. |
| 4. Evento/ruta para abrirlo desde fuera | **No existe.** No hay `lovable:open-geo-maintenance` ni query param tipo `?adminTab=geography&ids=…`. |
| 5. ¿Acepta scope por IDs? | **Sí, internamente.** `useGeocodingJobStore.start(..., { locationIds: explicitIds, healthFilter: undefined })` ya soporta selección explícita y omite el healthFilter cuando hay IDs (líneas 355–372 del panel). Pero esa selección **solo se construye desde el árbol interno del propio panel** (`selectedIds`), no desde un payload externo. |
| 6. ¿Acepta país/región/global? | **Sí** (modo universe por `targetUserId` + `healthFilter`). Ortogonal a (5). |
| 7. Preview antes de escribir | **Parcial.** El panel muestra `universeTotal` y `selectedIds.size` y un label legible, pero **no hay un step "preview-confirm" dedicado para payloads externos** equivalente al de `HealthRepairPreviewDialog`. El usuario pulsa "Lanzar sobre selección (N)" y el job arranca. |
| 8. ¿Encola job o escribe directo? | **Encola.** Inserta en `geocoding_jobs` (`created_by = admin.uid`, `user_id = target.uid`); cron procesa con service role. No hay UPDATE directo desde el cliente. |
| 9. Audit log | **Parcial.** `useOperationHistory(operationKeyForCapability('run_geo_backfill'))` registra start/complete en `localStorage` (canon PR-BACKOFFICE-DEAD-SURFACES-1). No hay tabla `operation_runs`. Suficiente bajo el canon actual. |
| 10. ¿Puede recibir exactamente los IDs del grupo B? | **Bloqueado.** El store acepta IDs, pero **no existe el puente** desde `HealthRepairPreviewDialog` → panel destino con payload preservado. |

## 3. Resultado del gate (regla del contrato §6)

> *"No añadir botón en HealthRepairPreviewDialog si el destino no acepta scope por IDs **o** si no hay capability / navegación / test."*

- Capability: **OK** (`run_geo_backfill`).
- Scope por IDs en el motor: **OK** (`store.start({ locationIds })`).
- **Navegación cross-panel con payload: BLOQUEADO.**
- Preview/confirm dedicado en destino para payload externo: **BLOQUEADO** (no equivalente al de D repair).
- Tests: **No existen** para este puente.

**Decisión**: **NO se implementa botón "Geo Maintenance" en grupo B en este paso.** Grupo B mantiene únicamente `Exportar` / `Mapa` hasta que se construya el puente descrito en §4.

## 4. Plan técnico para desbloquear (cuando se autorice)

### 4.1 Puente de payload (cliente)

Crear un canal único de handoff IDs → panel destino. Patrón canónico (event bus, no query param para evitar URLs gigantes):

- **Evento**: `lovable:open-geo-maintenance-scoped`
  - `detail: { locationIds: string[]; mode: 'repair' | 'fill' | 'review'; source: 'health-repair-dialog'; reason: 'root-status-B'; }`
- **Emisor**: `HealthRepairPreviewDialog` (grupo B), un único `dispatchEvent` + cierre del modal.
- **Listener**: `GeographyBackfillPanel` (mount-level + en vivo). Al recibir el evento:
  1. Verifica `has_permission(uid, 'run_geo_backfill')` (gate de UI + gate de RPC server-side ya existente).
  2. Setea `mode` recibido y `selectedIds = new Set(detail.locationIds)`.
  3. Hace `scrollIntoView` al CTA "Lanzar sobre selección".
  4. **No arranca el job**: requiere click humano explícito.
- **Router**: navegar a `/admin?tab=geography` o equivalente actual antes de emitir, o bien emitir tras navegación si el panel ya está montado (idempotente; el evento se reentrega si el panel se monta después usando un `pendingHandoff` ref en un store ligero).

### 4.2 Step "preview-confirm" en el destino

Antes de habilitar "Lanzar", el panel destino debe mostrar, **cuando `source === 'health-repair-dialog'`**:

- Banner de origen ("N puntos enviados desde Resolver deuda · grupo B · Root Status B").
- Count = `locationIds.length` (debe coincidir con el del grupo B del scope original).
- Detalle por health (`partial / stale_name / broken`) recomputado contra el universe.
- Botón primario `Lanzar backfill scoped (N)` + botón secundario `Descartar handoff`.

Esto sí cumple la regla dura de UI/escritura del contrato §3 y §4.

### 4.3 Gating

- Botón en `HealthRepairPreviewDialog` grupo B visible **solo si** `useCapability('run_geo_backfill')`.
- Si capability ausente: ocultar botón. Mantener `Exportar` / `Mapa`.
- Si destino no monta o evento no entregado tras N ms: toast `"No se pudo abrir Geo Maintenance"` y permanecer en el modal. **Nunca** intentar fallback de escritura inline.

### 4.4 Payload — invariantes

- Solo Root Status **B**. A / C / D / no-reparables filtrados antes de emitir (reusar `health-repair-partition.ts`).
- `locationIds.length === group.B.length` del scope visible al pulsar el botón.
- Sin metadatos PII; solo UUIDs.
- Sin coordenadas, sin nombre.

## 5. Tests obligatorios (cuando se implemente)

`src/test/root-status-b-geo-maintenance-handoff.test.tsx`:

1. **gating-off**: sin `run_geo_backfill` → botón "Geo Maintenance" **no aparece** en grupo B.
2. **gating-on**: con `run_geo_backfill` → botón **aparece** y es clicable.
3. **handoff-emit**: click despacha exactamente un `lovable:open-geo-maintenance-scoped` con `detail.locationIds == group.B.ids`.
4. **no-write-on-click**: click **no** inserta en `geocoding_jobs`, **no** llama RPC `admin_user_geo_*`, **no** llama `store.start`.
5. **payload-scope-B-only**: A, C, D y no-reparables **no** aparecen en `detail.locationIds`.
6. **destination-receives**: `GeographyBackfillPanel` montado recibe evento, setea `selectedIds`, **no** arranca job.
7. **destination-preview-required**: confirm explícito requerido en destino antes de `store.start`.
8. **destination-missing**: si `view_geo_maintenance` falso (panel no montable) → botón **no aparece** en origen (regla dura: sin destino no hay botón).
9. **mixed-with-D**: en un scope con B+D, el botón B no incluye IDs de D y el botón D (repair preview) no incluye IDs de B.
10. **contract-test**: `health-repair-dialog` **no** importa `useGeocodingJobStore` ni RPCs `admin_user_geo_*` (sigue cumpliendo regla dura de no-escritura desde triage).

## 6. Archivos previstos (cuando se implemente, NO ahora)

| Archivo | Cambio |
|---|---|
| `src/shared/events/geo-maintenance-handoff.ts` | **nuevo** · contrato del evento + helper `dispatchGeoMaintenanceHandoff()` y `subscribeGeoMaintenanceHandoff()`. |
| `src/components/discovery/HealthRepairPreviewDialog.tsx` | botón condicional en grupo B + handler que cierra modal y despacha evento. |
| `src/components/admin/GeographyBackfillPanel.tsx` | listener + banner preview-confirm + setter de `selectedIds` desde handoff. |
| `src/test/root-status-b-geo-maintenance-handoff.test.tsx` | **nuevo** · tests §5. |
| `docs/contracts/root-status-resolution-contract.md` | nota normativa: "B usa handoff evento → preview-confirm en panel destino; no escribe desde triage". |

Ningún cambio a `supabase/`, `src/integrations/supabase/`, schema, RPC, datos, ni `package.json`.

## 7. Estado actual

- **Bloqueado para implementación inmediata** por ausencia de: (i) puente de payload IDs → panel destino, (ii) step preview-confirm específico para handoff externo en `GeographyBackfillPanel`.
- **Grupo B sigue exponiendo únicamente** `Exportar` y `Mapa` en `HealthRepairPreviewDialog`.
- D repair queda intacto como **único estado con flujo automático seguro** (preview→confirm→job dentro del propio diálogo).
- Plan §4–§6 listo para ejecución en un PR separado cuando se apruebe.

## 8. Criterios de aceptación del propio plan

- [x] Audita el destino real (`GeographyBackfillPanel`) sin inventarlo.
- [x] Identifica capabilities reales (`view_geo_maintenance`, `run_geo_backfill`, `run_geo_canonicalize`).
- [x] No inventa botón sin destino real.
- [x] No propone escritura directa desde el triage.
- [x] Garantiza scope por IDs (`store.start({ locationIds })`).
- [x] No mezcla B con D repair.
- [x] Declara bloqueo y condiciones de desbloqueo.
- [x] Define tests previos a cualquier merge.
- [x] No toca código.
