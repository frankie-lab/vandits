# P-POPUP-10 — Editorial popup reading style

Cambios **sólo de estilo y ritmo tipográfico**. Orden canónico, helpers, contratos, handlers, schema, taxonomy, ratings, hero, visited y composer 7A.3 NO se tocan.

## Diagnóstico

Bloques implicados (ya en su sitio):

```
hero
├─ título            (map-popups.ts L1328–1333)
├─ breadcrumb        (geo-header.ts buildTerritorialBreadcrumbHtml)
├─ metadata line     (buildOwnEnrichedMetadataLineHtml / buildSourceMetadataLineHtml)
├─ punto_destacado   (switch case L1438)
├─ descripcion       (switch case L1445)
├─ enrichmentRating  (composer 7A.3)
├─ userPersonalState (composer 7A.3)
└─ observacion       (switch case L1460)
```

Problemas visuales actuales:
- Título pegado al breadcrumb (margin-bottom 4px).
- Breadcrumb correcto pero su contenedor mete 12px y compite con metadata line.
- Metadata line tiene icono reloj + chips de provenance todavía pesados; debería leerse como byline.
- `punto_destacado` legible pero sin aire editorial (line-height 1.45, padding tight).
- `descripcion` renderiza un eyebrow "Descripción" en uppercase + contador de caracteres → ruido técnico que rompe la lectura editorial.
- `observacion` arrastra el mismo eyebrow uppercase.

## Cambios

### 1. Header — título con aire (`map-popups.ts` L1328–1339)

- Subir `margin-bottom` del wrapper de `<h3>` de `4px` → `10px`.
- Aumentar `line-height` del título de `1.3` → `1.2` con `letter-spacing: -0.01em` (más editorial, menos UI).
- Mantener `FONT.title` / `font-weight: 700`.

### 2. Breadcrumb territorial (`src/shared/popup/geo-header.ts` `buildTerritorialBreadcrumbHtml`)

Ya es link textual muted sin background. Refinamiento:
- Bajar `font-size` de `11px` → `text-micro` equivalente (`11px` ya, mantenemos) pero subir `letter-spacing: 0.01em` y `line-height: 1.5`.
- `<a>`: añadir `border-bottom: 1px solid transparent` y en hover `border-bottom-color: hsl(var(--muted-foreground) / 0.4)` para que el underline sea discreto y no `text-decoration: underline` plano.
- Separador `›`: bajar `opacity` `0.6` → `0.45`.
- Wrapper `<nav>`: añadir `margin-bottom: 6px` (separa del título y le da aire al byline siguiente).

Sin cambios de estructura, atributos o contrato `.filter-link`.

### 3. Metadata line (byline) — `buildOwnEnrichedMetadataLineHtml` (L701–739) + `buildCollectionsMetadataSegment` (L290–306)

Convertir en byline editorial:
- En `buildOwnEnrichedMetadataLineHtml`:
  - Quitar el `<svg>` del reloj (línea 733–736). Una byline no lleva icono.
  - Wrapper: `font-size: 11px` se mantiene; añadir `font-style: italic` SOLO al texto "Añadido dd/mm/yyyy" (envolver `datePart` en `<span style="font-style: italic;">`).
  - `color: hsl(var(--muted-foreground))` ya está.
  - Subir `margin-bottom` de `${CARD.sectionGap}px` (12px) → `14px` para crear respiro antes del extracto.
- En `buildCollectionsMetadataSegment`:
  - Quitar el `BOOKMARK_SVG` (línea 286 + uso L305). Colección queda como link textual puro.
  - Mantener `.collection-filter-chip`, atributos `data-collection-*`, hover underline. Aplicar mismo patrón `border-bottom` discreto que el breadcrumb (en lugar de `text-decoration`).
  - Color: cambiar `hsl(var(--foreground))` (L305) → `hsl(var(--muted-foreground))` para igualar registro byline.
- Provenance chips (`buildSourceChipSpan`): NO se tocan en lógica; sólo se asegura que el wrapper byline herede `color: muted` y los chips ya muted se vean homogéneos. Si visualmente quedan como pills, se documenta como tarea siguiente (fuera de scope si requiere tocar `buildSourceChipSpan`).

Resultado:
```
Añadido 12/05/2026 · Sendas del norte · vía Atlas Obscura
```
Sin reloj, sin bookmark, sin pill.

### 4. Extracto destacado — `case 'punto_destacado'` (L1438–1443)

