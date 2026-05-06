## Problema

Hoy el selector de colección (con dropdown de colecciones existentes + "Crear nueva") **solo existe** dentro del diálogo "Añadir" de `DocumentFocusView` (post-importación). Los flujos de **Web scraper**, **Archivos KML/GPX/GeoJSON** y **OneDrive** no exponen ese selector durante la importación: el usuario tiene que importar primero, abrir el documento, y luego usar "Añadir → A una colección".

Además es un parche local: la lógica vive embebida en `DocumentFocusView` (`userCollections`, `collectionId`, `newCollectionName`, dropdown inline). Cualquier cambio (orden, iconos, búsqueda) habría que duplicarlo en cada panel.

## Solución — helper transversal

Crear un único componente reutilizable y usarlo en los tres puntos de importación.

### 1. Nuevo componente `CollectionPicker`

Ubicación: `src/domains/content/components/CollectionPicker.tsx`

API:
```ts
interface CollectionPickerProps {
  userId: string;
  value: string;              // collectionId | '__new__' | '' (ninguna)
  onValueChange: (id: string) => void;
  newName: string;
  onNewNameChange: (n: string) => void;
  defaultNewName?: string;    // sugerencia (nombre del documento/URL)
  allowNone?: boolean;        // permite "No asignar"
  className?: string;
}
```

Responsabilidades:
- Cargar `collections` del usuario (`id, name, icon, color`) ordenadas por nombre.
- Renderizar `<select>` con: opción "No asignar" (si `allowNone`), opción "+ Crear nueva colección…" y la lista de colecciones existentes (con icono Lucide y color del helper de iconos).
- Si `value === '__new__'`, mostrar `<Input>` para nombre con placeholder = `defaultNewName`.
- Estado de loading mientras llega la query (fallback: solo "+ Crear nueva colección…").

### 2. Helper de aplicación post-import

Ubicación: `src/services/document-add.service.ts` (ya existe `applyCollection` para post-import en DocumentFocusView).

Añadir wrapper de uso desde flujos de importación:
```ts
export async function attachDocumentToCollection(opts: {
  docId: string; userId: string;
  collectionId: string | null;     // null si '__new__' o vacío
  newCollection?: { name: string; visibility: 'public'|'followers'|'private' } | null;
}): Promise<void>
```
Reutiliza `applyCollection` con `scope: 'all'` y sin `selectedIds` (todos los puntos del doc recién importado).

### 3. Integración en los tres flujos

#### a) `WebImportPanel.tsx` (scraper web)
- Añadir estado `collectionId` y `newCollectionName`.
- Insertar `<CollectionPicker>` justo encima del bloque "Visibilidad" (cuando `sourceKind !== 'empty'/'invalid'`).
- En `handleImportNow`, tras `saveDocumentToDatabase(doc)` y antes del summary dialog, llamar `attachDocumentToCollection`.
- En `handleEnqueue` (background), pasar `collectionId` / `newCollection` al body de `scrape-enqueue` → la edge function `scrape-enqueue` guarda esos campos en `scrape_jobs` (nuevas columnas `target_collection_id uuid null`, `new_collection_name text null`); `scrape-tick` los aplica al crear el documento. (Migración requerida.)

#### b) `FileUploadZone.tsx` / `UploadPreviewDialog.tsx`
- Añadir `<CollectionPicker>` en el preview/confirm dialog antes de "Confirmar importación".
- Tras `saveDocumentToDatabase`, llamar `attachDocumentToCollection`.

#### c) `OneDrivePhotosPanel.tsx`
- Igual: `<CollectionPicker>` en el panel/diálogo de importar selección.
- Tras crear el documento y los puntos, `attachDocumentToCollection`.

### 4. DocumentFocusView (post-import)
- Sustituir el `<select>` inline (líneas ~1632–1658) por `<CollectionPicker>`.
- Mantiene los mismos estados (`collectionId`, `newCollectionName`, `userCollections` ya no hace falta cargarlo aquí).

## Cambios técnicos

**Archivos nuevos**
- `src/domains/content/components/CollectionPicker.tsx`

**Archivos modificados**
- `src/domains/content/components/index.ts` (export)
- `src/domains/content/components/WebImportPanel.tsx`
- `src/domains/content/components/FileUploadZone.tsx` y/o `UploadPreviewDialog.tsx`
- `src/components/OneDrivePhotosPanel.tsx`
- `src/domains/content/components/DocumentFocusView.tsx` (refactor a `CollectionPicker`)
- `src/services/document-add.service.ts` (añadir `attachDocumentToCollection`)
- `supabase/functions/scrape-enqueue/index.ts` y `scrape-tick/index.ts` (leer/aplicar colección destino)

**Migración SQL**
- `ALTER TABLE scrape_jobs ADD COLUMN target_collection_id uuid NULL REFERENCES collections(id) ON DELETE SET NULL;`
- `ALTER TABLE scrape_jobs ADD COLUMN new_collection_name text NULL;`

**Memoria**
- Crear `mem://ui/import-collection-picker` documentando que `CollectionPicker` es la **única** fuente para asignar colección durante cualquier importación, y añadirlo al index Core como regla transversal.

## Resultado

- En Web scraper, Archivos y OneDrive aparece el mismo desplegable con las colecciones existentes + opción de crear nueva.
- Background scraper respeta la colección elegida (se aplica al terminar el job).
- Cualquier cambio futuro en el picker (búsqueda, iconos, agrupación) se hace en un único componente.
