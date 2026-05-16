# P-POPUP-4E — Validación

## Resumen

Las colecciones del POI se renderizan ahora **inline en la línea metadata**
(junto a la fecha "Añadido …"), con icono Lucide `bookmark` + nombre legible,
en `foreground` normal. Sin chips, sin pills, sin hashtags, sin color de
colección.

El bloque de chips flotantes (`buildCollectionChipsPlaceholder`) queda como
no-op para preservar la API pero sin inyectar DOM.

`vía …` permanece reservado exclusivamente a provenance/source externo.

## Formato canónico

```
Añadido 05/05/2026 · [bookmark] Atlas Obscura España
Añadido 05/05/2026 · [bookmark] FullTrips, Atlas Obscura España
Añadido 05/05/2026 · [bookmark] FullTrips, Atlas Obscura España +1
Añadido 05/05/2026 · [bookmark] FullTrips · vía Atlas Obscura
```

Reglas:

- Orden inmutable: `fecha · colección(es) · vía <provenance>`.
- Inline máximo 2 colecciones (`COLLECTIONS_INLINE_MAX = 2`).
- A partir de la 3ª → `+N` con `title` listando los nombres restantes
  separados por `, `.
- Nombre = `collection.name` legible (no slug, sin transformación).
- Datasets canónicos en cada nombre: `class="collection-filter-chip"`,
  `data-collection-id`, `data-collection-name`.

## Distinción visual y semántica

| Eje         | Collection                                     | Provenance (`vía`)              |
| ----------- | ---------------------------------------------- | ------------------------------- |
| Etiqueta    | icono `bookmark` + nombre                      | literal `vía` + `<chip>`        |
| Origen dato | `collection_items` (decisión del usuario)      | `sourceKind`/`sourceId`/`groupId` |
| Color       | `hsl(var(--foreground))` plano                 | `hsl(var(--muted-foreground))` |
| Forma       | texto inline                                   | chip con `.source-filter-chip`  |

## Cambios de código

- `src/components/map/map-popups.ts`
  - Nuevo helper privado `buildCollectionsMetadataSegment(location)`.
  - `buildCollectionChipsPlaceholder` → no-op (`return ''`).
  - Integración en `buildOwnAddedLineHtml`,
    `buildOwnEnrichedMetadataLineHtml`, `buildSourceMetadataLineHtml`.

Sin tocar:

- `LocationCollectionChips`, `GalleryView`.
- source/provenance pipeline upstream.
- notas, estrellas/visited, geo hierarchy, lifecycle, F2.
- React migration, cámara/subset-fit.
- Store `location-collections-store` (API intacta).

## Tests

`src/test/popup-collection-metadata-line.test.ts`:

1. Segmento vacío sin colecciones.
2. Nombre legible (no slug) + icono bookmark + foreground.
3. Datasets canónicos para filtro.
4. Inline ≤ 2 colecciones.
5. `+N` desde la 3ª con `title` de restantes.
6. Integración en `buildOwnAddedLineHtml` con separador `·`.
7. Línea sin colecciones no añade separadores extra.
8. Orden `fecha · colección · vía` en `buildOwnEnrichedMetadataLineHtml`.
9. `buildCollectionChipsPlaceholder` siempre `''` (con y sin colecciones).

Tests existentes que deben seguir verdes:

- `personal-tags-collection-dedup.test.ts` (P-POPUP-4B): el dedup sigue
  vigente — la regla `slug(tag) == slug(collection)` no depende de cómo se
  renderice la colección.
- `popup-source-metadata.test.ts` (P-POPUP-4A): provenance preserva su
  contrato.

## Migration Impact

Cero. No hay cambios de DB, schema, ni datos persistidos.

## Rollback

`git revert` del PR:

- Restaura `buildCollectionChipsPlaceholder` como fila de hashtags flotantes.
- Elimina el segmento inline de la línea metadata.
- Borra los tests P-POPUP-4E.

Sin migraciones a revertir.

## Validación manual

1. Hard refresh del preview.
2. Abrir popup de un POI con colección (ej. `#AtlasObscura_España`,
   `#fulltrips`).
3. Verificar que NO aparece como chip/hashtag flotante.
4. Verificar que aparece en la línea metadata tras la fecha con icono
   `bookmark` y nombre legible en foreground.
5. Para POIs con ≥3 colecciones, verificar `+N` y tooltip listando las
   restantes.
