# Contract — Marker Grammar

## Propósito
Decidir forma, color, anillos y modo de render de cada POI a partir de datos de dominio. Renderer puramente declarativo.

## Variables canónicas
| Variable | Tipo | Origen |
|---|---|---|
| `visualState` | `'enriched' \| 'imported' \| 'empty'` | `getPointVisualState(loc)` |
| `healthRings` | `Array<'partial'\|'chain'\|'review'\|'hardError'>` | `getPointHealthRings(loc)` |
| `poiSource` | `'own' \| 'followed' \| 'app' \| 'source'` | `resolvePoiSource(loc, currentUserId)` |
| `ownerIdentityColor` | OKLCH \| null | `getOwnerIdentityColor(uid, oklch?)` |
| `renderMode` | `'micro' \| 'compact' \| 'standard' \| 'rich'` | derivado del zoom |

## Paleta visual (3 estados únicos)
| Estado | Color | Criterio |
|---|---|---|
| enriched | verde | `enriched_data.descripcion` no vacío |
| imported | gris | description sin IA (incluye catálogo común heredado) |
| empty | naranja | sin description |

Sin azul cielo. Misma paleta en mapa global, vista doc, popup y miniaturas.

## Forma por origen
- **own** (POI propio): círculo. Recibe collection-tint-ring, health rings y estado completo.
- **followed** (seguido): triángulo invertido sin stroke, fill = OKLCH persistido por viewer.
- **app / source**: forma neutra. Sin tint privado.

## Health rings (v2)
- 4 anillos 5px concéntricos, apilados POR FUERA del marker y del collection-tint-ring.
- Visibles en `renderMode ∈ {compact, standard, rich}` (z ≥ 6). Ocultos en `micro` (z ≤ 5).
- Colores: `partial=amber, chain=yellow, review=magenta, hardError=red`.

## Zoom canon
| Zoom | renderMode |
|---|---|
| z ≤ 5 | micro |
| z 6–8 | compact |
| z 9–11 | standard |
| z ≥ 12 | rich |

## Ownership
- Decisor único: `resolveMarkerGrammar`.
- Renderer único: `createCustomIcon` (lee `MarkerGrammar`, no decide).
- Helpers de identidad: `getOwnerIdentityColor`, `getOwnerIdentityOklch` (renderer SOLO lee).

## Forbidden writes
- Crear icons fuera de `createCustomIcon`.
- Sustituir health rings por collection-tint-ring (se apilan, no se reemplazan).
- Inventar OKLCH fallback social en sidebar si no hay color asignado.
- Asignar identidad cromática a usuarios visibles no seguidos (solo `followStatus === 'accepted'`).

## Invariantes
1. Verde = enriquecido EN TODO LUGAR.
2. Health rings nunca sustituyen al marker base.
3. La forma indica **origen**; el color indica **estado** (own) o **identidad** (followed).
4. Allocator OKLCH excluye verdes (hue 85°-175° + vecindad ancla enriched) y grises (C<0.16) — duro.
5. Renderer es puro; cualquier cambio visual pasa por `resolveMarkerGrammar`.

## Pipeline canónico (PR-POI-SOURCE-1..7)
```text
resolvePoiSource
  → resolveShareability
  → filterBySource
  → resolveMarkerGrammar
  → resolveLayerGroupKey
  → applyLayerVisibility
  → createCustomIcon
```
Orden inmutable. Clasificación física (`resolveLayerGroupKey`) y visibilidad (`resolveLayerVisibility` + zoom gates) están **separadas**.

## Anti-patrones detectados
- Uso de azul cielo (eliminado).
- Crear capas por entidad para `app`/`source` (deben ser padres globales con `entityHidden: id[]`).
- Lógica de color en el renderer.

## Referencias
- mem://style/map/health-rings-rule
- mem://style/map/poi-zoom-canon
- mem://style/map/followed-poi-grammar
- mem://logic/poi/source-pipeline-canonical
- mem://constraints/poi-icon-single-source-of-truth
