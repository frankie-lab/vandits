## PR-IMPORT-UX-4 — Sub-toggle por fuente + CTA real en footer

### 1. Estructura

`ImportedContentPanel` mantiene las 3 tabs principales (Archivos / Web / Imágenes). Bajo cada tab, un sub-toggle binario (segmented control compacto, no `PanelTabs.Trigger` grande) entre **acción** e **histórico**. Default = acción. Estado por tab independiente.

| Tab        | Vista Acción           | Vista Histórico       |
|------------|------------------------|------------------------|
| Archivos   | Subir archivos         | Histórico de archivos  |
| Web        | Seleccionar web        | Jobs recientes         |
| Imágenes   | Subir imágenes         | Histórico de imágenes  |

### 2. Layout fijo por vista

```
PanelShell
├── Tabs principales (Archivos | Web | Imágenes)
├── Sub-toggle (Acción | Histórico)
├── Body (scrollable) — contenido de la vista activa
└── PanelFooter (sticky) — CTA real
```

### 3. CTA real en PanelFooter (no decorativo)

**Vista Acción**:
- **Archivos**: `Subir archivo` / `Importar archivo` (deshabilitado hasta `canUpload && fileSelected`). Si no hay archivo elegido, abre el file picker (delegar a un input oculto expuesto por `FileUploadZone`). Si ya hay archivo pendiente, lanza `handleFile`. Tooltip explica por qué está disabled (faltan condiciones, no hay archivo).
- **Web**: dos modos según estado real:
  - Si NO hay `preview` y URL es válida → CTA = `Probar`.
  - Si hay `preview` (Atlas) o sourceKind=generic → CTA = `Importar web` (ejecuta `handleExecute` = `handleImportNow` o `handleEnqueue` según `mode`).
  - Label dinámica: `Probar` | `Importar web` | `Encolar job`. Spinner cuando `phase !== 'idle'`.
- **Imágenes**: dos modos según estado real:
  - Si `indexPhotos.length === 0` o usuario explícitamente quiere reescanear → CTA = `Auditar fotos de OneDrive` (ya existe, se levanta tal cual).
  - Si hay índice y selección de fotos → CTA = `Importar imágenes` (placeholder cableado al evento real; si la lógica de creación de POIs aún no existe — backlog `PR-IMPORT-ONEDRIVE-CREATE-POI` — el botón queda visible pero disabled con tooltip "Pendiente de PR-IMPORT-ONEDRIVE-CREATE-POI"). **Importante**: NO añadimos lógica nueva; sólo expongo el slot y deshabilito.

**Vista Histórico**:
- Footer canónico con CTA secundaria única: `Nueva importación` → conmuta el sub-toggle de esa tab a `acción`.

### 4. No duplicar CTAs

Una vez levantados al footer, ELIMINAR/OCULTAR los botones inline equivalentes dentro del body:
- `FileUploadZone`: hoy el dropzone tiene su propio botón implícito (click→file input). El dropzone permanece como zona de drop visual, pero el botón explícito "Subir" del body (si lo hubiera) se oculta vía nueva prop `hidePrimaryCta` (default `false`). El footer dispara el file picker mediante una ref expuesta.
- `WebImportPanel`: el botón `Probar` actual (línea 374-385) y los botones de ejecución de modo (`Importar ahora` / `Encolar job`) se ocultan vía `hidePrimaryCta`. El footer recibe handlers (`onTest`, `onExecute`) y el estado computado (`phase`, `canTest`, `canExecute`, `executeLabel`).
- `OneDrivePhotosPanel`: ya tiene `PanelFooter` propio con "Auditar". Se elimina ese `PanelFooter` interno y se eleva al panel padre vía prop `renderFooter` / callback `onAudit` + `auditing` state expuesto.

### 5. Mecanismo de elevación (controlado, sin tocar lógica)

Patrón uniforme — **render-prop / imperative handle**:

```ts
// FileUploadZone
interface FileUploadZoneProps {
  hidePrimaryCta?: boolean;
  onPrimaryStateChange?: (state: {
    canSubmit: boolean;
    hasFile: boolean;
    isProcessing: boolean;
    submit: () => void;        // triggers file picker OR handleFile
    disabledReason?: string;
  }) => void;
}
```

Idéntico contrato para `WebImportPanel` y `OneDrivePhotosPanel`. El padre (`ImportedContentPanel`) guarda el último estado emitido por cada hijo y renderiza el footer:

