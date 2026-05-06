## Diagnóstico

En `src/components/map/map-icons.ts` el estado `selected` aplica `getStateColor()` al `fill_color` (relleno) y `getStateColor()` al `baseColorLight` del gradiente. Eso es lo que tiñe los puntos seleccionados de morado/violeta y rompe la lectura de la paleta de estado (verde/gris/naranja).

```ts
const currentState = isRecentlyEnriched ? 'recent'
  : isFocused ? 'focused'
  : isSelected ? 'selected'   // ← este caso pinta encima del color base
  : 'normal';
const applyStateColor = (hex) => currentState === 'normal' ? hex : getStateColor(hex, currentState, stateRules);
```

## Cambio propuesto (mínimo, transversal)

En `map-icons.ts`, tratar `selected` como visualmente **sutil** sin alterar el color de estado:

1. `applyStateColor` deja pasar el `hex` original cuando `currentState === 'selected'` (igual que en `'normal'`). Solo `focused` y `recent` siguen tiñendo.
2. Para que la selección siga siendo perceptible, en `selected`:
   - `stroke="white"` con `stroke-width="2"` (en lugar de 1px) en pin y círculo.
   - `filter` añade un halo blanco fino: `drop-shadow(0 0 0 1.5px rgba(255,255,255,0.95)) drop-shadow(0 1px 3px rgba(0,0,0,0.35))`.
3. `focused` y `recently-enriched` permanecen idénticos (sí pueden modular color porque son acciones puntuales del usuario sobre 1 punto, no masivas).

Resultado: al seleccionar 890 puntos en el filtro, los marcadores conservan verde/gris/naranja y solo se distinguen con un anillo blanco un poco más grueso. Sin morado.

## Archivos a editar

- `src/components/map/map-icons.ts` (única fuente del icono).

## Verificación

1. Abrir Buscar y Filtrar → seleccionar Italy. Los 890 puntos siguen verdes/grises (no se vuelven morados); se aprecia un borde blanco ligeramente más grueso.
2. Click sobre un punto (`focused`): conserva su animación y tinte de foco.
3. Recién enriquecido: conserva la celebración.
