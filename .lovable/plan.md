## Polaroid marker desde z≥11

Bajar el umbral de la imagen Hero como marker: desde **z=11** (vista metro/ciudad) y todos los zooms superiores, cada POI se pinta como un **polaroid clásico** con la imagen Hero o un **placeholder gris con icono de foto** si el punto no tiene imagen.

### 1. Token de zoom (single source of truth)

`src/design-system/tokens/source/map.json` → bajar `richMin` de **17 → 11**.
Rebuild tokens (`npm run build:tokens`) propaga a `tokens.css`, `tokens.ts` y Tailwind. La rama `renderMode === 'rich'` en `map-icons.ts` se activa automáticamente desde z11.

`heroMin` (14) se baja también a 11 para que el hover-tooltip polaroid y el marker polaroid coincidan en la misma banda.

Actualizar `mem://style/map/zoom-driven-hero` para reflejar el nuevo umbral.

### 2. Placeholder cuando no hay imagen

Hoy, en `rich` sin `heroUrl`, el código cae al SVG dot/pin estándar. Pasa a devolver siempre el `divIcon` polaroid:

- Si hay `heroUrl` → `<img>` como ahora.
- Si no → `<div class="poi-hero-marker__placeholder">` con icono `ImageIcon` Lucide (inline SVG, color `hsl(var(--muted-foreground))`, fondo gris muy claro y patrón sutil de líneas diagonales para look "foto vacía").

El icono se inyecta como SVG hardcodeado en el HTML del divIcon (mismo patrón que el resto de markers; Lucide no se puede importar a un string de divIcon, así que se copia el path del icono `image` de Lucide).

### 3. Estilo polaroid clásico

Reescribir `.poi-hero-marker` en `src/index.css`:

```text
┌────────────┐  ← marco blanco 3px arriba/izq/dcha
│            │
│   IMAGEN   │  ← 40×40 (imagen) o placeholder
│            │
├────────────┤
│            │  ← franja blanca inferior ~10px (caption strip)
└────────────┘
   sombra suave abajo
```

- Tamaño total: **46×56** (40 imagen + 3px marco + 3px marco + 10px franja inferior).
- `background: hsl(var(--background))` (blanco en light, papel oscuro respeta theme).
- `border-radius: 2px` (look fotográfico, no redondeado tipo card).
- `box-shadow: 0 2px 6px hsl(var(--foreground) / 0.18)`.
- Borde de **color de estado** (`--marker-state-color`) como `outline: 1px solid` ALREDEDOR del marco blanco — apenas perceptible pero respeta semántica verde/gris/naranja.
- Health rings (rojo/amarillo/naranja) se siguen apilando como `drop-shadow` por fuera del polaroid (helper existente, no cambia).
- Collection tint, halo de focus, recently-enriched y `is-own`: se conservan tal cual; solo se reposicionan al nuevo tamaño.

`iconAnchor` pasa a `[heroSize/2, 40]` (ancla en el centro de la imagen, no en el centro del polaroid) para que el polaroid "cuelgue" del punto geográfico de forma natural.

### 4. Banda compact (z10-13): comportamiento residual

El umbral nuevo (z11) hace que la banda `compact` quede en z10. A z10 se sigue pintando el marker estándar (dot/pin) como hasta ahora — sin cambios. Eso da una transición limpia: z≤9 micro 2px → z=10 dot → z≥11 polaroid.

### 5. Performance

A z11 sobre Madrid hay ~80-150 puntos visibles tras clustering (capturado en el screenshot). Polaroid es un `<div>` con `<img>` lazy por el navegador. El `CANVAS_BACKEND_TRIGGER` (>5k markers tras cluster) sigue sin activarse. Sin impacto.

### 6. Sin cambios en

- `getPointVisualState`, `getPointHealthRings`, `getPointHeroImage` — siguen siendo el SoT.
- Hover tooltip de map-tooltip.ts (sigue mostrando polaroid grande al hover sobre el marker pequeño en banda compact, irrelevante desde z≥11 porque el marker YA es polaroid).
- Clustering, popup, panels.

### Archivos a tocar

```text
src/design-system/tokens/source/map.json        # richMin 17→11, heroMin 14→11
src/components/map/map-icons.ts                 # rama heroUrl → siempre polaroid con placeholder fallback
src/index.css                                   # .poi-hero-marker rediseño polaroid + .poi-hero-marker__placeholder
mem://style/map/zoom-driven-hero                # actualizar regla canónica
```
