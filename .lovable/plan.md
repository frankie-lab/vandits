# P-POPUP-9 — Territorial breadcrumbs + collection metadata links

## Diagnóstico actual

- **Header territorial**: `buildGeoHeaderHtml` (`src/shared/popup/geo-header.ts`) emite chips con background `hsl(var(--secondary))`, padding 2x8 y border-radius 12px. Visualmente parecen hashtags/tags. Consumido en `map-popups.ts` L1337 (own-enriched) y L1764 (otra rama legacy con chips azul/verde/ámbar/violeta hardcodeados).
- **Colecciones en metadata**: `buildCollectionsMetadataSegment` (`map-popups.ts` L290) ya devuelve `<span class="collection-filter-chip" data-collection-id … data-collection-name …>` sin pill ni hashtag, con icono `bookmark`. Cumple ya la mayor parte del contrato de Cambio 2; sólo falta confirmar/añadir afordancia visual de link (cursor pointer + underline hover) y verificar que el handler de click filtre por colección.
- **Contrato de filtrado existente**: `.filter-link` + `data-filter-type` + `data-filter-value` ya es consumido por el handler central (`map-popup-handlers.ts`) para `zone | region | country | continent`. NO se modifica ese contrato.

## Decisión de orden (canon nuevo)

**Global → Local**: `Spain › Galicia › A Coruña`.

Justificación: convención editorial (breadcrumb estándar de navegación), facilita lectura "de dónde viene" antes que "qué punto". Se documenta en `mem://style/popup/territorial-breadcrumb` y en `docs/popups/p-popup-9-validation.md`. Inmutable salvo nueva PR.

## Cambios

### 1. Nuevo helper `buildTerritorialBreadcrumbHtml(location)`

Ubicación: `src/shared/popup/geo-header.ts` (mismo módulo, reutiliza `getCanonicalGeoChips`). 

- Reinvierte el orden de `getCanonicalGeoChips` a `country → region → zone → locality` (global→local).
- Render: `<nav data-popup-geo-breadcrumb="1" aria-label="Ubicación">` con elementos `<a>` (para `country/region/zone`) o `<span>` (locality, sin `filterType`) separados por `<span class="popup-breadcrumb-sep" aria-hidden="true">›</span>`.
- Cada link clickable: `class="filter-link" data-filter-type="…" data-filter-value="…" data-geo-level="…"`. Mismo contrato que hoy → cero cambios en handler.
- Estilo inline (sin tokens nuevos): `font-size: 11px; color: hsl(var(--muted-foreground)); text-decoration: none;` + hover `text-decoration: underline; color: hsl(var(--foreground));`. Separador `›` con `opacity: 0.6; margin: 0 4px;`. Wrap natural (`flex-wrap: wrap; row-gap: 2px;`).
- Locality se mantiene NO clickable (mismo motivo que en geo-header actual: handler no soporta `locality`).

### 2. Sustituir consumo en `map-popups.ts`

- **L1337** (own-enriched header): cambiar `buildGeoHeaderHtml(...)` por `buildTerritorialBreadcrumbHtml(location)`. Mantener el wrapper `<div style="margin: 0 0 12px 0;">`.
- **L1764** (rama legacy con chips colorizados continent/country/region/zone): reemplazar bloque entero por una sola llamada a `buildTerritorialBreadcrumbHtml(location)`. Elimina los `background: #e0f2fe / #dcfce7 / #fef3c7 / #f3e8ff` hardcodeados.
- Marcar `buildGeoHeaderHtml` como `@deprecated` (no se borra; otros tests lo cubren y puede haber consumidores que no quiero romper en esta PR). Si el grep confirma sólo los dos consumos detectados arriba + tests, se elimina junto con su test en una PR posterior (P-POPUP-9.1, fuera de scope).

### 3. Colecciones — refinamiento mínimo del link

