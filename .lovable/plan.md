
# PR-IMPORT-UX-2 — Import Wizard / Flow Unificado

Sustituir el panel de tabs por un **asistente de importación** con un selector inicial de 3 vías y un flujo guiado común. Sólo UI/UX; no se tocan parsers, scrapers, edge functions, schema ni RLS.

## 1. Objetivo

Al abrir `Contenido`, el usuario debe entender en 5 segundos qué puede importar (archivo / web / fotos), qué hace cada vía y cuál es el siguiente paso. Las tres vías comparten gramática y se sienten como un único importador.

## 2. Arquitectura del flujo

```text
ImportedContentPanel (PanelShell, width = library wide)
│
├── view: "hub"        ← pantalla inicial (selector 3 cards)
├── view: "wizard"     ← flujo guiado por vía elegida
│      steps: source → preview → destination → import → result
└── view: "library"    ← Documentos importados (historial, secundario)
```

Estado local: `{ view, channel?: 'file'|'web'|'onedrive', step }`. Sin router. Botón `Volver` siempre visible en wizard.

## 3. Hub inicial (vista por defecto)

Tres `ImportChannelCard` grandes (no tabs). Cada card:

- icono grande + título (`Importar desde fichero` / `Importar desde la web` / `Importar fotos desde OneDrive`)
- **Qué acepta**: chips concretos (KML/KMZ/GPX/GeoJSON/CSV · URL Atlas Obscura, KML remoto · fotos con GPS en OneDrive)
- **Qué crea**: una frase (POIs en tu catálogo · POIs scrapeados · POIs desde fotos georreferenciadas)
- **Cuándo usarlo**: una frase humana
- CTA primaria: `Empezar`

Debajo, sección secundaria colapsable `Biblioteca` con link `Ver documentos importados (N)` que cambia a `view='library'`. NO compite visualmente con las 3 cards.

Nuevo componente: `src/shared/components/import/ImportHub.tsx` + `ImportChannelCard.tsx`.

## 4. Wizard común

`ImportWizardShell` con stepper horizontal (`1 Fuente · 2 Revisión · 3 Destino · 4 Importar · 5 Resultado`). Mismo header (icono + título de la vía), mismo footer sticky con `Atrás` / `Siguiente` / CTA primaria. Cuerpo central con un único slot por paso.

Nuevo componente: `src/shared/components/import/ImportWizardShell.tsx` (header + stepper + body + footer). Reemplaza visualmente al actual `ImportSurfaceShell` para las 3 vías; el shell antiguo se conserva como fallback hasta limpieza.

### 4.1 Archivos
- **Paso 1 Fuente**: explicación humana + dropzone grande. Sin condiciones bloqueantes ni selector de colección al entrar.
- **Paso 2 Revisión**: preview del parseo (conteo de POIs/tracks, sample de nombres, warnings dedupe).
- **Paso 3 Destino**: aquí (y sólo aquí) aparecen colección destino + condiciones (checkbox de aceptación).
- **Paso 4 Importar**: progreso.
- **Paso 5 Resultado**: N POIs creados, link a documento, botón `Importar otro`.

Refactor de `FileUploadZone` para exponer fases (`pickFile` / `parsed` / `destination` / `running` / `done`) consumibles por el wizard. La lógica de parser/persistencia NO cambia.

### 4.2 Web
- **Paso 1 Fuente**: input URL grande + ejemplos (Atlas Obscura, KML remoto). Sin lista de jobs visible.
- **Paso 2 Revisión**: si sync → resultado scrape; si background → preview de la cola que se va a encolar.
- **Paso 3 Destino**: modo (sync / background con preset slow/normal/fast), `max_items`.
- **Paso 4 Importar**: lanzamiento + estado job.
- **Paso 5 Resultado**: link `Ver resultado` (document_id) cuando done.
- **Historial secundario**: `BackgroundScrapeJobs` se renderiza colapsado al final del wizard como "Jobs recientes", no como contenido principal. También accesible desde el hub vía `Ver jobs en curso (N)` cuando hay activos.

### 4.3 OneDrive · fotos
- **Paso 1 Fuente**: pantalla explicativa con copy claro ("Detectamos fotos con GPS en tu OneDrive para crear ubicaciones") + CTA `Auditar fotos`. Sin árbol técnico inicial.
- **Paso 2 Revisión**: resultado de `scan-onedrive-geo` (N fotos con GPS, sample, agrupación por carpeta).
- **Paso 3 Destino**: visibilidad/colección destino (placeholder hasta `PR-IMPORT-ONEDRIVE-CREATE-POI`; CTA `Importar` queda `disabled` con tooltip "Próximamente: creación de POIs desde fotos. Por ahora la auditoría es informativa." — declarado honestamente, no botón fake).
- **Paso 4/5**: mismo placeholder honesto.
- **Avanzado · diagnóstico**: `Explorar` (browser OneDrive) y `Validar` (`OneDriveVisitValidator`) se mueven a un acordeón "Herramientas avanzadas" al pie del wizard, plegado por defecto. NO son la primera experiencia.

