# Health Repair — Feedback & Progress Postflight

**Scope:** Buscar y Filtrar → Mantener → Con deuda → Resolver deuda.
**PR:** Validación funcional del feedback visual del flujo `enqueue_health_repair` (no docs-only).
**Fecha:** 2026-05-24.

## Resumen ejecutivo

El flujo "Resolver deuda" tiene feedback visible en los dos niveles esperados:

1. **Spinner + estado en el `HealthRepairPreviewDialog`** durante el submit.
2. **Lane de progreso** (`GeocodingLane` dentro de `BottomProgressBar`) tras el enqueue, vía
   `useGeocodingJobStore.getState().attachToJob(job_id)`.

Los 8 invariantes funcionales del flujo quedan cubiertos por tests RTL con Supabase, store y
`sonner` mockeados. **No se ejecuta RPC real ni se toca BD.**

## Cambios aplicados (mínimos y seguros)

### `src/components/discovery/HealthRepairPreviewDialog.tsx`

Sólo accesibilidad y hooks de test, sin tocar la lógica del submit:

- `aria-busy={submitting}` en `<DialogContent>`.
- `data-submitting` y `data-exhausted` para QA/test.
- Región `<div aria-live="polite" data-testid="health-repair-status">` que anuncia
  `"Encolando reparación…"` durante el submit y `"Sin acciones disponibles"` cuando
  `exhausted = true`.

No se modificó:

- La RPC ni sus argumentos.
- `handleConfirm` ni su control de errores.
- `partitionRepairScopeByRootStatus`.
- `GeocodingLane`, `BottomProgressBar`, ni el store.

### `src/test/health-repair-dialog.test.tsx` (nuevo)

8 tests RTL con mocks de:

- `@/integrations/supabase/client` → `supabase.rpc` controlado por test.
- `@/stores/geocoding-job-store` → `attachToJob` espía.
- `sonner` → `success/error/info` espías.
- `@/domains/content/lib/poi-identity-root-status-client` → classifier por prefijo
  de id (`a*=A`, `b*=B`, `c*=C`, `d*=D`).
- `@/components/map/subset-fit`, `@/shared/geography/hierarchy` → no-op.

## Resultado de tests

```
bunx vitest run src/test/health-repair-dialog.test.tsx
✓ src/test/health-repair-dialog.test.tsx (8 tests) 429ms
Test Files  1 passed (1)
     Tests  8 passed (8)
```

| # | Escenario | Resultado |
|---|-----------|-----------|
| 1 | Spinner + label "Encolando…" + disabled mientras `submitting` | PASS |
| 2 | Doble click NO llama dos veces a `enqueue_health_repair` | PASS |
| 3 | RPC recibe `_location_ids` = D ∩ {partial,chain} (A/B/C excluidos) | PASS |
| 3b | Filter `hardError` → no hay reparables, confirm disabled, no RPC | PASS |
| 4 | Éxito → `attachToJob(job_id)` + `toast.success` + `onOpenChange(false)` | PASS |
| 5 | `enqueued_count = 0` → no `attachToJob`, `exhausted=true`, modal abierto, label "Sin acciones disponibles" | PASS |
| 6 | Error RPC → `toast.error`, `submitting=false`, `aria-busy=false`, modal sigue actionable | PASS |
| 7 | Sólo A/B/C en scope → confirm disabled, no RPC | PASS |

## Confirmaciones

- **Spinner en modal:** `<Loader2 … animate-spin />` aparece y el botón muestra "Encolando…"
  durante el submit (test 1). `aria-busy` y la región `aria-live` reflejan el estado.
- **Bloqueo anti doble submit:** test 2 confirma exactamente una llamada a `rpc` pese a tres
  clicks rápidos.
- **`_location_ids` = repairableIds:** test 3 verifica el contenido y la ausencia de A/B/C.
- **`attachToJob(job_id)`:** test 4 verifica que se llama exactamente una vez con el job_id
  devuelto por la RPC. Esto es lo que dispara la aparición de `GeocodingLane` en
  `BottomProgressBar` (el lane lee `useGeocodingJobStore` y muestra "Reparación de salud · …"
  cuando `job.scope.source === 'health_cta'`).
- **Error mantiene modal abierto:** test 6.
- **Sin reparables no hay submit:** tests 3b y 7.

## Gaps residuales

Ninguno bloqueante. Posibles mejoras menores (fuera de scope):

- **Hueco visual handoff (~200–500 ms):** entre el cierre del modal y el primer render de la
  lane (mientras `attachToJob` hace el fetch del job). Mitigable con un flag `running=true`
  optimista en el store antes del fetch. No aplicado aquí para no tocar el store.
- **Tests E2E del lane:** este postflight cubre que `attachToJob` se invoca con el `job_id`
  correcto. La visibilidad real de la lane (`job.running`, ETA, segmentos) ya está cubierta
  por el contrato del store y por `bottom-progress-multi-lane`. No se ha duplicado aquí.

## Fuera de alcance (no tocado)

- Backend, schema, datos, RLS.
- `enqueue_health_repair` (RPC server-side).
- Marker fill, POI-N, health rings v2.
- 5ª tab Identity (PR-FILTER-ROOTSTATUS-2.2 cerrado como fila compacta).
- Version bump.

## Archivos afectados

- `src/components/discovery/HealthRepairPreviewDialog.tsx` — aria-busy + aria-live + data-* hooks.
- `src/test/health-repair-dialog.test.tsx` — nuevo, 8/8 PASS.
- `docs/audits/health-repair-feedback-progress-postflight.md` — este doc.
