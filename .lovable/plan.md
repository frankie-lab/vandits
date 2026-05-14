## Objetivo

Al pulsar "Ver puntos de X" en `UsersSidebar` (sea sandbox o cualquier otro), el mapa debe mostrar **solo** los POIs de ese usuario y ajustar el zoom para que **todos** quepan en el viewport.

## Estado actual (ya hecho)

- `UsersSidebar.handleFilterByUser` aplica `filters.filterByUserId = user.id` y dispara `requestSubsetFit(ids, { mode: 'always', reason: 'user-filter' })`.
- El listener en `LocationMap.tsx` ya hace fit a **bounds completos** (sin recortar a "región dominante"), con clamp `FIT_CLAMP_ZOOM` y padding.
- El matcher (`location-filtering.ts`) recorta por `getLocationOwnerUserId(loc) === filterByUserId`.
- Paginador (`db-transformers.ts`) fix recién aplicado: ya carga las páginas parciales que antes truncaban los POIs de Alpha.

## Por qué aún puede fallar

1. **Timing del `setTimeout(50ms)`** en `UsersSidebar` línea 361: `getFilteredLocations()` se lee antes de que el store haya aplicado el nuevo filtro en el render de Zustand. Con sandbox cuela porque sus 337 POIs ya estaban montados; con un usuario con pocos POIs (Alpha = 8) el array puede llegar vacío y `requestSubsetFit` hace early-return (`locationIds.length === 0`).
2. **Dependencia indirecta de otros filtros**: `getFilteredLocations()` aplica TODOS los filtros activos (geo, tags, salud…). Si quedaba algún chip activo de una sesión anterior, los ids del subset pueden no representar "todos los POIs del usuario".
3. **Culling por viewport**: ids no montados se resuelven por fallback contra `locationsRef`. Si la primera carga aún no hidrató `locationsRef`, el listener no encuentra coords.

## Cambios propuestos

### 1. `src/components/UsersSidebar.tsx` — calcular ids de forma determinista

Reemplazar el bloque `setTimeout` (líneas 361–371) por:

- Leer `useLocationsStore.getState().getAllLocations()` (universo completo, sin pasar por otros filtros).
- Filtrar por `getLocationOwnerUserId(loc) === user.id` directamente.
- Llamar a `requestSubsetFit(ids, { mode: 'always', reason: 'user-filter' })` **sin** `setTimeout`.
- Si `ids.length === 0`, mostrar toast informativo ("Sin puntos visibles para este usuario") y no mover cámara.

Esto desacopla el subset-fit de:
- el ciclo de render de Zustand,
- otros filtros activos (Geo/Tipo/Tags/Salud),
- el momento exacto en que se montan los markers.

### 2. `src/components/LocationMap.tsx` — endurecer fallback de coords

En el handler del listener (líneas 2214–2227), si tras recorrer ids quedan ≥1 sin coords resueltas, **diferir** una segunda pasada con `requestAnimationFrame` (máx 1 reintento) leyendo `locationsRef.current` ya hidratado. Hoy si `pts.length === 0` se hace early-return silencioso.

Log de telemetría: `console.warn('[subset-fit] missing coords', { reason, total, missing })` cuando alguno se pierda.

### 3. Validación

Tras los cambios, en preview:
- Filtrar por **sandbox-agent** → 337 POIs visibles, mapa encuadra todos.
- Filtrar por **Explorador Alpha** → 8 POIs visibles, mapa encuadra los 8 (con clamp z12 si quedan muy juntos).
- Quitar filtro → vuelve al universo global sin mover cámara.

Logs esperados:
- `[paginator] DONE … alphaHits: '8/8'` (validación del fix previo).
- Sin `[subset-fit] missing coords` en flujo normal.

## Fuera de alcance

- `documents_of_uid: 0` para Alpha (bug separado en `use-database-sync.ts`).
- Cualquier cambio al matcher, RLS o vista `v_locations_resolved`.
- Cambios al contrato de subset-fit para otros `reason` distintos de `user-filter`.
