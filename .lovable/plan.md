## Cambios acordados

### 1. Anillo de colección — grosor 1.5px
En `src/index.css` (`.collection-tint-ring`):
- `border: 1.5px solid var(--collection-tint, #ffffff);`
- Default a blanco (no gris `#6b7280`) para que cuando no haya colección con color asignada, el anillo sea blanco.

### 2. "Anillo blanco por defecto" — qué significa
Es solo verificar que cuando una colección está marcada como "Sin color" (sentinel `#ffffff` en `CollectionAppearanceDialog`), o cuando el punto no pertenece a ninguna colección con color, el `collectionTint` que llega a `map-icons.ts` sea blanco (o nulo y se use el fallback blanco del CSS). **No toca lógica nueva**, solo asegurar que el sentinel `#ffffff` se propaga tal cual y el fallback del CSS también es blanco. Sin forzar 3px en ningún sitio.

### 3. Paleta del diálogo
Se mantiene tal como está: opción "Sin color / Por defecto" (blanco con borde discontinuo) ya añadida en `CollectionAppearanceDialog.tsx`. **Sin cambios.**

### 4. Clusters de Leaflet — todos gris claro
En `src/index.css` (líneas 240-259), reemplazar los 3 tonos (verde/azul/naranja) por **un único gris claro** en las 3 clases (`small`, `medium`, `large`):
- Fondo exterior: `rgba(156, 163, 175, 0.5)` (gris claro translúcido)
- Fondo interior (div): `rgba(156, 163, 175, 0.85)`
- Texto del contador: mantener blanco para legibilidad.

Así los clusters dejan de competir visualmente con la paleta de estado de los puntos (verde/gris/naranja).

---

### Ficheros tocados
- `src/index.css` — `.collection-tint-ring` (grosor 1.5px + fallback blanco) y `.marker-cluster-small/medium/large` (gris claro único).

### Ficheros NO tocados
- `src/components/CollectionAppearanceDialog.tsx`
- `src/components/map/map-icons.ts` (no se fuerza ningún borderWidth nuevo)
- `src/shared/components/ui/panel/tokens.css`
