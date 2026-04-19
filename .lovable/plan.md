
## Mover filtros de propietario y Fotos al panel de Capas

### Estado actual

**FloatingToolbar** tiene aún:
- Filtro de propietario (Todos / Míos / Seguidos) → usa `setOwnershipFilter` de `use-layer-visibility`
- Toggle de Fotos → usa `togglePhotoLayer` de `map-photo-layer`

**LayersPanel** ya tiene la infraestructura:
- Sección "Puntos" con `catalog`, `workspace`, `followed` (toggles individuales con `toggleLayer`)
- Sección "Otros" con toggle de Fotos (ya está aquí, duplicado con la barra)
- Toggle global "Puntos" (master) y "Rutas"

**Conclusión**: el panel ya cubre lo mismo y más (granularidad por capa). La barra es redundante.

### Cambios

**1. `src/components/FloatingToolbar.tsx`**
- Eliminar el bloque del filtro de propietario (botones Todos/Míos/Seguidos o dropdown).
- Eliminar el toggle de Fotos (ya está en LayersPanel).
- Limpiar imports e iconos huérfanos (`Camera`, `Users`, `User`, `Globe`, etc. si no se usan en otro sitio del archivo).
- Limpiar props no usadas (`onTogglePhotos` si existía).

**2. `src/components/LayersPanel.tsx`** (mejora menor de UX para reemplazar la barra)
- Añadir un acceso rápido "Mis puntos / Todos / Seguidos" al inicio de la sección "Puntos" como **3 botones radio compactos** que invocan `setOwnershipFilter('mine' | 'all' | 'followed')` desde `useLayerVisibility`.
- Esto da un atajo equivalente al de la barra, sin perder los toggles individuales de abajo.

**3. Verificación**
- `setOwnershipFilter` ya existe en `use-layer-visibility.ts` y emite `LAYER_VISIBILITY_EVENT`, así que el panel se re-renderiza solo.
- No hay cambios en `map-v2-renderer` ni en el store: la lógica subyacente es la misma.

### Archivos tocados

- `src/components/FloatingToolbar.tsx` (eliminar UI de propietario + Fotos)
- `src/components/LayersPanel.tsx` (añadir selector rápido de ownership al inicio de "Puntos")

### Fuera de alcance

- No se elimina `setOwnershipFilter` ni `togglePhotoLayer` (siguen usándose desde el panel y desde otros sitios).
- No se toca `use-layer-visibility.ts` ni el singleton.
- No se cambia el comportamiento por defecto de las capas.
