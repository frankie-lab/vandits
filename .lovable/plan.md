## Contexto

Tienes razón. Habíamos definido que "Contexto cercano" se viera **inline dentro del popup de la ficha**, no en un panel lateral. En la iteración anterior, al arreglar que el botón no respondía en el mapa global, monté `GlobalNearbyContextHost` que abre `NearbyPanel` en un `Sheet` lateral derecho — eso fue un error de arquitectura.

Memorias afectadas (a actualizar tras aplicar):
- `mem://features/content/empty-point-quick-actions-v2` (dice "panel lateral se abre" → debe decir "se expande inline en el popup")
- `mem://features/content/proximity-context-enrichment-v2` (dice "barra lateral" → debe reflejar "inline en ficha")
- Añadir línea Core: "Contexto cercano = inline en popup. NUNCA panel lateral ni Sheet."

## Plan

### 1. Eliminar el host lateral
- Borrar `src/domains/content/components/GlobalNearbyContextHost.tsx`.
- Quitar import + montaje en `src/domains/discovery/components/DiscoveryOrchestrator.tsx`.
- Quitar el listener equivalente en `src/components/DocumentFocusView.tsx` (~líneas 514-531) — la ficha es el contenedor único.

### 2. Cambiar el contrato del botón en `UnenrichedRecoveryBlock.tsx`
En vez de disparar `open-nearby-context`, alternar estado local:

```ts
const [showNearby, setShowNearby] = useState(false);
```

Renderizar `<NearbyPanel variant="inline" ... />` justo debajo de las acciones rápidas cuando `showNearby === true`. El botón "Contexto cercano" hace toggle.

### 3. Adaptar `NearbyPanel` (en `PointContextActions.tsx`) para modo inline
- Aceptar prop `variant?: 'sidebar' | 'inline'` (default `inline`).
- Modo `inline`: contenedor con `max-h` acotada (~50vh) y scroll interno, padding compacto, sin header sticky redundante (la ficha ya tiene cabecera), botón "Cerrar" → colapsa el bloque vía `onClose`.
- Misma lógica funcional intacta: búsqueda, slider de radio, lista, fusionar, guardar como personal.

### 4. Limpiar el evento `open-nearby-context`
- Quitar emisión en `UnenrichedRecoveryBlock.tsx` (`handleOpenContext`).
- Quitar emisión en `src/components/map-popups.ts` si la hace.
- Quitar listener en `DocumentFocusView.tsx`.
- El evento queda eliminado del código.

### 5. No tocar `map-popups.ts` más allá de la limpieza del evento
El popup HTML sigue montando `UnenrichedRecoveryBlock` por portal — `NearbyPanel` heredará ese contenedor automáticamente.

### 6. Actualizar memorias
Tras aplicar, reescribir las dos memorias citadas y añadir la regla Core para que ningún cambio futuro vuelva a moverlo a la columna derecha.

## QA

- Mapa global → click POI vacío → "Contexto cercano" → se expande dentro del propio popup, sin abrir nada en columna derecha.
- Focus mode (documento abierto) → mismo comportamiento, sin panel lateral duplicado.
- Cerrar contexto → el popup vuelve a su estado compacto y sigue abierto.
- Popup respeta `--popup-max-h` y scroll interno.