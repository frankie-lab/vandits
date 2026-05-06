# Geocodificación 100% automática y completa durante el import

## Diagnóstico

Hoy el flujo de import (`processImportedDocument`) hace:

1. Geocoding de puntos **sin coordenadas** (Nominatim por nombre).
2. FK resolve desde strings (`continent/country/region/zone`).
3. **Best-effort** kick a `backfill-admin-fks` con `limit:200` que NO se espera.
4. Marca `documents.import_status='confirmed'` y termina.

Resultado: puntos que llegan sólo con `lat/lng` (sin strings ni name útil) quedan con `country_id=null`. Eso genera un `pending_geocoding_count` por documento que dispara:

- Botón "Geocodificar (N)" por documento en `DocumentsPanel`.
- Banner amarillo "Geocodificar todos" en `GeographyTree`.
- Badge "N sin geocodificar" en cada documento.

El usuario lo quiere obligatorio y completo en el momento del import: sin tope, sin acción manual posterior.

## Cambio

### 1. `processImportedDocument` — geocodificación reverse bloqueante y SIN límite

Tras los pasos actuales 1 (Nominatim por nombre) y 2 (FK por strings), añadir un **paso 2.b "geo-reverse"**:

- Contar (con `count: 'exact', head: true`) los puntos del doc con `country_id IS NULL OR continent_id IS NULL` y `deleted_at IS NULL` → `initialPending`.
- Si `initialPending > 0`, ejecutar un loop **hasta agotar todos los pendientes**, llamando en cada iteración:
  ```ts
  await supabase.functions.invoke('backfill-admin-fks', {
    body: { limit: 25, document_id: docId },
  });
  ```
  - Tamaño de tanda 25 (la edge function ya respeta el rate-limit 1 req/s de Nominatim internamente; `limit:25` mantiene la barra fluida sin saturar).
  - Sin tope superior de "limit:200": el loop continúa hasta que la edge function devuelve `remaining=0` o una tanda completa devuelve `updated=0 && failed=0` (señal real de que no quedan resolubles).
  - Cap de seguridad **por iteraciones sin progreso** (no por número total): si 5 tandas seguidas vienen con `updated=0`, paramos el loop pero el documento sigue marcándose como confirmado; los puntos restantes son irresolubles (sin nombre + sin admin info en OSM) y se quedan en "Sin clasificar" sin CTA.
  - Emitir progreso vía `emitStep(docId, 'geocoding', 'running', { total: initialPending, processed })` cada tanda. La barra del banner del documento ya consume estos eventos.
- Sólo entonces continuar al paso 3 (catalog-match) y marcar `confirmed`.

Notas:
- No usamos el `geocoding-job-store` global aquí: el progreso vive en el banner del documento que ya existe (event bus). El store global queda reservado para `resumeIfPending` (refresh durante import largo).
- `processImportedDocument` ya es fire-and-forget desde el caller, así que el bloqueo es interno al pipeline del documento, no congela la UI.

### 2. Eliminar UI manual

**`src/domains/content/components/DocumentsPanel.tsx`**
- Borrar botón "Geocodificar (N)" y handler `handleGeocode` / `startDocumentGeocoding`.
- Borrar badge "N sin geocodificar".
- Borrar campo `pending_geocoding_count` del fetch + interfaz local.
- Limpiar imports muertos (`useGeocodingJobStore`, `startDocumentGeocoding`, `Compass`).

**`src/components/filters/GeographyTree.tsx`**
- Borrar el banner amarillo "Geocodificar todos" + `runBackfill`/`stopBackfill` y todo el bloque de progreso. Geografía vuelve a ser puramente lectura.

**`src/domains/content/lib/document-geocoding.ts`**
- Eliminar (sólo servía a los botones manuales).

**Memoria**
- Actualizar `mem://logic/geocoding/unified-job` y `mem://ui/documents-panel-actions`: la geocodificación es paso bloqueante del import, sin botones manuales; el job global sólo persiste para `resumeIfPending` tras refresh.

### 3. Mantener intactos

- `geocoding-job-store` y `resumeIfPending` (resiliencia tras refresh).
- `GeocodingProgressBar` global (sigue mostrando progreso si el store está activo durante un resume).
- Edge function `backfill-admin-fks` y helper `geocodeLocations` (sin cambios).

## Resumen para el usuario

Importar geocodifica **todos** los puntos de forma obligatoria y sin tope antes de marcar el documento como listo. Desaparecen los botones "Geocodificar" del panel de Contenido y del filtro de Geografía. El progreso aparece en el banner del propio documento mientras se procesa.
