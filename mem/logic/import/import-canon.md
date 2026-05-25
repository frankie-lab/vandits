---
name: Import canon (PR-IMPORT-CANON-1 + PR-IMPORT-UX-1)
description: Define qué es importación en Vandits (3 medios) y la UX canónica del hub Contenido tras el cierre de PR-IMPORT-UX-1.
type: feature
---

# Import canon — Vandits

## Regla DURA

En Vandits, **"importación"** significa **exclusivamente** uno de estos tres medios:

1. **Fichero** — KML, KMZ, GPX, GeoJSON, CSV (`FileUploadZone`).
2. **Web** — scrapeo de URL (Atlas Obscura + jsonld genérico, sync o background; remote KML/NetworkLink). `WebImportPanel` + `BackgroundScrapeJobs`.
3. **OneDrive · fotos** — extracción de geodatos EXIF (`OneDrivePhotosPanel`, tab `Fotos con GPS`).

Cualquier otro flujo que produzca o modifique POIs (alta manual, enriquecimiento, backfill, recovery, canonicalize) **NO es importación** y NO puede mezclarse con el hub. Ver `docs/contracts/import-canon.md` §3.

## Hub UX canónico (PR-IMPORT-UX-1)

`ImportedContentPanel` (`src/components/ImportedContentPanel.tsx`) agrupa tabs en dos secciones rotuladas:

- **Importar**: `Archivos` → `Web` → `OneDrive · fotos` (orden fijo).
- **Biblioteca**: `Documentos importados` (`DocumentsPanel`) — historial operativo, **NO** vía de importación. El propio panel muestra subtítulo explícito que lo declara.

`OneDrivePhotosPanel` parte sub-tabs en dos grupos:

- **Importar**: `Fotos con GPS` (única vía canónica §2.2).
- **Avanzado · diagnóstico**: `Explorar` (navegador OneDrive, read-only) + `Validar` (`OneDriveVisitValidator`, marca `visited=true` — fuera de canon §3, conservado temporalmente hasta `PR-PERSONAL-STATE-FROM-PHOTOS`).

## Contract test

`src/test/import-hub-ux.test.tsx` asegura:
- 3 triggers exactos bajo grupo `Importar` con labels canónicos.
- `Archivos` muestra chips KML/KMZ/GPX/GeoJSON/CSV.
- `Web` menciona URL + Atlas Obscura.
- `OneDrive · fotos` menciona fotos + GPS.
- Ningún header del hub menciona `enriquecer/backfill/recovery/canonicalize`.
- `Documentos importados` existe bajo grupo `Biblioteca`.

## Backlog explícito (NO abrir sin PR dedicado)

- `PR-IMPORT-ONEDRIVE-CREATE-POI` — implementar acción canónica §2.2 (crear/incorporar POIs desde fotos GPS indexadas).
- `PR-PERSONAL-STATE-FROM-PHOTOS` — extraer `OneDriveVisitValidator` a panel propio fuera del hub.
- `PR-IMPORT-CLEANUP` — eliminar `UploadPreviewDialog` legacy + re-export huérfano en `domains/content/components/index.ts`.

## No tocar sin PR explícito

- Parsers, scrapers, schema, RLS, edge functions de import.
- Reordenar grupos o renombrar tabs canónicos.
- Mover OneDrive `Fotos con GPS` fuera del grupo `Importar`.

## Referencias

- `docs/contracts/import-canon.md`
- `docs/audits/import-ux-operability.md`
- `mem://logic/content/import-lifecycle-by-channel`
- `mem://logic/import/unified-parser-contract`
- `mem://ui/imported-content-panel`
