## Problemas detectados (captura)

1. **Placeholder de imagen sobre fotos reales**: aparece el icono de marco de imagen (Lucide) encima de polaroids que sí tienen foto Hero.
2. **Código/markup visible detrás de la polaroid**: se ven trozos de texto/HTML asomando alrededor del marco. Causa probable: el `onerror` inyecta `placeholderHtml` escapado como string dentro del atributo HTML, dejando residuo visible cuando la cadena se rompe.
3. **El triángulo de la polaroid se monta sobre el dot**: el pointer toca/eclipsa el círculo de color del POI. El dot debe seguir siendo claramente un dot.
4. **El dot del POI casi no se ve** debajo de la polaroid.

Todo esto se resuelve **una sola vez** dentro del helper único `createCustomIcon` (`src/components/map/map-icons.ts`) — no hay parches por POI.

## Cambios transversales

### 1. `src/components/map/map-icons.ts` — rama `rich`

- **Polaroid solo si hay foto real**. Calcular `heroUrl = getPointHeroImage(loc, { isOwn })` al inicio. Si `heroUrl` es null → `polaroidHtml = ''` y no se inyecta nada. El POI queda como dot canónico puro (igual que `compact`). Esto elimina de raíz el "placeholder de imagen sobre el POI" para todos los puntos sin foto.
- **Eliminar la rama `placeholderHtml` por completo** dentro de la polaroid: ya no se construye ni se referencia. Esto borra también el string escapado del `onerror`, que es la fuente del "código por detrás" visible.
- **`onerror` simplificado y seguro**: en vez de re-inyectar HTML, el `onerror` solo marca el ID en `heroFailedIds` y oculta el `<img>` (`this.style.display='none'`). En el siguiente repintado por zoom/render-mode, esa imagen ya no entra → no hay polaroid. Cero string-en-atributo.
- **El dot canónico no escala en `rich`**: `modeScale` pasa a `1.0` para `rich` (igual que `compact`). El dot mantiene tamaño consistente y sigue siendo claramente un dot bajo la polaroid.
- **Separación clara entre pointer y dot**: la polaroid se ancla con `bottom: calc(100% + 8px)` (en lugar de 4px). El triángulo deja de tocar el círculo y queda un aire visible entre ambos.

### 2. `src/index.css` — limpieza

- `.poi-hero-marker__photo`: eliminar `background: hsl(var(--muted))`. El marco blanco del card es suficiente fondo; sin foto no hay polaroid en absoluto.
- Marcar como deprecadas (comentadas) `.poi-hero-marker__placeholder` y `.poi-hero-marker__placeholder-icon`. Ya no se generan desde la polaroid.

### 3. Memoria

Actualizar `mem://style/map/zoom-driven-hero`:

> A z≥11 el marker es siempre el dot canónico. Si y solo si hay `heroUrl` real (vía `getPointHeroImage(loc, { isOwn })`), se añade encima una polaroid 50×56 con la foto, separada 8px del dot por el pointer. Sin foto = sin polaroid. El placeholder de imagen ya no se renderiza nunca dentro del marker.

## Por qué es transversal

- Todo vive en `createCustomIcon` (helper único llamado desde `LocationMap` para todos los markers — añadir/actualizar/cluster/realtime).
- `getPointHeroImage` sigue siendo el SoT de "¿hay foto?".
- No se toca paleta, health rings, collection tint, `ZOOM_THRESHOLDS`, tokens ni cluster.
- Cualquier POI nuevo o modificado pasa automáticamente por la nueva regla — no hay listas blancas ni casos hardcodeados.
