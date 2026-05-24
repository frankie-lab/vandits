# POI-7 Image Recovery — L2 Execution

**Fecha**: 2026-05-21
**Versión**: 1.3.6 (sin bump)
**Guardrail activo**: sí — `classifyImageCandidate` + `image_status` (rejected/pending_review excluidos por `hasValidatedMedia`).

## Scope

- Snapshot inicial (sandbox `f04b3b95-…`, POI-7 candidato — sin `enriched_data.imagen`, no rejected/pending, `geo_health='ok'`, `raw_geocode IS NOT NULL`, descripción presente): **252 IDs** (`docs/audits/snapshots/poi7-l2-scope.csv`).
- Filtrado real (también sin `user_image_url`, no atendidos previamente): **103 IDs** (`docs/audits/snapshots/poi7-l2-scope-real.csv`).
- Los 149 restantes del snapshot ya tienen `user_image_url` (Atlas Obscura) — `recover-missing-images mode=missing` los excluye por contrato; no son POI-7 funcional.
- Los 20 falsos positivos L1 (`image_status='rejected'`) quedan excluidos por la consulta.

## Ejecución

- Mecanismo: `POST /functions/v1/recover-missing-images` con `scope:'ids'`, `mode:'missing'`, `dryRun:false`, clasificación previa activa.
- Batches lanzados:
  - **Batch 1 — 50 IDs**: completado OK.
  - **Batch 2 — 50 IDs**: completado server-side (tool client timeout, función terminó).
  - **Batch real subset (25 IDs, scope-real)**: 2 procesados antes de timeout; resto pendiente.

## Resultados consolidados (sobre los 252 IDs del snapshot)

| Métrica | Valor |
|---|---|
| attempted (`media.image_recovery_attempted_at`) | **57** |
| accepted (`image_status='accepted'`, kind=`representative`) | **56** |
| rejected (bandera/escudo/logo) | **0** |
| pending_review | **0** |
| `enriched_data.imagen` poblado | **56** |
| failedTransient (no fuente) | **1** (`noImage`) |

Promoción POI-7 → POI-8+: **56** (todos `accepted/representative`; geo+desc+media → POI-8/9 según tags).

## Calidad

- 0 rechazos heráldicos en L2. Diferencia vs L1 (49 % flags): scope L2 no incluye `place_type='city'` puro — son POIs Atlas-Obscura-style con páginas Wikipedia/Commons que devuelven foto real. Guardrail demostró no penalizar fotos legítimas.
- Fuentes: `wikipedia`, `wikimedia_commons`, `wikimedia_geosearch`, `openverse`.

## Pendiente

- **101 IDs `scope-real` aún no atendidos** por timeout de cliente (la edge function necesita admin JWT y los batches >25 IDs exceden el timeout del tool). Reanudación: ejecutar `recover-missing-images` con los IDs restantes de `poi7-l2-scope-real.csv` cuyo `media.image_recovery_attempted_at` siga NULL (consulta SQL más abajo).
- Pasarela alternativa: cron `image-recovery-job-tick` los procesará automáticamente.

```sql
-- IDs todavía pendientes de L2
SELECT id, name FROM locations
WHERE owner_user_id='f04b3b95-7308-4b74-b3c7-7e819767c5fb'
  AND raw_geocode IS NOT NULL AND geo_health='ok'
  AND length(coalesce(enriched_data->>'descripcion',''))>0
  AND (enriched_data->>'imagen' IS NULL OR enriched_data->>'imagen'='')
  AND (user_image_url IS NULL OR user_image_url='')
  AND enriched_data->'media'->>'image_recovery_attempted_at' IS NULL
  AND coalesce(enriched_data->>'image_status','') NOT IN ('rejected','pending_review');
```

## Campos tocados (solo)

`enriched_data.imagen`, `enriched_data.imagen_fuente`, `enriched_data.image_status`, `enriched_data.image_kind`, `enriched_data.media` (sub-llaves `cover_url`, `images[]`, `media_rejected[]`, `image_recovery`, `image_recovery_attempted_at`).

## Campos NO tocados

`name`, `latitude`, `longitude`, `raw_geocode`, FKs geo, `enriched_data.descripcion`, tags/categorías, colecciones, `place_type`, `enrichment_status`.

## Restricciones cumplidas

- Sin re-enrichment IA. Sin bump (versión 1.3.6 intacta). Sin migraciones. Sin cambios de código. Sin tocar fixtures soft-deleted. Sin hard-delete.

## Rollback

```sql
-- Revertir L2 sobre los 57 atendidos (sólo accepted; pending=0, rejected=0)
UPDATE locations SET enriched_data = enriched_data
  - 'imagen' - 'imagen_fuente' - 'image_status' - 'image_kind'
  || jsonb_build_object('media', (enriched_data->'media') - 'cover_url' - 'images' - 'image_recovery' - 'image_recovery_attempted_at')
WHERE id IN (
  SELECT id FROM locations
  WHERE enriched_data->'media'->>'image_recovery_attempted_at' >= '2026-05-21T12:30:00Z'
    AND enriched_data->'media'->>'image_recovery_attempted_at' <  '2026-05-21T13:30:00Z'
    AND owner_user_id='f04b3b95-7308-4b74-b3c7-7e819767c5fb'
);
```

## Snapshots

- `docs/audits/snapshots/poi7-l2-scope.csv` (252)
- `docs/audits/snapshots/poi7-l2-scope-real.csv` (103)
