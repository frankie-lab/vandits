
# PR-EXPORT-5 — Export Content Model & Popup Parity

Objetivo: que el archivo exportado (especialmente KML/GuruMaps) refleje la ficha real del popup Vandits, no un pin pobre. Centralizar QUÉ datos salen en un único modelo por capas, scope-aware y format-aware. Sin tocar elegibilidad, RLS, thresholds, ExportResolver UX, jobs ni GPX.

## Alcance

In: contenido del payload exportado (mapper + serializers KML/CSV/JSON/GeoJSON) + paridad popup→export + tests + docs.
Out: RLS, `evaluatePoiExport`, thresholds, UI del Resolver, jobs background, GPX, share canon.

## Diseño

### 1. Capa única de construcción de contenido

Nuevo módulo `src/domains/content/lib/poi-export-content-model.ts`:

```ts
buildPoiExportContent(loc: GeoLocation, { scope, format, target }): PoiExportContent
```

Devuelve un objeto plano y semántico organizado por **capas**, consumido por todos los serializers (no duplican lógica):

- A. `identity` — id, slug?, name, primaryCategory
- B. `summary` — highlight (`enriched_data.punto_destacado`), shortDescription, longDescription (`enriched_data.descripcion`), observation (`enriched_data.observacion`)
- C. `geography` — country, region, province, locality, sublocality, address (`direccion_postal`), containmentPath?
- D. `media` — imageUrl, imageAttribution (`imagen_fuente`), sourceUrl
- E. `classification` — category, subcategory, tags (IA + personales + geo), taxonomyLabel, curationLevel (sólo si útil)
- F. `userContext` — **internal only** — createdAt, collection/list, personalNotes, ownState
- G. `provenance` — fuentes públicas, web_referencia, wikidata/wikipedia/OSM si existen, canonical Vandits URL si existe
- H. `internal/forbidden` — NUNCA: ownerUserId, RLS flags, debug, raw provider dump, secrets, caches, runtime internals

Reglas duras (defensa en profundidad además del DTO actual):
- `scope === 'public'`: F omitido, notas privadas excluidas, imagen sólo URL pública validada (reutiliza heurística existente en mapper).
- `scope === 'internal'`: incluye F + máximo contexto útil del dueño.
- Capa H jamás escrita, garantizado por construcción + grep test.

### 2. Matriz formato × capa

Tabla canónica en código (`EXPORT_FORMAT_MATRIX`) y espejo en docs:

| layer        | KML | CSV | JSON | GeoJSON |
|--------------|-----|-----|------|---------|
| A identity   | ✓   | ✓   | ✓    | ✓       |
| B summary    | HTML render | longDesc plana | full | full |
| C geography  | HTML + ExtendedData | columnas | full | properties |
| D media      | `<img>` en desc HTML | URL plana | full | URL |
| E classif.   | tags ExtendedData | columnas | full | properties |
| F userCtx    | internal only, ExtendedData | internal cols | internal | internal |
| G provenance | enlaces en desc HTML | columna `links` | full | properties.links |
| H forbidden  | NO  | NO  | NO   | NO      |

GPX y Vandits-package documentados como backlog (PR-EXPORT-7 / PR-EXPORT-10), no implementados aquí.

### 3. KML / GuruMaps target

Builder `buildKmlDescriptionHtml(content, { target })`:
- HTML mínimo y compatible (GuruMaps acepta subset reducido: `<p>`, `<b>`, `<i>`, `<img>`, `<a>`, `<br/>`).
- Orden: imagen → highlight → longDescription → ubicación (`localidad · región · país`) → categoría + tags → observación → enlaces → footer "Generado por Vandits · {fecha ISO}".
- Sanitización XML existente (`escapeXml`) sobre cada nodo de texto.
- Nada de JSON crudo, nada de campos internos, sin atributos que GuruMaps descarte.
- ExtendedData mantiene los campos estructurados (ya existente) para apps que los lean.

### 4. Serializers — cambios mínimos

Todos pasan a consumir `PoiExportContent` (vía mapper → content model). Hoy ya consumen `PoiExportRecord`; se añade un paso intermedio común sin romper el DTO.

- `poi-kml.ts`: sustituye `description` plano por `buildKmlDescriptionHtml`. ExtendedData enriquecida con capas C/E/G.
- `poi-csv.ts`: añade columnas `highlight`, `observation`, `address`, `category`, `subcategory`, `links` (join `|`), e `internal_*` sólo en scope internal. Mantiene flatten estricto.
- `poi-json.ts`: el envelope incluye `content` estructurado por capas (BREAKING menor sobre `poi-export-json-v2`; se mantiene la versión, se documenta como ampliación retro-compatible aditiva).
- `poi-geojson.ts`: `properties` recibe el content model serializado plano (no anida `coordinates`).

