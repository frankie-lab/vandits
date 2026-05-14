## Objetivo

Recuperar imágenes para los ~3.648 POIs enriquecidos sin imagen y blindar el primer enriquecimiento. Entregado en 4 PRs independientes.

---

## PR-IMG-1 — Image search shared helpers (base)

**El cambio más crítico.** Sin esta base sólida, la recuperación retroactiva reutilizaría una búsqueda frágil.

### Archivos nuevos
- `supabase/functions/_shared/external-fetch.ts`
  - Renombrado desde `wikiFetch` → **`externalFetch(url, init?)`** (no es Wikimedia-specific; cubre Commons/Wikidata/Openverse/OSM/etc).
  - Headers por defecto: `User-Agent: Vandits/1.0 (+https://vandits.lovable.app; contact@vandits.app)` + `Accept: application/json`.
  - **`Accept` es overridable** vía `init.headers` (algunas sources devuelven imagen binaria, XML o text/html).
  - `withRetry(fn, { attempts: 3, baseMs: 500, factor: 3, jitterMs: 200 })`.
  - 429/503/network → retry; 404/400 → no retry; 200 → ok.
- `supabase/functions/_shared/image-search.ts`
  - `searchImageFromSources(input, opts)` con sources en **`Promise.allSettled` paralelo** y elección por prioridad: Wikipedia > Commons > Wikidata > Openverse > **OSM (último, opt-in, máx 1 intento, sin retry)**.
  - Por source: `withRetry` + `externalFetch`.
  - Output enriquecido:
    ```ts
    {
      url: string,
      source: 'wikipedia'|'commons'|'wikidata'|'openverse'|'osm',
      license?: string,
      author?: string,
      attribution?: string,
      fetched_at: string  // ISO
    }
    ```
  - Telemetría devuelta: `{ sourcesTried[], sourcesSucceeded[], finalSource, durationMs }`.

### Sin cambios todavía en `enrich-location` ni `batch-enrich`
- Helper en paralelo. Validación: tests Deno básicos sobre `external-fetch` (UA presente, retry en 503, override de Accept) y mock de `image-search` (allSettled, prioridad correcta).

---

## PR-IMG-2 — Adoptar helpers en enrich-location y batch-enrich

### `enrich-location/index.ts`
- Reemplazar implementaciones inline por import de `_shared/image-search.ts`.
- Persistir en `enriched_data.media`:
  ```jsonc
  {
    "media": {
      "images": [{ url, source, license, author, attribution, fetched_at }],
      "cover_url": "<url>",
      "image_recovery": {
        "source_telemetry": {
          "sourcesTried": ["wikipedia","commons","wikidata"],
          "sourcesSucceeded": ["commons"],
          "finalSource": "commons",
          "durationMs": 1234
        }
      }
    }
  }
  ```
- Columna `cover_url` se mantiene = primera imagen, por compat con queries actuales.

### `batch-enrich/index.ts`
- `CONCURRENCY: 8 → 4`.
- Jitter 100–400ms entre tareas dentro de la misma ola.

### Verificación
- Enriquecer 5 POIs nuevos vía UI:
  - 4–5 con imagen (vs ~1 antes)
  - logs muestran telemetría
  - `image_recovery.source_telemetry` persistido.

---

## PR-IMG-3 — Edge function `recover-missing-images`

### `supabase/functions/recover-missing-images/index.ts`
- Input:
  ```ts
  {
    scope: 'all' | 'user' | 'ids',
    userId?: string,
    locationIds?: string[],
    batchSize?: number = 50,
    dryRun?: boolean = false,
    force?: boolean = false,        // ignora image_recovery_attempted_at
    retryStaleDays?: number = 30,
    cursor?: string                 // UUID, no offset
  }
  ```
- **Cursor estable por `id`** (no offset — el set candidato cambia a medida que se actualizan filas):
  ```sql
  WHERE id > :cursor
    AND enriched_data IS NOT NULL
    AND deleted_at IS NULL
    AND cover_url IS NULL
    AND COALESCE(enriched_data #>> '{media,images,0,url}', '') = ''
    AND (
      :force
      OR enriched_data #>> '{media,image_recovery_attempted_at}' IS NULL
      OR (enriched_data #>> '{media,image_recovery_attempted_at}')::timestamptz < now() - (:retryStaleDays || ' days')::interval
    )
  ORDER BY id ASC
  LIMIT :batchSize
  ```
  Devuelve `nextCursor = lastProcessedId` para continuación.
- Procesa en olas de **3 en paralelo**, jitter 200–500ms.
- Reusa helper de PR-IMG-1.
- Si encuentra: actualiza `cover_url` + `enriched_data.media.images` + telemetría.
- **Solo marca `image_recovery_attempted_at` cuando TODAS las sources han respondido (success o 4xx definitivo)**. Si hubo errores transitorios (timeout, 5xx en todas), NO marcar — permite reintento futuro.
- Output: `{ scanned, updated, skippedAlreadyAttempted, failedTransient, nextCursor }`.

### Sin UI todavía
- Probar via `curl_edge_functions` con `dryRun=true` y `scope='ids'` sobre 5 POIs concretos.

---

## PR-IMG-4 — Admin UI recovery

### `src/components/admin/RecoverImagesPanel.tsx`
- Integrar en panel admin "Data sources" existente.
- Controles:
  - Selector scope: Todos / Un usuario (autocomplete) / IDs pegados (textarea)
  - Toggle `dryRun` **on por defecto** — el flujo recomendado es ver primero qué se va a tocar
  - Toggle `force`
  - Slider `retryStaleDays` (default 30)
  - **Botón primary** (no destructivo): **"Recuperar imágenes faltantes"** — variante primaria del design system, no rojo.
- Progreso:
  - Reusar `BottomProgressMultiLane`
  - Lane "Recovery imágenes" con `processed/total/found/failed`
  - Maneja `nextCursor` para iteraciones encadenadas hasta vaciar el set.
- Log en vivo: últimos 20 POIs procesados con `name`, `result` (found/none/error), `source`.

---

## Notas y riesgos

### Atribución legal
- Wikimedia/Commons/Openverse **requieren atribución**. Guardar `author` + `license` + `attribution` no es opcional. Mostrar en popup/galería en pasos posteriores (fuera de scope).

### Métricas — sin promesas
- Tasa de recuperación: **objetivo medible tras dry-run sobre muestra de 200 POIs**. POIs locales tendrán tasa muy inferior. No prometer % hasta medir.

### OSM/Nominatim
- Última source, opt-in via `opts.includeOsm`, **un solo intento sin retry**, respeta política Nominatim (1 req/s, UA identificable). En la práctica casi nunca devolverá imagen útil.

### Sin migración de schema
- Solo se añaden keys opcionales en `enriched_data.media`. No requiere DDL.

### Coste
- Cero llamadas a modelos de IA. Solo HTTP a APIs públicas gratuitas.

---

## Orden de ejecución

1. **PR-IMG-1** (helpers compartidos + tests) — base obligatoria
2. **PR-IMG-2** (adopción + concurrencia 4 + telemetría persistida) — corta la sangría
3. **PR-IMG-3** (edge function recovery con cursor por id) — backend recovery masivo
4. **PR-IMG-4** (UI admin con dry-run on por defecto) — botón primary
