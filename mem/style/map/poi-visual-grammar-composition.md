---
name: POI visual grammar composition (PR-MAP-CANON-1/3)
description: SoT visual del POI propio del mapa. resolvePoiVisualGrammar compone forma, paleta, rings y nivel canónico POI-N. levelKey es la SoT del fill desde PR-MAP-CANON-3.
type: design
---

`resolvePoiVisualGrammar(viewerUid, poi)` en `src/domains/content/lib/poi-visual-grammar.ts` es la ÚNICA composición visual del marker propio. Devuelve:

- `grammar` (`resolveMarkerGrammar`): forma + paletteScope + decoraciones por origen (own/followed/app/source).
- `visualState` (`getPointVisualState`): bucket plano enriched/imported/empty. **Compat sólo**: no decide color desde PR-MAP-CANON-3.
- `healthRings` (`getPointHealthRings`): rings filtrados por ownership (PR-1 curated-only). Señal operativa secundaria.
- `curation` (`getPoiCurationLevel`): verdict canónico POI-0…POI-10 incluyendo `levelKey: 'poi-0'|'poi-1a'|'poi-1b'|'poi-3'|'poi-5'|'poi-9'|'poi-10'`.
- `levelVisual` (PR-MAP-CANON-3): `{ levelKey, fillHsl, showStateRing }` derivado del `levelKey` y de `tokens.poi.level.<N>`. `null` cuando `paletteScope !== 'state'`.

**SoT del fill del marker propio = `levelVisual.fillHsl`**. El renderer (`createCustomIcon`) lo lee y NO consulta `entry.fill_color` (`marker_size_config`) para color cuando `levelVisual` existe. `entry` sigue rigiendo tamaño, hover y border width.

**Separación crítica**:
- `levelKey` = semántica visual del mapa (PR-MAP-CANON-3). Vive en `getPoiCurationLevel`.
- `bodyBlocker` = semántica de interacción del popup (P-POI-CURATION-2). El mapa NO lo lee.

Ambos derivan del mismo verdict canónico → mapa y popup nunca divergen, pero cada uno consume su campo.

**Tokens** en `src/design-system/tokens/source/poi.json` bajo `poi.level.{0,1a,1b,3,5,9,10}`. Cero hardcode en código.

**Rings**: aparecen sólo cuando `healthRings.length > 0`. En POI-5 los rings comunican qué tipo de deuda (`partial/chain/review/hardError`). En POI-9/10 los rings están vacíos por construcción canónica.

**followed/app/source intactos**: `levelVisual === null`. Su pipeline (forma + paleta neutra / identidad cromática) no cambia.