### 5. Mapper

`poi-export-mapper.ts` queda como **único** lector de `GeoLocation` y delega en `buildPoiExportContent`. `PoiExportRecord` se mantiene como shape histórico y se extiende aditivamente con `content` por capas. Sin cambios en `evaluatePoiExport`.

### 6. Paridad Popup → Export (Torre de Hércules)

- Nueva fixture `src/test/fixtures/poi-torre-hercules-export.ts` con un POI enriquecido completo (imagen, highlight, longDesc, observación, jerarquía, tags, rating, fuentes).
- Tabla de paridad en `docs/audits/pr-export-5-popup-parity-torre-hercules.md` con columnas `popup_field | source_path | visible_in_popup | current_export | target_export | format_support | decision`.

### 7. Tests (`src/test/pr-export-5-*`)

- `pr-export-5-content-model.test.ts` — capas A–G presentes/omitidas según scope; H jamás presente.
- `pr-export-5-kml-popup-parity.test.ts` — KML internal de Torre Hércules contiene: longDesc, highlight, ubicación territorial, observación, `<img>` con URL pública, enlaces; KML public excluye notas privadas; ningún output contiene `ownerUserId` ni claves de capa H.
- `pr-export-5-csv-flat.test.ts` — columnas planas, sin HTML largo salvo `description`.
- `pr-export-5-geojson-geometry.test.ts` — `geometry` válida + `properties` limpias.
- `pr-export-5-json-richest.test.ts` — JSON es estrictamente superset de CSV/KML/GeoJSON en información estructurada.
- `pr-export-5-gurumaps-html.test.ts` — el HTML KML sólo usa tags whitelisted; no contiene `<script>`, `<style>`, atributos `on*`, ni JSON crudo.
- Grep test reutilizado: ningún serializer importa `GeoLocation` ni emite claves de capa H.

### 8. Docs + memoria + versión

- `docs/contracts/poi-export-content-model.md` (nuevo, canon del modelo por capas + matriz).
- Actualizar `docs/contracts/poi-export-canon.md` §5 con la matriz por capa y referenciar el nuevo contrato.
- Actualizar `mem/logic/export/poi-export-canon.md` con la regla dura "serializers consumen `buildPoiExportContent`, no datos sueltos; capa H forbidden".
- Bump a `v1.5.7` con entrada en `docs/releases/version-history.md` + README.

## Postcondiciones (engineering discipline)

- Tests verdes (suite export completa).
- `APP_VERSION` bumped y `version-parity.test.ts` verde.
- Memoria + contrato sincronizados en el mismo PR.
- Sin tocar archivos fuera de export/serializers/tests/docs.

## Archivos previstos

Creados:
- `src/domains/content/lib/poi-export-content-model.ts`
- `src/domains/content/lib/exporters/kml-description-html.ts`
- `src/test/fixtures/poi-torre-hercules-export.ts`
- `src/test/pr-export-5-content-model.test.ts`
- `src/test/pr-export-5-kml-popup-parity.test.ts`
- `src/test/pr-export-5-csv-flat.test.ts`
- `src/test/pr-export-5-geojson-geometry.test.ts`
- `src/test/pr-export-5-json-richest.test.ts`
- `src/test/pr-export-5-gurumaps-html.test.ts`
- `docs/contracts/poi-export-content-model.md`
- `docs/audits/pr-export-5-popup-parity-torre-hercules.md`

Editados:
- `src/domains/content/lib/poi-export-mapper.ts` (delega en content model)
- `src/domains/content/lib/exporters/poi-kml.ts` (description HTML + ExtendedData enriquecida)
- `src/domains/content/lib/exporters/poi-csv.ts` (nuevas columnas)
- `src/domains/content/lib/exporters/poi-json.ts` (envelope con `content`)
- `src/domains/content/lib/exporters/poi-geojson.ts` (properties enriquecidas)
- `src/domains/content/lib/poi-export-record.ts` (extensión aditiva con `content` por capas)
- `docs/contracts/poi-export-canon.md`, `mem/logic/export/poi-export-canon.md`
- `package.json`, `src/lib/app-version.ts`, `docs/releases/version-history.md`, `README.md` (bump)
