# P-POPUP-7C — Hero chrome reduction · Validation

**Fecha**: 2026-05-16
**Scope**: visual-only sobre `buildVisitedHeroOverlay` + sección hero de
`buildImageSection` en `src/components/map/map-popups.ts` + 3 reglas CSS
en `src/index.css`.

## Objetivo

Reducir el ruido visual del hero del popup sin cambiar handlers, schema,
rating, taxonomy, collections, provenance, geo, lifecycle, marker
grammar, F2, React migration ni PopupShell. Botón cerrar y menú ⋯
explícitamente fuera de scope.

## Cambios

### 1. Overlay Visitado/Pendiente compacto

Antes: pill ancha, padding `5px 10px 5px 8px`, font 11px, icono 14px,
verified 12px, gap 6px.

Después (P-POPUP-7C):
- Posición: `bottom-left` (sin cambio).
- Padding: `3px 7px 3px 6px`.
- Font: `10px`, weight 600.
- Icono principal: `12px`. Verified: `10px`.
- Gap: `4px`.
- Class añadida: `popup-hero-visited-badge` (hook semántico).
- `data-action`, `data-visited-state`, `data-visited-hero-overlay`,
  `aria-label`, `title` intactos. Sigue clicable.

### 2. Controles foto (upload/delete) reveal-on-hover

Antes: siempre visibles top-right del hero.

Después:
- Wrapper externo del hero ahora lleva `class="popup-hero"`.
- Bloque de controles lleva `class="popup-hero-controls"`.
- Botones `data-action="upload-photo"` y `data-action="delete-photo"`
  EXACTAMENTE iguales (markup, handlers, SVGs).
- CSS añadido en `src/index.css`:
  ```css
  .popup-hero .popup-hero-controls { opacity: 0; transition: opacity 120ms ease; }
  .popup-hero:hover .popup-hero-controls,
  .popup-hero:focus-within .popup-hero-controls { opacity: 1; }
  @media (hover: none) { .popup-hero .popup-hero-controls { opacity: 1; } }
  ```
- Desktop: invisibles en reposo, aparecen on hover/focus.
- Touch/mobile (`hover: none`): siempre visibles (fallback seguro).

### 3. Botón cerrar

NO se toca. Queda para PR posterior.

### 4. Menú ⋯

NO se introduce.

## Tests

- `src/test/popup-visited-hero-overlay.test.ts` — actualizado: el badge
  contiene class `popup-hero-visited-badge`, `font-size: 10px`,
  `padding: 3px 7px 3px 6px`.
- `src/test/popup-hero-chrome.test.ts` — **nuevo**: 5 tests verifican
  wrapper `popup-hero`, wrapper `popup-hero-controls`, presencia de
  `data-action="upload-photo"` / `data-action="delete-photo"`, ausencia
  de controles para non-own viewers, y overlay sigue inyectado.

Resultado: **48/48 tests verdes** (suites: hero-overlay, hero-chrome,
presentation-state, personal-state-hierarchy).

## QA visual

POI: Reserva Natural Integral de Muniellos (visitado, sin user image,
con AI image).

- **Reposo** (`tool-results://screenshots/20260516-190131-333706.png`):
  badge compacto "✓ Visitado" verde en bottom-left. Hero sin chrome
  superpuesto (sólo botón close por defecto top-right).
- **Hover sobre hero**
  (`tool-results://screenshots/20260516-190142-291420.png`): aparece
  el botón cámara (upload-photo) top-right con drop-shadow. Badge
  "Visitado" sigue visible bottom-left.
- Click sobre el badge toggle-visited sigue operativo (handler
  intacto).

## Conclusión

Hero chrome reducido. Acciones y handlers preservados. Comportamiento
mobile/touch protegido por `@media (hover: none)`. Listo para promover
a canon visual.