```tsx
<PanelFooter>
  <Button onClick={state.submit} disabled={!state.canSubmit}>
    {state.label}
  </Button>
</PanelFooter>
```

Esto NO cambia:
- parsers (`parseGeoFile`, `scrape-atlas-obscura`, `scan-onedrive-geo`),
- scrapers / edge functions,
- schema / RLS,
- lógica de import (`saveDocumentToDatabase`, `processImportedDocument`, `handleImportNow`, `handleEnqueue`, `runAudit`).

Sólo añade un canal de notificación de estado + exposición del callback de submit. Toda la lógica interna sigue viviendo dentro de cada panel hijo.

### 6. Vistas histórico

- **Archivos**: `DocumentsPanel` con `sourceFilter=['kml','kmz','gpx','geojson','csv']` (ya cableado).
- **Web**: `DocumentsPanel` con `sourceFilter=['web_import','scrape']` (filtro UI, sin cambiar API). Más debajo, `ScrapeJobsList` (ya existe en `BackgroundScrapeJobs`) en sección colapsable "Jobs en curso".
- **Imágenes**: `DocumentsPanel` con `sourceFilter=['onedrive','photo']`. Si está vacío, `PanelEmptyState` con CTA contextual al footer.

### 7. Cambios concretos

1. `src/components/ImportedContentPanel.tsx` — añadir `subView` state por tab, sub-toggle UI, slots de footer cableados a los estados emitidos por hijos.
2. `src/domains/content/components/FileUploadZone.tsx` — añadir `hidePrimaryCta` + `onPrimaryStateChange`; extraer el `submit` interno como callback memoizado expuesto vía el callback.
3. `src/domains/content/components/WebImportPanel.tsx` — mismo contrato; ocultar `Probar` inline + bloque "Importar ahora / Encolar" cuando `hidePrimaryCta`; calcular `label` dinámico según `phase`/`preview`/`mode`.
4. `src/components/OneDrivePhotosPanel.tsx` — mismo contrato; eliminar `PanelFooter` interno del tab `index` cuando `hidePrimaryCta`; calcular `label` y `disabled` desde `auditing`.
5. `src/domains/content/components/DocumentsPanel.tsx` — sin cambios de API (ya acepta `sourceFilter`); nuevos call sites en Web e Imágenes.
6. `src/shared/components/ui/panel/PanelFooter.tsx` — sin cambios.
7. **Tests** (`src/test/import-hub-ux.test.tsx`):
   - Cada tab tiene sub-toggle con labels exactos.
   - Vista Acción de cada tab tiene `PanelFooter` con CTA real (no "Ver histórico").
   - No hay CTA duplicada (assert: el botón inline original NO está en DOM cuando `hidePrimaryCta`).
   - Vista Histórico tiene CTA "Nueva importación".
   - Smoke: ningún import de `parseGeoFile`/`scrape-atlas-obscura`/`scan-onedrive-geo` se ha modificado (snapshot de exports).
8. Bump `APP_VERSION` → `v1.6.2`; entrada en `docs/releases/version-history.md`.
9. Actualizar `mem/logic/import/import-canon.md` + `docs/contracts/import-canon.md` §8 con PR-IMPORT-UX-4 (sub-toggle + CTA real en footer).
10. Mantener backlog explícito: `PR-IMPORT-ONEDRIVE-CREATE-POI`, `PR-IMPORT-CLEANUP` (legacy `wizardMode` props).

### 8. Reglas duras

- Footer SIEMPRE tiene la acción principal real de la vista. Nada decorativo.
- Una sola CTA por footer.
- Si el CTA está disabled, tooltip OBLIGATORIO explicando el motivo (canon `selector-interaction-contract` aplicado).
- Sub-toggle = segmented control compacto, NO segundo nivel de tabs grandes.
- Default siempre Vista Acción.
- Sin emojis; iconos Lucide.

### 9. Fuera de alcance

- Crear POIs desde fotos OneDrive (backlog `PR-IMPORT-ONEDRIVE-CREATE-POI`). El botón "Importar imágenes" del footer queda visible pero deshabilitado con tooltip mientras tanto.
- Limpieza de `wizardMode` props (backlog `PR-IMPORT-CLEANUP`).
- Cambios de parsers, scrapers, edge functions, schema, RLS.
