# PR-4A.3a — Reparación de salud usa el carril Geo existente

## Objetivo

Cuando el usuario confirma una reparación desde el chip "Rellenar huecos" / "Reparar cadena", la `BottomProgressBar` muestra el progreso en el **mismo `GeocodingLane`** que ya existe. Sin nuevo carril, sin store nuevo, sin tocar la RPC.

## Cambios

### 1. `HealthRepairPreviewDialog.tsx`

Tras un `enqueue_health_repair` exitoso:

```ts
if (row?.job_id) {
  await useGeocodingJobStore.getState().attachToJob(row.job_id);
}
```

- **Guarda `row.job_id != null`** antes de llamar. Si la RPC devolvió `enqueued_count = 0` (audit `no_eligible`), `job_id` es `null` y no hay nada que enganchar — no se llama a `attachToJob`.
- `attachToJob` ya existe (turno previo). Idempotente.

### 2. `GeocodingLane.tsx` — copy contextual

El RPC actual ya inserta etiquetas claras (`'health-cta: rellenar huecos admin'`, `'health-cta: reparar cadena'`). Único ajuste:

- Si `scope.source === 'health_cta'`, prefijar el título con `Reparación de salud · {label sin "health-cta: "}`. En caso contrario, copy actual `Normalización geográfica · …` intacto.
- Sin cambio de icono ni de tono.

**Limitación aceptada**: si la reparación de salud se piggybackea sobre un job geo ya en curso (RPC paso 4), el job conserva su `scope.source` original (no-health) y el título seguirá diciendo "Normalización geográfica". El usuario sigue viendo el progreso, sólo el copy puede ser ambiguo. Aceptable para esta iteración: este PR no aísla jobs, eso queda para un PR posterior si se necesita.

### 3. Store — exponer `scope.source`

`geocoding-job-store.ts` → en `applyRow`, mapear `row.scope?.source` a `scope.source` (string opcional). Cero impacto en el resto del flujo.

## Fuera de alcance

- Carril dedicado "Salud" / `HealthLane`.
- Split del store por matcher.
- Modificación del RPC `enqueue_health_repair` para aislar jobs.
- Jobs paralelos Geo + Salud.

## Criterio de cierre

1. Disparar reparación con elegibles → `BottomProgressBar` aparece, carril Geo muestra "Reparación de salud · …", progresa, desaparece al terminar.
2. Disparar reparación sin elegibles (RPC devuelve `job_id=null`) → no se llama `attachToJob`, no aparece barra fantasma.
3. Reparación con job geo ya corriendo → el carril sigue visible, contador sube; el título mantiene "Normalización geográfica" (limitación documentada).
4. Sin reparación activa → barra oculta.

## Archivos tocados

- `src/components/discovery/HealthRepairPreviewDialog.tsx` — `attachToJob` con guard de `job_id`.
- `src/stores/geocoding-job-store.ts` — exponer `scope.source` en `applyRow`.
- `src/shared/progress/GeocodingLane.tsx` — prefijo de título cuando `scope.source === 'health_cta'`.
