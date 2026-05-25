
# PR-IMPORT-UX-1 — Unificar hub de importación

Solo UX, copy y estructura del panel `ImportedContentPanel` y sus hijos. **No** se tocan parsers, scrapers, schema, RLS, edge functions ni lógica de import.

## 1. Auditoría previa — `docs/audits/import-ux-operability.md`

Tabla `surface | tab | acción visible | acción real | escribe datos | fake/no-op | estado | recomendación` cubriendo:

- `ImportedContentPanel` (hub)
- `FileUploadZone`
- `WebImportPanel` + `BackgroundScrapeJobs (ScrapeJobsList)`
- `OneDrivePhotosPanel` (sub-tabs Índice/Explorar/Validar)
- `OneDrivePhotoBrowser` (legacy, sólo usado en `LocationPhotoMenu`)
- `OneDriveVisitValidator`
- `UploadPreviewDialog` (verificar si está vivo; hoy `FileUploadZone` usa `ImportSummaryDialog` y `processImportedDocument`, no preview previo)
- `ImportSummaryDialog`
- `DocumentsPanel` (biblioteca)
- `import.service`

Hallazgos esperados que ya emergen del código:

- **OneDrive › Validar** (`OneDriveVisitValidator`): no importa POIs, marca `custom_data.visited=true` en locations ya existentes. Por canon §3 esto es **enriquecimiento/personal state**, no importación. → mover fuera del hub o degradar a "avanzado".
- **OneDrive › Explorar**: explorador genérico de carpetas/fotos sin acción de creación de POI. Es diagnóstico. → degradar a "Avanzado" o ocultar.
- **OneDrive › Índice**: única acción real es `Auditar fotos de OneDrive` (escanea EXIF). **No existe acción "crear POI desde foto"** — gap canónico (canon §2.2 dice "permite crear ubicaciones desde ellas"). Marcar como **deuda explícita** (no se implementa en este PR; queda anotado para `PR-IMPORT-ONEDRIVE-CREATE-POI`).
- **FileUploadZone**: `UploadPreviewDialog` (706 líneas) parece huérfano del flujo actual (post import-first). Verificar referencias y o bien reactivarlo como "preview real antes de guardar" (fuera de alcance: requiere lógica) o eliminar/ocultar y declararlo legacy.
- **FileUploadZone › Condiciones**: dos checkboxes obligatorios con copy semilegal punitivo. Reescribir copy humano.
- **WebImportPanel**: ya unifica probar+inmediato+background. Sin fake. Mantener.
- **`BackgroundScrapeJobs` › Pausar/Reanudar/Preset**: acciones reales. Falta acción "abrir documento resultado" cuando `document_id` existe (hoy el listener `document:open-workspace` está pero no hay botón). → añadir botón "Ver resultado" condicional.
- **DocumentsPanel**: es híbrido (historial + documentos vivos consultables). Decisión documentada: **mantener como "Documentos importados"** dentro de un nuevo grupo `Biblioteca`, sin renombrar.

## 2. Rediseño estructural — `ImportedContentPanel`

Grupos visuales del `PanelTabs.Header` (sin Radix añadidos):

```text
Importar:
  - Archivos
  - Web
  - OneDrive · fotos

Biblioteca:
  - Documentos importados
```

Cambios mínimos:

- Renombrar grupo `Fuentes` → `Importar` (verbo, no sustantivo).
- Renombrar trigger `OneDrive` → `OneDrive · fotos` para reforzar el alcance canónico (sólo fotos).
- Orden canónico: Archivos → Web → OneDrive (coincide con el canon §2.1/2.2/2.3).

## 3. Modelo visual único por vía

Cada una de las 3 vías comparte la misma columna conceptual (A→F del enunciado). Esto se materializa con un **componente de presentación compartido nuevo** `ImportSurfaceShell` (sólo UI, sin lógica):

```text
A. Qué vas a importar    → <SurfaceHeader title subtitle icon />
B. De dónde viene        → input/dropzone (slot 'source')
C. Qué se va a crear     → resumen de visibilidad + colección (slot 'target')
D. Preview/revisión      → slot 'preview' (opcional)
E. Estado/historial      → slot 'history' (opcional)
F. Acción principal      → <SurfaceFooter primaryAction />
```

`FileUploadZone`, `WebImportPanel` y `OneDrivePhotosPanel` se envuelven en `ImportSurfaceShell` sin reescribir su lógica interna. Tres pantallas reconocibles como hermanas.

### 3.1 Archivos

- Header: "Importar desde fichero" + "Formatos: KML · KMZ · GPX · GeoJSON · CSV".
- Condiciones: reescribir copy humano. Mientras bloqueen, mostrar banner explicativo arriba: "Confirma estas condiciones para poder subir archivos." No tratarlas como muro legal.
- Sin cambios en `handleFile`, `processImportedDocument`, `setPendingCollection`.

### 3.2 Web

- Header: "Importar desde web" + "Pega una URL (Atlas Obscura, listados o páginas con coordenadas)."
- Mantener flujo actual probar→inmediato/background.
- Bajo "Jobs recientes" añadir botón "Ver resultado" cuando `j.document_id` existe (emite el evento ya soportado `document:open-workspace`). No añadir botones que no tengan handler.

### 3.3 OneDrive · fotos