- Subir `padding` `8px 12px` → `12px 16px`.
- `line-height: 1.45` → `1.6`.
- `font-size: FONT.body` (14px) → mantener; `font-weight: 500` → `font-weight: 500` (igual) pero añadir `font-style: italic` para que se lea como entradilla editorial.
- `margin-bottom`: `${CARD.sectionGap}px` (12) → `16px`.
- `border-left` y `bgColor` (HIGHLIGHT.\*) se mantienen.

### 5. Descripción — `case 'descripcion'` (L1445–1458)

- **Eliminar el eyebrow uppercase "Descripción"** (L1449). Es ruido técnico, una ficha editorial no rotula el cuerpo.
- **Eliminar el contador "N caracteres"** (L1453). Idem.
- Párrafos vía `descriptionToHtmlParagraphs`: subir
  - `margin: 0 0 8px 0` → `margin: 0 0 12px 0` (separación entre párrafos).
  - `line-height: 1.625` → `1.7`.
  - Añadir `letter-spacing: 0.005em`.
- Wrapper: añadir `margin: 4px 0 16px 0` (aire arriba/abajo natural).
- Mantener `class="vandits-description-body"` y `color: COLOR.bodyText`.

### 6. Observación — `case 'observacion'` (L1460–1466)

- Eliminar eyebrow uppercase "Observación" (L1464).
- Reemplazar por prefijo inline italic `<span style="font-style: italic; color: muted; margin-right: 6px;">Nota:</span>` al inicio del `<p>` (mismo registro editorial que un aside de blog).
- `line-height: 1.5` → `1.65`.
- `padding: 8px 12px` → `12px 14px`.

### 7. Bloques posteriores (rating + personal state)

- NO se toca composer 7A.3.
- NO se toca `buildEnrichmentRatingBlock` ni `buildPersonalStateBlock`.
- Sólo asegurar que el `margin-top` del primer fragment post-descripción respire: añadir un wrapper neutral `<div style="margin-top: 4px;">` alrededor de `enrichmentRatingFragment` en el composer SI y SÓLO SI no rompe ningún test 7A.\*. Si rompe, omitir y dejar el ritmo a los `sectionGap` existentes.

## Restricciones honradas

- Orden canónico: intacto.
- Composer 7A.3: intacto (excepto wrapper de margen opcional).
- Ratings, handlers, schema, taxonomy, collections logic, provenance logic, marker grammar, F2, PopupShell, hero chrome, visited/pending: intactos.
- Atributos data-\*, clases `.filter-link` / `.collection-filter-chip`: intactos.

## Tests

Actualizar / añadir asserts en:

- `src/test/popup-territorial-breadcrumb.test.ts`: confirmar separador `›` con `opacity: 0.45` y ausencia de `text-decoration: underline` plano en hover (sólo `border-bottom`).
- `src/test/popup-collection-metadata-line.test.ts`:
  - assert `NO contiene` el `BOOKMARK_SVG` (`<path d="m19 21-7-4-7 4V5...`).
  - assert color del wrapper = `hsl(var(--muted-foreground))`.
- Nuevo `src/test/popup-editorial-style.test.ts`:
  - descripción NO contiene `>Descripción<` eyebrow.
  - descripción NO contiene `caracteres</span>`.
  - observación NO contiene `>Observación<` eyebrow; SÍ contiene `Nota:`.
  - metadata line NO contiene `<circle cx="12" cy="12" r="10"/>` (icono reloj fuera).
  - `punto_destacado` contiene `font-style: italic` y `line-height: 1.6`.

## Documentación + memoria

- Nuevo: `docs/popups/p-popup-10-validation.md` (canon visual editorial + before/after).
- Nuevo memory `mem://style/popup/editorial-reading-style` con la regla "byline sin iconos, descripción sin eyebrows, breadcrumb sin underline plano".
- Update `mem://index.md` (entry nueva en Memories).
- Update `docs/contracts/popup-contract.md` con sección "Editorial reading style v1".

## Out of scope

- Refactor de `buildSourceChipSpan` (provenance chips) — si visualmente persiste el aspecto pill tras vaciar el wrapper, queda como P-POPUP-10.1.
- Tipografía global (`--font-display` para títulos del popup) — riesgo de drift con card preview.
- Cualquier cambio en `formatDescription` / `descriptionToHtmlParagraphs` más allá del estilo inline pasado por argumento.
