# P-POPUP-7B — Validation

## Canon implementado

- **Overlay hero visible sólo cuando** `customData.visited === 'true'` ∧ `!curatorId` ∧ `!isNearbyPopupContext(id)` ∧ existe `displayImage`.
- **Compacto sin texto**: check Lucide 14px (`--state-success`) + verified opcional (`camera`/`mapPin`) 12px.
- Posición esquina inferior-izquierda; fondo `hsl(var(--background)/0.85)` + `backdrop-filter: blur(4px)`.
- Clicable → `data-action="toggle-visited"` (mismo handler).
- `aria-label` + `title` = `"Visitado · {verifiedLabel} ({hace…}) · click para quitar"`.
- **Bloque inferior** cuando `heroOverlayActive`:
  - `isVisited` → inline discreto `✓ Visitado` (sin pill, sin background, `--text-secondary`, click → `toggle-visited`).
  - verified badge inline **eliminado** (vive sólo en overlay).
- **Fallback sin hero** (legacy popup con `enriched=null`, o sin user/AI image): overlay no se renderiza; comportamiento P-POPUP-7A intacto (pill + verified inline).
- **Rating** sin cambios respecto a P-POPUP-7A.

## Cambios técnicos

### `src/components/map/map-popups.ts`

- Nuevo `isVisitedHeroOverlayActive(location, ownership, enriched?)` — gate único que respeta la misma lógica de `displayImage` que `buildImageSection` (legacy branch pasa `enriched=null` y suprime fallback AI).
- Nuevo `buildVisitedHeroOverlay(location, ownership, enriched?)` — devuelve el HTML del overlay o `''`.
- `buildImageSection` inyecta `${buildVisitedHeroOverlay(...)}` dentro del wrapper `position: relative` ya existente (no se modifica el layout del hero).
- `buildPersonalStateBlock` acepta `ctx.heroOverlayActive?: boolean`. Cuando `true` + `isVisited`: render inline `data-personal-visited-inline="true"` y verified badge = `''`. En cualquier otro caso, comportamiento P-POPUP-7A intacto.
- Ambos call sites (enriched + legacy) calculan `heroOverlayActive` y lo pasan al bloque.

## Tests

```
src/test/popup-visited-hero-overlay.test.ts        15/15 ✓
src/test/popup-personal-state-hierarchy.test.ts    11/11 ✓
```

Cubren: gate (visited/curator/nearby/sin-hero/legacy enriched=null), data-action, ausencia de label textual, conteo de SVG (check ± verified), inline `✓ Visitado` cuando overlay activo, ausencia de verified inline, fallback P-POPUP-7A intacto cuando overlay inactivo.

## Migration impact

Sin cambios de schema, handlers ni eventos. `customData.visited`, `visited_verified_at`, `oldest_geotagged_photo_date`, `user_rating` intactos. Realtime sync vía popup persist-on-rebuild.

## Rollback

Revertir `map-popups.ts`: borrar `isVisitedHeroOverlayActive` + `buildVisitedHeroOverlay`, quitar la inyección en el wrapper de `buildImageSection`, restaurar la firma anterior de `buildPersonalStateBlock` (sin `heroOverlayActive`).

## Scope NO tocado

taxonomy · collections · provenance · geo hierarchy · lifecycle · F2 · React migration · PopupShell · wishlist/pending · marker grammar · schema customData.

---

## Post-merge fix — Overlay invisible (tokens inexistentes)

### Síntoma

En preview el inline `✓ Visitado` aparecía bajo la descripción, pero el overlay sobre la hero NO era visible.

### Diagnóstico

`buildVisitedHeroOverlay` SÍ se invocaba (mismo guard `isVisitedHeroOverlayActive` que el bloque inferior, mismos args). El wrapper hero (`position: relative`) ya alberga otros elementos absolute (botones de foto) que funcionan. El HTML del overlay estaba en el DOM.

Causa raíz: los tokens usados en el overlay **no existen** en `src/index.css`:

| Token | Existe | Efecto sin fallback |
|---|---|---|
| `--state-success` (stroke del check) | NO | SVG stroke inválido → check **invisible** |
| `--text-secondary` (verified icon)   | NO | SVG stroke inválido → verified **invisible** |
| `--surface-border` (border del pill) | NO | border inválido → sin contorno |
| `--background` (fondo del pill)      | sí | único elemento que pintaba |

Resultado: un pill semitransparente blanco ~22×22 sin iconos visibles sobre la hero. El resto del archivo resuelve este problema con el helper `tk(token, legacy)` (L69) que aplica el token si el flag `__POPUP_TOKENS_ENRICHED_V1__` está ON y cae a un literal hex/rgba en caso contrario. El overlay quedó usando los tokens en crudo.

### Fix aplicado (canon intacto)

En `buildVisitedHeroOverlay` (`src/components/map/map-popups.ts`):

- check stroke → `tk('hsl(var(--state-success))', '#16a34a')`
- verified icon → `tk('hsl(var(--text-secondary))', '#475569')`
- background pill → `tk('hsl(var(--background) / 0.85)', 'rgba(255,255,255,0.92)')`
- border pill → `tk('hsl(var(--surface-border) / 0.6)', 'rgba(15,23,42,0.18)')`

