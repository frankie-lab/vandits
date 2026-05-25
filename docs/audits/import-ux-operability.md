# Import UX Operability Audit — PR-IMPORT-UX-1

> Fecha: 2026-05-25 · PR: PR-IMPORT-UX-1
> Canon de referencia: `docs/contracts/import-canon.md`
>
> Esta auditoría evalúa la **operabilidad real** de cada superficie
> visible bajo el hub `Contenido` (`ImportedContentPanel`) y la mapea al
> canon de importación (§2.1 fichero · §2.2 OneDrive fotos · §2.3 web).
> Se identifican botones/tabs/cards que (1) escriben datos reales, (2)
> son diagnóstico, (3) son legacy o (4) son fake/no-op.

## 1. Tabla de superficies

| surface                  | tab/sección              | acción visible                   | acción real                                            | escribe datos | fake/no-op | estado            | recomendación                                                       |
| ------------------------ | ------------------------ | -------------------------------- | ------------------------------------------------------ | ------------- | ---------- | ----------------- | ------------------------------------------------------------------- |
| ImportedContentPanel     | hub (header)             | Tabs Fuentes/Biblioteca          | Cambia tab                                             | no            | no         | operativo         | Renombrar grupo `Fuentes`→`Importar`. Renombrar `OneDrive`→`OneDrive · fotos`. |
| FileUploadZone           | Archivos · dropzone      | Drag/click → subir archivo       | Parse + `saveDocumentToDatabase` + `processImportedDocument` | sí       | no         | operativo         | Envolver en `ImportSurfaceShell`. Mostrar chips KML/KMZ/GPX/GeoJSON/CSV en header. |
| FileUploadZone           | Archivos · visibilidad   | 3 radios visibility              | Se persiste en `locations.visibility` al guardar       | sí            | no         | operativo         | Mantener.                                                            |
| FileUploadZone           | Archivos · CollectionPicker | Selector colección/nueva       | `setPendingCollection`                                 | sí            | no         | operativo         | Mantener.                                                            |
| FileUploadZone           | Archivos · Condiciones   | 2 checkboxes obligatorios        | Gate cliente `canUpload`                               | no            | no         | operativo         | **Reescribir copy humano**. Mostrar banner explicativo cuando bloquean. |
| FileUploadZone           | Archivos · ImportSummaryDialog | Diálogo post-import        | Abre workspace del doc creado                          | no            | no         | operativo         | Mantener.                                                            |
| UploadPreviewDialog      | —                        | Diálogo de preview de doc        | Marcaría puntos para no importar                       | sí (si se usara) | n/a    | **legacy huérfano** | No referenciado por `FileUploadZone` post import-first. Fuera de alcance de este PR; documentar para `PR-IMPORT-CLEANUP`. |
| WebImportPanel           | Web · header             | Título + input URL               | `detectSource(url)` + badge fuente                     | no            | no         | operativo         | Envolver en `ImportSurfaceShell`. Copy claro.                       |
| WebImportPanel           | Web · Probar             | Botón "Probar"                   | `scrape-atlas-obscura` (Atlas) o validación URL (genérica) | no       | no         | operativo         | Mantener.                                                            |
| WebImportPanel           | Web · Inmediato          | Tarjeta modo "Inmediato"         | `handleImportNow` → guarda doc + locations             | sí            | no         | operativo (Atlas) | Mantener; auto-deshabilitado para genéricas.                        |
| WebImportPanel           | Web · Background         | Tarjeta modo "Background"        | `scrape-enqueue`                                       | sí            | no         | operativo         | Mantener.                                                            |
| WebImportPanel           | Web · Visibilidad + Enriquecer | Switches/radios            | Aplica al doc creado                                   | sí            | no         | operativo         | Mantener.                                                            |
| BackgroundScrapeJobs     | Web · Jobs recientes     | Pausar / Reanudar / Preset       | Update `scrape_jobs` row                               | sí            | no         | operativo         | Mantener.                                                            |
| BackgroundScrapeJobs     | Web · Jobs recientes     | (Ver resultado del job)          | **No existe botón** aunque el listener `document:open-workspace` está cableado | — | **gap UX** | gap operativo | **Añadir botón "Ver resultado" condicional a `document_id`**.       |
| OneDrivePhotosPanel      | OneDrive · Índice        | Lista de fotos con GPS indexadas | Click → emite `photo-focus` para centrar el mapa       | no (lectura)  | no         | operativo         | Renombrar tab `Índice`→`Fotos con GPS`. Envolver en `ImportSurfaceShell`. |
| OneDrivePhotosPanel      | OneDrive · Índice · CTA  | "Auditar fotos de OneDrive"      | `scan-onedrive-geo` recursivo + persiste índice        | sí (índice EXIF) | no      | operativo         | Mantener como CTA primaria del surface.                              |
| OneDrivePhotosPanel      | OneDrive · Índice        | **Crear POI desde foto**         | **No existe**                                          | —             | **gap canónico** | **gap funcional** | Canon §2.2 lo exige. Deuda separada: `PR-IMPORT-ONEDRIVE-CREATE-POI`. NO se implementa aquí. |
| OneDrivePhotosPanel      | OneDrive · Explorar      | Navegación carpetas + thumbnails | `browse-onedrive` (lectura)                            | no            | no         | diagnóstico       | Degradar a acordeón `Avanzado` (plegado) dentro del mismo tab.       |
| OneDrivePhotosPanel      | OneDrive · Validar       | `OneDriveVisitValidator`         | Marca `custom_data.visited=true` en locations existentes | sí (estado personal) | **fuera de canon** | enriquecimiento/personal state | Canon §3: NO es importación. Degradar a `Avanzado` (plegado). Mover a panel separado en `PR-PERSONAL-STATE-FROM-PHOTOS`. |
| OneDrivePhotoBrowser     | (LocationPhotoMenu)      | Browser de fotos por ubicación   | Selecciona foto OneDrive para asignar a POI           | sí            | no         | operativo (otro contexto) | Fuera del hub. No tocar.                                              |
| ImportSummaryDialog      | (post import)            | Resumen tras importar            | Botón "Ver documento" emite `document:open-workspace`  | no            | no         | operativo         | Mantener.                                                            |
| DocumentsPanel           | Biblioteca · Documentos importados | Lista de docs + acciones | Approve / Open / Delete                                | sí            | no         | operativo         | Mantener. Añadir subtítulo del grupo.                                |
| import.service           | —                        | API server-side                  | n/a (no UI)                                            | n/a           | n/a        | n/a               | No tocar.                                                            |

