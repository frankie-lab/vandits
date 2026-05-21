## Cierre image-recovery job `3e8a009b-77a4-4444-b1c6-e8d965f76a24`

### 1. Terminar ticks
- Loop `POST /image-recovery-job-tick` cada ~5s hasta que la fila tenga `status='done'` (o `last_error`). El job ya está capado a `max_total=37`, así que como máximo restan ~11 POIs.
- Re-chequeo mid-loop con `SELECT status, scanned, updated, no_image, skipped, failed, waves, last_error, recent_items FROM image_recovery_jobs WHERE id='3e8a009b…'`.

### 2. Consolidar métricas finales
Sobre el set real de IDs procesados (los 37 del scope):
- `accepted` = COUNT donde `enriched_data->'media'->>'image_status' = 'accepted'` post-tick (delta respecto a pre-tick).
- `rejected` = COUNT con nuevas entradas en `enriched_data->'media_rejected'`.
- `pending_review` = COUNT con `enriched_data->'media'->>'image_status' = 'pending_review'`.
- `failed` = `job.failed`.
- `none` = `job.no_image`.
- `scanned`, `total_in_scope` desde la fila del job.
- POI-7 restante global = re-query del filtro canónico POI-7 missing-image (path correcto `enriched_data.media.image_recovery_attempted_at`).

### 3. Crear `docs/audits/image-recovery-batch-500-<UTC>.md`
Contenido:
- **Job ID** `3e8a009b-77a4-4444-b1c6-e8d965f76a24` + timestamps.
- **Scope real procesado**: 37 IDs (no 500, no 1.403). Lista resumida con `id`/`name` desde `recent_items`.
- **Métricas finales** (tabla con las 7 métricas de arriba).
- **Hallazgo del filtro erróneo**:
  - Filtro incorrecto usado en la solicitud previa: `enriched_data->'recovery'->>'attempted_at'`.
  - Path real canónico: `enriched_data.media.image_recovery_attempted_at`.
  - Consecuencia: el primer job de 500 (`e634ea84…`) seleccionó IDs no-enriched/inelegibles → 0 escrituras útiles → **inocuo, no tocó datos**.
- **Backlog real**: 37 POI-7 reales (enriched + sin imagen + sin recovery previa), no 500 ni 1.403.
- **Cierre operativo**: no se lanzan nuevos jobs image-recovery hasta nueva orden.
- **Invariantes verificados** (no se tocó: name/lat/lng/FKs/descripcion/tags/colecciones; no re-enrich; sin código/migraciones/bump).

### Restricciones respetadas
- No nuevos jobs.
- No código, no migraciones, no version bump.
- No re-enrich.
- Solo lectura DB + ticks edge function + creación de un archivo markdown de auditoría.
