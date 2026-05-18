# P-POPUP-6A — Validation: Taxonomy canonical = chips

## Decisión

Taxonomy se representa **sólo como chips** dentro del bloque `case 'etiquetas'`.
El breadcrumb textual del bloque `case 'clasificacion'` queda **eliminado**.

## Cambios aplicados

### `src/components/map/map-popups.ts` — `case 'clasificacion'`

Antes:

- Renderizaba pill con `enriched.clasificacion.codigo` (p.ej. `2.5.x`).
- Renderizaba `categoria_principal + separador + subcategoria` en texto muted.
- Añadía el chip violeta de `cultural_context.type_label` (Wikidata).

Después:

- **Eliminado** el pill `codigo` (metadata interna del catálogo, sin valor para un viewer humano).
- **Eliminado** el breadcrumb textual `categoria_principal + separador + subcategoria`.
- **Mantenido** el chip violeta de `cultural_context.type_label`.
- Si NO hay `cultural_context.type_label`, el `case` retorna `''` y el contenedor `<div>` no se renderiza (no hay shell vacío).

### `case 'etiquetas'` — sin cambios

- Bucket `taxonomy` sigue rendererizándose como chips `#hashtag` con estilo "classification".
- Dedupe `taxonomy ↔ semantic ↔ user` por `tagSlug` exacto se mantiene intacto.
- Caps `POPUP_TAG_CAPS` sin cambios.

## Validación visual esperada

1. Un POI con `clasificacion = { codigo: "2.5.1", categoria_principal, subcategoria, tipo_especifico }` ya NO muestra la línea `2.5.1 Entidades construidas › Recintos`.
2. El mismo POI sigue mostrando los chips `#EntidadesConstruidas` `#Recintos` `#ComplejoRecinto` en la chip row de etiquetas.
3. Un POI con `cultural_context.type_label = "Castle"` sigue mostrando el chip violeta `Castle` (Wikidata) en su slot original.
4. Un POI SIN `clasificacion` y SIN `cultural_context` no renderiza el bloque `clasificacion` (sin div vacío).

## Tests

`src/test/popup-taxonomy-canon-chips.test.ts` (8 tests):

- Static scan: el cuerpo del `case 'clasificacion'` no contiene `enriched.clasificacion.codigo`, `categoria_principal`, `subcategoria`, ni separador `›`.
- Static scan: tiene early return `if (!cc?.type_label) return ''`.
- Static scan: sigue renderizando `cc.type_label` y la marca `Wikidata`.
- Contract: `getCanonicalPopupTags` expone los 3 niveles de taxonomy como bucket `taxonomy`.
- Contract: semantic chip cuyo slug == slug taxonomy queda suprimido.
- Contract: personal tag cuyo slug == slug taxonomy queda suprimido.

Suites relacionadas (verdes, sin cambios): `popup-tags-canonical`, `personal-tags-collection-dedup`, `popup-collection-metadata-line`, `popup-source-metadata`, `popup-tokens-enriched`.

## Migration Impact

Cero. Sin cambios de DB, schema, ni datos persistidos.

## Rollback

`git revert` del PR restaura el bloque `case 'clasificacion'` con pill `codigo`, breadcrumb textual y chip cultural conjuntos. Sin migraciones a revertir.

## Scope NO tocado

- Collections (P-POPUP-4E).
- Source/provenance (P-POPUP-4A).
- Personal tags / personal-collection dedup (P-POPUP-4B).
- `cultural_context` chip (se conserva en su slot — no se mueve a la chip row).
- `placeType` / catálogo `places`.
- `etiquetas_geograficas` (cubierto por P-POPUP-2).
- Notas, estrellas/visited, lifecycle, geo hierarchy, F2, React migration.
- Sin fuzzy matching / sinonimia / alias semánticos.
