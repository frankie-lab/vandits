# P-POPUP-7D — Hero chrome safe-area (solución transversal)

Cierre de P-POPUP-7D como **contrato único** para cualquier overlay flotante sobre `.popup-hero`. No es un ajuste de offsets del badge.

## Problema raíz

`.popup-hero` vive dentro de `.leaflet-popup-content-wrapper`, que tiene `border-radius` + `overflow: hidden`. Cualquier overlay con offset menor al radio entra en la zona curva y se clipea. Hoy cada chrome resuelve esto a mano con un número distinto:

| Chrome | Posición actual | Origen |
|---|---|---|
| Badge visited/pending | `bottom: 6px; left: 6px` (inline) | `buildVisitedHeroOverlay` (~L864) → **clipeado** |
| Wrapper foto upload/delete | `bottom: 12px; right: 16px` (inline) | `buildImageSection` (~L983) |
| Curator avatar overlay | `bottom: 8px; right: 8px` (inline) | `buildImageSection` branch curator (~L889) |

No hay contrato. Cada futuro badge o menú repetiría la negociación.

## Contrato

Una sola fuente de verdad:

```text
.popup-hero
  └─ overlay con clase .popup-hero-chrome + .popup-hero-chrome--{tl|tr|bl|br}
       offset = var(--popup-hero-chrome-inset)
       gap interno = var(--popup-hero-chrome-gap)
```

Regla: **prohibido** `position: absolute` + offsets numéricos sueltos sobre la hero. Si el `border-radius` del popup wrapper cambia, se ajusta el token y todos los overlays se reubican a la vez.

## Cambios

### 1. Token único

`src/design-system/tokens/source/popup.json` — extender el bloque `hero`:

```json
"hero": {
  "ratio":       { "value": "16 / 9", "_css": "--popup-hero-ratio" },
  "chromeInset": { "value": "12px",   "_css": "--popup-hero-chrome-inset" },
  "chromeGap":   { "value": "8px",    "_css": "--popup-hero-chrome-gap" }
}
```

`chromeInset = 12px` cubre con holgura el radio actual (`rounded-lg` = 8px del wrapper) más margen ergonómico. La pipeline `npm run tokens:build` regenera `src/design-system/tokens/build/tokens.css` (corre en predev/prebuild — no se toca).

### 2. Clase común en `src/index.css`

Junto al bloque P-POPUP-7C ya existente:

```css
/* P-POPUP-7D — Hero chrome safe-area.
   Contrato único para CUALQUIER overlay flotante sobre .popup-hero
   (badge visited, controles foto, curator overlay, futuros menús/badges).
   Ningún componente vuelve a hardcodear bottom/left/right/top sobre la hero. */
.popup-hero { position: relative; }

.popup-hero-chrome {
  position: absolute;
  z-index: 2;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--popup-hero-chrome-gap, 8px);
}
.popup-hero-chrome--tl { top:    var(--popup-hero-chrome-inset, 12px); left:  var(--popup-hero-chrome-inset, 12px); }
.popup-hero-chrome--tr { top:    var(--popup-hero-chrome-inset, 12px); right: var(--popup-hero-chrome-inset, 12px); }
.popup-hero-chrome--bl { bottom: var(--popup-hero-chrome-inset, 12px); left:  var(--popup-hero-chrome-inset, 12px); }
.popup-hero-chrome--br { bottom: var(--popup-hero-chrome-inset, 12px); right: var(--popup-hero-chrome-inset, 12px); }
```

`.popup-hero-controls` (reveal-on-hover, P-POPUP-7C) se mantiene intacta — sólo gestiona **opacidad/visibilidad**. La nueva clase gestiona **posición**. Las dos se combinan en el mismo nodo.

### 3. Aplicar a los tres chromes existentes

`src/components/map/map-popups.ts`:

**a) Badge visited/pending** (`buildVisitedHeroOverlay`, ~L864):
- Quitar del inline `style`: `position`, `bottom`, `left`, `z-index`, `pointer-events`, `display`, `align-items`, `justify-content`.
- Añadir `popup-hero-chrome popup-hero-chrome--bl` al `class` existente.
- Conservar: `width/height: 24px`, fondo translúcido, border, blur, icon ✓/○, `data-action="toggle-visited"`, `data-location-id`, `data-visited-hero-overlay`, `data-visited-state`, `aria-label`, `title`.
- Subir alpha de fondo a `rgba(0,0,0,0.5)` y borde a `rgba(255,255,255,0.4)` para mejorar contraste contra fotos claras (ajuste de contraste, no de posición — la posición es 100% sistema).

