## PR-IMPORT-UX-4-FIX — Plan

### Alcance
Sólo UI/orquestación de `ImportedContentPanel` + reorden interno de `FileUploadZone` + empty state de `DocumentsPanel` + tests + memoria. **No tocar** parsers, scrapers, edge functions, schema, RLS, lógica de import, ni creación de POIs desde fotos.

---

### Hallazgos previos (auditoría, ya hecha)

- **DB `documents.source_type`** (enum real): `kml | gpx | geojson | csv | manual | web_import`. NO existe `kmz` (KMZ se persiste como `kml` — confirmado en `FileUploadZone.tsx:417`). NO existe `scrape` ni `atlas-obscura` ni `onedrive` ni `photo`.
- **Conteo actual en prod**: `kml=8`, `web_import=6`, `manual=4`, `NULL=4`.
- **Bug de filtros**:
  - `WEB_SOURCE_TYPES = ['web_import','scrape','atlas-obscura']` — los dos últimos NUNCA existen → ruido sin efecto, pero el canon debe quedar `['web_import']`.
  - `IMAGE_SOURCE_TYPES = ['onedrive','photo']` — NINGUNO existe en enum → histórico imágenes SIEMPRE vacío.
  - `FILE_SOURCE_TYPES` actual es correcto funcionalmente (KMZ → kml), pero conviene documentarlo.
- **Empty state** de `DocumentsPanel.tsx:425`: "Sube un archivo KML, GPX o GeoJSON" — omite KMZ y CSV, y es genérico (no sabe que está en histórico).

---

### Cambios

#### 1. `src/components/ImportedContentPanel.tsx` — sub-toggle → acción única + footer uniforme

- **Eliminar `SubToggle`** (segmented control) y su render entre las tabs y el contenido. `subView` por fuente se mantiene como estado, pero no hay control visual binario.
- **Footer rediseñado** (`PanelFooter`):
  - **Vista `action`**: CTA primaria real elevada (igual que hoy vía `currentCta`) + debajo un **link/botón secundario** "Ver histórico" que llama `setSub('history')`.
  - **Vista `history`**: CTA primaria **específica por fuente** (no genérica "Nueva importación") que vuelve a `action`:
    - `archivos` → "Subir archivo"
    - `web` → "Nueva web"
    - `imagenes` → "Auditar imágenes"
  - Labels en constante `RETURN_TO_ACTION_LABELS: Record<SourceTab,string>`.
- Eliminar texto "Nueva importación" y el icono `Plus` genérico.
- Mantener `data-import-primary-cta={tab}` en vista acción; añadir `data-import-secondary-cta="history-link"` para el link "Ver histórico"; añadir `data-import-return-to-action={tab}` para el botón de retorno en vista histórico.

#### 2. `src/domains/content/components/FileUploadZone.tsx` — reorden vertical lógico

Orden actual: dropzone → visibilidad → colección → condiciones. Orden nuevo (no-wizard, hidePrimaryCta):

1. **Notice / requisitos** (banner si `!canUpload`).
2. **Condiciones** (Términos + Política duplicados) — bloque actual movido **arriba**.
3. **Visibilidad**.
4. **Colección destino** (`CollectionPicker`).
5. **Dropzone** (al final, listo para usarse una vez todo verde).
6. Footer (lo provee el padre): "Subir archivo / Importar archivo" — ya cubierto por `onPrimaryStateChange`.

Mover el bloque `{/* Drop zone */}` (label que envuelve input file + motion.div) DESPUÉS del bloque `Settings` (visibility/collection/conditions), y dentro de `Settings` reordenar: Condiciones → Visibilidad → Colección. Cambiar copy del dropzone deshabilitado a "Antes de subir, confirma las condiciones de arriba" (hoy dice "abajo").

#### 3. `ImportedContentPanel.tsx` — corregir filtros `source_type`

- `FILE_SOURCE_TYPES = ['kml','gpx','geojson','csv']` (quitar `'kmz'`; el enum no lo tiene, KMZ se guarda como `kml`). Añadir comentario explicando que KMZ↔kml.
- `WEB_SOURCE_TYPES = ['web_import']` (quitar `'scrape'`, `'atlas-obscura'` — nunca se persisten).
- `IMAGE_SOURCE_TYPES`: el enum no tiene tipo para imágenes/OneDrive. Histórico de imágenes hoy es inviable filtrando por `source_type`. **Decisión**: mostrar el mismo `DocumentsPanel` con `sourceFilter={[]}` + un header explícito + un `emptyOverride` claro: "No hay imágenes importadas todavía". (Si más adelante se añade enum `onedrive`, basta cambiar el filtro.) NO se toca el pipeline de import de imágenes.

#### 4. `DocumentsPanel.tsx` — empty state parametrizable

- Añadir prop opcional `emptyTitle?: string` y `emptyHint?: string`.
- `ImportedContentPanel` pasa:
  - archivos → "No hay archivos importados todavía" / "Formatos soportados: KML · KMZ · GPX · GeoJSON · CSV".
  - web → "No hay webs importadas todavía" / "Importa una URL desde la vista de acción".
  - imagenes → "No hay imágenes importadas todavía" / "Audita tu OneDrive desde la vista de acción".
- Si `emptyTitle`/`emptyHint` no se pasan, mantener copy actual (compat).

#### 5. Tests — `src/test/import-hub-ux.test.tsx`

Actualizar (y añadir donde falte) asserts:
- NO existe `[data-import-subtoggle]` ni `role="tab"` con `data-import-subview`.
- En vista acción: existe `[data-import-primary-cta=<tab>]` y un link `[data-import-secondary-cta="history-link"]` con texto "Ver histórico".
- En vista histórico: existe `[data-import-return-to-action=<tab>]` con label específico ("Subir archivo" / "Nueva web" / "Auditar imágenes"); NO existe el texto "Nueva importación".
- En `FileUploadZone` (action archivos): los bloques aparecen en orden Condiciones → Visibilidad → Colección → Dropzone (verificable por orden DOM).
- Filtro histórico archivos pasa exactamente `['kml','gpx','geojson','csv']` (snapshot del prop `sourceFilter`).
- Empty state archivos contiene los 5 formatos (KML, KMZ, GPX, GeoJSON, CSV).
- Empty state imágenes contiene "No hay imágenes importadas todavía".

#### 6. Documentación / memoria

- `docs/contracts/import-canon.md` §8: reescribir bloque sub-toggle y footer; documentar que la fuente decide su CTA de retorno (no hay copy genérico); documentar la equivalencia KMZ↔kml en `source_type` y los filtros canónicos por fuente.
- `mem://logic/import/import-canon`: actualizar resumen.
- `docs/releases/version-history.md`: nueva entrada PR-IMPORT-UX-4-FIX.
- Bump `APP_VERSION` patch (1.6.x → 1.6.x+1) vía `scripts/release/bump-version.ts`.

---

### Fuera de alcance (explícito)
- Parsers, scrapers, edge functions, schema/migrations, RLS.
- Añadir enum `onedrive`/`photo` a `document_source_type` (requiere migración + cambios en pipeline → otro PR).
- Crear POIs desde fotos.
- Cambios funcionales en `WebImportPanel`, `OneDrivePhotosPanel`, `ScrapeJobsList`.

### Postcondición (gate NASA)
- Tests verdes (o `.skip` con TODO PR-XXX).
- `version-parity.test.ts` verde.
- `APP_VERSION` bumped en `src/lib/app-version.ts`.
- Memoria + `import-canon.md` sincronizados en el mismo PR.
- Hard-refresh autenticado sigue verde (no se modifica boot ni stores persistidos).