## 5. Biblioteca (historial)

`view='library'` muestra `DocumentsPanel` sin compartir espacio con el hub. Subtítulo actual se conserva. Acceso sólo desde el link secundario del hub y desde un breadcrumb `← Volver a Importar`.

## 6. Componentes nuevos / tocados

Nuevos (todos en `src/shared/components/import/`):
- `ImportHub.tsx` — selector inicial.
- `ImportChannelCard.tsx` — card grande de vía.
- `ImportWizardShell.tsx` — shell con stepper + footer sticky.
- `ImportStepper.tsx` — indicador de pasos.
- `wizards/FileImportWizard.tsx` — orquestador 5 pasos archivos.
- `wizards/WebImportWizard.tsx` — orquestador 5 pasos web.
- `wizards/OneDriveImportWizard.tsx` — orquestador 5 pasos fotos.

Tocados (UI only):
- `src/components/ImportedContentPanel.tsx` — pasa de `PanelTabs` a router de vistas (`hub | wizard | library`). Mantiene `defaultTab` por compat traduciéndolo a vista/canal.
- `src/domains/content/components/FileUploadZone.tsx` — extrae fases consumibles; conserva API legacy.
- `src/domains/content/components/WebImportPanel.tsx` — se divide en `WebImportForm` (URL + opciones) + `BackgroundScrapeJobs` reubicado al pie.
- `src/components/OneDrivePhotosPanel.tsx` — descompuesto: `OneDriveAuditStep` (canónico) + acordeón `Avanzado` con `OneDriveExplorer` + `OneDriveVisitValidator`.

Lógica de negocio (parsers, edges, dedupe, lifecycle) NO se toca.

## 7. Contract tests

Actualizar `src/test/import-hub-ux.test.tsx`:
- Hub renderiza 3 cards canónicas con título + "Qué acepta" + "Qué crea" + CTA `Empezar`.
- No hay tabs como navegación principal (no `role="tablist"` en el hub).
- Tras click en una card aparece el stepper con 5 pasos.
- `Documentos importados` accesible sólo vía link secundario.
- Ningún paso del wizard menciona `enriquecer/backfill/recovery/canonicalize`.
- OneDrive wizard expone CTA "Auditar fotos" como primera acción y declara explícitamente la limitación de creación de POIs (no botón fake).

Nuevo test: `src/test/import-wizard-flow.test.tsx` (smoke por vía: hub → step 1 → step 2 visible).

## 8. Documentación y memoria

- `docs/contracts/import-canon.md` §8: añadir entrada PR-IMPORT-UX-2 con el nuevo modelo hub+wizard y marcar el panel-tabs como sustituido.
- `mem://logic/import/import-canon`: actualizar sección "Hub UX canónico" describiendo hub (3 cards) + wizard 5 pasos + biblioteca secundaria + acordeón avanzado OneDrive.
- `mem://index.md`: ajustar la línea correspondiente a import canon si cambia wording.
- `docs/audits/import-ux-operability.md`: cerrar gaps "Explorar/Validar primera experiencia" y "Jobs como contenido principal"; reabrir como deuda sólo `PR-IMPORT-ONEDRIVE-CREATE-POI`.

## 9. Versionado

Bump minor: **v1.5.16 → v1.6.0** (cambio de modelo de navegación del hub, no sólo copy). Atómico vía `scripts/release/bump-version.ts`. Entrada en `docs/releases/version-history.md`.

## 10. Fuera de alcance (deuda explícita, NO abrir)

- `PR-IMPORT-ONEDRIVE-CREATE-POI` — creación real de POIs desde fotos GPS.
- `PR-PERSONAL-STATE-FROM-PHOTOS` — sacar `OneDriveVisitValidator` del hub.
- `PR-IMPORT-CLEANUP` — borrar `UploadPreviewDialog` legacy.
- Cambios en parsers, scrapers, schema, RLS, edge functions, lifecycle.

## 11. Postcondición (gate de cierre)

- Tests verdes (hub-ux + wizard-flow).
- `version-parity` verde, `APP_VERSION = 1.6.0`.
- Memoria + canon doc sincronizados en el mismo PR.
- QA visual manual: abrir `Contenido` → ver hub con 3 cards → entrar en cada vía → ver stepper + paso 1 honesto (sin condiciones bloqueantes, sin jobs como protagonistas, sin árbol técnico).