`buildCollectionsMetadataSegment` ya emite el contrato correcto. Cambios cosméticos:
- Añadir `cursor: pointer; text-decoration: none;` y hover `text-decoration: underline;` al `<span class="collection-filter-chip" …>` (vía estilo inline o regla CSS global en `src/index.css` bajo `.collection-filter-chip`).
- Mantener intactos: `data-collection-id`, `data-collection-name`, `title`, icono bookmark, regla "máx 2 inline + `+N`".
- **Nota fuera de scope**: el handler de click para `.collection-filter-chip` no aparece grepable en `src/`. Se documenta como deuda en `docs/popups/p-popup-9-validation.md` (probablemente vive en un listener global pendiente). Esta PR sólo garantiza el contrato HTML, no introduce nuevo handler.

### 4. Orden metadata (sin cambios estructurales)

Ya implementado por `buildOwnEnrichedMetadataLineHtml`:
```
Añadido dd/mm/yyyy · [colección/es] · vía [source]
```
Sólo se verifica en tests.

## Restricciones (no tocar)

ratings, composer 7A.3, hero chrome, visited/pending, taxonomy, schema, marker grammar, F2, PopupShell. Tampoco el handler `.filter-link` ni la lógica de filtrado.

## Tests

Nuevo archivo `src/test/popup-territorial-breadcrumb.test.ts`:
- Emite elementos en orden `country → region → zone → locality`.
- Cada nivel (excepto locality) lleva `class="filter-link"` y `data-filter-type` correcto.
- Separador `›` aparece entre elementos, no al inicio ni al final.
- Sin background azul/verde/ámbar/violeta hardcodeado (regex de hex).
- Sin `border-radius` en los elementos del breadcrumb.
- Wrap permitido (`flex-wrap: wrap`).

Actualizar `src/test/popup-collection-metadata-line.test.ts`:
- Añadir aserción `cursor: pointer` en el span de colección.

Actualizar/añadir test de integración:
- `buildEnrichedPopupContent` ya NO contiene `buildGeoHeaderHtml` chips (regex contra `background: hsl(var(--secondary))` en zona header).
- Contiene `data-popup-geo-breadcrumb="1"`.

## Documentación y memoria

- **Crear** `docs/popups/p-popup-9-validation.md`: contrato breadcrumb + orden global→local + nota de deuda del handler de colecciones.
- **Crear** `mem://style/popup/territorial-breadcrumb`: regla canónica (orden, contrato HTML, no-chip, link-style).
- **Actualizar** `mem://index.md`: añadir entrada en Memories.
- **Actualizar** `docs/contracts/popup-contract.md`: territorial = breadcrumb, no chips.

## Archivos a editar

1. `src/shared/popup/geo-header.ts` — añade `buildTerritorialBreadcrumbHtml`.
2. `src/components/map/map-popups.ts` — sustituye dos consumos (L1337, L1764) + ajuste cosmético colección (L298 o CSS global).
3. `src/index.css` — regla `.collection-filter-chip` + `.popup-breadcrumb-sep` (opcional si se prefiere CSS sobre inline).
4. `src/test/popup-territorial-breadcrumb.test.ts` — nuevo.
5. `src/test/popup-collection-metadata-line.test.ts` — añadir aserción link-style.
6. `docs/popups/p-popup-9-validation.md` — nuevo.
7. `mem://style/popup/territorial-breadcrumb` + `mem://index.md` + `docs/contracts/popup-contract.md`.

## Criterio de aceptación

- Header sin chips azules territoriales.
- Breadcrumb `Spain › Galicia › A Coruña` visible, link-style, muted, clickable en country/region/zone.
- Click en breadcrumb dispara filtro territorial usando contrato actual.
- Colección clickable, sin hashtag/pill/badge color, en línea metadata.
- Orden metadata: `Añadido dd/mm/yyyy · [colección] · vía [source]`.
- Tests verdes (149 popup + nuevos breadcrumb).
