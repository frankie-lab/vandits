# Glosario del sistema Vandits

Vocabulario congelado. **No usar sinónimos**. Si necesitas un concepto que no está aquí, propón ADR antes de inventar palabra.

## Estado del POI sobre el mapa

| Término | Definición exacta | Sinónimos prohibidos |
|---|---|---|
| **focused** | El único POI con `id === focusedLocationId`. Bajo atención visual del usuario. | "activo", "destacado", "current" |
| **selected** | POI cuyo id ∈ `selectedLocations: Set<string>`. Conjunto operativo. | "marked", "checked" |
| **popup-open** | POI cuyo id === `openPopupLocationId` (local a `LocationMap`). | "expanded", "open" |
| **preserved** | Marker que sobrevive a una reconciliación porque su id ∈ `keepIds = focused ∪ popupOpen`. | "pinned", "alive" |

`focused`, `selected` y `popup-open` son **ortogonales**. Pueden coincidir o no.

## Ejes de filtro

| Término | Definición | Mueve cámara |
|---|---|---|
| **ownershipFilter** | `'all' \| 'mine' \| 'others' \| 'app' \| 'source'` | NO |
| **filterByUserId** | Restringir a POIs de un único uid concreto. | SÍ (`UsersSidebar`) |
| **visualState** | `'enriched' \| 'imported' \| 'empty'`. Estado canónico del marker (color). Solo expuesto desde popover Mis POI. | SÍ (popover) |
| **healthFilter** | `'partial' \| 'chain' \| 'review' \| 'hardError'`. Anillo de salud activo. | SÍ |
| **geoFilters** | `region/zone/admin3/locality` resueltos. | NO |
| **filterBySource** | `'own' \| 'followed' \| 'app' \| 'source'`. | SÍ (`if-outside`) |

## Render

| Término | Definición exacta |
|---|---|
| **renderMode** | `'micro' \| 'compact' \| 'standard' \| 'rich'` derivado del zoom (≤5 / 6-8 / 9-11 / ≥12). |
| **viewMode** | Modo principal de la app: mapa global vs vista de documento. Reset de selección/focus al cambiar. |
| **renderContext** | Conjunto `{viewMode, documentId, ownershipFilter, filterByUserId}` que determina qué pipeline de visibilidad se aplica. |
| **isCatalog** | Flag dominio: el POI pertenece a una colección catálogo común (afecta visibilidad cross-user). |

## Cámara y subconjuntos

| Término | Definición |
|---|---|
| **subset-fit** | Encuadrar la cámara sobre un subconjunto explícito de POIs. Único contrato: `requestSubsetFit`. |
| **mode: always** | Acción explícita del usuario. Ignora cooldown manual. Siempre encuadra. |
| **mode: if-outside** | Encuadre oportunista. Solo si <40% del subset en viewport. Respeta cooldown manual 4s. |
| **cooldown manual** | 4s tras gesto real (`movestart`/`zoomstart`/`dragstart` con `originalEvent != null`). Solo bloquea `if-outside`. |
| **culling** | A z≥7, solo se montan markers cuyo punto cae en bounds ampliados del viewport. |

## Operaciones pesadas

| Término | Definición |
|---|---|
| **operation pending** | Recién creada. Aún no `markRunning` ni `setProgress`. |
| **operation running** | Activamente ejecutando. Puede tener `progress` numérico. |
| **operation done** | Finalizada con éxito. Auto-purga 1.5s. |
| **operation error** | Finalizada con fallo. Auto-purga 4s. |
| **watchdog** | Timer interno por op. Si sigue viva al expirar → `failOperation`. |
| **blockReentry** | Si `true`, `startOperation` devuelve `false` cuando ya hay op viva con el mismo id. |

## Origen del POI (PoiSource)

| Valor | Significado |
|---|---|
| **own** | Owner del POI === currentUser. Forma círculo. Recibe identidad propia (estado/rings/tint). |
| **followed** | POI de un usuario que el current user sigue (`followStatus='accepted'`) y pasa `isShareablePoi`. Forma triángulo invertido sin stroke. Color = OKLCH del owner. |
| **app** | POI editorial gestionado por la app. Capa global con `entityHidden: id[]`. |
| **source** | POI proveniente de fuentes externas (catálogos). Capa global con zoom gate ≥8. |

## Visibilidad

| Término | Definición |
|---|---|
| **isShareablePoi** | Helper que decide si un POI ajeno puede entrar al mapa del viewer (curated-only boundary). |
| **bypassZoomGates** | Flag de `applyLayerVisibility` activo cuando `filterByUserId` está set. Permite ver `followed/app/source` a cualquier zoom. |
| **entityHidden** | `id[]` por capa. Ocultar entidades concretas sin destruir la capa. |
| **collection-tint-ring** | Anillo de color de colección DEL OWNER. Apilado debajo de health rings. Privado del owner. |
| **health rings** | 4 anillos 5px concéntricos POR FUERA del marker. Privados del owner. Visibles z≥6. |

## Eventos canónicos del bus

| Evento | Payload | Origen | Listener |
|---|---|---|---|
| `subset-fit-bounds-request` | `SubsetFitDetail` | `requestSubsetFit` | `LocationMap` (único) |
| `lovable:my-catalog-popover-applied` | `MyCatalogPopoverAppliedDetail` | `MyCatalogQuickFilters` | `use-my-catalog-popover-fit` |
| `lovable:my-catalog-popover-empty` | `MyCatalogPopoverEmptyDetail` | hook | `MyCatalogQuickFilters` (UI) |
| `lovable:owner-identity-updated` | — | allocator | `LocationMap` (repinta) + `UsersSidebar` (badge) |
| `COLLECTION_VISIBILITY_EVENT` | — | toggles | `LocationMap` (tints) |
| `COLLECTION_FIT_BOUNDS_EVENT` | `{collectionId, mode}` | toggles | `LocationMap` (auto-fit) |
| `popupclose` | Leaflet | Leaflet | `map.on('popupclose')` único |
