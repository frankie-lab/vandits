## Diagnóstico

El toast "Geocodificación completada: 0 puntos" no es un fallo silencioso: el bucle termina tras **1 sola iteración** porque en modos `reconcile` y `overwrite` se conjugan dos defectos:

### Bug A — el store siempre pide la misma fila

`useGeocodingJobStore.start()` invoca la edge function con `limit: 1` y **sin `offset**`. En cada vuelta vuelve a pedir la primera fila ordenada por `created_at ASC`. En modo `fill` esto funciona porque la fila procesada deja de cumplir el `OR` de FKs nulos y "desaparece" del cursor; en `reconcile`/`overwrite` el cursor abarca **todas** las filas, así que siempre devuelve el mismo primer registro.

### Bug B — el bucle termina al primer skip

En la edge function, `reconcile` con primera fila ya consistente devuelve `processed=1, updated=0, failed=0, remaining=null`. El store tiene esta guardia:

```ts
if (upd === 0 && failed === 0) break;
```

→ Sale del bucle a la primera y muestra "0 puntos".

Por eso el modo recomendado parece no hacer nada.

## Fix

### 1. `supabase/functions/backfill-admin-fks/index.ts`

- En `**reconcile**` y `**overwrite**` devolver `remaining` calculado como `total_in_scope − offset − processed` (count rápido `head: true` con los mismos filtros sin paginar).
- Devolver también `nextOffset` = `offset + processed` para que el cliente avance el cursor sin recalcular.
- Subir `limit` por defecto razonable (sigue siendo configurable).

### 2. `src/stores/geocoding-job-store.ts`

- Mantener un `offsetRef` local en el bucle.
- En cada llamada enviar `offset: offsetRef`, leer `nextOffset` o calcular `offsetRef += processed`.
- Cambiar las condiciones de salida:
  - **fill** (igual que hoy): salir cuando `remaining === 0`.
  - **reconcile / overwrite**: salir solo cuando `processed === 0` (ya no quedan filas en el scope) — `updated===0 && failed===0` deja de ser señal de fin.
- Subir `limit` a un valor más útil (p.ej. `25`) para ahorrar round-trips; el respeto a Nominatim (1 req/s) sigue dentro de la edge function.
- Recalcular `remaining` real:
  - fill → como hoy (server lo manda).
  - reconcile/overwrite → usar `nextOffset` y un `total_in_scope` que el server envía solo en el primer tick (cachear en el store).

### 3. UI

- `GeographyBackfillPanel` ya muestra "Procesados X / total". Ahora `total` será el `total_in_scope` del primer tick para reconcile/overwrite (hoy lo calcula el panel antes de arrancar y queda correcto, así que sin cambios de UI necesarios).
- ETA seguirá funcionando porque `totalUpdated` ahora avanza de verdad.

## Archivos

- editar `supabase/functions/backfill-admin-fks/index.ts` (devolver `remaining` y `nextOffset` en todos los modos)
- editar `src/stores/geocoding-job-store.ts` (offset local, nuevas condiciones de salida, subir limit)

## Verificación

1. Lanzar reconcile en cuenta con 5074 puntos → contador debe avanzar de 1 en 1 hasta completar todos los puntos. El objetivo es completar todos los puntos y normalizarlos.
2. Ver que ETA se calcula tras los primeros segundos.
3. Pulsar "Detener" → corta entre ticks y respeta la cancelación.
4. Refrescar pestaña a media ejecución → `resumeIfPending` recoge el progreso desde la BD.  
ser persistente