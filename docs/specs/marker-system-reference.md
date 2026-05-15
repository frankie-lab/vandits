# Marker System Reference

Spec consolidada del sistema de markers. Complementa [`contracts/marker-grammar-contract.md`](../contracts/marker-grammar-contract.md).

## Decisor único
`resolveMarkerGrammar(loc, ctx)` produce un `MarkerGrammar` con:
- `shape`: círculo (own) | triángulo invertido (followed) | neutro (app/source)
- `fillColor`: estado (verde/gris/naranja) o identidad OKLCH (followed)
- `rings`: orden estricto (interno → externo): collection-tint-ring → health rings (4)
- `renderMode`: derivado del zoom

## Renderer único
`createCustomIcon(grammar)`. **No decide nada**. Solo lee.

## Estados visuales (3, únicos)
| Estado | Color | Helper |
|---|---|---|
| enriched | verde | `getPointVisualState` (vía `isPointEnriched`) |
| imported | gris | description sin IA |
| empty | naranja | sin description |

Sin azul cielo. Misma paleta en todos los lugares (mapa global, vista doc, popup, miniaturas).

## Health Rings v2
- Helper único: `getPointHealthRings(loc)`.
- 4 anillos 5px concéntricos POR FUERA del marker y del collection-tint-ring.
- Visibles en `compact|standard|rich`. Ocultos en `micro` (z≤5).
- Colores: `partial=amber, chain=yellow, review=magenta, hardError=red`.

## Identidad cromática (PR-OWNER-IDENTITY-2.6)
- Persistida por viewer en `user_owner_color_assignments`, `palette_version='owner-v2.6-no-green-no-gray'`.
- Allocator: dos exclusiones duras (verdes hue 85°-175° + vecindad ancla enriched; grises C<0.16).
- Solo se asigna a `followStatus='accepted'`.
- Sidebar **no muestra triángulo** si no hay OKLCH cargado (sin fallback inventado).
- Evento `lovable:owner-identity-updated` dispara repintado de markers + refresh de badge sidebar.

## Zoom canon
Ver glosario. `renderMode` = micro/compact/standard/rich según ZOOM_THRESHOLDS.

## Cross-references
- ADR-0002 (visibility vs grammar)
- mem://style/map/health-rings-rule
- mem://style/map/poi-zoom-canon
- mem://style/map/followed-poi-grammar
- mem://constraints/poi-icon-single-source-of-truth

## Known caveats
- Markers preservados durante reconciliación pueden mantener un grammar antiguo hasta la siguiente actualización completa. Mitigación: `keepIds` solo preserva instancia, no congela grammar.
- `recentlyEnrichedIds` participa en dependencias de muchos `useEffect` de pintado. Ver auditoría stale-closures.

## Legacy behavior
- Versiones previas de palette (v1, v2, v2.1, v2.2, v2.4, v2.5) **purgadas** del store. No restaurar.
- Curators & Druids **eliminados**. Cualquier referencia residual debe limpiarse.
