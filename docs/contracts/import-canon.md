# Import Canon — Vandits

> Status: **ACTIVE — CANON**. Define qué es y qué NO es "importación"
> en Vandits. Documentación pura: este PR no toca código, schema, RLS,
> parsers, scrapers ni UI.
>
> Companion to:
> - [`../audits/import-discovery.md`](../audits/import-discovery.md)
> - `mem://logic/import/import-canon`
> - `mem://logic/content/import-lifecycle-by-channel`

---

## 1. Definición canónica

En Vandits, **"importación"** significa **exclusivamente** uno de estos
tres medios:

1. **Importación desde fichero** — KML, KMZ, GPX, GeoJSON, CSV.
2. **Importación desde OneDrive (solo fotos)** — extracción de
   geodatos EXIF de imágenes para crear/incorporar POIs.
3. **Importación desde web** — scrapeo desde URL (Atlas Obscura,
   páginas compatibles, remote KML / NetworkLink, jobs background).

Cualquier otro flujo que produzca o modifique POIs **NO es
importación** y se clasifica según §3.

## 2. Los tres medios — detalle canónico

### 2.1 Importación desde fichero

- **Formatos canónicos**: `KML`, `KMZ`, `GPX`, `GeoJSON`, `CSV`.
- **Entrada**: archivo local subido por el usuario (drag&drop o file
  picker).
- **Pipeline**: parser unificado (`parseGeoFile`) → `toKMLDocument` →
  `applyCanonToParsed` → resolver FK → preview/dedupe → persistencia.
- **Lifecycle**: `normalized` (no auto-aprueba) salvo override
  explícito. Ver `mem://logic/content/import-lifecycle-by-channel`.
- **NetworkLinks** (KMZ Google My Maps) se resuelven vía
  `fetch-remote-kml`. Ver `mem://logic/import/networklink-resolution`.

### 2.2 Importación desde OneDrive (solo fotos)

- **Alcance**: **únicamente fotos**. OneDrive **NO es un importador
  documental general** — no se aceptan KMLs ni documentos vía
  OneDrive.
- **Objetivo**: detectar geodatos EXIF en imágenes y, cuando aplique,
  crear o incorporar POIs.
- **Funciones edge**: `browse-onedrive` (listado),
  `scan-onedrive-geo` (extracción de coordenadas).
