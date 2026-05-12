# Cambio de regla canónica: polaroid siempre en `rich`

## Nueva regla canónica (sustituye a la actual)

A `z ≥ richMin` (`rich` mode), TODOS los POIs muestran polaroid 50×56 flotante 8px sobre el dot canónico:

- **Con foto Hero** (`getPointHeroImage(loc, { isOwn })` → url) → polaroid con `<img>` real.
- **Sin foto Hero** (helper devuelve `null` o el `<img>` falla en runtime) → polaroid con **placeholder = icono de imagen** centrado sobre fondo `hsl(var(--muted))`, mismo marco/pointer/borde de estado.

El dot canónico se mantiene idéntico al de `compact` debajo del pointer en ambos casos. La polaroid es siempre capa decorativa flotante (`pointer-events: none`); el host de click, health rings y collection tint sigue siendo el dot.

Invariantes que NO cambian: 3-state palette, health rings, collection tint, halo de propiedad, `ZOOM_THRESHOLDS`, cluster, realtime, `iconAnchor` = centro del dot.

## Cambios técnicos

### 1) `src/components/map/map-icons.ts` — rama `rich`

Reescribir el bloque `if (renderMode === 'rich')` (líneas ~207–242):

- Calcular `heroUrl` igual que ahora (con `heroFailedIds` + `getPointHeroImage`).
- Construir `polaroidHtml` SIEMPRE (no condicionado a `heroUrl`). Dentro de `.poi-hero-marker__photo`:
  - Si `heroUrl` → `<img class="poi-hero-marker__img" ...>` con el `onerror` actual (marca `heroFailedIds` + `display='none'` + revela el placeholder hermano vía CSS sibling).
  - Renderizar SIEMPRE un hermano `<div class="poi-hero-marker__placeholder">` con SVG de icono imagen (Lucide `image`) inline. Cuando hay `<img>` válido, queda oculto debajo (z-index lower) o detrás del `<img>` que ocupa `inset:0`. Cuando el `<img>` falla y se oculta (`display:none`), el placeholder queda visible automáticamente.
  - Sin foto desde el inicio → no se renderiza `<img>`, solo el placeholder.
- Mantener pointer SVG, `--marker-state-color`, `is-own` class.

### 2) `src/index.css` — restaurar y refinar placeholder

- Devolver `background: hsl(var(--muted))` a `.poi-hero-marker__photo` (como fondo base del marco).
- Reemplazar el bloque comentado por reglas activas:
  ```
  .poi-hero-marker__placeholder {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted));
    border-radius: 8px;
  }
  .poi-hero-marker__placeholder-icon { width: 60%; height: 60%; opacity: 0.7; }
  ```
- El `<img>` con `position:absolute; inset:0` se pinta encima del placeholder; al fallar y aplicar `display:none` el placeholder queda visible sin re-render.

### 3) Memoria — actualizar regla canónica

Reescribir `mem://style/map/zoom-driven-hero` y la línea Core en `mem://index.md` para reflejar:

> A z≥richMin (rich) TODO POI muestra polaroid 50×56 flotante 8px sobre el dot canónico (idéntico al de compact). Con foto Hero → `<img>` real. Sin foto o tras fallo `onerror` → placeholder con icono Lucide `image` sobre fondo muted, mismo marco/pointer/borde de estado. El dot sigue siendo host de click, health rings y collection tint. Helper único `getPointHeroImage(loc, { isOwn })` decide si hay foto. `pointer-events: none` en `.poi-hero-marker--addon`. No volver a variar.

## Archivos tocados

- `src/components/map/map-icons.ts` (rama `rich` + className `has-polaroid` ahora siempre true en rich)
- `src/index.css` (.poi-hero-marker__photo / __placeholder / __placeholder-icon)
- `mem://style/map/zoom-driven-hero` (regla actualizada)
- `mem://index.md` (línea Core "Zoom-driven hero / polaroid")
