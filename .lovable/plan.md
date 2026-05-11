## Problema

En `src/components/map/map-icons.ts` el modo `rich` (z≥11) **reemplaza** el marker estándar por la polaroid. La regla canónica es: el POI sigue siendo el dot de color (estado + health rings + collection tint), y la polaroid es solo una **capa añadida** flotando encima.

Además, en la rama actual el placeholder gris (patrón diagonal) se renderiza **siempre** en el DOM aunque haya imagen Hero válida, manchando el área de la foto en el momento previo a que la imagen pinte (y en cualquier zona transparente del `<img>`).

## Cambios

### 1. `src/components/map/map-icons.ts` — la polaroid se añade al dot, no lo sustituye

- Eliminar el `return L.divIcon(...)` temprano de la rama `if (renderMode === 'rich')`.
- En su lugar, dejar que el flujo continúe hasta la rama "Default: small circle" (dot canónico con gradiente, stroke blanco, health rings y collection tint).
- Calcular un `polaroidHtml` cuando `renderMode === 'rich'` (cuadrado redondeado 50×56 con marco blanco, pointer triangular abajo apuntando al dot, foto Hero o placeholder dentro). En el resto de modos, `polaroidHtml = ''`.
- Inyectar `polaroidHtml` como hijo absolute del contenedor del dot, posicionado **arriba** (`position:absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); pointer-events: none`). De este modo:
  - El `iconAnchor` sigue siendo el centro del dot (la coordenada real).
  - `iconSize` no cambia (Leaflet permite que el HTML interno se desborde del bounding box; ya lo hace el tooltip).
  - Click, popup, halo focused y health rings siguen funcionando exactamente como en `compact`/`standard`.
  - El dot canónico es invariante en todas las bandas excepto `micro`.

### 2. Arreglar placeholder superpuesto

En el HTML de la polaroid, renderizar **uno solo** de los dos:

```ts
const photoInner = heroUrl ? photoHtml : placeholderHtml;
```

Y en `onerror` del `<img>` (cuando la imagen falla en runtime), reemplazar el contenido del `__photo` por el placeholder en lugar de superponerlo (vía `parentElement.innerHTML = placeholderSvg`). Ya marcamos el ID en `heroFailedIds` para el siguiente repintado.

### 3. `src/index.css` — ajustes mínimos

- `.poi-hero-marker__wrap` deja de ser el contenedor del marker; pasa a ser solo el wrapper interno de la polaroid flotante.
- Mantener `.poi-hero-marker__card`, `__pointer`, `__photo`, `__img`, `__placeholder`, `__halo` como están (sin tocar tokens ni colores).
- Añadir `pointer-events: none` al wrapper polaroid para que todos los clicks vayan al dot.

## Notas técnicas

- Single source of truth: el dot canónico es siempre el marker. La polaroid es decoración de zoom alto.
- Memoria `mem://style/map/zoom-driven-hero` se actualizará: "a z≥11 el marker añade una polaroid flotante encima; el dot canónico nunca desaparece".
- No tocar tokens `map.json` ni `ZOOM_THRESHOLDS`.
- Cluster, realtime y force-update siguen funcionando porque todo el HTML va en el mismo `divIcon`.
- No se altera la lógica de `getPointHeroImage` ni la paleta de los 3 estados.
