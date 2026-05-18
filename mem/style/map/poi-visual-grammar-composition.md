---
name: POI visual grammar — single composition point (PR-MAP-CANON-1)
description: Renderer del mapa lee `resolvePoiVisualGrammar(viewerUid, loc)` — único punto de composición sobre marker grammar + visual state + health rings + curation level. Renderer no compone, solo pinta.
type: design
---

# PR-MAP-CANON-1 — Single source of visual truth for POIs on the map

**Helper único**: `resolvePoiVisualGrammar(viewerUid, loc): PoiVisualGrammar`
en `src/domains/content/lib/poi-visual-grammar.ts`.

Combina los 4 resolvers canónicos en UN objeto declarativo:

| Campo | Fuente | Significado |
|---|---|---|
| `grammar` | `resolveMarkerGrammar` | shape + paletteScope + flags (own/followed/app/source) |
| `visualState` | `getPointVisualState` | `enriched\|imported\|empty` (relevante solo si `paletteScope='state'`) |
| `healthRings` | `getPointHealthRings` (con ownership guard) | rings activos, `[]` para no-own |
| `curation` | `getPoiCurationLevel` | POI-0/1/3/5/9/10 + bodyBlocker + primaryAction |

## Invariantes (regla DURA)

1. `grammar.source.type === 'own'` ⇔ `paletteScope === 'state'` ⇔ `allow*` flags todos `true`.
2. Followed/app/source SIEMPRE reciben `healthRings: []` (PR-1 curated-only sharing).
3. `curation.level ∈ {0,1,3,5,9,10}` — sin niveles nuevos.
4. Función PURA. Misma entrada → misma salida. Sin DOM/Leaflet/tokens.

## Contrato renderer

`createCustomIcon` (`src/components/map/map-icons.ts`) es el único renderer y
SOLO lee el grammar. Cero composición/heurística en el renderer.

PR-MAP-CANON-1 es **NO-OP visual**: `curation` se computa y se transporta pero
el renderer no diferencia por nivel todavía. Esa decisión se reserva para
PR-MAP-CANON-3.

## Hardcodes eliminados (PR-MAP-CANON-2)

Tokenizados en `src/design-system/tokens/source/poi.json`:
- `poi.neutral.{app,source}.{fill,stroke}` (antes literales HSL en `map-icons.ts:36-39`)
- `poi.halo.own` (antes literal `drop-shadow(...)` en `map-icons.ts:355`)
- `poi.animation.{celebrate,pulse}` (antes literales animation string)
- `poi.microDot.byZoom.{z3OrLess,z4,z5}` (antes ramp hardcoded 2/3/4)
- `poi.shadow.*` ya tokenizado; eliminados fallbacks literales redundantes.

## Tests

- `src/test/poi-visual-grammar.test.ts` (8 tests) — contrato + invariantes + purity.
- `src/test/poi-marker-grammar.test.ts` mantiene su validez (capa interna).

## Backlog futuro

- **PR-MAP-CANON-3**: introducir paleta por nivel POI-N (`poi.level.{0,1,3,5,9,10}.*`)
  y decidir UX para diferenciar POI-0 vs POI-1b, POI-9 vs POI-10. Pendiente
  de revisión del canon UX del mapa.
- **PR-MAP-CANON-4**: purgar `src/domains/v2/visual-grammar.ts` (`@deprecated`)
  y `MARKER_ICON_PATHS` residuales en `map-constants.ts` si sin callers.
