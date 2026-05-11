## Decisiones (basadas en tu medición)

Con cluster activo + 5.073 puntos → 319 nodos DOM. El cluster ya resuelve el problema que canvas intentaba solucionar. Las 3 capas se reordenan así:

---

### 4) Canvas para z0–z9 — **DESCARTADO ahora**

No se implementa. Motivo: premature optimization. El umbral real para que canvas compense es "decenas de miles de puntos visibles **simultáneamente en pantalla**", no en total. Con `maxClusterRadius: 50` eso ocurre muy tarde.

Qué sí hacemos:
- **Documentar el disparador** en `LocationMap.tsx` (comentario + constante `CANVAS_BACKEND_TRIGGER` no usada todavía) con la condición "visibles tras clustering > 5.000 en viewport". Cero código activo.
- Dejar el plan archivado en `mem://architecture/canvas-backend-deferred` para retomarlo si en el futuro un usuario power tiene >50k puntos y nota lag.

Sin cambios de runtime.

---

### 5) Thumbnail en marker — **solo en POI focused/selected, no por zoom**

Regla nueva, transversal (helper único):
- Solo el marker actualmente en estado `focused` o `selected` muestra thumbnail circular (24×24) superpuesto al icono base.
- Independiente del zoom: si está focused a z10, también lo muestra (más útil para encontrarlo de un vistazo).
- Resto de markers: nunca thumbnail en el mapa. La imagen sigue viviendo en popup/galería como hoy.
- Fuente: `loc.user_image_url || enriched_data.imagenes[0]`. Si no hay imagen, no se renderiza nada extra (el marker queda como está).

Implementación:
- Extender `createCustomIcon(loc, { focused, selected })` en `map-icons.ts` para inyectar un `<img>` circular en la esquina superior derecha del divIcon cuando `focused || selected` **y** hay imagen.
- `LocationMap` ya llama a `createCustomIcon` al pasar de un marker a focused/selected (focus-pane lifecycle). Pasar el flag basta — no se necesita refresh global.
- CSS: clase `.poi-thumb { width:24px; height:24px; border-radius:50%; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.4); object-fit:cover; position:absolute; top:-8px; right:-8px }`.

Riesgo: imágenes externas con `crossOrigin` ya están saneadas (memoria `mem://technical/enrichment/image-retrieval-logic`). Si falla la carga, `onerror` esconde el `<img>`.

---

### 6) `disableClusteringAtZoom` — **se mantiene en 16**

No tocar. Quitar cluster en zoom medio sin canvas detrás degradaría zonas densas (Italia, costa francesa). El cluster sigue siendo la representación principal en z<16 y se expande al click — eso ya cumple la regla "ver puntos siempre".

Sin cambios.

---

## Resumen de archivos a tocar

- `src/components/map/map-icons.ts` — añadir thumbnail condicional (focused/selected + imagen).
- `src/index.css` (o el CSS del mapa) — clase `.poi-thumb`.
- `src/components/LocationMap.tsx` — pasar `focused`/`selected` a `createCustomIcon` en los refresh de focus-pane (ya pasa el state hoy, solo verificar la propagación). Añadir comentario `CANVAS_BACKEND_TRIGGER` para el futuro.

## Verificación

1. z10 con un POI con imagen → click → thumbnail aparece arriba-derecha del marker. Sin click, ningún thumbnail.
2. Cambiar focus a otro POI → el thumbnail anterior desaparece, el nuevo aparece.
3. POI sin imagen → click → marker base, sin thumbnail extra, sin huecos.
4. z3 vista global con cluster → ningún thumbnail (cluster oculta markers individuales). Sin regresión de rendimiento.
5. `disableClusteringAtZoom` sigue en 16; verificar que a z16 los markers se separan como hoy.

## Memoria a guardar tras implementación

`mem://style/map/focused-thumbnail-rule` — Thumbnail circular 24×24 SOLO en marker focused/selected, nunca por zoom, helper único `createCustomIcon` con flags. Resto de markers limpios.