- **Limitación canónica**: paginación 200 ítems (ver Core rule "Cloud
  Photos Constraint"). Sin integración iCloud / Google Drive.

### 2.3 Importación desde web (scrape)

- **Modos**:
  - **Sync** — `scrape-atlas-obscura` (URL única, respuesta directa).
  - **Background job** — `scrape-enqueue` + `scrape-tick` (cola con
    presets `slow|normal|fast`, pausas, `max_items`).
  - **Remote KML / NetworkLink** — `fetch-remote-kml` (cuando la URL
    apunta a un KML/KMZ remoto o un NetworkLink).
- **Fuentes soportadas**: Atlas Obscura + páginas compatibles
  (`generic_jsonld`). Cualquier otra fuente debe planearse aparte.
- **Lifecycle**: `web_import` auto-aprueba (ver
  `mem://logic/content/import-lifecycle-by-channel`).

## 3. Qué NO es importación

Los siguientes flujos producen o modifican POIs pero **NO se clasifican
como importación** y NO deben mezclarse con el canon de §2:

| Flujo | Clasificación canónica | Notas |
|-------|------------------------|-------|
| Crear POI manualmente desde mapa/app | **Alta manual** | Creación directa del usuario. No pasa por parser. |
| Adoptar POI ajeno al catálogo propio | **Alta manual** (variante) | Bypass histórico documentado en audit §Surface 7. |
| Mejora IA del POI (descripción, rating, imágenes) | **Enriquecimiento** | Posterior a la incorporación. Ver `enrich-*` edges. |
| Reparación de coordenadas / geocoding faltante | **Mantenimiento / Backfill** | `backfill-coordinates`, `geocoding-job-tick`. |
| Recuperación de imágenes | **Recovery** | `image-recovery-job-tick`. |
| Canonicalización de admin areas | **Mantenimiento estructural** | `canonicalize-admin-areas`. |
| Backfill de scraped locations existentes | **Mantenimiento** | `backfill-scraped-locations` re-procesa lo ya importado. |

**Regla dura**: "importación" en docs, código, memoria, UI copy y
naming de PRs se reserva exclusivamente para los tres medios de §2.
Llamar "importador" a un enriquecimiento, backfill, recovery o
canonicalize es **violación de canon**.

## 4. Matriz canónica

```text
                       ┌───────────────┐
                       │   Vandits     │
                       │   Catalog     │
                       └───────┬───────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   Alta manual            IMPORTACIÓN            Operaciones
   (creación               (§2)                  posteriores
    directa)                 │                   (§3)
        │            ┌───────┼───────┐                │
        │            │       │       │                │
        │         Fichero  OneDrive  Web          Enrichment
        │         (KML/    (fotos)  (scrape/      Backfill
        │          KMZ/             remote        Recovery
        │          GPX/              KML)         Canonicalize
        │          GeoJSON/
        │          CSV)
```

## 5. Implicaciones operativas

- **Naming de PRs / memorias / docs**: usar `PR-IMPORT-*` solo para
  los tres medios. Mantenimiento usa `PR-BACKFILL-*` / `PR-RECOVERY-*`
  / `PR-CANON-*` / `PR-ENRICH-*`.
- **Audit de superficies** (`docs/audits/import-discovery.md`):
  re-clasificar cualquier superficie que no encaje en §2 hacia §3.
- **UI copy**: tabs/menús que digan "Importar" deben corresponder a
  uno de los tres medios. Si una pestaña dejara de producir POIs
  (caso OneDrive sin bridge a POI), debe renombrarse (ver audit §8).
- **Memorias afectadas**: las que describen lifecycle, parser, scrape,
  NetworkLink, pending-collection siguen vigentes. Esta canon las
  ordena bajo un único paraguas.

## 6. Fuera de alcance (este PR)

- Schema, RLS, parsers, scrapers, edge functions, UI.
- Renombrar componentes, tabs o memorias existentes.
- Cambios a `source_type` enum o lifecycle.

Solo documentación + memoria.

## 7. Referencias

- `docs/audits/import-discovery.md`
- `mem://logic/content/import-lifecycle-by-channel`
- `mem://logic/import/unified-parser-contract`
- `mem://logic/import/networklink-resolution`
- `mem://logic/import/pending-collection-deferred`
- `mem://logic/import/scrape-direct-enrichment`
- `mem://logic/import/atlas-obscura-listing-canonical`
- `mem://features/import/unified-two-step-flow`
- `mem://features/import/preview-dialog`

## 8. Histórico

- 2026-05 — Canon creado tras PR-IMPORT-DISCOVERY-1.
- 2026-05-25 — **PR-IMPORT-UX-1 CERRADO** (v1.5.16). Reorganización
  de labels en tabs.
- 2026-05-25 — **PR-IMPORT-UX-2 RECHAZADO** (wizard de 3 cards + 5
  pasos). No aprobado por el usuario: ocultaba las fuentes reales y
  añadía un asistente innecesario. Hub/wizard/channel-card eliminados.
- 2026-05-25 — **PR-IMPORT-UX-3 CERRADO** (v1.6.1). Modelo definitivo:
  panel **"Fuentes de importación"** con 3 tabs operativas exactas:
  - `Archivos` — `FileUploadZone` + histórico contextual
    (`DocumentsPanel` filtrado por `source_type ∈ {kml,kmz,gpx,
    geojson,csv}`, header "Archivos importados anteriormente").
  - `Web` — `WebImportPanel` (incluye `ScrapeJobsList` como
    histórico de jobs/webs procesadas).
  - `Imágenes` — bloque "Proveedor · OneDrive" + `OneDrivePhotosPanel`
    (sub-tabs internos `Importar` / `Avanzado · diagnóstico`).
  - OneDrive deja de ser tab principal: es proveedor dentro de
    Imágenes. "Biblioteca / Documentos importados" deja de ser tab
    principal: vive contextual dentro de Archivos.
  - `DocumentsPanel` acepta props UI-only `sourceFilter` +
    `headerLabel` + `headerSubtitle` (sin cambios de lógica).
  - Hub/Wizard/ChannelCard/Stepper ELIMINADOS del código.
    `wizardMode` prop queda dead en `FileUploadZone`/`WebImportPanel`/
    `OneDrivePhotosPanel` hasta `PR-IMPORT-CLEANUP`.
  - Contract test `import-hub-ux.test.tsx` (11/11): valida 3 tabs,
    histórico contextual, ausencia total de rastros del wizard.
  - Reglas duras: no wizard, no stepper, no hub de cards, no
    biblioteca global como tab principal, OneDrive no como tab raíz.
  - Memoria sincronizada: `mem://logic/import/import-canon`.

### 8.1 Backlog explícito (NO abrir sin PR dedicado)

| ID                                  | Alcance                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `PR-IMPORT-ONEDRIVE-CREATE-POI`     | Implementar acción canónica §2.2 (crear/incorporar POIs desde fotos GPS indexadas). |
| `PR-PERSONAL-STATE-FROM-PHOTOS`     | Extraer `OneDriveVisitValidator` a panel propio fuera del hub. |
| `PR-IMPORT-CLEANUP`                 | Eliminar `UploadPreviewDialog` legacy + re-export huérfano + retirar prop dead `wizardMode` de los tres paneles de fuente. |

- 2026-05 — Canon creado tras PR-IMPORT-DISCOVERY-1.
- 2026-05-25 — **PR-IMPORT-UX-1 CERRADO** (v1.5.16). Reorganización
  de labels y grupos en `ImportedContentPanel` (versión tabs):
  grupo `Importar` (Archivos · Web · OneDrive · fotos) separado de
  `Biblioteca` (Documentos importados). `OneDrivePhotosPanel` con
  sub-tabs `Importar` / `Avanzado · diagnóstico`. `DocumentsPanel`
  con subtítulo de biblioteca. `BackgroundScrapeJobs` con botón
  "Ver resultado". `FileUploadZone` con copy humano + chips.
  Contract test inicial + auditoría `import-ux-operability.md`.
- 2026-05-25 — **PR-IMPORT-UX-2 CERRADO** (v1.6.0). Rediseño real
  del hub: tabs → **wizard guiado**. Supera la UX de PR-IMPORT-UX-1
  (que sólo reorganizaba labels).
  - `ImportedContentPanel` deja de ser `PanelTabs` y pasa a **router
    de vistas** (`hub` · `wizard` · `library`).
  - `ImportHub` (`src/shared/components/import/ImportHub.tsx`):
    landing con 3 `ImportChannelCard` (`file` · `web` · `onedrive`),
    cada una con título, "Qué acepta" (chips), "Qué crea", "Cuándo
    usarlo" y CTA `Empezar`. Link secundario `Documentos importados`.
  - `ImportWizardShell` (`src/shared/components/import/ImportWizardShell.tsx`):
    header (icono + título + back-to-hub) + stepper canónico de
    5 pasos: `Fuente · Revisión · Destino · Importar · Resultado`.
  - Cada vía monta su panel existente con `wizardMode={true}` (sin
    doble header, jobs colapsados, sub-tabs diagnóstico ocultos).
    Lógica de import sin cambios.
  - `DocumentsPanel` queda en `view='library'` accesible sólo por
    link secundario del hub, con breadcrumb `← Importar`.
  - Contract test (`import-hub-ux.test.tsx`, 8/8 verde): ausencia
    de `role="tablist"` en hub, presencia de `data-import-channel-card`
    para los 3 canales, stepper de 5 pasos en wizard, biblioteca
    sólo vía `data-import-library-link="v2"`.
  - Reglas duras: prohibidas tabs pequeñas como navegación principal,
    3 UX distintas por canal, diagnóstico como feature principal,
    botones fake.
  - Memoria sincronizada: `mem://logic/import/import-canon`.

### 8.1 Backlog explícito (NO abrir sin PR dedicado)

| ID                                  | Alcance                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `PR-IMPORT-ONEDRIVE-CREATE-POI`     | Implementar acción canónica §2.2: crear/incorporar POIs desde fotos con GPS indexadas (schema/edge/flow nuevos). El wizard OneDrive hoy llega hasta `Auditar fotos`; los pasos `Destino/Importar/Resultado` quedan placeholder hasta este PR. |
| `PR-PERSONAL-STATE-FROM-PHOTOS`     | Extraer `OneDriveVisitValidator` a panel propio fuera del hub de importación (canon §3 — es estado personal). |
| `PR-IMPORT-CLEANUP`                 | Eliminar `UploadPreviewDialog` legacy (706 líneas, huérfano post import-first) y su re-export en `domains/content/components/index.ts`. |

