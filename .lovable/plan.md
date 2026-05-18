# P-POPUP-15 — Remove hero visited overlay + hide popup debug badges

## A. Eliminar estado visited del hero

**`src/components/map/map-popups.ts`** (L1167-1172, dentro de `buildImageSection`):

- Borrar la llamada `const __overlayHtml = buildVisitedHeroOverlay(...)` y el slot `${__overlayHtml}` del template del `.popup-hero`.
- El hero queda sólo con `imageHtml` + `buttonHtml` (acciones foto, reveal-on-hover P-POPUP-7C intacto).

**Contrato lógico (no borrar exports todavía)**:

- Mantener `buildVisitedHeroOverlay` e `isVisitedHeroOverlayActive` exportados como **no-op de contrato** durante una versión: ambos devuelven `''` / `false` siempre. Esto evita romper imports externos y deja un único punto de verdad ("hero overlay desactivado por P-POPUP-15").
- Añadir comentario de provenance arriba del helper apuntando a P-POPUP-15.

**Sincronizar `buildPersonalStateBlock`**:

- En el call-site donde se pasa `heroOverlayActive`, forzarlo a `false` (o eliminar la rama porque ya nunca está activo). El bloque de ratings P-POPUP-14.2 sigue siendo SOT del estado visited/pendiente — sin cambios funcionales.

## B. Ocultar badges debug P-POPUP-2 ON / P-POPUP-3 ON

**`src/components/map/map-popups.ts`** (L1446, raíz del `#${popupId}`):

- Eliminar los dos bloques inline `${isPopupDiagBadgeVisible() && ... ? '<div ...>P-POPUP-2 ON</div>' : ''}` y el equivalente `P-POPUP-3 ON`.
- Retirar la función `isPopupDiagBadgeVisible` (L148-156) — ya no la consume nadie.
- Los atributos `data-popup-version` / `data-popup-geo-canonical` / `data-popup-ownership-strip` del root se conservan: son hooks de test, no UI visible.

Resultado: nunca más badges técnicos en la esquina superior izquierda del hero, ni en preview (lovable.app), ni con `?diag=1`, ni en producción.

## C. Tests

**`src/test/popup-visited-hero-overlay.test.ts`** — reescribir como contrato negativo:

- `buildVisitedHeroOverlay(...)` SIEMPRE devuelve `''` (cualquier input).
- `isVisitedHeroOverlayActive(...)` SIEMPRE devuelve `false`.
- Añadir guard: el HTML de `buildImageSection` NO contiene `data-visited-hero-overlay` ni `data-action="toggle-visited"` en ningún caso (visited/pending, AI/user image, own/follower).

**`src/test/popup-visited-presentation-state.test.ts`** — ajustar la rama que asume `showHeroOverlay` puede ser `true`; ahora siempre `false`. El bloque de ratings sigue siendo la única fuente.

**`src/test/popup-hero-chrome.test.ts`** — quitar el caso "overlay Visitado/Pendiente sigue inyectado en el hero" (ya no aplica). Mantener tests de `popup-hero` + `popup-hero-controls` + reveal-on-hover.

**Nuevo test `src/test/popup-no-diag-badges.test.ts`**:

- `createPopupContent(...)` nunca contiene `>P-POPUP-2 ON<` ni `>P-POPUP-3 ON<` en ningún hostname / con `?diag=1` simulado.

## D. Documentación + memoria

- **`docs/popups/p-popup-7d-validation.md`**: nota al final marcando la sección "badge visited/pending icon-only" como **superseded by P-POPUP-15** (hero overlay retirado; estado personal vive sólo en ratings block).
- **`docs/contracts/popup-contract.md`** § Hero / § Ratings: aclarar que el hero NO renderiza estado personal ni badges técnicos; el estado personal vive exclusivamente en el bloque de ratings P-POPUP-14.2.
- **Nueva memoria `mem://style/popup/hero-no-personal-state`**: regla canónica "Hero sólo imagen + photo actions. Estado personal exclusivamente en ratings block. Sin badges de debug visibles en runtime."
- Actualizar `mem://index.md` Core con una línea referenciando la nueva regla y eliminando cualquier mención al "badge visited en hero" del bullet de P-POPUP-7D.

## E. No tocar

Ratings block P-POPUP-14.2, footer, composer, hero image, photo actions (reveal-on-hover), schema, marker grammar, curation levels, shell canónico, breadcrumb territorial, taxonomía.

## Verificación

```
bunx vitest run popup-visited-hero-overlay popup-visited-presentation-state \
  popup-hero-chrome popup-no-diag-badges popup-golden-poi-contract \
  popup-curation-primary-action
```

Inspección manual en preview: abrir POI visitado + POI pendiente. Hero limpio (sólo foto + controles al hacer hover si own). Sin check verde, sin círculo blanco, sin chips "P-POPUP-2 ON" / "P-POPUP-3 ON". Bloque de ratings sigue mostrando "Pendiente" gris / "Pendiente de valoración" verde / "Tu valoración ★★★★" según corresponda.