Ajustes visuales mínimos para discoverability (sin tocar canon: sin texto, esquina inferior izquierda, mismo handler):

- check icon `14 → 16px`
- verified icon `12 → 14px`
- padding `4px 6px → 5px 7px`
- añadido `z-index: 2; pointer-events: auto;` defensivos

### Tests

- `src/test/popup-visited-hero-overlay.test.ts`: nuevos asserts `z-index: 2`, `pointer-events: auto`, y `stroke="(token|#16a34a)"` para que la suite pase tanto con flag ON como OFF.
- `bunx vitest run src/test/popup-visited-hero-overlay.test.ts src/test/popup-personal-state-hierarchy.test.ts` → **27/27 verde**.

### Canon intacto

Overlay sólo si visited · sin texto · esquina inferior-izquierda · inline `✓ Visitado` debajo de descripción · mismo handler `toggle-visited` · verified sólo en overlay. Ninguna restricción tocada (taxonomy/collections/provenance/geo/lifecycle/marker grammar/F2/React migration/PopupShell/wishlist/pending).

---

## Post-merge fix #2 — Unificación: `resolveVisitedPresentationState`

### Síntoma

Tras el fix de tokens el overlay seguía sin verse en preview en POIs visited+enriched, mientras que el inline `✓ Visitado` SÍ aparecía bajo la descripción. Estado híbrido: las dos ramas no decidían "lo mismo" de forma garantizada.

### Diagnóstico

`buildVisitedHeroOverlay` (rama hero, llamado desde `buildImageSection`) e `isVisitedHeroOverlayActive` (rama bloque inferior, leído en `personalStateCtx.heroOverlayActive`) computaban de forma independiente:

- Triple cálculo de `displayImage` (overlay + `buildImageSection` + ad-hoc en el bloque).
- `enriched` se pasaba con tres semánticas distintas (`undefined` / `null` / objeto) y cada función reinterpretaba el fallback.
- No había single source of truth: cualquier cambio futuro en una rama desincronizaba la otra sin que el test lo detectara.

### Fix aplicado (canon intacto)

Nuevo helper canonical en `src/components/map/map-popups.ts`:

```ts
resolveVisitedPresentationState(location, ownership, enriched): VisitedPresentationState
```

Devuelve la matriz completa:

| Campo | Significado |
|---|---|
| `isVisited` | `customData.visited === 'true'` |
| `hasHero` | hero image realmente renderizable (mismo cálculo que `buildImageSection`) |
| `isCurator` | `ownership.curatorId` truthy |
| `isNearby` | `isNearbyPopupContext(location.id)` |
| `visitRelevance` | `calculateVisitRelevance(...)` si `isVisited` |
| `showHeroOverlay` | `isVisited && hasHero && !isCurator && !isNearby` |
| `showInlineVisited` | `=== showHeroOverlay` |
| `showVisitedPill` | `!isCurator && !isNearby && !showHeroOverlay` |
| `showVerifiedOnHero` | `showHeroOverlay && !!visitRelevance` |

Acompañado de un helper privado `resolveHeroDisplayImage(location, enriched, ownership)` que centraliza el cómputo de `displayImage` (mismo algoritmo que `buildImageSection`, respetando la convención `enriched === null` para la rama legacy).

- `isVisitedHeroOverlayActive` queda como wrapper de 1 línea: `resolveVisitedPresentationState(...).showHeroOverlay`.
- `buildVisitedHeroOverlay` admite un parámetro opcional `state?: VisitedPresentationState` para reutilizar el estado ya resuelto sin recomputarlo.
- `buildImageSection` admite el mismo parámetro y se lo propaga al overlay.
- Los dos call sites de `createPopupContent` (rama enriched L1242 y rama legacy L1626) calculan el state **una sola vez** y lo comparten entre `buildImageSection` y `buildPersonalStateBlock` (`heroOverlayActive: visitedState.showHeroOverlay`).

Resultado: imposible que el overlay y el bloque inferior tomen decisiones distintas — comparten el mismo objeto `VisitedPresentationState`.

### Tests

- Nuevo `src/test/popup-visited-presentation-state.test.ts` (9 casos): matriz canon + invariante `isVisitedHeroOverlayActive === state.showHeroOverlay` + respeto al `state` precomputado.
- Suites previas intactas: `popup-visited-hero-overlay.test.ts` (16/16) y `popup-personal-state-hierarchy.test.ts` (11/11).
- Total `bunx vitest run src/test/popup-visited-{hero-overlay,presentation-state}.test.ts src/test/popup-personal-state-hierarchy.test.ts` → **36/36 verde**.

### Canon intacto

- visited=true + hero válida → overlay visible + inline `✓ Visitado` discreto.
- visited=false → sin overlay + pill "Marcar visitado".
- verified sólo en overlay cuando hay hero.
- rating sin cambios.
- handlers, schema y realtime intactos.

### Scope NO tocado

P-POPUP-7C · P-POPUP-8 · taxonomy · collections · provenance · geo · lifecycle · marker grammar · F2 · React migration · PopupShell · wishlist/pending.
