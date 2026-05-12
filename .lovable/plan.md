## Objetivo

Unificar el tamaño de los POIs de contenido en TODAS las vistas para que el canon transversal (banda por zoom × estado × modeScale) sea la única fuente de verdad. Hoy el renderer V2 usa fallbacks fijos (`14`/`20`) y rompe el canon en cuanto el flag `v2_map_features` está activo.

## Canon transversal (recordatorio, NO cambia)


| Banda    | Zoom    | Forma       | Tamaño                       | Health rings | Tint colección | Polaroid |
| -------- | ------- | ----------- | ---------------------------- | ------------ | -------------- | -------- |
| micro    | z ≤ 9   | div plano   | rampa 2/3/4/5/6 px           | no           | no             | no       |
| compact  | z 10–11 | SVG plano   | base × {0.85, 0.95}          | no           | sí             | no       |
| standard | z 12–13 | SVG + grad. | base × {1.00, 1.05, 1.10}    | sí           | sí             | no       |
| rich     | z ≥ 14  | SVG + grad. | base × 1.15 + polaroid 50×56 | sí           | sí             | sí       |


`base` viene de `marker_size_config[configKey]` (enriched/imported/empty) vía `getBaseSize(entry, isRecentlyEnriched, isFocused, isSelected)`. Excepción única: `isFocused` escapa a `rich`. `isSelected` NO escapa.

## Cambios

### 1. `src/components/map/map-v2-renderer.ts` — delegar en el canon

Eliminar el cálculo paralelo (`cfg.default?.base_normal ?? 14` / `?? 20`) y delegar en `createCustomIcon` para POIs de contenido (waypoints/places). El renderer V2 deja de generar su propio SVG/HTML para markers de contenido y queda como adaptador `MapFeature → createCustomIcon`.

- `createV2Icon(feature)`:
  - Mapear `feature` → `GeoLocation`-like con los campos que `getPointConfigKey` y `getPointVisualState` necesitan (`enrichedData`, `isApproved`, ownership). Si el `MapFeature` no trae todos los campos, derivar el mínimo viable desde `feature.entityType` + `feature.ownershipSource` + `feature.state`.
  - Llamar `syncRenderModeFromMap(map)` antes (ya patrón estándar en photo/preview).
  - Devolver `createCustomIcon(isSelected, isFocused, _, locationLike, 0, false, collectionTint, isOwn)`.
- Eliminar `getShapeSvg` para shapes que se solapan con el canon (`teardrop`, `circle-solid`). Conservar solo lo que represente entidades NO-POI (si las hay; si no, borrar).
- Eliminar `decoration` halo/warning/star/check del path de POIs de contenido — las warnings ya se cubren con health rings del canon. Si V2 necesita decoraciones extra, se añaden vía clase CSS sobre el divIcon canónico, no como SVG paralelo.

### 2. `renderV2Features` — pasar `map` al icon factory

Hoy `createV2Icon` no recibe `map`. Cambiar la firma para que `renderV2Features` pase `map` a `createV2Icon`, que a su vez llama `syncRenderModeFromMap(map)` antes de `createCustomIcon`. Garantiza que markers creados fuera del `zoomend` principal entran con el render mode correcto (mismo patrón que `map-photo-layer`).

### 3. Re-render en `zoomend` (verificación)

Verificar que el bloque V2 en `LocationMap.tsx` (línea ~1996) recrea o actualiza icons en `zoomend`, igual que el path legacy. Si no lo hace, los V2 markers quedan congelados en la banda del zoom inicial. Acción: añadir listener `zoomend` que regenere los icons V2 vía `createV2Icon`.

### 4. Fuera de scope (no se tocan)

- `map-photo-layer.ts` (fotos OneDrive — fuera del canon de POIs de contenido).
- Markers de Home, GPS, ruta, nearby — tienen su propia tipología.
- `useMarkerSizeConfig`, `marker_size_config` BD, `getBaseSize`, `getModeScaleForZoom`, `getRenderModeForZoom`, tokens `map.json`/`poi.json` — el canon ya es correcto, no se modifica.

## Validación

1. Activar flag `v2_map_features` y cargar mismo dataset en vista global (z6), z11, z14, z16. Comprobar visualmente que un mismo POI tiene exactamente el mismo tamaño que el path legacy en cada banda.
2. Verificar transición continua al hacer zoom in/out (sin saltos entre V2 y legacy si ambos coexisten en pantalla).
3. `isFocused` (click directo) sigue escalando a rich. `isSelected` masivo no rompe micro en z6.
4. Health rings y collection tint aparecen en V2 igual que en legacy según banda.

## Memoria a actualizar

- `mem://style/map/zoom-driven-hero` — añadir nota: "V2 renderer delega en `createCustomIcon`. Prohibidos cálculos paralelos de tamaño POI fuera del canon."
- Considerar nuevo `mem://constraints/poi-icon-single-source-of-truth` con la regla absoluta: cualquier marker de POI de contenido pasa por `createCustomIcon`. Renderers alternativos solo adaptan input.