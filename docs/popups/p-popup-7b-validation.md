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
