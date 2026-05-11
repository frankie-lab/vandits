## Objetivo

Dejar **una sola regla de POIs por zoom**, sin ramas paralelas que se contradigan. Restaurar el formato acordado: puntos pequeños → rollover Polaroid con foto Hero → en proximidad el marker se convierte en la foto Hero.

## Regla canónica (frozen)

| Zoom | Modo | Marker | Hover |
|---|---|---|---|
| ≤ 9 | `micro` | Punto plano 5px (color de estado) | — |
| 10-13 | `compact` | SVG plano (sin gradiente, sin health rings, sin tint) | Polaroid sin imagen |
| 14-16 | `standard` | SVG completo (gradiente + health rings + collection tint) | **Polaroid con foto Hero** |
| ≥ 17 | `rich` | **El marker ES la foto Hero** (40px cuadrado, borde de estado). Sin imagen → cae a SVG `standard` | Polaroid con foto Hero |

Modificadores que **NO** cambian la regla, solo añaden capa:
- `isFocused` (1 clic) → pulse + halo, mantiene la forma que dicta el zoom.
- `isSelected` (selección masiva) → halo blanco en `shadow`, nunca cambia forma ni tamaño.
- `collectionTint` → anillo de colección por fuera del marker base.
- `healthRings` → anillos rojo/amarillo/naranja por fuera del tint.
- `isOwn` → halo blanco más marcado + `mine-pane` (capa superior).

## Cambios

### 1. `src/components/map/map-icons.ts`
- **Eliminar** el bloque `showThumb` + `thumbHtml` + `.poi-thumb` (líneas ~176-194 y los dos `${thumbHtml}` insertados en pin/dot).
- Mantener la rama `heroUrl` (modo `rich`) — esa es la regla buena.
- Confirmar que el escape de `micro` es solo por `isFocused` (ya hecho).

### 2. `src/index.css`
- **Eliminar** las reglas de `.poi-thumb` (alrededor de la línea 380) que ya no usa nadie.
- Verificar que `.poi-hover-tooltip__img` solo se muestra con `.map-zoom-standard` / `.map-zoom-rich` (ya está, no se toca).

### 3. Memoria
- Marcar `mem://style/map/focused-thumbnail-rule` como **deprecada** (sustituida por el rollover Polaroid + hero marker en `mem://style/map/zoom-driven-hero`).
- Actualizar `mem://index.md` para sacar la entrada vieja del listado.

### 4. Verificación
- En `LocationMap.tsx` el `zoomend` ya aplica `map-zoom-{micro|compact|standard|rich}` al contenedor y dispara `map-render-mode-changed` para repintar markers.
- Comprobar que `buildHoverTooltipHtml` se cablea en todos los markers (línea 1403, ya está) y que la imagen Hero llega vía `getPointHeroImage`.

## Lo que NO se toca

- La cadena de prioridad de paleta (`getPointVisualState`).
- Los anillos de salud (`getPointHealthRings`).
- El `collection-tint-ring`.
- Las panes `mine-pane` / `others-pane` / `selection-pane`.
- La gating de clustering (sigue desactivado de facto).

## Resultado esperado

- Vista mundial (Francia entera, 699 seleccionados): solo puntitos 5px de color. Cero miniaturas.
- Vista regional (zoom 11-13): círculos planos de color, sin foto, hover muestra solo el nombre.
- Vista local (zoom 14-16): círculos con gradiente + rings, hover Polaroid con foto Hero.
- Vista muy cercana (zoom 17+): el marker es la foto Hero, hover sigue mostrando la Polaroid.

Una sola regla. Sin ramas que la salten.