## 2. Hallazgos clave

### 2.1 OneDrive mezcla 3 conceptos distintos

Hoy `OneDrivePhotosPanel` ofrece como sub-tabs primarios `Índice / Explorar / Validar`. Sólo el primero está alineado con canon §2.2 (importación de fotos). `Explorar` es navegador genérico (diagnóstico). `Validar` escribe `visited=true` y por canon §3 es **estado personal / enriquecimiento**, no importación.

**Acción de este PR**: renombrar `Índice → Fotos con GPS`, mover `Explorar` y `Validar` a un acordeón inferior `Avanzado` (plegado por defecto, badge `Diagnóstico`).

**Deuda fuera de alcance**: extraer `OneDriveVisitValidator` a su propio panel en `PR-PERSONAL-STATE-FROM-PHOTOS`.

### 2.2 Gap canónico: crear POI desde foto OneDrive

Canon §2.2 declara que OneDrive *"detecta geodatos EXIF en imágenes y, cuando aplique, crear o incorporar POIs"*. La acción de creación **no existe** en la UI ni hay edge cable. Hoy las fotos indexadas sólo se pueden visualizar (`photo-focus`) o validar contra POIs ya existentes (`OneDriveVisitValidator`).

**Acción de este PR**: documentar el gap. **No implementar** (lógica fuera de alcance — exigiría schema/edge/flow nuevos).

**Deuda**: `PR-IMPORT-ONEDRIVE-CREATE-POI`.

### 2.3 Web · Jobs recientes sin acceso al resultado

`ScrapeJobsList` no expone botón para abrir el documento generado por el job, aunque `document:open-workspace` está cableado en `DocumentsPanel` y `BackgroundScrapeJobs` ya conoce `j.document_id`.

**Acción de este PR**: añadir botón "Ver resultado" condicional a `job.status === 'done' && document_id` que emite `document:open-workspace`.

### 2.4 FileUploadZone — copy de condiciones punitivo

Las 2 checkboxes obligatorias (`Términos de uso`, `Política de duplicados`) bloquean la subida con copy semilegal y sin explicación clara de por qué están bloqueando.

**Acción de este PR**: reescribir copy humano + banner explicativo cuando `!canUpload`: *"Confirma estas condiciones para poder subir archivos."*

### 2.5 UploadPreviewDialog — legacy huérfano

706 líneas. Único referenciador es `src/domains/content/components/index.ts` (re-export). El flujo activo `FileUploadZone` usa `ImportSummaryDialog` post-guardado, no preview previo.

**Acción de este PR**: no tocar. Documentar como candidato a eliminación en `PR-IMPORT-CLEANUP`.

## 3. Cambios estructurales del hub

```text
Antes (grupo "Fuentes"):           Después (grupo "Importar"):
  Archivos                            Archivos
  Web                                 Web
  OneDrive                            OneDrive · fotos

(grupo "Biblioteca"):              (grupo "Biblioteca"):
  Documentos importados               Documentos importados
```

Orden Archivos → Web → OneDrive coincide con el canon §2.1 → §2.3 → §2.2 reordenado por afinidad UX (de menor a mayor complejidad de input).

## 4. Tests de regresión

Contract test añadido en `src/test/import-hub-ux.test.ts` asegura:

- 3 triggers exactos bajo grupo `Importar` con labels canónicos.
- Tab `Archivos` muestra chips `KML/KMZ/GPX/GeoJSON/CSV`.
- Tab `Web` menciona `URL` y `Atlas Obscura`.
- Tab `OneDrive · fotos` menciona `fotos` y `GPS`.
- Ningún header dentro del hub menciona `enriquecer/backfill/recovery/canonicalize` (asegura separación canon §3).
- `Documentos importados` existe bajo grupo `Biblioteca`.

## 5. Deuda explícita generada

| ID                                    | Descripción                                                            |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `PR-IMPORT-ONEDRIVE-CREATE-POI`       | Implementar "Crear POI desde foto OneDrive" (acción canónica §2.2).    |
| `PR-PERSONAL-STATE-FROM-PHOTOS`       | Extraer `OneDriveVisitValidator` a panel propio fuera del hub.         |
| `PR-IMPORT-CLEANUP`                   | Eliminar `UploadPreviewDialog` y re-export huérfano si sigue sin uso.  |
