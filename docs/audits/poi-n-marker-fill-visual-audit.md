# Auditoría visual — Contrato POI-N vs colores reales del marker

**Fecha**: 2026-05-21 · **Versión**: 1.3.6 · **Modo**: read-only (sin cambios de código/tokens/datos).

## TL;DR

**No hay bug**. El fill principal del marker propio sale **siempre** del token `poi.maturity.<level>` vía la cadena canónica
`computePoiMaturity → getPoiMaturityColor → resolvePoiVisualGrammar.levelVisual.fillHsl → createCustomIcon` (canon v3 Fase 2, v1.3.1).

Los colores que parecen “no-POI-N” (naranjas, rojos, morados) tienen dos orígenes legítimos y **separados** del fill principal:

1. **Naranjas y amarillos saturados son la propia paleta `poi.maturity`** (POI-3/4/5/6/7). No son un overlay ni un bug — el contrato POI-N v2 los define así (gris → amarillo → ámbar → verde).
2. **Rojo y magenta SOLO aparecen como overlays externos**:
   - `--poi-health-hard-error` = `0 72% 51%` (rojo) — health ring `hardError`.
   - `--poi-health-review`     = `326 77% 50%` (magenta/morado) — health ring `review` (también la insignia de incoherencia name-coords, esquina sup-der).
   - Estos rings se apilan **POR FUERA** del dot y del collection-tint-ring (`mem://style/map/health-rings-rule`). Nunca sustituyen al fill.

## 1. Cadena de resolución (SoT)

| Paso | Archivo | Output relevante |
|---|---|---|
| 1. Ladder POI-N (0..10) | `src/domains/content/lib/poi-maturity.ts` § `computePoiMaturity` | `level: 0..10`, con techo por flag `custom_data.geo_resolution.status` |
| 2. Color desde token | `src/domains/content/lib/poi-maturity-color.ts` § `getPoiMaturityColor` | `{ level, fill: 'hsl(<token>)' }` leído de `tokens.poi.maturity[level]` |
| 3. Gramática visual única | `src/domains/content/lib/poi-visual-grammar.ts` § `resolvePoiVisualGrammar` | `levelVisual.fillHsl` (sólo cuando `grammar.paletteScope === 'state'`, i.e. POI propio) |
| 4. Renderer | `src/components/map/map-icons.ts` § `createCustomIcon` | `const baseColor = levelVisual ? hsl(${levelVisual.fillHsl}) : entry.fill_color` (líneas 394-398) |

Followed/app/source toman otra rama (triángulo invertido OKLCH / rombo neutro / hexágono neutro). `levelVisual` es `null` para ellos por invariante 2 del contrato.

## 2. Tabla `POI-N → token → color real`

Tokens leídos directos de `src/design-system/tokens/source/poi.json`:

| Nivel | Token `poi.maturity.<N>` | HSL | Color percibido | Trigger gate (qué falta para subir) |
|---|---|---|---|---|
| POI-0 | `220 8% 55%` | gris azulado | sin nombre ni coords |
| POI-1 | `30 10% 60%` | gris cálido claro | sin nombre |
| POI-2 | `30 10% 48%` | gris cálido oscuro | coords no válidas |
| POI-3 | `50 55% 65%` | amarillo claro | sin `raw_geocode` |
| POI-4 | `50 90% 55%` | amarillo fuerte | sin país/continente |
| POI-5 | `48 96% 48%` | **amarillo oro saturado** | sin región/zona — único nivel con `showStateRing` |
| POI-6 | `38 90% 60%` | **naranja claro** | sin descripción enriquecida |
| POI-7 | `32 92% 50%` | **naranja saturado** | sin imagen aceptada |
| POI-8 | `80 60% 50%` | verde lima | sin categoría/tags |
| POI-9 | `130 50% 50%` | verde estándar | falta `enrichment_status='enriched'` o `geo_health!='ok'` |
| POI-10 | `142 71% 38%` | verde oscuro | máximo, todo OK |

## 3. Origen de cada color visible

| Color visto en mapa | Es fill principal? | Origen real |
|---|---|---|
| Verde oscuro | Sí | `poi.maturity.10` — POI-10 (canon esperado) |
| Verde estándar | Sí | `poi.maturity.9` |
| Verde lima | Sí | `poi.maturity.8` |
| Naranja claro/medio | **Sí** | `poi.maturity.6/7` — POIs sin descripción o sin imagen aceptada. **Esperado por contrato**, no es bug. |
| Amarillo oro | Sí | `poi.maturity.4/5` |
| Gris | Sí | `poi.maturity.0/1/2` |
| **Rojo** | **No** | Health ring `hardError` overlay (token `--poi-health-hard-error`). Sólo se renderiza si `levelKey === 'poi-5'` (gate `levelAllowsRings`, `map-icons.ts:346`). |
| **Morado/magenta** | **No** | Health ring `review` overlay (token `--poi-health-review`) o badge de incoherencia name-coords en esquina sup-der (`map-icons.ts:439`). |
| Tinte exterior continuo (cualquier hue de colección) | **No** | `collection-tint-ring` (anillo CSS por fuera del dot, `map-icons.ts:479,522`). Modula percepción pero no toca el fill. |
| Triángulo invertido con color custom | **No** (otra rama) | Followed POI — `getOwnerIdentityColor` (OKLCH owner-v2.6). |

## 4. Verificación con 10 markers visibles

