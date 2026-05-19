# Catálogo de eventos globales (window)

Estado: **documentación inicial** — 2026-05-19  
Alcance: inventario de los eventos `CustomEvent` emitidos/escuchados sobre `window` en `src/**`.  
**No** describe contratos cerrados ni autoriza refactor; ver `docs/tech-debt.md` ítem 2.

## Convenciones observadas

- Bus único: `window.dispatchEvent(new CustomEvent(name, { detail }))` + `window.addEventListener(name, handler)`.
- Algunos nombres viven como constantes exportadas (`LAYER_VISIBILITY_EVENT`, `MY_CATALOG_POPOVER_APPLIED_EVENT`, etc.); la mayoría son strings inline duplicados en emisor y consumidor.
- Prefijos coexisten sin norma unificada: `lovable:`, `vandits:`, `map-`, `map:`, `admin:`, `document:`, `route:`, `routes:`, `locations:`, `personal-categories:`, y nombres sin prefijo (`store-updated`, `trash-updated`, `popup-action`, etc.).
- Payloads sin tipado central: cada emisor define `detail` ad hoc; los consumidores hacen `(e as CustomEvent).detail` con casts puntuales.
- **Riesgo transversal**: no existe ni un registro de tipos (`WindowEventMap` augmentation) ni una capa de bus tipada. Renombrar un evento o cambiar la forma de su `detail` es un cambio silencioso (no falla compilación).

## Conteo

`rg -n "window\.(dispatchEvent|addEventListener|removeEventListener)|new CustomEvent\("` devuelve ~453 hits en `src/**` (incluye tests). Eventos únicos identificados por nombre: ~75.

---

## Eventos por dominio

Para cada evento se indica nombre, payload conocido, emisor(es), consumidor(es) principal(es) y propósito. Las rutas son representativas, no exhaustivas: en muchos casos `LocationMap.tsx` o `Index.tsx` actúan como hub.

### Mapa — comandos imperativos (Index/paneles → `LocationMap`)

| Evento | `detail` | Emisor | Consumidor | Propósito |
|---|---|---|---|---|
| `map-fit-bounds` | `{ bounds, padding? }` | `pages/Index.tsx` | `components/LocationMap.tsx` | Encuadrar el mapa a un bbox. |
| `map-fly-to` | `{ lat, lng, zoom? }` | varios paneles | `LocationMap.tsx` | Centrar/volar a una coordenada. |
| `map-go-home` | — | toolbar/perfil | `LocationMap.tsx` | Volver a la vista "home" del usuario. |
| `map-reset-view` | — | toolbar | `LocationMap.tsx` | Restablecer vista por defecto. |
| `map-set-theme` | `{ theme }` | `use-map-theme.ts` | `LocationMap.tsx` | Cambiar tema base del mapa. |
| `map-theme-changed` | `{ theme }` | `use-map-theme.ts` | hooks suscritos | Notificar cambio de tema. |
| `map-render-mode-changed` | `{ mode }` | toolbar | `LocationMap.tsx` | Cambiar render mode POI (micro/compact/standard/rich). |
| `map-locate-toggle` / `map-locate-state` | varios | botón locate-me | `LocationMap.tsx` | Contrato locate-me (ver `mem://logic/map/locate-me-button-contract`). |
| `map:set-drag-mode` | `{ mode }` | route builder | `LocationMap.tsx` | Cambiar modo drag global. |
| `map-correction-mode` | `{ enabled, ... }` | corrección GPS | `LocationMap.tsx` | Activar UI de corrección de tramos. |

### Mapa — previews / overlays temporales

| Evento | Emisor | Consumidor | Propósito |
|---|---|---|---|
| `map-show-preview-markers` / `map-clear-preview-markers` | import preview | `LocationMap.tsx` | Mostrar/ocultar markers de preview de import. |
| `map-show-import-preview-routes` / `map-clear-import-preview-routes` | import preview | `LocationMap.tsx` | Idem para rutas. |
| `map-show-nearby-ref` / `map-clear-nearby-ref` | proximity panel | `LocationMap.tsx` | Marcar la referencia de "contexto cercano". |
| `nearby-highlight-marker` | proximity panel | `LocationMap.tsx` | Resaltar marker concreto en nearby. |
| `map-show-insert-preview` / `map-hide-insert-preview` | route builder | `LocationMap.tsx` | Preview de inserción de waypoint. |
| `map-show-editable-waypoints` / `map-clear-editable-waypoints` | route builder | `LocationMap.tsx` | Mostrar waypoints editables. |
| `map-waypoint-dragged` / `map-waypoint-insert` | `LocationMap.tsx` | route builder | Notificar drag/insert hechos en mapa. |
| `map-show-route` / `map-clear-route` | itinerary | `LocationMap.tsx` | Render efímero de ruta concreta. |
| `map-clear-advisor-preview` | advisor legacy | `LocationMap.tsx` | Limpiar preview del antiguo advisor. |
| `map-segment-correction-start` / `map-segment-corrected` / `map-segment-correction-error` | corrección GPS | UI corrección | Estado del flujo de corrección. |
| `map-route-selected` | `LocationMap.tsx` | `RoutesListPanel.tsx` | Notificar selección de ruta clicada en mapa. |

