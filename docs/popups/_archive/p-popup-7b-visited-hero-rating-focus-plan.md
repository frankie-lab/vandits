# P-POPUP-7B — Visited hero overlay + minimal inline action (canon v3)

## Canon final (aprobado)

- **Overlay sobre la hero**, visible **sólo cuando `customData.visited === 'true'`**.
  - Compacto, sin texto: check Lucide 14px (color `--state-success`) + opcional verified icon (`camera` o `map-pin`) 12px si `visitRelevance`.
  - Posición esquina inferior-izquierda; fondo `hsl(var(--background)/0.85)` + `backdrop-filter: blur(4px)` para contraste sobre cualquier foto.
  - Clicable → `data-action="toggle-visited"` (mismo handler). Quita visited → overlay desaparece en el siguiente render (popup persist-on-rebuild).
  - `title` / `aria-label` describen estado + verified + acción ("Visitado · verificado por foto · click para quitar").
- **Bloque post-descripción** (siempre cuando aplica al viewer):
  - `!isVisited` → pill actual "Marcar visitado" + rating (sin cambios respecto a P-POPUP-7A).
  - `isVisited` → acción inline discreta **`✓ Visitado`** (sin pill, sin background, color `--text-secondary`, click → quita visited) + rating.
  - Verified badge **eliminado** del bloque inferior en ambos estados (vive sólo en el overlay del hero).
- **Fallback sin hero** (placeholder "Sin imagen" / "Añadir imagen"): overlay NO se renderiza; el bloque inferior cae a la pill actual con verified badge inline (comportamiento P-POPUP-7A intacto).
- **Rating** se mantiene como hoy debajo de descripción.

## Datos y handlers (sin cambios)

- `customData.visited`, `customData.visited_verified_at`, `customData.oldest_geotagged_photo_date`, `customData.user_rating`.
- Handlers: `toggle-visited`, `set-rating`, `clear-rating` (LocationMap).
- Realtime sync vía popup persist-on-rebuild.

## Helpers

- **Nuevo** `isVisitedHeroOverlayActive(location, ownership) → boolean`
  - `true` ⟺ `visited === 'true'` ∧ `!curatorId` ∧ `!isNearbyPopupContext(id)` ∧ existe `displayImage` (misma lógica que `buildImageSection`).
- **Nuevo** `buildVisitedHeroOverlay(location, ownership) → string`
  - Devuelve `''` si `!isVisitedHeroOverlayActive(...)`.
  - HTML: `<button data-action="toggle-visited">` con check + verified icon inline + title contextual; absolute inf-izq sobre el wrapper relative del hero.
- **Actualizado** `buildPersonalStateBlock(location, ctx)`
  - `ctx` ahora incluye opcional `heroOverlayActive?: boolean`.
  - `heroOverlayActive === true`:
    - Verified badge inline = `''`.
    - Si `isVisited`: pill reemplazada por inline `✓ Visitado` (link discreto sin background, `text-secondary`, gap 4px, click → `toggle-visited`).
  - `heroOverlayActive` falsy: comportamiento P-POPUP-7A intacto (pill + verified badge inline).
- `buildImageSection` envuelve el `<img>` regular en un wrapper `position: relative` e inyecta `${buildVisitedHeroOverlay(location, ownership)}` justo después.

## Spec visual del overlay

- Container: `position: absolute; bottom: 8px; left: 8px;`
- Pill: `display: inline-flex; gap: 4px; padding: 4px 6px; border-radius: 9999px;`
- Fondo: `hsl(var(--background) / 0.85); backdrop-filter: blur(4px);`
- Check 14px `hsl(var(--state-success))`; verified 12px `hsl(var(--text-secondary))`.
- Hit-area mínima 28×28 efectiva.
- Sin label textual.

## Spec inline `✓ Visitado` (bloque inferior, estado visitado)

```html
<button data-action="toggle-visited" data-location-id="{id}"
  class="popup-action-btn"
  title="Visitado · click para quitar"
  style="display:inline-flex; align-items:center; gap:4px;
         background:none; border:none; padding:0; cursor:pointer;
         color: hsl(var(--text-secondary)); font-size: 11px;">
  <svg .../>  <!-- check 12px stroke="currentColor" -->
  <span>Visitado</span>
</button>
```

## Migration Impact Check

1. **Canon afectado**: popup canon P-POPUP-7A (bloque personal post-descripción).
2. **Regla anterior**: visited pill + verified badge + rating coexisten en bloque post-descripción siempre.
3. **Regla nueva**: visited = overlay hero (sólo si visited y hay hero) + acción inline `✓ Visitado` discreta abajo; verified sólo en overlay; rating intacto.
4. **Motivo**: jerarquía visual del above-the-fold + recompensa de estado + discoverability del toggle de retroceso.
5. **Componentes**: `src/components/map/map-popups.ts` (`buildImageSection`, `buildPersonalStateBlock`, nuevo `buildVisitedHeroOverlay`, helper `isVisitedHeroOverlayActive`).
6. **Tests**:
   - actualizar `src/test/popup-personal-state-hierarchy.test.ts` (verified ausente cuando `heroOverlayActive`; inline `✓ Visitado` cuando visited+overlay activo).
   - nuevo `src/test/popup-visited-hero-overlay.test.ts` (overlay sólo si visited+hero; sin texto label; data-action correcto; ausente en curator/nearby/sin-hero).
7. **Docs**: este plan + `docs/popups/p-popup-7b-validation.md` post-implementación.
8. **Migración**: inmediata, single-pass, popup enriched + legacy.
9. **Riesgo**: contraste sobre fotos claras → mitigado con backdrop-blur + tint. Discoverability del clic en overlay → mitigado con título + cursor; además el inline `✓ Visitado` inferior sigue presente.
10. **Rollback**: revertir `map-popups.ts` al estado P-POPUP-7A (borrar overlay + helpers, restaurar visited pill + verified inline). Cero impacto en schema o handlers.
11. **Aceptación**:
    - overlay presente ⟺ visited+hero+!curator+!nearby;
    - bloque inferior nunca contiene verified badge cuando `heroOverlayActive`;
    - bloque inferior contiene inline `✓ Visitado` cuando visited+overlay activo;
    - bloque inferior conserva pill "Marcar visitado" cuando no visitado o sin hero.
12. **Deuda fuera de scope**: wishlist/pending, lifecycle, schema customData, marker grammar, taxonomy, collections, provenance, F2, React migration, PopupShell.

## Scope NO tocado

taxonomy · collections · provenance · geo hierarchy · lifecycle · F2 · React migration · PopupShell · wishlist/pending · marker grammar · schema customData.
