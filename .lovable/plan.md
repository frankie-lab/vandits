## Problema

El popup "Sin localización clara" se desborda del viewport cuando se abre "Contexto cercano" inline.

El contrato canónico (`mem://ui/map/popup-dimensions-and-scrolling`) dice:
- El popup-root tiene `max-height: calc(100vh - top-header - bottom-overlay - …)`.
- El cuerpo desplazable (`.popup-scroll-body` en `map-popups.ts:657`) gestiona **el único scroll** del popup.
- Sin scrollbars anidadas dentro.

Pero `PointContextActions.tsx` (variant `inline`, montado dentro del popup vía `UnenrichedRecoveryBlock` → `NearbyPanel`) está rompiendo el contrato:

- Línea 696: el root inline impone `max-h-[60vh] overflow-hidden`. Esto trunca/expande el bloque a una altura fija que el popup-root no puede comprimir.
- Línea 803: hay un `<ScrollArea className="flex-1 min-h-0 overflow-hidden">` dentro que crea un segundo scroll anidado.
- Línea 937: footer "shrink-0" pegado dentro del ScrollArea, lo que aumenta la altura mínima del bloque.

Resultado: el popup se hace más alto de lo que la fórmula `max-height` permite, porque su hijo inline ya impone una altura mínima/fija ≈ 60vh + header + footer.

## Cambios

Solo en `src/domains/content/components/PointContextActions.tsx`, **únicamente para `variant === 'inline'`**:

1. **Línea 696** — quitar `max-h-[60vh]` y `overflow-hidden` del root inline:
   - Antes: `'flex w-full min-w-0 flex-col overflow-hidden overflow-x-hidden border-t border-border/60 bg-background max-h-[60vh]'`
   - Después: `'flex w-full min-w-0 flex-col overflow-x-hidden border-t border-border/60 bg-background'`
   - El root pasa a fluir con su contenido natural; el `popup-scroll-body` exterior decide cuánto se ve.

2. **Línea 803** — sustituir `<ScrollArea>` por un `<div>` plano cuando la variante es inline:
   - Inline: `<div className="flex-1 min-w-0">…</div>` (sin scroll propio, sin `min-h-0`, sin `overflow`).
   - Variante `card` (no inline) conserva el `<ScrollArea>` actual con `flex-1 min-h-0`.
   - La lista de resultados crece y el scroll del popup la absorbe.

3. **Footer** (línea 937) — en variant inline, dejar `shrink-0` pero quitar `border-t bg-background sticky` si lo hubiera. Como ya no está dentro de un scroll anidado, basta con que sea un bloque normal al final del flujo. (En la variante `card` se mantiene el footer pegado.)

No se tocan: la lógica de "Enriquecer aquí" por fila, los handlers, la query de vecinos, el header, ni el merge mode. Solo se eliminan las constraints de altura/scroll del modo inline.

## Verificación

Tras el cambio:
- Abrir un POI sin localización clara → click en "Contexto cercano".
- El popup debe crecer solo hasta `calc(100vh - …)` y mostrar **una única** scrollbar (la del `popup-scroll-body`).
- Hacer scroll dentro del popup debe revelar todos los resultados de proximidad y el footer "Elige el punto correcto en la lista" sin que el popup salga del viewport.
- La variante `card` (usada en `GalleryView` y `DocumentWaypointsTabs`) debe seguir igual, con su propio `ScrollArea` y footer pegado.