### Itinerarios

| Evento | `detail` | Emisor | Consumidor | Propósito |
|---|---|---|---|---|
| `itinerary-focus` | `{ locationIds }` (null = limpiar) | `Index.tsx`, panel rutas | `LocationMap.tsx` | Foco/limpiar foco itinerario. Contrato: `null` = reset. |
| `itinerary-point-selected` | `{ id }` | `RoutesListPanel.tsx` | mapa/popups | Sincronizar selección de POI desde panel. |
| `itinerary-segment-selected` | `{ ... }` | `RoutesListPanel.tsx` | mapa | Selección de tramo. |
| `itinerary-map-point-clicked` | `{ id }` | `LocationMap.tsx` | `RoutesListPanel.tsx` | Click POI en mapa → resaltar fila. |
| `route:toggle-visibility` | `{ routeId, visible }` | toolbar/panel | `LocationMap.tsx` | Toggle visibilidad ruta concreta. |
| `route-alternative-hover` / `route-alternative-selected` | `{ alternativeId }` | UI alternativas | mapa | Hover/selección alternativas intermodales. |
| `routes:changed` | — | `domains/routes/hooks/use-routes.ts` | `use-linked-location-ids.ts`, paneles | Invalidación cliente del set de rutas (no Supabase). |

### Toolbar / catálogo / filtros

| Evento | Emisor | Consumidor | Propósito |
|---|---|---|---|
| `lovable:my-catalog-popover-applied` | `use-my-catalog-popover-fit.ts` | `MyCatalogQuickFilters` | Confirmar aplicación de filtro popover (selector contract). |
| `lovable:my-catalog-popover-empty` | popover catálogo | `MyCatalogQuickFilters` | Señalar subset vacío. |
| `layer-visibility-changed` (`LAYER_VISIBILITY_EVENT`) | `use-layer-visibility.ts` | `LocationMap.tsx`, tests | Cambios de visibilidad de capas. |
| `duplicate-threshold-changed` | settings | import/duplicates | Recalcular avisos de duplicados. |
| `enrichment-criteria-changed` | `Index.tsx` / criterios IA | `LocationMap.tsx`, hooks | Repintar markers/popups al cambiar criterios. |
| `measurement-units-changed` | `UserProfileEditor.tsx` | `LocationMap.tsx`, UI | Cambio km/mi. |
| `icon-library-changed` | `IconLibraryContext.tsx` | suscriptores libreria iconos | Sustituir librería de iconos. |

### Contenido / locations (sync UI sin reload)

| Evento | `detail` | Emisor | Consumidor | Propósito |
|---|---|---|---|---|
| `location-realtime-update` | `{ locationId, kind: 'insert'\|'update'\|'delete' }` | `use-realtime-locations.ts` | mapa/popups/listas | Patch incremental tras evento Supabase realtime. |
| `reload-locations` | — | `AdminPanel.tsx`, realtime fallback | hooks de locations | Forzar refetch completo (fallback). |
| `locations-refresh` / `locations:refresh` / `locations-updated` / `locations:changed` | varios | varios | varios | Variantes históricas para invalidar listas. **Duplicación de nombres**. |
| `collection-items-changed` | `{ collectionId }` | `services/document-add.service.ts` | UI colecciones | Cambios de pertenencia de POI a colección. |
| `collections-updated` / `collections:changed` | varios | UI colecciones | Refresh listado colecciones. **Duplicación de nombres**. |
| `personal-categories:reload` | settings/perfil | hooks categorías | Releer categorías personales. |
| `document:processed` / `document:processing-step` | servicio import | UI import | Progreso/fin de procesado de doc. |
| `document:deleted` | borrado doc | listas/mapa | Quitar doc y opcionalmente sus POIs. |
| `document:open-workspace` / `document:view-on-map` | UI docs | `Index.tsx`/mapa | Abrir doc en workspace o focar en mapa. |
| `location:enriched` | enriquecimiento | popups/listas | POI pasó a enriched. |
| `enrichment-started` | enriquecimiento | UI progreso | Inicio de batch IA. |
| `photo-updated` | `{ locationId, ... }` | `use-realtime-locations.ts`, `LocationPhotoSearch.tsx`, `LocationPhotoUpload.tsx` | popup/hero foto | Refrescar foto in-place. |
| `visited-updated` | `{ locationId, visited }` | `use-realtime-locations.ts` | popups/listas | Cambio estado visited. |
| `rating-updated` | `{ locationId, rating }` | `use-realtime-locations.ts` | popups/listas | Cambio user rating. |
| `notes-updated` | `{ locationId }` | notas | popups/listas | Cambio notas. |
| `store-updated` | — | `LocationPhotoUpload.tsx`, `FilterBar.tsx`, `Index.tsx` | varios | Bus genérico legacy "algo del store cambió". **Granularidad pobre**. |
| `trash-updated` | — | `FilterBar.tsx`, `use-realtime-locations.ts` | papelera | Refrescar contador papelera. |
| `pending-validations-updated` | `{ count }` | servicios | `Index.tsx` | Badge validaciones pendientes. |

