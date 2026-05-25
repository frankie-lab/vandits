---
name: Import canon (PR-IMPORT-CANON-1 + PR-IMPORT-UX-1 + PR-IMPORT-UX-3 + PR-IMPORT-UX-4)
description: Define qué es importación en Vandits (3 medios) y la UX canónica del panel "Fuentes de importación" como 3 tabs operativas + sub-toggle Acción/Histórico + PanelFooter con CTA real elevada desde el hijo (PR-IMPORT-UX-4).
type: feature
---

# Import canon — Vandits

## Regla DURA — qué es importación

En Vandits, **"importación"** significa **exclusivamente** uno de estos tres medios:

1. **Fichero** — KML, KMZ, GPX, GeoJSON, CSV (`FileUploadZone`).
2. **Web** — scrapeo de URL (Atlas Obscura + jsonld genérico, sync o background; remote KML/NetworkLink). `WebImportPanel` + `BackgroundScrapeJobs`.
3. **Imágenes** — extracción de geodatos EXIF. Proveedor actual = OneDrive (`OneDrivePhotosPanel`).

Cualquier otro flujo (alta manual, enriquecimiento, backfill, recovery, canonicalize) **NO es importación** y NO puede mezclarse con el hub. Ver `docs/contracts/import-canon.md` §3.

## Hub UX canónico (PR-IMPORT-UX-3)

`ImportedContentPanel` (`src/components/ImportedContentPanel.tsx`):

- **Título del panel = "Fuentes de importación"** (NO "Contenido").
- **PanelTabs con 3 tabs operativas exactas** (grupo `Fuentes`):
  - `archivos` — `FileUploadZone` arriba + `DocumentsPanel` filtrado por `source_type ∈ {kml,kmz,gpx,geojson,csv}` como histórico contextual abajo (headerLabel "Archivos importados anteriormente").
  - `web` — `WebImportPanel` (incluye `ScrapeJobsList` como histórico de jobs/webs).
  - `imagenes` — bloque "Proveedor · OneDrive" + `OneDrivePhotosPanel` (sub-tabs internos `Importar` / `Avanzado · diagnóstico`).
- **OneDrive NO es tab principal**: es proveedor dentro de Imágenes.
- **"Biblioteca / Documentos importados" NO es tab principal**: vive contextual dentro de Archivos vía `DocumentsPanel sourceFilter`.
- **Prohibido**: hub de cards, wizard, stepper de 5 pasos, navegación tipo asistente.
- `DocumentsPanel` ahora acepta props UI-only `sourceFilter?: string[]` + `headerLabel?` + `headerSubtitle?` (sin cambios en lógica de fetch/import).

## Compat `defaultTab`

| Legacy        | Tab fuente    |
| ------------- | ------------- |
| `upload`      | `archivos`    |
| `web`         | `web`         |
| `onedrive`    | `imagenes`    |
| `documents`   | `archivos`    |

## Contract test

`src/test/import-hub-ux.test.tsx` (11/11 verde) asegura:
- Panel titulado "Fuentes de importación".
- Exactamente 3 tabs `data-import-source-tab`: `archivos` · `web` · `imagenes`.
- Tabs principales NO contienen `OneDrive`, `Biblioteca`, `Documentos`.
- Archivos lista formatos KML/KMZ/GPX/GeoJSON/CSV y muestra `data-import-history="archivos"`.
- Web menciona URL/Atlas.
- Imágenes menciona OneDrive + GPS + imágenes/fotos.
- `defaultTab='documents'` cae en `archivos`.
- Tabs no mencionan `enriquecer/enriquecimiento/backfill/recovery/canonicalize`.
- NO existen ya `data-import-hub`, `data-import-stepper`, `data-import-channel-card`, `data-import-wizard` (cero rastro del wizard PR-IMPORT-UX-2).

## Backlog explícito (NO abrir sin PR dedicado)

- `PR-IMPORT-ONEDRIVE-CREATE-POI` — implementar acción canónica §2.3 (crear/incorporar POIs desde fotos GPS indexadas).
- `PR-PERSONAL-STATE-FROM-PHOTOS` — extraer `OneDriveVisitValidator` a panel propio fuera del hub.
- `PR-IMPORT-CLEANUP` — eliminar `UploadPreviewDialog` legacy + re-export huérfano + retirar prop `wizardMode` dead de `FileUploadZone`/`WebImportPanel`/`OneDrivePhotosPanel`.

## No tocar sin PR explícito

- Parsers, scrapers, schema, RLS, edge functions de import.
- Reordenar tabs canónicos.
- Reintroducir wizard/hub/cards/stepper.
- Mover el histórico fuera de su tab fuente.

## Referencias

- `docs/contracts/import-canon.md` §8 (PR-IMPORT-UX-3)
- `mem://logic/content/import-lifecycle-by-channel`
- `mem://logic/import/unified-parser-contract`
