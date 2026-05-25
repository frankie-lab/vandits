---
name: Import canon (PR-IMPORT-CANON-1 + PR-IMPORT-UX-1 + PR-IMPORT-UX-2)
description: Define qué es importación en Vandits (3 medios) y la UX canónica del hub Contenido como wizard guiado (3 cards + 5 pasos) tras PR-IMPORT-UX-2.
type: feature
---

# Import canon — Vandits

## Regla DURA

En Vandits, **"importación"** significa **exclusivamente** uno de estos tres medios:

1. **Fichero** — KML, KMZ, GPX, GeoJSON, CSV (`FileUploadZone`).
2. **Web** — scrapeo de URL (Atlas Obscura + jsonld genérico, sync o background; remote KML/NetworkLink). `WebImportPanel` + `BackgroundScrapeJobs`.
3. **OneDrive · fotos** — extracción de geodatos EXIF (`OneDrivePhotosPanel`, tab `Fotos con GPS`).

Cualquier otro flujo que produzca o modifique POIs (alta manual, enriquecimiento, backfill, recovery, canonicalize) **NO es importación** y NO puede mezclarse con el hub. Ver `docs/contracts/import-canon.md` §3.

## Hub UX canónico (PR-IMPORT-UX-2)

`ImportedContentPanel` (`src/components/ImportedContentPanel.tsx`) ya NO es un `PanelTabs`. Es un **router de vistas**:

- `view='hub'` → `ImportHub` (`src/shared/components/import/ImportHub.tsx`) renderiza 3 cards canónicas (`ImportChannelCard`): `file` · `web` · `onedrive`. Cada card declara título, qué acepta (chips), qué crea, cuándo usarlo, CTA `Empezar`. Debajo, link secundario `Documentos importados` que abre la biblioteca. **Prohibido** usar tabs como navegación principal en el hub.
- `view='wizard'` → `ImportWizardShell` (`src/shared/components/import/ImportWizardShell.tsx`) con header (icono + título + back-to-hub) + stepper de 5 pasos canónicos: `Fuente · Revisión · Destino · Importar · Resultado`. Cada vía monta su componente en `wizardMode={true}`:
  - **File** (`FileUploadZone wizardMode`): dropzone primero, sin doble header.
  - **Web** (`WebImportPanel wizardMode`): URL + Probar primero; `ScrapeJobsList` colapsado como historial secundario.
  - **OneDrive** (`OneDrivePhotosPanel wizardMode`): copy explicativo + CTA Auditar primero; sub-tabs `Explorar`/`Validar` ocultos (acordeón diagnóstico futuro).
- `view='library'` → `DocumentsPanel` con breadcrumb `← Importar`. Historial operativo, **NO** vía de importación.

## Contract test

`src/test/import-hub-ux.test.tsx` asegura:
- Hub renderiza `data-import-channel-card` para `file`/`web`/`onedrive` con título + Qué acepta + Qué crea + Cuándo usarlo + CTA `Empezar`.
- Hub NO contiene `role="tablist"` como navegación principal.
- Click en card monta `data-import-wizard=<channel>` con stepper de 5 pasos.
- Wizard expone `data-import-back-to-hub`.
- OneDrive wizard menciona Audita + fotos + GPS como primera acción.
- Biblioteca accesible sólo vía `data-import-library-link="v2"`.
- Ningún header/stepper/back-button del hub menciona `enriquecer/backfill/recovery/canonicalize`.

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