### Popups / interacción POI

| Evento | `detail` | Emisor | Consumidor | Propósito |
|---|---|---|---|---|
| `popup-action` | `{ action, locationId, ... }` | popup HTML inyectado | `Index.tsx` (router de acciones) | Canal único acciones popup (`adopt-nearby`, `set-rating`, etc.). Ver `docs/contracts/popup-contract.md`. |
| `nearby-marker-clicked` | `{ id }` | `LocationMap.tsx` | nearby panel | Click sobre referencia nearby. |
| `open-nearby-context` | `{ id }` | popups/UI | nearby panel | Abrir vista "Contexto cercano" inline. |
| `open-reclassify` | `{ locationId }` | popups admin | reclassify dialog | Abrir reclasificación. |
| `photo-focus` | `{ photoId }` | popup/galería | viewer | Centrar foto. |

### Social / identidad

| Evento | Emisor | Consumidor | Propósito |
|---|---|---|---|
| `lovable:follow-changed` | `UsersSidebar.tsx` | `Index.tsx`, hooks social | Cambio de follow/unfollow. |
| `lovable:owner-identity-updated` | identity allocator | `UsersSidebar.tsx`, mapa | Repintar markers con nueva paleta OKLCH owner-v2.6. |
| `lovable:open-users-sidebar` | UI | `UsersSidebar.tsx` | Abrir sidebar social. |
| `lovable:profile-updated` | perfil | UI usuario | Cambios en profile. |

### Admin / backoffice

| Evento | Emisor | Consumidor | Propósito |
|---|---|---|---|
| `admin:open-geography` | sidebar admin | `Index.tsx` | Abrir panel geografía. |
| `admin:open-data-sources` | sidebar admin | `Index.tsx` | Abrir panel data-sources. |
| `vandits:open-upload` | topbar | `Index.tsx` | Abrir flujo upload. |
| `vandits:open-profile` | topbar | `Index.tsx` | Abrir perfil. |
| `import:open-categories` | import preview | `Index.tsx` | Abrir editor categorías personales. |
| `lovable:image-recovery-job-tick` | image recovery | UI progreso | Tick de progreso job. |
| `lovable:op-history-changed` | `useOperationHistory` (BackOffice UX canon) | paneles ops | Refresh `OperationStatusCard`. |

---

## Riesgos y notas de contrato

1. **Sin tipado**: ningún `WindowEventMap` augmentation. Los `detail` se castean en cada consumidor.
2. **Nombres duplicados / sinonimias**: `locations:changed` vs `locations-updated` vs `locations-refresh` vs `locations:refresh`; `collections-updated` vs `collections:changed`. Coexisten por capas históricas y no son alias formales: cada uno tiene su set de listeners.
3. **Prefijos inconsistentes**: `lovable:`, `vandits:`, `map-`, `map:`, `admin:`, `document:`, ninguno y todos a la vez. Hace difícil grep por dominio.
4. **Bus único `popup-action`**: contrato crítico definido en `docs/contracts/popup-contract.md`. Cualquier acción nueva debe respetar `data-popup-footer="v1"` y el shape `{ action, locationId }`.
5. **`store-updated` / `reload-locations`**: catch-alls que provocan invalidaciones amplias. Buen candidato a sustituir por eventos granulares (futuro, fuera de alcance de este doc).
6. **Eventos `map-*` son comandos imperativos**: `LocationMap.tsx` es el único consumidor real. Acopla todos los paneles al hub del mapa (ítem 6 de `docs/tech-debt.md`).
7. **Realtime → bus**: `use-realtime-locations.ts` traduce postgres_changes a eventos `window`. La forma del `detail` (especialmente `kind`) es contrato implícito con popups/listas.
8. **Tests cubren parcialmente**: `src/test/layer-visibility.test.ts`, `src/test/preferences-sync.test.ts`, `src/test/popup-curation-validate-geo.test.ts` usan el bus directamente. No hay test que valide el catálogo completo.

## No-objetivos de este documento

- No define un contrato cerrado por evento.
- No propone renombrados ni unificación de prefijos.
- No introduce un bus tipado ni augmentation de `WindowEventMap`.
- No sustituye eventos por stores.

Cualquiera de esos pasos es trabajo futuro (ítem 2 de `docs/tech-debt.md`).
