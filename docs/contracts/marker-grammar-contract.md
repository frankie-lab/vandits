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
- mem://style/map/poi-visual-grammar-composition (PR-MAP-CANON-1)
- mem://logic/poi/source-pipeline-canonical
- mem://constraints/poi-icon-single-source-of-truth

## PR-MAP-CANON-1 — Single composition point

`createCustomIcon` consume `resolvePoiVisualGrammar(viewerUid, loc)` que
combina marker grammar + visual state + health rings (con ownership guard) +
curation level (POI-0…POI-10) en un único objeto declarativo. El renderer
NO compone — sólo pinta. La paleta por nivel POI-N queda reservada para
PR-MAP-CANON-3.

## PR-MAP-CANON-2 — Tokens (hardcodes eliminados)

Tokenizados en `src/design-system/tokens/source/poi.json`:
`poi.neutral.{app,source}.{fill,stroke}`, `poi.halo.own`,
`poi.animation.{celebrate,pulse}`, `poi.microDot.byZoom.*`. Sin literales HSL
ni `drop-shadow(...)` ni `animation: ...` en `map-icons.ts`.

## PR-MAP-CANON-3 — Tabla final del mapa (cierre canónico)

`levelKey` (derivado de `getPoiCurationLevel`) gobierna el **fill del own
marker**. `showStateRing` gobierna si se pintan **rings**. En V1 solo
`poi-5` los pinta. La paleta histórica `enriched / imported / empty`
(`getPointVisualState`) queda como **compat / legacy** para call-sites
sin `levelVisual`, NO como SoT visual del mapa.

| levelKey  | fill token        | rings | aplica solo a own |
|-----------|-------------------|-------|-------------------|
| `poi-0`   | `poi.level.0`     | no    | sí                |
| `poi-1a`  | `poi.level.1a`    | no    | sí                |
| `poi-1b`  | `poi.level.1b`    | no    | sí                |
| `poi-3`   | `poi.level.3`     | no    | sí                |
| `poi-5`   | `poi.level.5`     | **sí**| sí                |
| `poi-9`   | `poi.level.9`     | no    | sí                |
| `poi-10`  | `poi.level.10`    | no    | sí                |

Reglas duras:

- El fill del marker own = `levelVisual.fillHsl` exclusivamente. El
  renderer no consulta `entry.fill_color` para color cuando `levelVisual`
  existe (sigue rigiendo tamaño, hover y border width).
- Rings se pintan **iff** `levelVisual.showStateRing === true`. En V1
  eso es solo `poi-5`. `getPointHealthRings` sigue siendo SoT de **deuda
  operativa** (panel salud, reparación, contadores) pero NO de pintura.
- `followed`, `app`, `source`: `levelVisual === null`. Su forma y paleta
  (triángulo invertido con identidad OKLCH para followed; neutros para
  app/source) no cambian respecto al canon previo.

**SoT visual del mapa**: `resolvePoiVisualGrammar` (decisor) →
`createCustomIcon` (renderer puro, solo lee).

**Fuera de alcance V1**: diferenciación visual POI-0 vs POI-1a y
POI-9 vs POI-10, glyph system completo en markers.


