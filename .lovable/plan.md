## Objetivo

Que cualquier POI sin `enriched_data.descripcion` muestre **dentro de su propia ficha** (popup del mapa, vista de detalle, fila de la lista del documento) las mismas opciones de recuperación que viven hoy en el `BatchEnrichmentPanel`: badge del motivo, mensaje, distancia, candidatos, **Reintentar / Contexto cercano / Renombrar**.

Los puntos enriquecidos no muestran nada. Reutilizamos los helpers ya creados — sin nuevos campos en `locations`.

---

## Arquitectura

### 1. Hook único `useEnrichmentFailure(locationId)`

`src/domains/content/hooks/use-enrichment-failure.ts`

- Único punto de lectura del motivo del último fallo de IA para un POI dado.
- Consulta:

```sql
SELECT error_messages, error_ids, updated_at
FROM enrichment_jobs
WHERE error_ids @> ARRAY[locationId]::uuid[]
ORDER BY updated_at DESC
LIMIT 1
```

- Devuelve:

```ts
{ parsed: ParsedEnrichmentError | null, loading: boolean }
```

donde `parsed` se obtiene con el `parseEnrichmentError(...)` ya existente sobre `error_messages[locationId]`.

- **Cache** en `Map<locationId, ParsedEnrichmentError|null>` a nivel de módulo + invalidación por:
  - evento `location:enriched` (ya emitido por `triggerEnrichLocation`) → borra entrada.
  - postgres realtime UPDATE en `enrichment_jobs` (un canal global, no uno por POI).
- TTL en memoria: 60 s para evitar re-consultas en re-render.

Impacto DB: a futuro conviene añadir índice GIN sobre `enrichment_jobs.error_ids`. **Migración mínima incluida**:

```sql
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_error_ids
  ON public.enrichment_jobs USING GIN (error_ids);
```

### 2. Componente compartido `UnenrichedRecoveryBlock`

`src/domains/content/components/UnenrichedRecoveryBlock.tsx`

Props:

```ts
{ location: GeoLocation, variant: 'card' | 'row' }
```

(El popup no es React, ver §4.)

- Si `location.enrichmentStatus === 'enriched'` o tiene `enriched_data.descripcion` → no renderiza nada.
- Llama `useEnrichmentFailure(location.id)` para tono y datos extra.
- Render:
  - **Header**: `<AlertCircle/>` + badge con `labelForKind(parsed?.kind ?? 'unknown')` o "Sin enriquecer" si no hay registro.
  - **Mensaje**: `parsed.message` si existe; si no, copy genérico "Este punto aún no se ha enriquecido".
  - **Distancia**: `parsed.nameLocation.distanceKm` cuando aplica.
  - **Acciones** (siempre en este orden):
    1. **Reintentar** → `triggerEnrichLocation(location.id, { focusAfter: false })`.
    2. **Contexto cercano** → dispatch `open-nearby-context` con `providedName / nameLocation / nearbyCandidates` parseados (o vacíos si no hay job).
    3. **Renombrar** → input inline pre-rellenado con `parsed.candidates[0]?.name`. Solo aparece si `parsed.kind === 'coherence'` con `candidates.length>0`.
  - **Chips de candidatos** (≤ 4): pre-rellenan el input al pulsarse.
- Tono: ámbar para soft (`coherence | no_match`), rojo para errores duros, gris neutro cuando no hay registro de fallo.

`variant` solo cambia padding / tamaño tipográfico (`row` más compacto). Cero diferencias de lógica.

### 3. Wiring en ficha completa y lista de doc

- **`GalleryView`** (`src/components/GalleryView.tsx`): insertar `<UnenrichedRecoveryBlock variant="card" location={loc}/>` justo encima del bloque de descripción cuando el punto no está enriquecido.
- **`DocumentWaypointsTabs`** (la lista de waypoints del doc): añadir `<UnenrichedRecoveryBlock variant="row" location={loc}/>` en cada fila no-enriquecida, debajo del nombre. Compacto: solo header + 1 línea con los 3 botones; los chips de candidatos se muestran solo si los hay.

