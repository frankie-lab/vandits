
## Objetivo

Cuando un proceso de geocodificación termina, hoy desaparece la tarjeta de progreso y el usuario no sabe qué pasó. Hay que:

1. **Mostrar un resumen del último proceso** en la columna 3 ("Lanzar"), justo donde estaba la barra de progreso.
2. **Refrescar la lista de puntos** (universo + contadores de cada modo) para que el árbol y los 3 KPIs superiores reflejen el nuevo estado tras el proceso.

## Cambios

### 1. `src/stores/geocoding-job-store.ts` — exponer snapshot del último job

- Añadir al estado:
  ```
  lastResult: {
    finishedAt: number;
    status: 'completed' | 'canceled' | 'failed';
    mode: BackendMode;
    label?: string;
    totalProcessed: number;
    totalUpdated: number;
    failed: number;
    durationMs: number;
    initialPending: number;
  } | null;
  clearLastResult: () => void;
  ```
- Dentro de `applyRow`, cuando `status` deja de ser activo (`completed | canceled | failed`), poblar `lastResult` con los counters de la fila (calcular `durationMs` con `Date.now() - startedAt`).
- `clearLastResult` setea `lastResult: null`.

### 2. `src/components/admin/GeographyBackfillPanel.tsx` — tarjeta resumen + refresco

#### 2a. Tarjeta "Resumen del último proceso"

En la columna 3, cuando `!job.running && job.lastResult`, renderizar una tarjeta nueva (encima del botón "Lanzar") con:

- Título: "Resumen del último proceso" + chip de estado:
  - `completed` → verde "Completado"
  - `canceled` → naranja "Detenido"
  - `failed` → rojo "Fallido"
- Línea con `lastResult.label` y modo.
- Grid 2 columnas reutilizando el componente `StatCell` ya existente:
  - Revisados (`totalProcessed / initialPending`)
  - Actualizados (verde)
  - Sin cambios (`processed - updated - failed`)
  - Errores (rojo si > 0)
  - Duración (`formatDuration(durationMs)`)
  - Tasa (puntos/min)
- Pie: "Hace Xm" (relativo a `finishedAt`) y botón texto "Cerrar resumen" → `clearLastResult()`.

El resumen persiste hasta que el usuario lo cierre o lance un nuevo job (al lanzar también se limpia para evitar mezclar pasados).

#### 2b. Refresco de lista tras finalizar

El `useEffect` de las líneas 280-292 ya recarga `summary` y `universe` 500ms después de que `job.running` pasa a false. Reforzar:
- Aumentar el delay a 1500ms (los UPDATE realtime/RPC pueden ir un pelo desfasados respecto al COMMIT final del tick).
- Tras el refresco, si `selectedIds` contiene IDs que ya no están en el nuevo `universeLocations`, podarlos (ya queda implícito si el usuario tenía selección — el universo cambia y los IDs ya procesados desaparecen del modo "fill"/"repair", así que limpiamos selección si todos sus IDs salieron del universo).

#### 2c. Limpiar resumen al lanzar

En `handleStart`, antes de invocar `start(...)`, llamar `useGeocodingJobStore.getState().clearLastResult()`.

## Notas técnicas

- No tocamos backend (`geocoding-job-tick`, `backfill-admin-fks`): los counters ya están en la fila `geocoding_jobs`.
- `initialPending` viene de `total_in_scope` (ya pinned) — el resumen mostrará el universo declarado al lanzar, no el recortado.
- `STAT_TONE` y `StatCell` ya existen, se reutilizan.
- No hay cambios de schema/migrations.

## Resultado esperado

Tras "Lanzar sobre selección (2)" → procesar 2 puntos → al terminar:
- La tarjeta de progreso desaparece.
- Aparece "Resumen del último proceso · Completado": Revisados 2/2, Actualizados N, Errores 0, Duración 8s, ~15 ptos/min.
- El árbol del universo se refresca: si el modo era "Rellenar huecos" y ambos puntos pasaron a OK, el contador del modo baja a 0.
- El KPI superior "Rellenar huecos" baja en consonancia.
