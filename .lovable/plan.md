# Sistema global de feedback de carga (real, no inventado)

## Diagnóstico — dónde se "congela" hoy

Auditado el código, los puntos donde el usuario siente bloqueo son:

| # | Operación | Dónde | Señal real disponible |
|---|---|---|---|
| 1 | Carga inicial (3.9k+ puntos paginados + perfiles + miembros) | `useDatabaseSync.loadFromDatabase` | `syncPhase` ya existe (`own`/`social`/`done`) — no se usa en UI |
| 2 | Pintar miles de markers tras `addDocument` | `LocationMap` (loop síncrono `createCustomIcon`) | nº markers procesados / total |
| 3 | Abrir documento (vista doc) | `use-document-focus` + filtrado de locations | bool start/end |
| 4 | Toggle ojo de colección (carga items vía red) | `collection-visibility.toggleCollectionVisibility → loadEntry` | promesa start/end |
| 5 | "Aprobar todos" / geocodificar / batch-enrich | jobs ya con su propia barra | ya cubierto |
| 6 | Click en punto → popup (fetch enriched/imagen) | `map-popup-handlers` | promesa start/end |
| 7 | Recalcular filtros sobre 3.9k locations | `getFilteredLocations` | duración medible |
| 8 | Cargar listas (DocumentsList, GalleryView, Collections) | hooks respectivos | `loading` ya existe en cada uno |

## Principios del sistema

1. **Una sola fuente de verdad transversal**: bus global `LoadingBus` (event-driven, igual que `COLLECTION_VISIBILITY_EVENT`). Cualquier dominio empuja/saca tareas con un id, etiqueta y opcionalmente progreso real.
2. **Solo datos reales**: si una operación no tiene contador, va indeterminada (barra animada). Nunca progreso falso.
3. **Persistente entre vistas**: el bus vive en `src/shared/loading/` y se monta en `App.tsx`, por lo que la barra superior se mantiene aunque cambies de panel.
4. **Componente único**: `<GlobalLoadingBar />` arriba del mapa. Apila operaciones; muestra la más reciente y un contador "(+N)" si hay varias en paralelo.
5. **Skeletons locales** solo donde tiene sentido (listas con altura conocida). El resto usa la barra global.

## Implementación

### A. Crear bus
`src/shared/loading/loading-bus.ts`:
```ts
type LoadingTask = { id: string; label: string; current?: number; total?: number; startedAt: number };
export function startLoading(id: string, label: string, total?: number): void
export function updateLoading(id: string, current: number, total?: number): void
export function endLoading(id: string): void
export function useActiveLoadings(): LoadingTask[]   // hook React (subs al evento)
```
Emite `loading-changed` por `window.dispatchEvent`.

### B. Componente visual
`src/shared/loading/GlobalLoadingBar.tsx`:
- Barra fina arriba del viewport (z-index sobre mapa, debajo de toasts).
- Indeterminada cuando no hay `total`; determinada con `current/total` cuando sí.
- Tooltip al hover con el label de la tarea más reciente.
- Si hay varias tareas: muestra la última y "(+N)".

Montar en `src/App.tsx` (una sola vez, global).

### C. Wiring de las cargas reales (sin tocar lógica de negocio)

| Punto | Cambio |
|---|---|
| `useDatabaseSync` | `startLoading('db-sync', 'Cargando catálogo')` al inicio; `updateLoading` al recibir locations (`current=ownLocCount`); `endLoading` en `done`/error. Usar también `syncPhase` para etiqueta. |
| `LocationMap` (loop de markers) | Trocear el render en chunks con `requestIdleCallback` (fallback `setTimeout(0)`) y reportar `updateLoading('map-render', i, total)`. Esto además elimina el freeze del main thread. |
| `collection-visibility.toggleCollectionVisibility` | `startLoading('collection-toggle:'+id, 'Cargando colección')` antes de `loadEntry`, `endLoading` al final. |
| `use-document-focus` | start/end al entrar/salir de vista de documento si la transición tarda >150 ms. |
| `map-popup-handlers` (fetch popup) | start/end por popup; etiqueta = nombre del punto. |

### D. Skeletons donde ya hay `loading` local
Reusar el spinner que ya tienen estos paneles, cambiándolo por skeletons proporcionales (3-5 filas de altura `h-14`):
- `CollectionsListPanel` (cuando `loading` de `useCollections`)
- `ImportedContentPanel` (cuando carga la lista de documents)
- `GalleryView` (grid 3-4 columnas con skeletons cuadrados)

### E. Cursor + bloqueo selectivo
Para operaciones >300 ms marcadas como "blocking" (ej. `db-sync` inicial): clase global `body.is-blocking-load` que añade `cursor: progress` y desactiva interacciones del mapa (`pointer-events: none` en el contenedor del mapa). Resto de UI sigue interactiva.

## Verificación

1. Recarga inicial: barra superior con label "Cargando catálogo" desde el primer paint hasta que `syncPhase=done`. Cursor en progress. Mapa no responde a clicks hasta terminar.
2. Encender ojo de colección con 2k items: barra "Cargando colección X" hasta que aparezcan los anillos. No bloquea el resto de UI.
3. Render de markers: barra avanza de 0 a N en pasos visibles; el mapa permanece interactivo (chunked).
4. Listas (Colecciones, Documentos, Galería): skeletons con la forma final mientras carga.
5. Si todo carga en <150 ms (cache caliente), la barra no llega a aparecer (umbral mínimo).

## Fuera de alcance

- No tocamos la lógica de carga de datos (qué se pide, RLS, paginación). Solo añadimos señales de progreso reales sobre lo existente.
- No reemplazamos las barras dedicadas de geocoding/enrichment (ya cubiertas con su propia UI). El bus las puede mostrar como tarea, pero su control sigue donde está.
- No introducimos progreso simulado en ninguna parte.

## Archivos nuevos
- `src/shared/loading/loading-bus.ts`
- `src/shared/loading/GlobalLoadingBar.tsx`
- `src/shared/loading/index.ts`
- `src/shared/loading/use-active-loadings.ts`

## Archivos editados
- `src/App.tsx` (montar `<GlobalLoadingBar />`)
- `src/domains/content/hooks/use-database-sync.ts` (start/update/end)
- `src/components/LocationMap.tsx` (chunked marker render + reportar progreso)
- `src/domains/content/lib/collection-visibility.ts` (start/end en toggle)
- `src/components/CollectionsListPanel.tsx`, `ImportedContentPanel.tsx`, `GalleryView.tsx` (skeletons)
- `src/index.css` (`.is-blocking-load { cursor: progress }` + bar styles)

## Memoria a guardar (si se aprueba)
`mem://ui/loading-feedback-system` — bus global + barra superior + chunked render + skeletons en listas; siempre datos reales, nunca progreso simulado.
