## Diagnóstico

**Lo que pasa**: en zoom global (z≤9, banda micro) algunos POIs de TU colección se renderizan con el "perfil personalizado" (SVG circular grande con gradiente + anillo de tinte de colección + drop-shadow → blob de ~20–30px con halo), mientras otros del mismo set se ven como micro-dots de 4px. Mi explicación de `isFocused` era errónea: solo afecta a 1 marker.

**Causa real**: el modo de render es un singleton de módulo (`currentRenderMode` en `src/components/map/map-icons.ts`) que arranca en `'standard'`. Cuando una marker se crea **fuera del flujo principal** (capas paralelas, callbacks puntuales) antes de que se sincronice con el zoom actual, entra en la rama SVG (compact/standard) en lugar del early-return micro — y se queda así porque NO está en `markersRef.current` y por tanto el handler `map-render-mode-changed` no la repinta al hacer pan/zoom.

Sospechosos auditados en `LocationMap.tsx`:
- L.299 → `previewMarkersGroupRef` (markers de preview de import) — viven en su propia capa, jamás los refresca el handler de zoom.
- L.1570 → `subscribeLocationCollections` → solo actualiza `setPopupContent`, NO `marker.setIcon`. Cambios de pertenencia/perfil de colección no repintan el icono.
- L.1681, L.1742 → otros sitios que llaman `createCustomIcon` directamente sin sincronizar primero `currentRenderMode` con `mapRef.current.getZoom()`.

Resultado visible: el mismo POI puede pintarse "grande con personalización" si se generó por un camino y "micro 4px" si se regeneró por el camino canónico.

## Cambios

### 1. Helper único `refreshMarkerIcon(locationId)`
Crear en `src/components/map/marker-refresh.ts` un helper que:
- Lee el zoom actual de `mapRef.current` (param o singleton del map ref).
- Llama `setCurrentRenderMode(getRenderModeForZoom(zoom))` ANTES de regenerar el icono.
- Reúne todos los flags (selected/focused/enriched/recent/tint/own) leyendo de los stores canónicos.
- Hace `marker.setIcon(...)`.

Reemplazar en `LocationMap.tsx` los ~6 sitios que hoy invocan `createCustomIcon` + `setIcon` inline por este helper único.

### 2. Repintar icono en cambios de colección (no solo popup)
En `subscribeLocationCollections` (L.1570): además de `setPopupContent`, llamar a `refreshMarkerIcon(id)` para cada `id` afectado. Cubre toggle de visibilidad, alta/baja en colección y cambio de profile.

### 3. Sincronizar `currentRenderMode` antes de cualquier `createCustomIcon`
En el propio `createCustomIcon` (defensivo): si `currentZoom === 12` y todavía no se ha llamado `setCurrentZoom` desde el mapa, no asumir `'standard'`. Mejor exponer una función `syncRenderModeFromMap(map)` que se invoque en cualquier path que cree markers fuera del effect principal.

### 4. Preview markers fuera de banda
Los markers de preview (`previewMarkersGroupRef`) deben:
- Suscribirse al evento `map-render-mode-changed` mientras la capa está montada, o
- Limpiarse explícitamente cuando termina el flujo de preview (verificar `handleClearPreviewMarkers` se llama siempre).

### 5. Memoria
Actualizar `mem://style/map/zoom-driven-hero` añadiendo: *"Cualquier marker en cualquier capa (principal, preview, photo, route) DEBE pasar por `refreshMarkerIcon` que sincroniza render mode con zoom actual antes de generar el icono. Markers fuera del registro principal `markersRef` deben suscribirse al evento `map-render-mode-changed` o ser limpiados al terminar su flujo."*

## Validación

1. Abrir vista global (z≤9) con colecciones activas.
2. Verificar que TODOS los markers son micro-dots de 4px sin anillo de tinte ni halo, independientemente de si pertenecen a una colección con perfil personalizado.
3. Hacer click en un POI → ese (y solo ese) sale a polaroid `rich`. Cerrar popup → vuelve a 4px.
4. Toggle de visibilidad de colección → sin cambios visuales en banda micro (solo afecta a compact+).
5. Importar fichero → preview markers no quedan fantasma tras cerrar el flujo.

## Detalles técnicos

- Archivos tocados: `src/components/map/map-icons.ts` (defensa), `src/components/map/marker-refresh.ts` (nuevo helper), `src/components/LocationMap.tsx` (sustituir 6 llamadas inline + añadir setIcon en subscribeLocationCollections).
- Sin cambios de DB ni de tokens.
- Sin cambios al criterio de palette (verde/gris/naranja) ni a los anillos de salud.
- Los memoria-files actualizados solo describen la regla transversal, no introducen excepción nueva.