### 4. Wiring en el popup del mapa (HTML)

`src/components/map/map-popups.ts` y `src/components/map/map-popup-handlers.ts`.

El popup es **HTML string** + delegación con `data-action`. Mantenemos ese patrón — no introducimos React mount.

- Helper único nuevo `buildRecoveryBlockHtml(loc, parsed, themeTokens)` en `src/components/map/popup-recovery.ts`. Devuelve un `<div data-recovery-root data-location-id="...">…</div>` con la misma estructura visual que el componente React.
- Insertar el bloque en la cabecera del popup cuando `!loc.enrichedData?.descripcion`.
- Como el popup se construye sincrónicamente y el lookup del job es async, el bloque se inyecta primero "skeleton" (con badge "Sin enriquecer", solo Reintentar + Contexto cercano), y un `requestAnimationFrame` después se rehidrata con el motivo + candidatos llamando al mismo cache singleton del hook (refactorizado a una clase `enrichmentFailureStore` exportable).
- Nuevos `data-action` delegados en `map-popup-handlers.ts`:
  - `enrich-retry` → `triggerEnrichLocation(locationId, { focusAfter: false })`.
  - `enrich-context` → emite `open-nearby-context` con el payload cacheado.
  - `enrich-rename` → muestra/oculta input inline (toggle DOM en sitio); `enrich-rename-confirm` ejecuta `update locations set name` + reintenta.
  - `enrich-pick-candidate` → rellena el input.
- Si el popup se cierra antes de que el lookup complete, simplemente no se rehidrata (idempotente).

### 5. Persistencia & estado

- **No** se añade columna nueva a `locations`. La fuente del motivo es `enrichment_jobs` (decisión del usuario). Cuando un job se purga, los puntos sin éxito muestran solo Reintentar + Contexto cercano (estado "Sin enriquecer" sin badge específico) — comportamiento aceptable.
- El cache realtime se invalida cuando llega un UPDATE de `enrichment_jobs` que afecta al `locationId` en su `processed_ids` o `error_ids`.

### 6. Memoria

Nueva memoria `mem://logic/enrichment/per-poi-recovery-block` con:

- Helper único `useEnrichmentFailure(locationId)` + cache `enrichmentFailureStore`.
- Componente único `UnenrichedRecoveryBlock` (variants `card | row`) + helper HTML `buildRecoveryBlockHtml` para popup.
- Se monta SIEMPRE en todo POI no-enriquecido (popup, ficha, fila de doc).
- Acciones reutilizan `triggerEnrichLocation` y el evento `open-nearby-context`.
- No hay schema change en `locations`; el motivo se obtiene por lookup al job más reciente.

---

## Archivos tocados

- `supabase/migrations/<ts>_idx_enrichment_jobs_error_ids.sql` — **nuevo** (índice GIN).
- `src/domains/content/hooks/use-enrichment-failure.ts` — **nuevo** (hook + store singleton).
- `src/domains/content/components/UnenrichedRecoveryBlock.tsx` — **nuevo** (variant `card | row`).
- `src/components/map/popup-recovery.ts` — **nuevo** (HTML builder).
- `src/components/map/map-popups.ts` — insertar bloque skeleton cuando POI no enriquecido.
- `src/components/map/map-popup-handlers.ts` — nuevos `data-action` enrich-retry / context / rename / pick-candidate.
- `src/components/GalleryView.tsx` — montar `UnenrichedRecoveryBlock variant="card"`.
- `src/domains/content/components/DocumentWaypointsTabs.tsx` — montar `UnenrichedRecoveryBlock variant="row"` en filas no-enriquecidas.
- `mem://logic/enrichment/per-poi-recovery-block.md` + entry en `mem://index.md`.

Sin cambios en `BatchEnrichmentPanel` (sigue mostrando la lista global; ahora el usuario tiene paridad punto-a-punto).
