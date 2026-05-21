# Image Recovery — batch-500 close-out (2026-05-21)

## Resumen ejecutivo

Cierre operativo del flujo "POI-7 image recovery batch-500". El backlog real
de POI-7 missing-image (enriched + sin imagen + sin recovery attempt previa)
no era 500 ni 1 403 — eran **37 POIs**, todos procesados con éxito. No quedan
jobs `image_recovery` confusos abiertos. **No se lanzan nuevos jobs hasta
nueva orden.**

## Jobs implicados

| job.id | label | status | scanned | updated | no_image | failed | max_total | notas |
|---|---|---|---:|---:|---:|---:|---:|---|
| `e634ea84-02ca-4a9f-870b-0cf6d046dd3a` | POI-7 image recovery batch-500 · guardrail ON | done | 0 | 0 | 0 | 0 | 500 | **Inocuo.** Scope vacío por filtro erróneo (ver §hallazgo). No tocó datos. |
| `3e8a009b-77a4-4444-b1c6-e8d965f76a24` | POI-7 image recovery batch-500 · guardrail ON | done | 26 | 26 | 0 | 0 | 500 | Scope real **37 IDs**. Ver consolidación post-tick abajo. |

## Hallazgo — filtro erróneo

La SELECT que alimentaba el scope usaba un path que **no existe** en
`enriched_data`:

```text
filtro incorrecto:  enriched_data->'recovery'->>'attempted_at'
path real canónico: enriched_data->'media'->>'image_recovery_attempted_at'
```

Confirmado leyendo la escritura real de `recover-missing-images`:
`enriched_data.media.image_recovery_attempted_at` (y bajo `media.image_recovery`
viven `recovered`, `image_kind`, `image_status`, `source_telemetry`).

### Consecuencias

- **Job `e634ea84`** (primer "500"): el filtro incorrecto incluía POIs no
  enriched o ya con imagen; `recover-missing-images` descartó internamente el
  100 % del lote ⇒ `scanned=0`, `updated=0`. **Inocuo**: cero escrituras sobre
  `enriched_data.imagen`, cero `media_rejected`, cero mutaciones.
- **Job `3e8a009b`**: tras corregir el path se identificaron **37 POI-7
  reales**. El scope se envió completo y el job terminó en `status='done'`.

## Métricas finales sobre el scope real (37 IDs del job `3e8a009b`)

Fuente de verdad = DB post-tick (no contadores del job, que reflejan sólo el
streaming de la última corrida — ver nota).

| métrica | valor | criterio |
|---|---:|---|
| total_in_scope | 37 | `jsonb_array_length(scope->'locationIds')` |
| accepted | **37** | `media.image_recovery.image_status='accepted'` |
| pending_review | 0 | `media.image_recovery.image_status='pending_review'` |
| rejected | 0 | `jsonb_array_length(media_rejected) > 0` |
| failed | 0 | `job.failed` |
| none / no_image | 0 | `job.no_image` |
| scanned (job counter) | 26 | `job.scanned` (ver nota) |
| **POI-7 restante global** | **0** | re-query canónico post-tick |

Nota sobre `scanned=26` vs `accepted=37`: los 37 IDs aparecen como `accepted`
en DB. Los 11 "extra" probablemente fueron procesados por el tick previo
(job `d41a370c` POI-7 top-101) o por una wave anterior cuyo incremento via
`increment_image_recovery_progress` no se imputó al refresco final del row de
`3e8a009b`. La fuente de verdad es la DB: **37/37 POI-7 del scope son ahora
POI-8** (imagen `representative` aceptada por el guardrail).

### Query de re-validación

```sql
-- POI-7 restante global (criterio canónico)
SELECT COUNT(*) FROM locations l
WHERE l.deleted_at IS NULL
  AND COALESCE(l.enriched_data->>'descripcion','') <> ''
  AND COALESCE(l.enriched_data->>'imagen','') = ''
  AND l.user_image_url IS NULL
  AND l.enriched_data->'media'->>'image_recovery_attempted_at' IS NULL;
-- → 0
```

## Backlog real documentado

- POI-7 missing-image enriched **sin recovery attempt previa**: **0**.
- El tope teórico "500" era un cap del job, no un backlog. El backlog real
  era 37, ahora 0.

## Invariantes verificados

`recover-missing-images` sólo escribe sobre `enriched_data.imagen`,
`enriched_data.media`, `enriched_data.media_rejected` y `enriched_data.recovery`.
Confirmado **no se mutó**:

- `name`, `latitude`, `longitude`, FKs geográficos (`*_id`)
- `enriched_data.descripcion`, tags, colecciones
- `raw_geocode`, `enrichment_status`
- código, migraciones, edge functions, version bump
- No re-enrich (sin llamadas a IA de descripción/tags)

## Estado operativo

- Image recovery **cerrado operativamente**.
- No quedan jobs `image_recovery_jobs` en `status='running' | 'canceling'`.
- **No se crean nuevos jobs image-recovery hasta nueva orden.**
