
# PR-IMPORT-UX-5 — Histórico de Imágenes real (OneDrive scans)

## Diagnóstico confirmado

1. `IMAGE_SOURCE_TYPES = []` en `ImportedContentPanel.tsx:49`.
2. `DocumentsPanel.fetchDocs` (línea 106) sólo aplica el `.in('source_type', ...)` si el array tiene longitud > 0. Con array vacío **lista TODOS los `documents` del usuario** → por eso aparecen `web_import` de Atlas Obscura dentro de "Histórico de imágenes".
3. OneDrive **no escribe en `documents`** — escribe en `public.onedrive_photo_index` (809 filas hoy en este usuario, last scan `2026-05-06`). Mirar `documents` para imágenes es un error categórico: ese histórico no existirá nunca ahí.

## Decisión

- Histórico de Imágenes = vista de **escaneos OneDrive** sobre `onedrive_photo_index`, agrupado por `folder_path` (mismo concepto que un "documento" para imports KML).
- Eliminar uso de `DocumentsPanel` en el tab Imágenes.

## Cambios

### 1. Nuevo componente `OneDrivePhotoHistoryPanel`

`src/components/OneDrivePhotoHistoryPanel.tsx` — lectura pura, sin lógica de import:

- Query: `SELECT folder_path, count(*), max(taken_at), max(created_at) FROM onedrive_photo_index WHERE user_id=auth.uid() GROUP BY folder_path ORDER BY max(created_at) DESC`.
- Cabecera con total fotos y total carpetas indexadas (sustituye al `headerSubtitle` falso de 4739/3447).
- Cada fila = una carpeta escaneada: nombre, nº fotos con GPS, fecha último scan. Sin acción "Abrir" (no hay vista de carpeta aún) — sólo lectura.
- Empty state honesto: "No has escaneado OneDrive todavía. Usa 'Subir imágenes' para iniciar un scan."
- Botón refresh (mismo patrón que `DocumentsPanel`).

### 2. `ImportedContentPanel.tsx`

- Borrar `IMAGE_SOURCE_TYPES` (deja de tener sentido).
- En el tab Imágenes, sub-vista `history` monta `<OneDrivePhotoHistoryPanel />` en lugar de `<DocumentsPanel sourceFilter={IMAGE_SOURCE_TYPES} />`.
- Archivos (`FILE_SOURCE_TYPES`) y Web (`WEB_SOURCE_TYPES`) intactos — el bug no les afecta porque sus arrays no están vacíos.

### 3. `DocumentsPanel.tsx` — defensa en profundidad

Cambiar la guarda para que un `sourceFilter` definido (aunque vacío) devuelva lista vacía, no global:

```ts
if (sourceFilter) {
  if (sourceFilter.length === 0) { setDocs([]); setLoading(false); return; }
  query = query.in('source_type', sourceFilter as any);
}
```

Evita que otro panel que pase `[]` por error muestre toda la biblioteca del usuario.

### 4. Tests

`src/test/import-hub-ux.test.tsx`:
- En el tab Imágenes histórico, comprobar que NO renderiza `data-document-row` (DocumentsPanel) y SÍ renderiza `data-onedrive-folder-row` (nuevo componente).
- Test unitario para `DocumentsPanel`: pasar `sourceFilter={[]}` y verificar que llama a `setDocs([])` sin disparar query global (mock supabase).

### 5. Versionado y memoria

- `APP_VERSION` patch bump (1.6.x → 1.6.x+1) vía `scripts/release/bump-version.ts`.
- Entrada en `docs/releases/version-history.md`.
- Actualizar `mem/logic/import/import-canon.md` §"Hub UX canónico": el sub-toggle Imágenes/Histórico apunta a OneDrive scans, NO a `documents`.
- Actualizar `docs/contracts/import-canon.md` §8 con nota: "Imágenes/histórico = `onedrive_photo_index`, no `documents`".

## Fuera de alcance (NO tocar)

- Lógica de scan (`scan-onedrive-geo`).
- `OneDrivePhotosPanel` (vista de acción).
- Creación de POIs desde fotos (sigue siendo backlog `PR-IMPORT-ONEDRIVE-CREATE-POI`).
- Parsers, scrapers, schema, RLS, edge functions.

## Resultado esperado

- "Histórico de imágenes" muestra carpetas reales escaneadas en OneDrive (1 carpeta, 809 fotos hoy en esta sesión).
- Nunca más aparecen `web_import` de Atlas Obscura ahí.
- Cabecera con conteo real, no el global de ubicaciones.
