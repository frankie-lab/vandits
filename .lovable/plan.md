## Objetivo

Cuando el usuario hace click en un POI, el popup debe quedar visualmente **centrado en la zona útil del mapa** (descontando: header superior, barra inferior de progreso, sidebar izquierdo de Usuarios, panel derecho de Documento si está abierto). El usuario sigue pudiendo hacer pan/zoom libre después.

## Diagnóstico

El centrado actual en `LocationMap.tsx` (`centerOpenedPopupInVisibleMap`, líneas 222–271) ya hace la matemática correcta, pero falla por tres motivos:

1. **Race con Leaflet autoPan**: el popup se crea con `autoPan: true` (línea 1694). Leaflet panea para que el popup "asome", y nuestro `panBy` ejecuta a los 120 ms — durante la animación de Leaflet el `getBoundingClientRect()` mide una posición transitoria.
2. **Sidebar izquierdo no detectado**: `UsersSidebar` no expone `data-left-sidebar="true"`, así que `leftPanelWidth = 0` y el centro útil se desplaza a la izquierda.
3. **Timing fijo de 120 ms** insuficiente para popups con tags/imágenes que afectan altura final.

## Cambios

### 1. `src/components/LocationMap.tsx` — `centerOpenedPopupInVisibleMap`

- Quitar el `setTimeout(120)` y reemplazar por dos `requestAnimationFrame` anidados, para esperar a que Leaflet termine layout y el popup tenga tamaño final.
- Verificar estabilidad: medir `popupRect` dos veces seguidas (segundo rAF); si la altura cambió, repetir una vez más (máx 3 intentos) antes de panear.
- Mantener la lógica de insets vía CSS vars (`--top-header-h`, `--bottom-overlay-safe-h`, `--overlay-progress-gap`).
- Bajar el umbral de tolerancia a 4 px para asegurar centrado preciso.

### 2. `src/components/LocationMap.tsx` — opciones del popup (línea 1694)

- Cambiar `autoPan: true` a `autoPan: false`. Nuestro centrado lo sustituye por completo y evita la doble animación.

### 3. `src/components/UsersSidebar.tsx`

- Añadir `data-left-sidebar="true"` al contenedor raíz del sidebar (sólo cuando esté abierto/expandido), para que el helper lo descuente del ancho útil.

### 4. (Opcional, defensivo) Re-centrar tras `popupopen` y tras carga de imágenes

- Adjuntar un listener `load` a las `<img>` dentro del popup que dispare un re-centrado si la altura cambió tras cargar imágenes diferidas. Esto evita que un popup con thumbnail tardío quede descentrado.

## Detalles técnicos

```ts
const centerOpenedPopupInVisibleMap = useCallback(
  (marker: L.Marker, rightPanelWidth = 0) => {
    const map = mapRef.current;
    if (!map) return;

    let attempts = 0;
    let lastHeight = -1;

    const tryCenter = () => {
      const popup = marker.getPopup();
      const el = popup?.getElement();
      if (!popup || !popup.isOpen() || !el) return;

      const rect = el.getBoundingClientRect();
      // Reintenta si aún está midiéndose o si la altura sigue cambiando
      if ((rect.height < 20 || rect.height !== lastHeight) && attempts < 3) {
        lastHeight = rect.height;
        attempts++;
        requestAnimationFrame(tryCenter);
        return;
      }

      const rs = getComputedStyle(document.documentElement);
      const px = (n: string, f: number) => {
        const v = parseFloat(rs.getPropertyValue(n).trim());
        return Number.isFinite(v) ? v : f;
      };
      const topInset = px('--top-header-h', 72);
      const bottomInset = px('--bottom-overlay-safe-h', 0);
      const gap = px('--overlay-progress-gap', 12);

      const leftEl = document.querySelector<HTMLElement>('[data-left-sidebar="true"]');
      const leftW = leftEl ? leftEl.getBoundingClientRect().width : 0;

      const c = map.getContainer().getBoundingClientRect();
      const visCx = (c.left + leftW + (c.right - rightPanelWidth)) / 2;
      const visCy = (c.top + topInset + gap + (c.bottom - bottomInset - gap)) / 2;

      const dx = (rect.left + rect.width / 2) - visCx;
      const dy = (rect.top + rect.height / 2) - visCy;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        map.panBy([dx, dy], { animate: true, duration: 0.35 });
      }
    };

    requestAnimationFrame(() => requestAnimationFrame(tryCenter));
  },
  [],
);
```

Y en las opciones del popup:
```ts
autoPan: false,         // antes: true — evita race con nuestro centrado
autoPanPadding: ...     // se mantiene por defensa, pero ya no aplica
```

En `UsersSidebar.tsx`, añadir `data-left-sidebar="true"` al `<aside>`/contenedor raíz (sólo cuando `isOpen`).

## Fuera de alcance

- No se toca lógica de negocio, ni filtros, ni store.
- No se cambia el ancho/altura del popup ni su contenido.
- No se modifica el comportamiento de pan/zoom posterior del usuario.
