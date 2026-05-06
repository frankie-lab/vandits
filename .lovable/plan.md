
## Por qué se rompe hoy

Aunque ya existen helpers transversales (`isLocationVisibleInGlobalMap`, `getTintForLocation`, `collection-visibility`), conviven varias fuentes de verdad y eso explica la deriva entre sesiones:

1. **Color del marcador**: el centro lo decide `getPointVisualState` (estado: enriched/imported/empty). El color de colección solo se aplica como **anillo externo** (`.collection-tint-ring`) en un `useEffect` aparte de `LocationMap.tsx` (L1457–1492). Si los marcadores se recrean (cluster, realtime, force-update), el anillo se pierde hasta que el efecto vuelve a correr.
2. **Visibilidad**: `isLocationVisibleInGlobalMap` ya combina aprobación + colecciones, pero el recálculo depende de un bump global (`_docVersion`) que se dispara con `collection-visibility-changed`. Si el evento llega antes de que `catalogMembership` esté reconstruido, los puntos se ven/desaparecen mal por una fracción de segundo y a veces se "congelan".
3. **Estado por sesión**: `initSessionCollectionVisibility` usa `sessionStorage` + un singleton in-memory. Tras `StrictMode`, hot-reload, cambio rápido de pestañas, o re-mount de `Index`, queda desincronizado: el panel muestra un set y el mapa otro.
4. **Falta de tests**: ni `collection-visibility`, ni `document-visibility`, ni el efecto de tintado tienen tests; cualquier cambio en otra área puede romperlos sin aviso.

## Objetivo

Antes de tocar UI: **fijar por contrato** qué hace el ojo ("tintar + filtrar"), centralizar la única fuente de verdad y blindarlo con tests deterministas. Solo después se ajusta el render del mapa.

## Plan en 4 fases

### Fase 1 — Auditoría y matriz de reglas (sin código)

Producto: `docs/adr/004-collection-visibility-and-tint.md` con:

- Inventario de **todos** los lugares que hoy deciden visibilidad o color de un punto/ruta (mapa global, vista doc, popup, miniaturas, panel colecciones, focus de colección, contadores).
- Matriz de reglas única (ya está casi escrita en `collection-visibility.ts`, se formaliza):

  ```text
  Punto aprobado     + sin colección catálogo        → visible, sin anillo
  Punto aprobado     + ≥1 colección catálogo, ninguna visible → OCULTO
  Punto aprobado     + ≥1 colección catálogo, alguna visible  → visible, anillo color de la 1ª visible
  Punto NO aprobado  + en colección privada visible           → visible, anillo color
  Punto NO aprobado  + resto                                  → solo visible en vista doc
  Ruta               → solo visible si toggle Itinerarios o vista doc; anillo si pertenece a colección visible
  ```
- Lista de "no-haz" (no decidir color/visibilidad inline en componentes, no leer `documents.status`, no tocar el centro del marcador desde lógica de colección).

Sin esta auditoría escrita, el siguiente cambio volverá a romper algo.

### Fase 2 — Helper único + tests primero

1. Promover `collection-visibility.ts` a contrato cerrado:
   - API pública: `isLocationVisibleInGlobalMap`, `getTintForLocation`, `getTintForRoute`, `toggleCollectionVisibility`, `getVisibleCollectionIds`, `subscribeCollectionVisibility`, `initSessionCollectionVisibility`, `resetSessionCollectionVisibility`.
   - Marcar el resto como `@internal` (no importar fuera del módulo).
2. Añadir `src/test/collection-visibility.test.ts` y `src/test/document-visibility.test.ts` cubriendo cada celda de la matriz de Fase 1, incluyendo:
   - Toggle de catálogo / privada y persistencia en `sessionStorage`.
   - Reconstrucción de `catalogMembership` tras `collection-items-changed`.
   - Carrera entre `initSession…` y un toggle inmediato (no debe perder estado).
   - Re-mount idempotente (StrictMode): segundo init no borra el set.
3. Test del store: `getFilteredLocations` reacciona al evento `collection-visibility-changed` con la nueva visibilidad ya aplicada (no antes).

Ningún cambio de UI hasta que estos tests existan y pasen.

### Fase 3 — Render del marcador: anillo como propiedad, no como parche DOM

Hoy el anillo se inyecta vía `el.appendChild` en un `useEffect` separado. Cambios:

1. Pasar el `tint` a `createCustomIcon` (junto al estado visual) para que el anillo forme parte del HTML del divIcon desde su creación. Así, cualquier `setIcon` posterior (cluster, realtime, force-update) lo reaplica solo.
2. Mantener el efecto de tintado **solo** como diff incremental (cambio de color sin recrear marker), suscrito a `subscribeCollectionVisibility` en vez de a `getCollectionVisibilityState` puntual.
3. Para rutas: aplicar el color en `showRoute`/`renderV2Features` leyendo `getTintForRoute`, en vez de en un efecto posterior.

Resultado: el color y la visibilidad ya no dependen del orden de eventos.

### Fase 4 — Panel colecciones y QA visual

1. `CollectionsListPanel` deja de mantener su propio `Set` derivado: lee directamente de `subscribeCollectionVisibility` (un solo `useSyncExternalStore`). Eliminamos la prop `visibleCollectionIds` y el efecto duplicado en `Index.tsx`.
2. Borrar el reset por re-mount oculto en `Index.tsx` (ya está comentado, lo limpiamos del todo) y unificar en `useEffect [user?.id]` con un guard explícito.
3. QA browser después de implementar: 4 escenarios fijos contra `frankie@gmz.wtf` (recogidos como checklist en el ADR), capturando antes/después.

## Detalles técnicos

- Archivos tocados: `src/domains/content/lib/collection-visibility.ts`, `src/domains/content/lib/document-visibility.ts`, `src/components/LocationMap.tsx` (icono + efecto anillo), `src/components/map/map-icons.ts` (firma de `createCustomIcon`), `src/components/map/map-routes.ts` (color al crear), `src/components/CollectionsListPanel.tsx`, `src/pages/Index.tsx`, `docs/adr/004-collection-visibility-and-tint.md`, `src/test/collection-visibility.test.ts`, `src/test/document-visibility.test.ts`.
- No se tocan: RLS, esquema DB, helpers de buckets (`getBucketStats`), `getPointVisualState`. Ya son canónicos.
- Memoria a actualizar al final: `mem://logic/collections/visibility-and-styling` (apuntar al ADR 004) y la entrada `Visibilidad = is_approved + colecciones catálogo` en Core (añadir referencia al ADR).

## Garantía contra regresiones futuras

Cualquier PR que toque marker render o el panel de colecciones deberá:
1. Importar **solo** la API pública del helper (lint rule simple a añadir más tarde si hace falta).
2. Pasar los tests de Fase 2.
3. Marcar en el ADR la celda de la matriz que toca, si aplica.

Esto rompe el patrón actual de "parche local que rompe otra cosa".
