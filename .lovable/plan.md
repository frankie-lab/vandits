# Geocoding job server-side (autocompletable)

Hoy el bucle vive en el navegador (`useGeocodingJobStore`). Si cierras el portátil, el avance ya guardado se conserva, pero el bucle no progresa hasta volver a abrir la app.

Objetivo: convertirlo en un **job de servidor** que, una vez lanzado, siga procesando hasta terminar — independientemente del navegador o del equipo del usuario. Solo se detiene si el usuario pulsa "Detener".

## Arquitectura

```text
[UI] ──► insert geocoding_jobs (status='running', scope, totals)
            │
            │  realtime subscription
            ▼
[UI] ◄── progreso (totals, ETA) en vivo
            ▲
            │
[pg_cron 1×min] ──► geocoding-job-tick (edge function)
                         │
                         ├─ lee próximo job 'running' (FIFO, lock con updated_at)
                         ├─ procesa N filas (reusa lógica de backfill-admin-fks)
                         ├─ actualiza job row: processed/updated/remaining/heartbeat
                         └─ si remaining=0  → status='completed'
                            si status='canceling' → status='canceled'
```

El navegador deja de ser necesario. La edge function se invoca cada minuto desde Postgres (pg_cron + pg_net), procesa un lote, y termina. Al siguiente minuto retoma. Nominatim sigue limitado a 1 req/s dentro del tick.

## Cambios

### 1. Base de datos (migration)
Nueva tabla `public.geocoding_jobs`:
- `id`, `user_id`, `created_at`, `updated_at`
- `status` enum: `running | canceling | canceled | completed | failed`
- `scope` jsonb: `{ documentId?, label?, mode, catalogOnly? }`
- `mode` text (denormalizado para índice)
- `offset` int, `page_size` int (default 25)
- `total_in_scope` int, `processed` int, `updated` int, `failed` int, `remaining` int
- `last_tick_at` timestamptz, `last_error` text
- Índice parcial `WHERE status IN ('running','canceling')` para el cron
- RLS: cada usuario ve/cancela solo sus jobs; service_role hace todo
- Realtime habilitado (`ALTER PUBLICATION supabase_realtime ADD TABLE`)

### 2. Edge function `geocoding-job-tick`
- Sin auth (la invoca pg_cron). `verify_jwt = false` en `supabase/config.toml`.
- Cada llamada:
  1. Selecciona 1 job con `status='running'` y `last_tick_at IS NULL OR < now()-30s` (lock optimista vía `update ... where updated_at = ...`).
  2. Si `status='canceling'` → marca `canceled` y retorna.
  3. Si no tiene `total_in_scope`, lo calcula con `head: true` y guarda.
  4. Procesa hasta `TIME_BUDGET_MS=120s` lotes de `page_size`, reusando la lógica actual de `backfill-admin-fks` (extraer a `_shared/backfill-core.ts`).
  5. Actualiza `processed/updated/failed/remaining/offset/last_tick_at`.
  6. Si `remaining=0` o no quedan filas → `status='completed'`.

### 3. Cron (pg_cron + pg_net)
SQL vía `supabase--insert` (no migration: contiene URL+anon key del proyecto):
```sql
select cron.schedule(
  'geocoding-job-tick-every-minute', '* * * * *',
  $$ select net.http_post(
       url:='https://nolmcafkzqwfmpleyfkx.supabase.co/functions/v1/geocoding-job-tick',
       headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
       body:='{}'::jsonb
     ); $$
);
```

### 4. Cliente — `useGeocodingJobStore` se simplifica
- `start()` → `insert` en `geocoding_jobs` con la scope. **No** lanza bucle local.
- `stop()` → `update status='canceling'` en el job propio activo.
- Suscripción realtime al row del job → expone `processed/updated/remaining/total_in_scope/status` al UI.
- ETA se sigue calculando en cliente con los mismos `eta.ts` (input: `processed`, `total_in_scope`, `last_tick_at`).
- Borrar `runningPromise`, `cancelFlag`, `resumeIfPending`, heartbeat en localStorage. Si quedan jobs `running` al abrir la app, la suscripción los muestra automáticamente.

### 5. UI (`GeographyBackfillPanel` + `GeocodingProgressBar`)
- Sin cambios visuales relevantes: ya consumen el store.
- Añadir nota: "El proceso continúa en segundo plano aunque cierres la app".

## Nota técnica
- **Concurrencia**: 1 job por usuario activo a la vez (constraint parcial UNIQUE en `user_id WHERE status IN ('running','canceling')`).
- **Idempotencia**: el tick es seguro de repetir; el offset se persiste por job.
- **Coste**: 1 invocación cron/min sin trabajo si no hay jobs activos (early return).
- **Resiliencia**: si un tick crashea, el siguiente minuto re-bloquea el job (lock por `last_tick_at < now()-30s`).

## Archivos
- **migration**: nueva tabla + enum + RLS + realtime
- **insert** (cron): schedule de `geocoding-job-tick`
- `supabase/functions/_shared/backfill-core.ts` (nuevo): extrae el procesamiento por lotes
- `supabase/functions/backfill-admin-fks/index.ts`: usa el shared (compatible con clientes legacy)
- `supabase/functions/geocoding-job-tick/index.ts` (nuevo)
- `supabase/config.toml`: `[functions.geocoding-job-tick] verify_jwt = false`
- `src/stores/geocoding-job-store.ts`: reescrito (insert + realtime, sin bucle local)
- `mem://logic/geocoding/unified-job`: actualizar
