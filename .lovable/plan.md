# Plan: vista mesa de trabajo + geocodificación + opciones "Añadir"

Tres cambios coordinados sobre el mismo flujo (subir → mesa de trabajo → añadir).

---

## 1. Mostrar los puntos del documento sobre el mapa al abrir la vista

**Síntoma:** Al entrar en `DocumentFocusView` (Mesa de trabajo) el mapa queda vacío y se muestra el `ErrorBoundary` ("The app encountered an error"). El filtro `filterByDocumentId` ya existe (`use-document-focus.ts`) pero `DocumentFocusView` nunca dispara el evento `document:view-on-map`, por lo que el mapa global no entra en modo foco.

**Cambio transversal:**
- Al montar `DocumentFocusView`: `dispatchEvent('document:view-on-map', { docId, docName, matchingCatalogIds })`.
- Al desmontar / `onBack`: `dispatchEvent('document:view-on-map', null)` para limpiar.
- Calcular `matchingCatalogIds` (los `is_approved=true` del doc + los puntos de catálogo a <250m por nombre via `findCatalogMatch` ya existente) una sola vez al cargar.
- Añadir un `flyToBounds` automático: cuando entra el foco, ajustar el mapa a los bounds de los puntos del documento (helper nuevo `fitMapToLocations` o reutilizar el bus que ya usa la vista de itinerario).

**Fix del ErrorBoundary:** investigar la traza exacta tras corregir el flujo de filtros (probablemente desaparece al ya no dejar `filterByDocumentMatchIds` como `Set` no serializable). Si persiste, parchear `locations-store.getFilteredLocations` para tolerar `matchingCatalogIds` vacío.

---

## 2. Geocodificación automática al subir

**Estado actual:** En `saveDocumentToDatabase` (`db-operations.ts:114`) ya existe un `void supabase.functions.invoke('backfill-admin-fks')` *fire-and-forget* que reverse-geocodifica solo los puntos sin `country/region`. **No** geocodifica puntos sin `lat/lng`.

**Cambio transversal:**
- Antes de insertar en la tabla `locations`, en `saveDocumentToDatabase`:
  - Detectar puntos con `lat==null || lng==null || (lat==0 && lng==0)`.
  - Llamar a `geocodeLocations(points)` — helper nuevo en `src/shared/geography/geocode-batch.ts` que envuelve la edge function `batch-geocode` ya existente.
  - Sustituir las coords obtenidas; los que sigan sin coords se marcan `customData.needs_geocoding = true` y se guardan igual (visibles en pestaña "Vacíos").
- En `DocumentFocusView`, añadir CTA "Geocodificar pendientes" en la pestaña "Vacíos" cuando haya puntos con `needs_geocoding`.
- Dejar el `backfill-admin-fks` actual para los FKs administrativos (continente/país/región).

---

## 3. Ampliar el diálogo "Añadir" del documento

Hoy ofrece dos modos: `Catálogo general` e `Itinerario`. Añadir tres más para alinear con lo que ya existe en el diálogo de subida (UploadPreviewDialog).

**Nuevos modos (RadioGroup `addMode`):**

| Modo | Acción |
|------|--------|
| `catalog` (existente) | Promueve a catálogo general. |
| `itinerary` (existente) | Crea ruta con los puntos como paradas. |
| **`collection`** (nuevo) | Añade los puntos como `collection_items` a una colección. Selector con colecciones del usuario + botón "Nueva colección" inline (nombre + icono Lucide + color + visibilidad). |
| **`route`** (nuevo) | Atajo para añadir los puntos como waypoints a una **ruta existente** (no crear una nueva). Selector de rutas propias. |
| **`tag`** (nuevo) | No promueve a catálogo: solo añade una o varias **etiquetas personalizadas** a `enriched_data.etiquetas` de los puntos del documento. Input multi-tag (chips) con autocompletado de tags ya usados por el usuario. |

**Reglas comunes a los nuevos modos:**
- Reutilizan el mismo `scope` (Todos / Solo seleccionados).
- El bloque "Visibilidad" solo aplica a `catalog`, `itinerary` y `collection` (en `tag` se oculta).
- El toggle "Enriquecer con IA" se mantiene solo para `catalog` e `itinerary`.
- El "Resumen de la operación" se vuelve genérico: "Puntos a incorporar" / "Coincidentes con catálogo" / "Etiquetas a aplicar" según modo.

**Helper único centralizado** (regla "transversal-changes-only"):
- Crear `src/services/document-add.service.ts` con `applyAdd(docId, mode, options)` que internamente llama a:
  - `place.service` para `catalog`
  - `route.service` para `itinerary` y `route`
  - `collection.service.addItem` para `collection`
  - actualización masiva de `enriched_data.etiquetas` para `tag`

---

## Archivos afectados

- `src/domains/content/components/DocumentFocusView.tsx` — disparar `document:view-on-map` al montar, ampliar diálogo Añadir con 3 modos nuevos.
- `src/domains/content/hooks/use-document-focus.ts` — añadir `fitMapToLocations` cuando entra el foco.
- `src/domains/content/lib/db-operations.ts` — invocar `geocodeLocations` antes del insert.
- `src/shared/geography/geocode-batch.ts` (nuevo) — wrapper único para `batch-geocode`.
- `src/services/document-add.service.ts` (nuevo) — helper transversal de los 5 modos.
- Memoria: actualizar `mem://features/import/unified-two-step-flow` con los nuevos modos y la geocodificación previa.

## Riesgos

- `batch-geocode` puede tardar para documentos grandes (382 puntos). Mitigar con loading state en el diálogo de subida y permitir guardar el doc igual con los puntos pendientes (no bloquear el flujo).
- Etiquetas masivas en `enriched_data.etiquetas`: hay que respetar la estructura actual y no sobreescribir tags existentes.
