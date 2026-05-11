## Diagnóstico

Revisado el cableado actual (`src/components/map/map-icons.ts`, `LocationMap.tsx`, `map-tooltip.ts`, `index.css`):

1. **El zoom-band sí se calcula y propaga** (`zoomend` → `setCurrentRenderMode` → evento `map-render-mode-changed` → repaint vía `setIcon`).
2. Pero hay **3 huecos** que explican lo que ves:

### Hueco 1 — Cluster oculta la progresión perceptible
En vista global (z≤9) la mayoría de markers están dentro de `MarkerClusterGroup`. Lo que ves son globos de cluster, NO los 5px del modo micro. Al hacer zoom, los clusters se rompen y aparecen markers que ya estaban creados en el band intermedio (compact/standard), por lo que el salto entre bands se nota poco. Además los factores actuales (`compact 0.7 / standard 1.0 / rich 1.15`) producen una progresión demasiado tenue.

### Hueco 2 — El tooltip Polaroid queda "congelado" sin imagen
`marker.bindTooltip(buildHoverTooltipHtml(loc, ownership))` se llama UNA sola vez al crear el marker. Si en ese momento la location todavía no tenía `enrichedData.imagen` (típico para puntos importados sin enriquecer), el HTML del tooltip se baquea SIN `<img>`. Cuando luego se enriquece o cambias de banda, el `setIcon` repinta el marker pero **no rehace el tooltip**, así que la Polaroid sigue sin foto para siempre.

### Hueco 3 — El gating CSS para la imagen funciona, pero solo si la `<img>` existe
`.map-zoom-standard .poi-hover-tooltip__img { display:block }` está bien, pero solo aplica si el `<img>` está en el DOM. Por el hueco 2, en muchos puntos no está.

---

## Plan de cambios (mínimo, transversal)

### A) `src/components/map/map-icons.ts` — amplificar la progresión
- `modeScale`: pasar de `compact 0.7 / standard 1.0 / rich 1.15` a **`compact 0.55 / standard 1.0 / rich 1.35`**.
- Mantener el resto del canon (micro 5px, compact = SVG plano, standard = SVG completo, rich = imagen Hero 40px).
- Sin cambios en paleta, anillos de salud, tint de colección.

### B) `src/components/LocationMap.tsx` — rebuild del tooltip al cambiar de banda
En el handler `map-render-mode-changed` (línea ~1697), tras `marker.setIcon(...)` añadir:
```ts
marker.unbindTooltip();
marker.bindTooltip(buildHoverTooltipHtml(location, ownership), {
  direction: 'top', offset: [0, -12],
  className: 'poi-hover-tooltip-wrap', opacity: 1,
});
```
Esto garantiza que al entrar en standard/rich la `<img>` del Hero aparezca aunque el punto se haya enriquecido después de crear el marker.

### C) `src/components/LocationMap.tsx` — refresco al enriquecer
Hay un useEffect que escucha `recentlyEnrichedIds`/eventos de enriquecimiento y llama `setIcon`. Añadir también el `unbindTooltip + bindTooltip` con el `buildHoverTooltipHtml` actualizado para el id afectado. Mismo helper, sin lógica nueva.

### D) Pequeño refresh del cluster
Tras `setCurrentRenderMode` con cambio de banda, llamar `markerClusterRef.current?.refreshClusters()` para que los markers que asoman al hacer spiderfy hereden el icono correcto.

---

## Lo que NO se toca

- Helper único `createCustomIcon` y los 4 modos (micro/compact/standard/rich) siguen siendo single source of truth.
- `getPointVisualState` (paleta verde/gris/naranja), health rings, collection tint, ownership halo.
- `buildHoverTooltipHtml` y el gating CSS (`.map-zoom-standard/rich .poi-hover-tooltip__img`).
- Lógica de visibilidad (`isLocationVisibleInGlobalMap`), filtros, buckets.

## Verificación

1. Zoom 7 (vista global): puntos micro 5px (en zonas sin cluster).
2. Zoom 12 (regional): círculos pequeños planos, hover Polaroid sin foto.
3. Zoom 15 (local): círculos completos con gradiente + anillos, hover Polaroid **con foto Hero**.
4. Zoom 18 (cercano): marker = foto Hero 40px, hover Polaroid también con foto.
5. Enriquecer un punto en zoom 15 → la Polaroid pasa a mostrar la foto sin recargar.

## Archivos a tocar

- `src/components/map/map-icons.ts` (1 línea: el objeto `modeScale`)
- `src/components/LocationMap.tsx` (handler `map-render-mode-changed` + handler de enriquecimiento + un `refreshClusters`)
