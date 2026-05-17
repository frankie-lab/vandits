# P-POPUP-9 — Territorial breadcrumbs + collection metadata links

**Status**: Ratified · **Date**: 2026-05-17

## Objetivo

Sustituir los chips territoriales tipo hashtag/tag por una cadena de **breadcrumbs ligera, clickable y muted** que exprese jerarquía geográfica real. Mantener las **colecciones** como links de filtro discretos en la línea metadata.

## Canon nuevo del header

```
Hero
Título
Breadcrumb territorial         ← P-POPUP-9
Línea metadata: fecha · colección(es) · vía source
Extracto / descripción / rating / observación
```

## Cambio 1 — Breadcrumb territorial

### Orden canónico

**Global → Local**:
```
Spain › Galicia › A Coruña (provincia) › A Coruña
```

Justificación: convención editorial estándar; el lector entiende primero el contexto general y baja a lo específico. **Inmutable salvo nueva PR**.

### Contrato HTML

Helper único: `buildTerritorialBreadcrumbHtml(loc)` en `src/shared/popup/geo-header.ts`.

```html
<nav data-popup-geo-breadcrumb="1" aria-label="Ubicación" style="display:flex; flex-wrap:wrap;...">
  <a href="#" class="filter-link popup-breadcrumb-link"
     data-filter-type="country" data-filter-value="Spain"
     data-geo-level="country" style="font-size:11px; color:hsl(var(--muted-foreground));...">Spain</a>
  <span class="popup-breadcrumb-sep" aria-hidden="true">›</span>
  <a href="#" class="filter-link popup-breadcrumb-link"
     data-filter-type="region" ...>Galicia</a>
  <span class="popup-breadcrumb-sep" aria-hidden="true">›</span>
  ...
  <span data-geo-level="locality">A Coruña</span>
</nav>
```

### Reglas de estilo

- **No chip, no background, no border-radius.**
- Texto pequeño (`font-size: 11px`), `color: hsl(var(--muted-foreground))`.
- Hover: underline + foreground (CSS opcional; aceptamos sólo el cambio de color por defecto, underline puede llegar vía regla global).
- Separador: `›` con `opacity: 0.6`, márgenes 4px.
- Wrap natural (`flex-wrap: wrap; row-gap: 2px`). Sin scroll horizontal.

### Contrato de filtrado

Reutiliza el contrato existente `.filter-link` + `data-filter-type` + `data-filter-value`. **Cero cambios** en `map-popup-handlers.ts`. Niveles clickables: `country`, `region`, `zone`. `locality` se renderiza como `<span>` (handler no soporta `locality`).

## Cambio 2 — Colecciones en metadata

Helper único: `buildCollectionsMetadataSegment(loc)` en `src/components/map/map-popups.ts`.

```html
<span data-popup-collections-meta="<id>" style="display:inline-flex; gap:4px; color:hsl(var(--foreground));">
  <svg .../>  <!-- icono bookmark -->
  <span>
    <span class="collection-filter-chip"
          data-collection-id="..." data-collection-name="..."
          title="Colección: ..." style="cursor:pointer;...">Atlas Obscura España</span>
  </span>
</span>
```

- **Sin** hashtag visual, **sin** pill/chip, **sin** color de badge de colección.
- Estilo link textual: `cursor: pointer`, underline en hover.
- Contrato `data-collection-id` / `data-collection-name` **preservado**.
- Máx 2 inline; del 3º en adelante `+N` con `title` listando los restantes.

### Deuda conocida (out of scope P-POPUP-9)

El handler de click para `.collection-filter-chip` no aparece grepable en `src/` (a fecha de esta PR). El contrato HTML está garantizado; el wiring del click queda como deuda menor para una PR siguiente (P-POPUP-9.1).

## Cambio 3 — Orden metadata

```
Añadido dd/mm/yyyy · [colección/es] · vía [source]
```

Ya implementado por `buildOwnEnrichedMetadataLineHtml`. Esta PR sólo verifica.

## Restricciones

No tocar: ratings, composer 7A.3, hero chrome, visited/pending, taxonomy, schema, marker grammar, F2, PopupShell, handler `.filter-link`, lógica de filtrado.

## Tests

- `src/test/popup-territorial-breadcrumb.test.ts` (8 tests): orden global→local, filter-link en country/region/zone, locality no clickable, separador `›` correcto, ausencia de background/border-radius, color muted, wrap, contenedor canónico.
- `src/test/popup-collection-metadata-line.test.ts`: aserción adicional `cursor: pointer` en `.collection-filter-chip`.

Resultado: 28/28 tests verdes.

## Archivos modificados

1. `src/shared/popup/geo-header.ts` — añade `buildTerritorialBreadcrumbHtml`.
2. `src/components/map/map-popups.ts` — sustituye dos consumos de `buildGeoHeaderHtml` (own-enriched + rama legacy) y refina `.collection-filter-chip` a link-style.
3. `src/test/popup-territorial-breadcrumb.test.ts` — nuevo.
4. `src/test/popup-collection-metadata-line.test.ts` — aserción de link-style.
5. `docs/popups/p-popup-9-validation.md` — este documento.
6. `mem://style/popup/territorial-breadcrumb` — regla canónica.

## Status legacy

`buildGeoHeaderHtml` permanece exportado y testeado (su test sigue validando el contrato antiguo de chips). No tiene consumidores en `map-popups.ts` después de P-POPUP-9. Eliminación definitiva en P-POPUP-9.1 si no aparecen nuevos consumidores externos.