Muestreo aleatorio de POIs propios del usuario principal (`b977aa23-…`). `Nivel` calculado del `computeLadderLevel` aplicando las gates del contrato a los datos actuales:

| # | POI | País | desc | img | tags | enriched | geo_health | **Nivel POI-N esperado** | Fill esperado (token) | Rings | Tinte colección |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Castillo de Ross | IE | no | no | 0 | — | ok | **POI-6** | `38 90% 60%` naranja claro | — (no es poi-5) | si está en colección |
| 2 | Tuiza de Arriba | ES | sí | sí | 14 | enriched | ok | **POI-10** | `142 71% 38%` verde oscuro | — | — |
| 3 | Leonardo's Horse | IT | sí | sí | 13 | enriched | ok | **POI-10** | verde oscuro | — | — |
| 4 | Porte de Paris | FR | sí | sí | 15 | enriched | ok | **POI-10** | verde oscuro | — | — |
| 5 | Gourgue d'Asque | FR | sí | sí | 15 | enriched | ok | **POI-10** | verde oscuro | — | — |
| 6 | Dubrovnik (Ragusa) | HR | no | no | 0 | — | ok | **POI-6** | `38 90% 60%` naranja claro | — | — |
| 7 | Phare de Men Ruz | FR | sí | sí | 13 | enriched | ok | **POI-10** | verde oscuro | — | — |
| 8 | Santa Cruz de los Cuérragos | ES | sí | sí | 14 | enriched | ok | **POI-10** | verde oscuro | — | — |
| 9 | Briksdal Glacier | NO | sí | sí | 14 | enriched | ok | **POI-10** | verde oscuro | — | — |
| 10 | Dolmen Chapel of Sao Brissos | PT | sí | sí | 14 | enriched | ok | **POI-10** | verde oscuro | — | — |

Distribución observada coincide con expectativa: la mayoría de POIs catálogo principal están en POI-10 (verde oscuro). Los “casos naranja” (1 y 6) son POI-6 legítimos: tienen geografía resuelta pero les falta descripción enriquecida.

## 5. Por qué un usuario podría percibir “muchos naranjas”

- **POI-7 sandbox**: el set `sandbox-agent` (252 POIs Atlas Obscura sin `enriched_data.imagen` antes de L1/L2) caía en POI-7 por defecto → naranja saturado (`32 92% 50%`). Tras L1 (41 accepted) + L2 (56 accepted) suben a POI-8/9, restantes siguen en POI-7. **Es el contrato funcionando**, no un overlay.
- **POI-6** en POIs importados sin descripción IA (ej. Castillo de Ross, Dubrovnik) — naranja claro por contrato.

## 6. Confirmación de NO interferencia

| Posible fuente sospechada | Verificación | Veredicto |
|---|---|---|
| Collection tint sobreescribe fill | `collection-tint-ring` es un `<div>` CSS hermano del SVG dot (`map-icons.ts:479,522`). No toca `fill="..."` del `<circle>` / `<path>`. | **No interfiere** |
| Owner identity colorea POI propio | `getOwnerIdentityColor` sólo se usa cuando `grammar.source.type !== 'own'` (followed). Rama distinta. | **No interfiere** |
| Health rings reemplazan fill | Son `<svg circle>` apilados externamente; `showStateRing` además limita su render al curation level `poi-5`. | **No interfiere** |
| `poi.level.*` (legacy) sigue mandando | `baseColor` se computa con `levelVisual.fillHsl` primero; `entry.fill_color` sólo es fallback cuando `levelVisual === null` (followed/app/source). | **No interfiere** |
| `poi.state.{enriched,imported,empty}` (legacy 3-estados) | `visualState` se computa para filtros/leyendas legacy pero el renderer **no la lee** como fill desde canon v3 Fase 2. | **No interfiere** |
| Selected/focus override | `applyStateColor` solo modifica el color cuando `currentState ∈ {focused, selected, recent}` y no es mass-select (líneas 376-379). Es el comportamiento esperado de feedback de interacción. | **Correcto, no es bug** |
| Overlay debug | `MaturityBadgeLayer` y `MaturityDiagnosticsControl` sólo se montan tras gate admin/QA. No alteran el fill. | **No interfiere** |
| Cache de levelKey | `resolvePoiVisualGrammar` es pura, sin caché. Recomputado por marker. | **N/A** |
| CSS/tokens sin regenerar | `tokens.ts` y `tokens.css` regenerados desde `poi.json` (presentes en `src/design-system/tokens/build/`). Los 11 niveles maturity están materializados. | **OK** |

## 7. Plan de corrección

No procede — el contrato POI-N v2 se está respetando.

## 8. Recomendaciones (opcionales, fuera de scope)

1. **Documentar al producto** que naranjas POI-6/7 son intencionales y representan deuda de descripción/imagen, no error de salud.
2. Si visualmente se desea reducir “masa naranja” de POI-6 sin descripción, la palanca correcta es bajar la saturación del token `poi.maturity.6` (`38 90% 60%` → algo como `38 50% 65%`), **no** tocar el renderer.
3. Considerar exponer en la leyenda inferior la diferencia entre fill (madurez objetiva) y rings (incidencias puntuales en POI-5).

## 9. Referencias

- `docs/contracts/marker-fill-canon-v3.md`
- `docs/contracts/poi-maturity-visual-contract.md`
- `mem://style/map/health-rings-rule`
- `mem://logic/poi/curation-levels`
- `mem://style/popup/golden-poi-reference`