- Header: "Importar fotos desde OneDrive" + "Detecta fotos con GPS y permite crear ubicaciones desde ellas."
- Sub-tabs honestos:
  - **Fotos con GPS** (renombrado desde `Índice`): única acción real hoy. CTA principal sticky `Auditar fotos de OneDrive`. Lista con thumbnail · nombre · fecha · coords · acción `Ver en mapa` (ya existente vía `photo-focus`).
  - **Explorar carpetas** y **Validar visitas** se mueven a un acordeón inferior `Avanzado` dentro del mismo tab Fotos, **plegado por defecto**, con badge `Diagnóstico`. Esto evita borrar funcionalidad real pero deja de mezclarlas con "importar".
- Si en QA se decide ocultarlas del todo, se hace con un flag local en el componente; sin tocar `OneDriveVisitValidator`/`OneDrivePhotoBrowser`.
- Documentar en el audit que **falta** la acción "Crear POI desde foto" — deuda `PR-IMPORT-ONEDRIVE-CREATE-POI`.

## 4. Biblioteca — Documentos importados

- Mantener `DocumentsPanel` tal cual, bajo grupo `Biblioteca`.
- Header local: "Documentos importados" + "Resultado de tus importaciones. Aquí gestionas lo ya subido."
- Sin tocar lógica; sólo copy del título/subtítulo.

## 5. Limpieza fake/no-op

- Si `UploadPreviewDialog.tsx` resulta no estar referenciado en el árbol vivo, **no se elimina** en este PR (es lógica fuera de alcance), pero se documenta en el audit con recomendación `legacy → eliminar en PR-IMPORT-CLEANUP`.
- Cualquier botón sin handler real detectado en la auditoría se oculta (no se borra el componente).

## 6. Tests — `src/test/import-hub-ux.test.ts`

Render del `ImportedContentPanel` con cada `defaultTab` y aserciones DOM:

- Existen exactamente 3 triggers bajo el grupo `Importar` con labels `Archivos`, `Web`, `OneDrive · fotos`.
- Tab `Archivos` muestra los chips `KML`, `KMZ`, `GPX`, `GeoJSON`, `CSV`.
- Tab `OneDrive · fotos` contiene los términos `GPS` y `fotos`.
- Tab `Web` contiene los términos `URL` y `Atlas Obscura`.
- Ninguna trigger/heading dentro del hub contiene los términos `enriquecer`, `enriquecimiento`, `backfill`, `recovery`, `canonicalize` (asegura separación de canon §3).
- Existe trigger `Documentos importados` bajo el grupo `Biblioteca`.

(Tests sólo de UI; mockear `useAuth`, `supabase`, stores con stubs mínimos.)

## 7. Documentación + memoria

- `docs/audits/import-ux-operability.md` — nueva tabla + hallazgos.
- `docs/contracts/import-canon.md` §5 — añadir nota sobre wording UI (`Importar` como verbo, `OneDrive · fotos` explícito, gap `crear POI desde foto`).
- `mem://logic/import/import-canon` — añadir referencia al PR y a `import-hub-ux.test.ts` como contract test del hub.
- Bump patch via `scripts/release/bump-version.ts` + entrada en `docs/releases/version-history.md`.

## 8. Fuera de alcance (explícito)

- Implementar "Crear POI desde foto OneDrive" (deuda separada).
- Reactivar/eliminar `UploadPreviewDialog` (deuda separada).
- Eliminar `OneDriveVisitValidator`/`OneDrivePhotoBrowser` (sólo se degradan visualmente).
- Cualquier cambio en `import.service`, `parseGeoFile`, `processImportedDocument`, `scrape-*`, `browse-onedrive`, schema, RLS.

## 9. Detalles técnicos

Archivos tocados:

- **Nuevo**: `src/shared/components/import/ImportSurfaceShell.tsx` (presentación; ~80 líneas, sólo slots A–F + CTA).
- **Editados (copy + envoltorio + header sin lógica)**:
  - `src/components/ImportedContentPanel.tsx` — rename grupo, rename trigger OneDrive, orden Archivos→Web→OneDrive.
  - `src/domains/content/components/FileUploadZone.tsx` — header `ImportSurfaceShell`, copy condiciones, banner cuando `!canUpload`.
  - `src/domains/content/components/WebImportPanel.tsx` — header `ImportSurfaceShell`, copy claro, botón `Ver resultado` en `ScrapeJobsList`.
  - `src/domains/content/components/BackgroundScrapeJobs.tsx` — botón `Ver resultado` condicional a `document_id`.
  - `src/components/OneDrivePhotosPanel.tsx` — rename tab `Índice`→`Fotos con GPS`, acordeón `Avanzado` que envuelve sub-tabs `Explorar`/`Validar`, copy del header.
  - `src/domains/content/components/DocumentsPanel.tsx` — sólo header/subtítulo.
- **Nuevo**: `src/test/import-hub-ux.test.ts`.
- **Nuevo**: `docs/audits/import-ux-operability.md`.
- **Edit**: `docs/contracts/import-canon.md`, `mem://logic/import/import-canon`, `package.json`, `src/lib/app-version.ts`, `docs/releases/version-history.md`, `README.md`.

Postcondiciones (engineering-discipline):

- Tests verdes (nuevo contract test + existentes).
- `APP_VERSION` bumped patch.
- Memoria sync (`mem://logic/import/import-canon` + actualización del entry en `index.md` si cambia wording de la regla — probablemente no, sólo se añade referencia).
- Sin cambios en schema/RLS/edges → no requiere `cloud_status` ni migración.

Resultado: el usuario abre Contenido y ve **3 cajas hermanas de importación** (fichero, web, OneDrive fotos) y **1 biblioteca** (documentos importados). Cada caja comunica qué hace, qué crea y cuál es la acción real. Lo que hoy es diagnóstico (Explorar/Validar de OneDrive) queda visible pero claramente etiquetado, sin pretender ser importación.
