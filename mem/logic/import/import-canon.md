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

## Hub UX canónico (PR-IMPORT-UX-3 + PR-IMPORT-UX-4)

`ImportedContentPanel` (`src/components/ImportedContentPanel.tsx`):

- **Título del panel = "Fuentes de importación"** (NO "Contenido").
- **PanelTabs con 3 tabs operativas exactas** (grupo `Fuentes`): `archivos` · `web` · `imagenes`.
- **Sub-toggle binario Acción/Histórico** debajo de las tabs (segmented control compacto, NO segundo nivel de tabs). Default = `action` por tab. Labels canónicos:
  - `archivos` → "Subir archivos" / "Histórico de archivos"
  - `web` → "Seleccionar web" / "Jobs recientes"
  - `imagenes` → "Subir imágenes" / "Histórico de imágenes"
- **Vista Acción** monta el componente fuente (`FileUploadZone` / `WebImportPanel` / `OneDrivePhotosPanel`) con `hidePrimaryCta` + `onPrimaryStateChange` → eleva la CTA REAL al `PanelFooter`.
- **Vista Histórico** monta `DocumentsPanel` filtrado por `sourceFilter` (archivos: KML/KMZ/GPX/GeoJSON/CSV; web: `web_import`/`scrape`/`atlas-obscura`; imágenes: `onedrive`/`photo`). En `web` se añade `ScrapeJobsList` arriba.
- **`PanelFooter` canónico (REGLA DURA, no decorativo)**:
  - Acción → único `Button` con `data-import-primary-cta={tab}`, `label`/`onClick`/`disabled` provistos por el hijo vía `ImportPrimaryCtaState`. `disabledReason` se renderiza como `<Tooltip>` cuando `!canSubmit`.
  - Histórico → único `Button outline` con `data-import-secondary-cta={tab}` "Nueva importación" que vuelve a `action`.
- **Prohibido**: CTA primaria duplicada inline (los hijos OCULTAN sus botones equivalentes cuando `hidePrimaryCta` está activo); hub de cards, wizard, stepper, navegación tipo asistente.
- **Contrato CTA**: `src/shared/components/import/import-primary-cta.ts` define `ImportPrimaryCtaState` (`label`, `canSubmit`, `isProcessing`, `submit`, `disabledReason?`). Es el ÚNICO canal por el cual la CTA real llega al footer.
- `DocumentsPanel` acepta props UI-only `sourceFilter?: string[]` + `headerLabel?` + `headerSubtitle?` (sin cambios de lógica).

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