**b) Wrapper controles foto** (`buildImageSection`, ~L983):
- Quitar inline `position: absolute; bottom: 12px; right: 16px; display: flex; gap: 8px`.
- Mantener `class="popup-hero-controls"` (reveal-on-hover).
- Añadir `popup-hero-chrome popup-hero-chrome--br` al mismo div.
- El `gap` interno entre upload/delete pasa a `--popup-hero-chrome-gap` (8px, mismo valor).

**c) Curator avatar overlay** (`buildImageSection` branch curator, ~L889):
- Quitar `position: absolute; bottom: 8px; right: 8px` inline.
- Aplicar `class="popup-hero-chrome popup-hero-chrome--br"` al div del avatar.
- Resto (tamaño 40×40, sombra, borde de color curator) intacto.

### 4. Tests

`src/test/popup-hero-chrome.test.ts` — añadir asserts:
1. `.popup-hero` contiene un elemento con clases `popup-hero-chrome popup-hero-chrome--bl` y `data-action="toggle-visited"`.
2. `.popup-hero` contiene un elemento con clases `popup-hero-chrome popup-hero-chrome--br` que envuelve los botones `data-action="upload-photo"` (y `delete-photo` cuando hay foto del usuario).
3. **Negative assert sistémico**: ningún descendiente directo de `.popup-hero` con clase `popup-hero-chrome` declara `position:`, `bottom:`, `top:`, `left:` o `right:` en su atributo `style` inline — la posición proviene EXCLUSIVAMENTE de la clase. Esto es el guardrail anti-regresión que impide volver a meter offsets ad-hoc.

`src/test/popup-visited-hero-overlay.test.ts` — actualizar los asserts existentes de `bottom: 6px` / `left: 6px` inline → verificar la presencia de `popup-hero-chrome--bl`. Resto (24×24, ausencia de spans Visitado/Pendiente, aria-label, 1 sólo `<svg>` con `visited_verified_at`) intacto.

Otras suites (`popup-visited-presentation-state`, `popup-personal-state-hierarchy`, parity, hero-chrome existente) sin cambios.

### 5. QA visual

POI con hero visible, viewport 1244×1111:
1. Estado **visitado** → ✓ verde completamente dentro del recorte de la hero, esquina inferior-izquierda. Sin clipping.
2. Estado **pendiente** → ○ blanco visible con contraste correcto sobre foto clara y oscura.
3. **Hover** sobre la hero → botones foto upload/delete aparecen en bottom-right (reveal P-POPUP-7C intacto), sin clipping.
4. POI **curator con avatar** → avatar en bottom-right, sin clipping.
5. Tap/click fuera → cierra popup (sin regresión vs P-POPUP-7D base).

Capturas: reposo (badge solo) + hover (badge + controles foto) + curator (avatar). Adjuntas al doc de validación.

### 6. Documentación

Reescribir la sección de cierre de `docs/popups/p-popup-7d-validation.md` añadiendo **"Hero chrome safe-area (canon transversal)"**:

- Token `--popup-hero-chrome-inset` (12px) y `--popup-hero-chrome-gap` (8px) — única fuente de verdad para chrome sobre la hero.
- Clases `.popup-hero-chrome` + `.popup-hero-chrome--{tl|tr|bl|br}` — único anclaje permitido.
- Regla: cualquier overlay futuro (badges, menús ⋯, indicadores) aplica la misma clase. Prohibido `position: absolute` + offsets sueltos sobre `.popup-hero`.
- Chromes migrados en esta PR: badge visited, controles foto upload/delete, curator avatar overlay.
- Si el `border-radius` del popup wrapper cambia, sólo se ajusta el token.

Crear memoria `mem://style/popup/hero-chrome-safe-area` referenciando el contrato + actualizar `mem://index.md` (sección Memories) con `[Hero chrome safe-area](mem://style/popup/hero-chrome-safe-area)`.

## Fuera de scope (no se toca)

Handlers, lógica visited toggle, rating, schema, taxonomy, collections, provenance, geo, lifecycle, marker grammar, F2, React migration, PopupShell, paridad renderer↔resolver (P-POPUP-7B), `closeButton: false` (P-POPUP-7D base), reveal-on-hover (`.popup-hero-controls` sigue gobernando opacidad, esta PR sólo separa "posición" de "visibilidad").

## Entregable

P-POPUP-7D cierra como **canon transversal "hero chrome safe-area"**: un token, una clase, cuatro variantes, tres chromes existentes migrados, contrato testeado con guardrail anti-regresión y documentado como memoria de proyecto.
