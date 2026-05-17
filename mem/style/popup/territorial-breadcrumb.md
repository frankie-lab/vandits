---
name: Territorial breadcrumb (P-POPUP-9)
description: Header territorial del popup = breadcrumb global→local muted, no chips. Colección = link textual con cursor pointer, sin pill/hashtag/badge color.
type: design
---

# Contrato — Territorial breadcrumb en popup

## Orden canónico

**Global → Local**: `Country › Region › Zone › Locality`.
Ejemplo: `Spain › Galicia › A Coruña (provincia) › A Coruña`.

Inmutable salvo nueva PR.

## Helper único

`buildTerritorialBreadcrumbHtml(loc)` en `src/shared/popup/geo-header.ts`.
Reutiliza `getCanonicalGeoChips(loc)` y reinvierte (chips llegan local→global).

## Reglas visuales

- Sin chip, sin background, sin border-radius.
- `font-size: 11px`, `color: hsl(var(--muted-foreground))`.
- Separador `›` con `opacity: 0.6`, márgenes 4px.
- Hover → underline.
- Wrap natural; sin scroll horizontal.

## Contrato de filtrado

`class="filter-link"` + `data-filter-type` + `data-filter-value`. Niveles clickables: `country`, `region`, `zone`. Locality es `<span>` (handler no soporta `locality`).

## Colecciones

Helper único: `buildCollectionsMetadataSegment`. Render link textual:
- `class="collection-filter-chip"`, `data-collection-id`, `data-collection-name`.
- Sin hashtag, sin pill, sin color de badge.
- `cursor: pointer`, underline en hover.
- Máx 2 inline + `+N`.

## Orden de la línea metadata

`Añadido dd/mm/yyyy · [colección/es] · vía [source]`.

## Tests guardrail

`src/test/popup-territorial-breadcrumb.test.ts` + aserción `cursor: pointer` en `popup-collection-metadata-line.test.ts`. Fallan si:
- aparece background hex o `hsl(var(--secondary))` en el breadcrumb,
- aparece `border-radius` en el breadcrumb,
- el orden no es global→local,
- locality es clickable,
- el separador `›` queda al inicio o al final.
