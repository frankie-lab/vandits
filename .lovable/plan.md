## Objetivo

Invertir el flujo de importación. Hoy: parsear → dedup → match → geocode → FK resolve → diálogo bloqueante → guardar. Nuevo: **parsear → guardar tal cual → procesar todo lo demás en background** mientras el usuario ya ve el documento en su vista.

## Flujo nuevo

```text
1. Subir archivo
   ↓
2. Parsear (KML/GPX/GeoJSON/CSV/KMZ)
   ↓
3. GUARDAR documento + TODOS los puntos como workspace
   (is_approved=false, sin FKs, sin dedup, sin match catálogo)
   import_status = 'processing'
   ↓
4. Abrir vista del documento inmediatamente
   ↓
5. Diálogo informativo (no bloqueante):
   "Documento importado: N puntos guardados.
    Procesando en background:
    [ ] Geocodificación de puntos sin coordenadas
    [ ] Resolución geográfica (país/región/zona)
    [ ] Detección de duplicados con tu catálogo
    [ ] (opcional) Enriquecimiento con IA"
   El usuario puede cerrar el diálogo y seguir trabajando.
   ↓
6. Workers en background actualizan los puntos in-place
   y emiten eventos para que la vista se refresque.
   import_status pasa a 'confirmed' al terminar.
```

## Cambios principales

### A. `saveDocumentToDatabase` (db-operations.ts)
- Quitar `geocodeLocations`, `resolveAllFks` y `approveImportedPoints` del flujo síncrono.
- Insertar puntos crudos (solo lo que viene del parser): id, document_id, name, description, lat/lng, custom_data, visibility, `is_approved=false`.
- Marcar `documents.import_status = 'processing'`.
- Retornar inmediatamente tras el insert.

### B. Nuevo helper `processImportedDocument(docId)` (transversal)
Archivo nuevo: `src/domains/content/lib/process-imported-document.ts`.

Orquesta los pasos opcionales en background, en este orden:
1. **Geocoding** — puntos sin coords válidas → llama `geocodeLocations` y hace UPDATE in-place.
2. **FK resolve** — invoca edge function `backfill-admin-fks` (ya existe, solo cambia el scope al docId).
3. **Catalog match** — corre `deduplicateLocations` contra catálogo del usuario:
   - Matches <250m → marca `is_approved=true` y aplica nombre canónico.
   - Posibles duplicados (250m–1km) → encola en `pendingDuplicates` para revisión.
4. **Auto-enrich** (si el usuario lo activó) — invoca `batch-enrich` con los IDs del doc.
5. Marcar `import_status='confirmed'` y emitir evento `document:processed`.

Cada paso emite progreso (`document:processing-step`) para la UI.

### C. Diálogo informativo nuevo
Archivo nuevo: `ImportSummaryDialog.tsx` (reemplaza el actual `UploadPreviewDialog` bloqueante).
- Aparece justo después de guardar.
- Muestra: total puntos importados, total rutas, archivo origen.
- Lista de pasos en background con checkmark/spinner por cada uno.
- Toggle "Enriquecer automáticamente con IA" (off por defecto).
- Botones: "Ver documento" (cierra y navega) / "Cerrar".
- No bloquea: si el usuario cierra, los workers siguen.

### D. `FileUploadZone.tsx`
- Eliminar el flujo `setShowPreviewDialog(true)` → `handlePreviewConfirm` actual.
- Tras parsear: `saveDocumentToDatabase(doc)` directo, luego `setShowSummaryDialog(true)` y lanzar `processImportedDocument(docId, { autoEnrich })` en fire-and-forget.
- Mantener el pre-check de "ya tienes una importación en revisión".

### E. Vista del documento (`ImportedContentPanel` / vista del doc)
- Añadir banner superior cuando `import_status='processing'` con barra de progreso de los pasos.
- Auto-refresh cuando llegan eventos `document:processing-step`.
- Cuando llegan duplicados pendientes, ofrecer botón "Revisar N posibles duplicados".

### F. Marcador visual
Sin cambios en `getPointVisualState`. Los puntos recién importados aparecen grises (workspace, sin enriquecer), tal cual hoy.

## Cambios en BD
Ninguno estructural. Reutilizamos `documents.import_status` con un valor adicional implícito `'processing'` (ya soportado como string).

## Impacto

| Hoy | Nuevo |
|-----|-------|
| Diálogo bloqueante con dedup, geocoding y FK | Importación instantánea |
| Si falla la geocoding, no se importa nada | Importa siempre; geocoding reintenta en background |
| Match catálogo decide aprobación al insertar | Match es post-proceso opcional |
| Usuario espera N segundos | Usuario ve el documento en <1s |

## Memoria a actualizar

Sustituir `mem://features/import/unified-two-step-flow` por nueva regla:
**"Import-first flow"** — Parser → Save raw → Background processors. Dedup, geocoding, FK resolve y enriquecimiento NUNCA bloquean la importación. Helper único `processImportedDocument(docId, options)`.

## Fuera de alcance

- No tocar el flujo de OneDrive (usa otra ruta de ingestión).
- No cambiar el sistema de aprobación masiva existente en la vista del documento.
- No tocar parsers ni `places_trunk`.