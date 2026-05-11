# Hover preview (standard) + marker-foto (rich) — tu spec literal

Aplico tu spec de modos por zoom. Lo que ya existe se mantiene; añado solo lo que falta.

## Estado actual vs spec

| Zoom | Modo | Hoy | Lo que falta |
|---|---|---|---|
| z≤9 | micro | divIcon plano 5px | ok |
| z10–13 | compact | SVG simplificado, sin imagen | ok |
| **z14–16** | **standard** | tooltip de Leaflet con solo nombre | **tooltip con imagen Hero + nombre** |
| **z17+** | **rich** | SVG estado (mismo que standard) | **marker = imagen Hero (28–44px). Sin imagen → "icono de vacío"** |
| focused/selected | — | thumb 24px (regla actual) | se mantiene en compact/standard. **En rich, focused/selected añade halo/pulse sobre la foto, no la sustituye** |

## Decisiones (tu última respuesta literal)

- Hover-preview con imagen Hero solo z≥14 (standard + rich). En compact el marker queda como hoy.
- En rich, el marker **es** la imagen Hero siempre que exista. Sin excepciones por focused/selected: la selección se marca con halo blanco + pulse alrededor del cuadrado.
- "Icono de vacío" cuando no hay imagen Hero en rich = el SVG estándar actual del estado del punto (verde / gris / naranja). No inventamos placeholder nuevo.
- Click → popup (sin cambios a cualquier zoom).
- Color de estado / collection-tint / health rings / ownership se conservan **en los 3 modos** (compact, standard, rich) como capas alrededor.

## Helpers nuevos (transversal)

1. `src/domains/content/lib/point-hero-image.ts` → `getPointHeroImage(loc)`:
   ```
   enrichedData.imagen → customData.user_image_url → null
   ```
   Reemplaza el bloque inline de `map-icons.ts` (líneas 169–173) y se reutiliza desde tooltip y rich-marker.

2. `src/components/map/map-tooltip.ts` → `buildHoverTooltipHtml(loc)`:
   - Con hero: `<div class="poi-hover-tooltip"><img class="poi-hover-tooltip__img" …><div class="poi-hover-tooltip__name">{name}</div></div>`
   - Sin hero: solo `<div class="poi-hover-tooltip__name">{name}</div>`
   - `onerror` oculta la imagen.

## Cambio 1 — Marker rich con foto

`src/components/map/map-icons.ts`, **nueva rama** justo antes de la rama `pin` actual (línea ~190):

```ts
if (renderMode === 'rich') {
  const hero = getPointHeroImage(location);
  if (hero) {
    // Tamaño 40px (medio de tu rango 28–44). containerSize = 40 + ringPad*2.
    // Estructura:
    //   <div style="position:relative; filter:${shadow}${ringShadow}; …">
    //     ${ringsHtml}                              // health rings por fuera
    //     <div style="… inset:${ringPad}px;">
    //       ${collectionTint ? <div class="collection-tint-ring"> : ''}
    //       <img class="poi-hero-marker__img"
    //            src="${hero}" referrerpolicy="no-referrer"
    //            onerror="this.closest('.poi-hero-marker').setAttribute('data-hero-failed','1')">
    //     </div>
    //     ${isFocused || isSelected ? '<div class="poi-hero-marker__halo"></div>' : ''}
    //   </div>
    // Borde 2px con `entry.fill_color` (estado), border-radius 8px,
    // halo blanco extra si isOwn, animationStyle (pulse focused).
    return L.divIcon({ className: 'poi-hero-marker', html, iconSize, iconAnchor, popupAnchor });
  }
  // Sin hero → caer al render estándar (sigue el flujo actual de dot/pin).
}
```

Sobre `data-hero-failed`: si la imagen falla en runtime, no podemos re-pintar desde dentro de un divIcon. Mantenemos un `Set<string>` en memoria en `map-icons.ts` con los IDs cuya hero falló; la próxima llamada a `createCustomIcon` salta la rama hero y devuelve el SVG estándar. El refresh natural por `zoomend`/`map-render-mode-changed` los repinta.

## Cambio 2 — Tooltip hover con hero en standard+rich

En `LocationMap.tsx`, sustituir los dos `marker.bindTooltip(location.name, …)` (líneas 295 y 344) por:

```ts
marker.bindTooltip(buildHoverTooltipHtml(location), {
  direction: 'top',
  offset: [0, -12],
  className: 'poi-hover-tooltip-wrap',
  opacity: 1,
});
```

**Gating por zoom (CSS, sin JS extra):** en el `zoomend` existente (línea 1190), después del `setCurrentRenderMode`, añadir/quitar clase en el contenedor del mapa según el modo:

```ts
const c = mapRef.current.getContainer();
c.classList.toggle('map-zoom-standard', mode === 'standard');
c.classList.toggle('map-zoom-rich', mode === 'rich');
```

CSS en `src/index.css`:
```css
/* Por defecto, el tooltip muestra solo el nombre */
.leaflet-tooltip.poi-hover-tooltip-wrap { padding:6px 8px; background:rgba(20,20,20,0.92); color:#fff; border:0; box-shadow:0 4px 12px rgba(0,0,0,0.35); border-radius:8px; }
.leaflet-tooltip.poi-hover-tooltip-wrap .poi-hover-tooltip__img { display:none; }
/* Solo en standard y rich se enseña la foto */
.map-zoom-standard .leaflet-tooltip.poi-hover-tooltip-wrap .poi-hover-tooltip__img,
.map-zoom-rich     .leaflet-tooltip.poi-hover-tooltip-wrap .poi-hover-tooltip__img {
  display:block; width:200px; height:120px; object-fit:cover; border-radius:6px; margin-bottom:6px;
}
.poi-hover-tooltip__name { font-size:13px; line-height:1.2; }

/* Marker rich con foto */
.poi-hero-marker__img { width:40px; height:40px; object-fit:cover; border-radius:8px; border:2px solid var(--marker-state-color); background:#1a1a1a; display:block; }
.poi-hero-marker[data-hero-failed="1"] .poi-hero-marker__img { display:none; }
.poi-hero-marker__halo { position:absolute; inset:-4px; border-radius:12px; box-shadow:0 0 0 2px rgba(255,255,255,0.95), 0 0 12px rgba(255,255,255,0.4); pointer-events:none; }
```

`--marker-state-color` se setea inline en el wrapper del divIcon: `style="--marker-state-color:${entry.fill_color}"`.

## Lo que NO cambia

- Cluster, `disableClusteringAtZoom`, `getRenderModeForZoom`.
- `getPointVisualState`, `getPointHealthRings`, `collection-tint-ring`, `mine-pane/others-pane`.
- Popup, click handler, ficha completa.
- Thumb 24px en focused/selected dentro de los modos micro/compact/standard (regla `mem://style/map/focused-thumbnail-rule` sigue intacta — el thumb solo desaparece visualmente en rich porque el marker entero ya es la foto).

## Archivos a tocar

- **Nuevo** `src/domains/content/lib/point-hero-image.ts`
- **Nuevo** `src/components/map/map-tooltip.ts`
- `src/components/map/map-icons.ts` — rama rich+hero, migrar lectura de imagen al helper
- `src/components/LocationMap.tsx` — `bindTooltip` por helper (2 sitios), toggle de clases `map-zoom-*` en zoomend
- `src/index.css` — clases `.poi-hover-tooltip*`, `.poi-hero-marker*`
- Memoria: actualizar `mem://style/map/focused-thumbnail-rule` y añadir `mem://style/map/zoom-driven-hero` para registrar la regla nueva
