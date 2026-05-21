## Próximo tick image-recovery — 101 POI-7

### Scope
- **Selección IDs**: SELECT directo en `locations` (DB ya conectada como master), filtros canónicos del modo `missing`:
  - `deleted_at IS NULL`
  - `enriched_data->>'descripcion' IS NOT NULL AND <> ''`
  - `enriched_data->>'imagen' IS NULL OR = ''`
  - `user_image_url IS NULL`
  - `enriched_data->'media'->>'image_status' IS NULL` (excluye `pending_review` ya tocados → no cuentan para POI-8 y no se reintentan)
  - **`enriched_data->'recovery'->>'attempted_at' IS NULL`** (excluye intentos previos que ya consumieron cuota — `retry_stale_days=30`)
  - `ORDER BY created_at ASC LIMIT 101`
- Ese set se pasa como `scope.locationIds` al crear el job → `total_in_scope = 101`, `max_total = 101`.

### Job
- INSERT en `image_recovery_jobs`:
  - `user_id = sandbox-agent` (master, owner del tick operativo)
  - `mode = 'missing'`, `force = false`, `dry_run = false`
  - `scope = { locationIds: [...101] }`
  - `page_size = 25`, `max_total = 101`
  - `label = 'POI-7 top-101 oldest · guardrail ON'`
- Status inicial `running`. El cron `image-recovery-job-tick` lo va a recoger en su próxima ejecución; además forzaremos ticks vía `supabase--curl_edge_functions POST /image-recovery-job-tick` hasta `status='done'` (~4–5 ticks de ~25 items).

### Guardrail (ya implementado en `recover-missing-images`)
Sin cambios de código. El flujo por POI:
- candidato accepted (`imageKind='representative'`) → `enriched_data.imagen` se setea + `media.image_status='accepted'` → **cuenta como POI-8**.
- candidato rejected (`imageKind='symbolic'` o falla calidad) → se empuja a `enriched_data.media_rejected[]`, NO se setea `imagen` → sigue POI-7.
- candidato `pending_review` (kind=`unknown`) → `imagen` se persiste para revisión humana pero `media.image_status='pending_review'` → **NO cuenta como POI-8**.
- failed/no-image → contador `no_image`/`failed`, sin escritura sobre datos.

### Invariantes (verificados, no se tocan)
- `name`, `latitude`, `longitude`, FKs geo (`*_id`), `enriched_data.descripcion`, tags, colecciones: NO mutados por `recover-missing-images` (solo escribe `enriched_data.imagen`, `enriched_data.media`, `enriched_data.media_rejected`, `enriched_data.recovery`).
- Sin re-enrich: el endpoint no llama a IA de descripción/tags; solo image search + quality gate.

### Reporte final (después de `status='done'`)
Salida en chat + persistencia en `docs/audits/image-recovery-tick-<UTC>.md`:
| métrica | fuente |
|---|---|
| accepted | `recent_items` filter `result='found' AND media.image_status='accepted'` + diff DB `enriched_data->'media'->>'image_status' = 'accepted'` sobre los 101 |
| rejected | conteo de nuevas entradas en `enriched_data.media_rejected[]` sobre los 101 |
| pending | diff DB `media.image_status='pending_review'` sobre los 101 |
| failed | job.`failed` |
| POI-7 restante (global) | re-query del filtro POI-7 missing-image post-tick |
| auditoría | `job.id`, timestamps `created_at`/`updated_at`, `waves`, `scanned`, lista de items con `id/name/result/source/durationMs` desde `recent_items` |

### Pasos de ejecución
1. SELECT 101 IDs POI-7 oldest (DB directa).
2. INSERT job con `scope.locationIds`.
3. Loop: `curl POST /image-recovery-job-tick` cada ~5s hasta `status='done'` (o `last_error`).
4. SELECT counters + diff DB sobre los 101 IDs.
5. Escribir auditoría en `docs/audits/image-recovery-tick-<UTC>.md` + reporte en chat.

### Fuera de alcance
- No se modifica `recover-missing-images` ni `image-recovery-job-tick`.
- No se purgan ni reabren POIs en `pending_review` previo.
- No se promueve manualmente a POI-8 (toda promoción ocurre solo si el guardrail acepta).
- No version bump (operación de datos, no de código).
