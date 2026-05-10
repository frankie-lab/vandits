## Diagnóstico

Sí, es exactamente eso. Lo he confirmado en la base de datos: una de las colecciones a las que pertenece "Medinaceli" es **`FullTrips`** con `color = #ffffff` (blanco puro).

`LocationCollectionChips` aplica el color elegido por el usuario tal cual a tres cosas:
- texto del chip (`color: color`)
- borde (`borderColor: color + '55'`)
- fondo (`backgroundColor: color + '14'`, 8% de opacidad)

Sobre un popup blanco, un chip blanco con borde blanco al 33% y fondo blanco al 8% es literalmente invisible. Lo mismo pasa con cualquier color muy claro (amarillos pálidos, beige, gris muy claro). El mismo problema afecta a popup, ficha lateral y cualquier sitio que renderice este componente — es transversal.

## Solución (transversal)

Cambiar el helper único que decide los colores de un chip de colección para que **garantice contraste mínimo legible** sobre fondo claro, sin perder la identidad cromática elegida por el usuario.

### 1. Helper único de chip de colección

Crear `src/shared/lib/collection-chip-color.ts` con una función única:

```
getCollectionChipColors(rawColor: string | null): {
  text: string;     // color del "#" y del nombre, con contraste garantizado
  border: string;   // borde, con opacidad
  background: string; // fondo, con opacidad
  hashtag: string;  // color del símbolo #
}
```

Reglas:
- Si `rawColor` es nulo o no parseable → usar un gris neutro del sistema de diseño.
- Convertir a HSL. Si la **luminosidad** supera un umbral (p. ej. `L > 70%`), oscurecer hasta caer dentro del rango legible sobre fondo claro (p. ej. `L = 35–45%`), preservando matiz y saturación. Caso extremo: blanco/negro → mapear a gris neutro del diseño.
- Si la saturación es ~0 (grises), forzar el gris del sistema.
- Calcular `border` y `background` a partir del color ya oscurecido (mismas opacidades actuales).
- Devolver siempre valores HSL/HEX listos para usar.

Esto se hace una sola vez y se reutiliza en TODOS los renders de chips.

### 2. Aplicar el helper en el render único

En `LocationCollectionChips.tsx` reemplazar el cálculo inline por una sola llamada a `getCollectionChipColors(c.color)` y aplicar los cuatro valores. Cero lógica de color inline.

Como el popup ya monta este mismo componente via `bindCollectionsMount`, el arreglo es automáticamente transversal: popup del mapa, `GalleryView`, listas, admin, etc.

### 3. Coherencia con el editor de apariencia de colección

En `CollectionAppearanceDialog` (donde el usuario elige el color):
- Mostrar la previsualización del chip usando el mismo helper, para que el usuario vea exactamente cómo se renderizará.
- Opcional: avisar con un texto pequeño si el color elegido se va a oscurecer automáticamente por contraste. No bloquear la elección — sólo informar.

### 4. Tests

Añadir `src/test/collection-chip-color.test.ts`:
- `#ffffff` → texto oscurecido, claramente legible (L ≤ 50%).
- `#000000` → gris neutro.
- color medio (p. ej. `#06b6d4` cian de "Los Pueblos Más Bonitos") → se mantiene casi igual.
- `null` / inválido → gris neutro.
- borde/fondo se derivan del color final, no del original.

## Alcance

- Sólo cambia cómo se traduce el color guardado del usuario a los tres tokens visuales del chip.
- No cambia el color guardado en `collections.color`, ni el render del marcador, ni RLS, ni el flujo de carga.

## Resultado esperado

Los hashtags de colección son **siempre visibles** en el popup y en cualquier vista, independientemente de si el usuario eligió blanco, beige, amarillo pálido, gris claro o cualquier otro color con baja luminosidad de contraste sobre fondo claro, manteniendo la identidad cromática elegida cuando es legible.
