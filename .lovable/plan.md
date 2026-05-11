## Diagnóstico

El bloque de recuperación (con los candidatos "Usar nombre" / "Mover aquí") **sí se monta** la primera vez que se abre el popup, pero queda destruido casi inmediatamente.

Causa raíz en `src/components/LocationMap.tsx`:

- `bindRecoveryMount` solo escucha `popupopen` y monta el React root dentro de `<div data-recovery-root="...">` cuando se abre el popup.
- Después, el popup se **regenera entero** vía `marker.setPopupContent(createPopupContent(...))` en varios sitios:
  - Línea 1426 (suscripción a `subscribeLocationCollections`) — se dispara incluso al abrir el popup, porque `primeCollectionsForLocations([id])` llama al store y éste notifica.
  - Línea 1458 (efecto que regenera todos los popups cuando cambia `locations`) — se dispara con cada update del store, incluido el `updateLocationInStore` que hace `triggerEnrichLocation` al registrar el fallo.

Cada `setPopupContent` reemplaza el HTML completo del popup, incluido el host `[data-recovery-root="…"]`. El `Root` de React queda referenciando un nodo desconectado del DOM, y el host nuevo nunca recibe `popupopen`, así que **el bloque no se vuelve a montar**. Resultado: el usuario no llega a ver los candidatos.

Esto explica por qué en el popup de "Stone House" (no enriquecido, debería mostrar el bloque base + la lista de candidatos tras un rechazo por coherencia) no aparece nada entre la descripción y los botones inferiores.

## Plan

Centralizar el montaje del bloque de recuperación para que **sobreviva a cualquier `setPopupContent`**.

### 1. Reescribir `popup-recovery-mount.ts` para observar el popup

- Mantener `bindRecoveryMount(marker, getLocation)` como helper único (regla transversal).
- Sustituir el listener `popupopen → query → render` por una estrategia robusta:
  - En `popupopen`: localizar el elemento del popup, crear un `MutationObserver` sobre su subtree y guardar el `Root` actual + el host activo en un mapa `marker → { observer, root, host }`.
  - Helper interno `mountInto(popupEl)`:
    1. Busca `[data-recovery-root="<id>"]` dentro del popup.
    2. Si no existe, no hace nada.
    3. Si es un host distinto al actual (porque `setPopupContent` lo reemplazó), desmonta el root viejo y crea uno nuevo en el host nuevo, renderizando `<UnenrichedRecoveryBlock location={...} variant="card" />`.
  - El observer llama a `mountInto` con `subtree: true, childList: true`, así cada regeneración del HTML reattacha el bloque automáticamente.
  - En `popupclose`: desconectar observer, desmontar root y limpiar el registro (con `setTimeout(0)` como hoy para evitar el warning de React).

Resultado: el bloque vive lo que viva el popup, sin acoplarse a quién regenere el HTML.

### 2. Verificación

- Abrir popup de un punto no enriquecido → debe verse la barra "Sin enriquecer" con Reintentar / Contexto cercano.
- Pulsar "Enriquecer" y forzar el rechazo por coherencia (caso `Isola Bella` con coordenadas a 1054 km) → la barra debe pasar a ámbar con el texto del error y debajo la **lista de candidatos** con acciones "Usar nombre" / "Mover aquí" + "Ignorar conflicto y enriquecer igual", encabezada por "Candidatos cercanos" o "Misma identidad, coordenadas distintas".
- Tocar otra cosa que dispare `setPopupContent` (ej. cambiar membership de colección) → los candidatos deben seguir visibles.
- Cerrar el popup → confirmar en consola que no quedan warnings de React por roots sin desmontar.

### 3. Memoria

Actualizar `mem://logic/enrichment/per-poi-recovery-block` para registrar que el mount en popup usa `MutationObserver` precisamente para sobrevivir a las regeneraciones por `setPopupContent` (collections-store y efecto de `locations`).

### Archivos a tocar

- `src/components/map/popup-recovery-mount.ts` — reescritura del binding.
- `mem://logic/enrichment/per-poi-recovery-block` — nota sobre la robustez vía observer.

### Lo que NO se toca

- `UnenrichedRecoveryBlock.tsx` (ya emite candidatos correctamente).
- `map-popups.ts` (el `[data-recovery-root]` ya se emite siempre).
- `LocationMap.tsx` (mantenemos los `setPopupContent` existentes; el observer absorbe el reemplazo).
- Lógica server-side de validación coherencia (`enrich-location/index.ts`).
