## Diagnóstico

Tres incoherencias entre **estado mostrado**, **visibilidad real** y **acciones disponibles**:

1. **Badge "Catálogo" en el documento** depende de `documents.status` (metadato editorial), no de cuántos puntos están realmente en el catálogo (`is_approved`). Por eso ves "Catálogo" cuando solo 4/2452 están integrados.
2. **El botón "Mesa de trabajo"** en realidad abre la vista del documento y no cambia de estado: el usuario no encuentra dónde aprobar/integrar y los 2.448 puntos se quedan invisibles en el mapa global sin saberlo.
3. **La geocodificación** (`backfill-admin-fks`) vive dentro del panel de filtros geográficos del mapa global → procesa los 3.117 puntos de **toda la cuenta**, sin distinguir documento, sin enseñar los puntos afectados. El sitio natural es la **vista del documento recién importado** (donde sí los ves) y/o el **diálogo de importación**.

---

## Cambios propuestos (todos transversales, helpers únicos)

### A. Estado del documento = aprobación real

Crear helper único `getDocumentIntegrationState(doc)` en `src/domains/content/lib/document-integration-state.ts`:

| Condición | Badge | Color |
|---|---|---|
| `approved_count === 0` | **Sin integrar** | gris |
| `0 < approved_count < location_count` | **Parcial X/N** | ámbar |
| `approved_count === location_count` (con N>0) | **Catálogo** | verde |

Consumido por `DocumentsPanel` y `DocumentFocusView`. `documents.status` se ignora en UI (queda en BD por compatibilidad).

### B. Acciones lógicas y visibles, no escondidas en hover

En la tarjeta del documento (lista) reemplazar el actual `[Mesa de trabajo] [Eliminar]` por:

```text
[Abrir]   [Aprobar todos (N)]   [Geocodificar (M)]   [Eliminar]
```

- **Abrir** (`FolderOpen`) → entra a la vista del documento (lo que hoy hace "Mesa de trabajo").
- **Aprobar todos (N)** (`CheckCheck`) → solo visible si `approved_count < location_count`. Confirma: *"Vas a integrar N puntos al catálogo. Aparecerán en el mapa global."* Ejecuta update masivo y emite `locations:changed`.
- **Geocodificar (M)** (`MapPin`) → solo visible si el doc tiene puntos sin `country_id`. Lanza el job con scope = ese documento (ver D).
- **Eliminar** → igual que ahora.

Helpers nuevos:
- `approveAllDocumentLocations(docId)` en `src/domains/content/lib/document-approval.ts`.
- `getDocumentPendingGeocoding(docId): number` (count rápido).

### C. La misma triada disponible dentro de la vista del documento

En `DocumentFocusView`, en la cabecera (encima de las pestañas Importados/Vacíos/Enriquecidos/Rutas) añadir tres CTAs grandes contextuales con la misma lógica que la lista, aprovechando que el usuario **ya ve los puntos en el mapa**:

```text
[Aprobar todos (N)]  [Geocodificar pendientes (M)]  [Enriquecer con IA (P)]
```

Cada botón se oculta si su contador es 0. Reusa los helpers anteriores y `triggerEnrichLocation` (ya existe).

### D. Geocodificación scoped por documento + global opcional

**Backend** (edge function `backfill-admin-fks`): aceptar parámetro opcional `document_id`. Si llega, el SELECT añade `WHERE document_id = ...`. Sin él, comportamiento actual.

**Store** (`geocoding-job-store.ts`): `start(initialPending, scope?: { documentId?: string; label?: string })`. Pasa `document_id` al invoke y muestra el toast con el contexto (*"Geocodificando puntos de FullTrips (1).kml..."*).

**UI**:
- En `DocumentsPanel` → botón "Geocodificar (M)" llama `start(M, { documentId })`.
- En `DocumentFocusView` → mismo botón en cabecera, scope = doc actual.
- En `GeographyTree` (panel de filtros del mapa global) → mantener el botón pero **solo cuando el usuario tiene 0 documentos importados pendientes** o explícitamente quiere geocodificar TODO. Cambiar el copy: *"Geocodificar todos mis puntos pendientes (M)"* y mover dentro de un `<details>` colapsado por defecto, para que no domine el panel de filtros.

### E. Limpieza de la fila de stats en `DocumentsPanel`

Sustituir las tres líneas (`Original / Depurado / Catálogo`) por una sola:

```text
5 may 2026 · 2452 puntos · Parcial 4/2452 en catálogo
```

Deja la tarjeta más legible y consistente con el badge derivado.

---

## Detalles técnicos

**Archivos nuevos:**
- `src/domains/content/lib/document-integration-state.ts` — badge derivado.
- `src/domains/content/lib/document-approval.ts` — `approveAllDocumentLocations(docId)`.
- `src/domains/content/lib/document-geocoding.ts` — `getDocumentPendingGeocoding(docId)`, `startDocumentGeocoding(docId, label)`.

**Archivos modificados:**
- `src/domains/content/components/DocumentsPanel.tsx` — badge derivado, fila stats simplificada, fila de acciones nueva.
- `src/domains/content/components/DocumentFocusView.tsx` — cabecera con CTAs de aprobar/geocodificar/enriquecer.
- `src/stores/geocoding-job-store.ts` — `start` acepta scope opcional.
- `supabase/functions/backfill-admin-fks/index.ts` — soporta `document_id` opcional en el body, JWT verificado y filtra por `owner_user_id = auth.uid()`.
- `src/components/filters/GeographyTree.tsx` — colapsa el bloque global, cambia copy a "todos mis puntos pendientes".

**Sin cambios:**
- `is_approved` semantics, RLS, `process-imported-document.ts`, `getBucketStats`, `isLocationVisibleInGlobalMap`.

---

## Resultado

- El **badge** del documento siempre refleja la integración real al catálogo.
- **Aprobar e integrar** está a 1 click desde la lista y desde la vista del documento, con confirmación.
- **Geocodificar** se hace en el contexto donde el usuario tiene visibilidad de los puntos (la vista del documento), no en un panel global donde no se ven. La opción global queda disponible pero secundaria.
