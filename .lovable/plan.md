## Objetivo

Convertir "Recuperar imágenes faltantes" en un job server-side persistente y reanudable (igual que `geocoding_jobs`), que sobreviva a F5, cierre de pestaña y cambios de dispositivo.

## Arquitectura propuesta

```text
┌─────────────────────┐       ┌─────────────────────────┐
│ RecoverImagesPanel  │──────▶│ image_recovery_jobs (BD)│
│ (start / cancel)    │  RPC  │ status, scope, cursor,  │
└─────────────────────┘       │ counters, totals        │
         ▲                    └────────────┬────────────┘
         │ realtime/poll                   │ tick (cada 1 min)
         │                                 ▼
┌─────────────────────┐       ┌─────────────────────────┐
│ ImageRecoveryLane   │◀──────│ image-recovery-job-tick │
│ (barra inferior)    │       │ (edge fn + pg_cron)     │
└─────────────────────┘       └─────────────────────────┘
```

Misma forma que el motor de geocoding: una fila en BD por job activo, un edge function `*-job-tick` que pg_cron invoca cada minuto, y la UI sólo lee/escribe estado.

## Cambios

### 1. BD — nueva tabla `image_recovery_jobs`

Espejo de `geocoding_jobs` adaptado:
- `id, user_id, created_by, status` (`running|canceling|done|canceled|failed`)
- `mode` (`missing|refresh|full`), `scope` jsonb (continent/country/region/zone/createdBefore/createdAfter/userId/locationIds)
- `dry_run`, `force`, `retry_stale_days`
- `cursor` text (id offset del recover-missing-images), `page_size`, `cooldown_ms`
- `total_in_scope`, `processed`, `updated`, `skipped`, `failed`, `remaining`
- `last_tick_at`, `last_error`, `recent_items` jsonb (últimos 30)
- `created_at`, `updated_at`
- Índices: `(status, last_tick_at) WHERE status IN ('running','canceling')`, único activo por usuario.
- RLS: usuario ve/cancela los suyos; admin/master ven todo.
- Trigger `updated_at`.
- RPC `cancel_image_recovery_job(_job_id uuid)` igual que `cancel_geocoding_job`.

### 2. Edge function nueva: `image-recovery-job-tick`

- Sin auth, invocada por cron (anon key).
- Loop interno: toma 1 job `running` con `last_tick_at` viejo, hace `SELECT … FOR UPDATE SKIP LOCKED`.
- Si `status='canceling'` → marca `canceled` y termina.
- Llama internamente a la lógica existente de `recover-missing-images` (extraer a helper compartido o invoke interno) con el `cursor` actual y el batch_size del job.
- Acumula contadores en BD; actualiza `cursor`, `recent_items` (mantener 30 últimos), `last_tick_at`.
- Si no hay `nextCursor` o `processed >= total_in_scope` → `status='done'`.
- En error → escribe `last_error` y deja `running` para reintentar (con backoff por `last_tick_at`).

### 3. `recover-missing-images` (existente)

- Sigue siendo el motor de UN lote: recibe scope+cursor+batchSize y devuelve resultados + nextCursor. Sin cambios de contrato. El tick lo invoca con service-role.

### 4. Cron (pg_cron + pg_net)

`SELECT cron.schedule('image-recovery-tick','* * * * *', $$ net.http_post(url:='…/image-recovery-job-tick', headers:='…apikey…') $$)`.

### 5. Cliente — `image-recovery-job-store` (Zustand)

Reemplaza el bucle client-driven por:
- `start(config)` → INSERT en `image_recovery_jobs` (status=`running`). Si ya hay activo del usuario, lo reusa.
- `stop()` → RPC `cancel_image_recovery_job`.
- Suscripción Realtime al row del job: actualiza `scanned/updated/totalTarget/cursor/items` desde BD.
- En mount: `SELECT … WHERE status IN ('running','canceling') AND user_id=auth.uid()` para auto-reanudar UI.

### 6. UI

- `RecoverImagesPanel`: misma UX. Botón pasa a "Lanzar / Detener job persistente". Indicador `En marcha · ver barra inferior` ya existe.
- `ImageRecoveryLane`: lee del store que ahora se alimenta desde Realtime → barra muestra `processed/total_in_scope` aunque cierres y vuelvas a entrar.

## Detalles técnicos

- **Concurrency**: índice único parcial `WHERE status IN ('running','canceling')` por `user_id` evita 2 jobs activos.
- **Total in scope**: en `start`, si scope=`ids` usar `array_length(location_ids)`; si scope=`user`/filtros, hacer un COUNT(*) inicial server-side (puede ir en el primer tick si es caro).
- **Cooldown entre lotes**: configurable en columna `cooldown_ms`; el tick respeta ritmo de 1/min de pg_cron, y dentro del tick procesa N lotes hasta llegar a un budget de tiempo (~25s para no exceder timeout).
- **Recent items**: jsonb truncado a 30 últimos para que el panel siga mostrando log reciente.
- **Backwards-compat**: el actual store cliente queda obsoleto pero se mantiene su API pública (`start/stop/totalTarget`) ahora respaldada por BD.

## Orden de implementación

1. Migración `image_recovery_jobs` + RLS + RPC cancel + trigger updated_at.
2. Edge fn `image-recovery-job-tick` + extraer worker reutilizable (o invocar `recover-missing-images` con service role).
3. pg_cron schedule (con `supabase--insert`, no migración).
4. Refactor `image-recovery-job-store` → Realtime + RPC.
5. Ajuste mínimo `RecoverImagesPanel` y `ImageRecoveryLane` para leer nuevos campos.
6. QA: lanzar job → F5 → barra reaparece con progreso correcto.

¿Lo apruebas y empiezo por la migración?