# P-POPUP-7D — Hero final cleanup · Validation

**Fecha**: 2026-05-16
**Scope**: visual + opción Leaflet del popup.

## Objetivo

Dejar la hero limpia: sin X persistente y con un badge visited/pending
icon-only no intrusivo en bottom-left.

## Cambios

### 1. Eliminar X persistente del popup hero

`src/components/LocationMap.tsx` (~L1781):

```diff
- closeButton: true,
+ closeButton: false,
```

Cierre del popup vía comportamiento nativo de Leaflet (`closeOnClick: true`
por defecto): tap/click fuera del popup lo cierra. Igual en desktop y
mobile/touch — no requiere affordance visual dedicada.

### 2. Limpieza CSS muerto

Reglas `.leaflet-popup-close-button` retiradas:
- `src/components/LocationMap.tsx` ~L3102-L3119 (regla y `:hover`).
- `src/index.css` ~L265-L273.

Ambos sitios quedan con comentario de provenance apuntando a P-POPUP-7D.

### 3. Badge visited/pending icon-only

`src/components/map/map-popups.ts` función `buildVisitedHeroOverlay`:

| Antes (P-POPUP-7C) | Después (P-POPUP-7D) |
|---|---|
| Chip horizontal con icono + label (`Visitado` / `Pendiente`) + opcional verified | Botón cuadrado 24×24, sólo icono |
| `padding: 3px 7px 3px 6px`, `gap: 4px`, `font-size: 10px` | `padding: 0`, `width/height: 24px`, sin texto |
| Icono principal 12px, verified 10px adicional | Icono 14px, único |
| Fondo translúcido claro | Fondo translúcido oscuro `rgba(0,0,0,0.38)` con `backdrop-filter: blur(4px)` y borde `rgba(255,255,255,0.25)` |

- **Visitado**: SVG `check` verde (`hsl(var(--state-success))` con fallback `#16a34a`).
- **Pendiente**: SVG `circle` outline blanco.
- Posición: `bottom: 6px; left: 6px; z-index: 2; pointer-events: auto`.
- `data-action="toggle-visited"`, `data-location-id`,
  `data-visited-hero-overlay="true"`, `data-visited-state` intactos.
- `aria-label` / `title`:
  - visited=true → `"Visitado[ · {relevance} ({tiempo})] · click para quitar"`.
  - visited=false → `"Pendiente · click para marcar visitado"`.

### 4. Verified visual diferido

El badge **no renderiza visualmente** ningún icono verified (camera /
mapPin) en el hero chrome. La decisión es explícita y reduce ruido sobre
la imagen.

- El estado verified sigue disponible en `visitRelevance` y se refleja en
  el `title`/`aria-label` cuando aplica.
- La presentación visual del verified queda **diferida a una decisión
  posterior** — no se asume implícito por visited, no se mueve a otro
  contenedor en esta PR.

### 5. Sin cambios

- `buildPersonalStateBlock` y fallback pill cuando no hay hero: igual.
- Rating, upload-photo, delete-photo: igual (reveal-on-hover P-POPUP-7C
  intacto, `@media (hover: none)` mantiene fallback touch).
- Schema, handlers, taxonomy, collections, provenance, geo, lifecycle,
  marker grammar, F2, React migration, PopupShell: sin tocar.

## Tests

`src/test/popup-visited-hero-overlay.test.ts` reescrito para la nueva
matriz icon-only:

- Sin `<span>Visitado</span>` ni `<span>Pendiente</span>`.
- `width: 24px` + `height: 24px` presentes en el inline style.
- `aria-label` con "click para quitar" (visitado) y "click para marcar
  visitado" (pendiente).
- **Verified visual ausente**: `<svg>` count = 1 incluso con
  `visited_verified_at` presente.

Suite completa de popups: **48/48 verdes** (hero-overlay, hero-chrome,
presentation-state, personal-state-hierarchy).

## QA preview

POI: Reserva Natural Integral de Muniellos (visitado, con AI image).

- Hero **sin X** (esquina superior derecha limpia).
- Bottom-left: badge circular 24×24 con `✓` verde sobre fondo translúcido
  oscuro.
- Click sobre el badge → alterna a `○` (Pendiente) y vuelve. Toast/UX de
  toggle intacto (handler en `popup-events`).
- Tap/click fuera del popup → cierra el popup (default Leaflet).
- Hover sobre la imagen → aparecen botones cámara / borrar
  (P-POPUP-7C reveal-on-hover preservado).
- `@media (hover: none)` → controles foto siempre visibles en touch.

## Conclusión

Hero limpia. Verified visual queda diferido como decisión separada,
no implícito. Listo para promover a canon.

---

## Hero chrome safe-area (canon transversal) — cierre P-POPUP-7D

**Fecha**: 2026-05-16

Tras el hotfix evidente del badge clipeado, P-POPUP-7D cierra como **contrato sistémico** y no como ajuste local de un único componente.

### Problema raíz

`.popup-hero` vive dentro de `.leaflet-popup-content-wrapper`, que tiene `border-radius` + `overflow: hidden`. Cualquier overlay con offset menor al radio entra en la zona curva y queda parcialmente recortado. Cada chrome venía resolviéndolo con números distintos sin contrato compartido:

| Chrome | Posición previa |
|---|---|
| Badge visited/pending | `bottom: 6px; left: 6px` inline (clipeado) |
| Wrapper controles foto (upload/delete) | `bottom: 12px; right: 16px` inline |
| Curator avatar overlay | `bottom: 8px; right: 8px` inline |

### Contrato

Única fuente de verdad para CUALQUIER overlay flotante sobre `.popup-hero`:

- **Tokens** (`src/design-system/tokens/source/popup.json` → `hero.chromeInset` / `hero.chromeGap`):
  - `--popup-hero-chrome-inset: 12px` (cubre con holgura el radio actual del wrapper, 8px)
  - `--popup-hero-chrome-gap: 8px` (gap interno cuando hay varios chromes apilados)
- **Clases** (`src/index.css`):
  - `.popup-hero-chrome` — base (`position: absolute; z-index: 2; pointer-events: auto; inline-flex; gap: var(--popup-hero-chrome-gap)`)
  - `.popup-hero-chrome--tl | --tr | --bl | --br` — anclaje por esquina, offset = `var(--popup-hero-chrome-inset)`

### Regla

**Prohibido** `position: absolute` + offsets numéricos sueltos sobre `.popup-hero`. Cualquier overlay nuevo (badges, menús ⋯, indicadores futuros) DEBE aplicar `.popup-hero-chrome` + variante de esquina. Si el `border-radius` del popup wrapper cambia, se ajusta el token y todos los overlays se reubican a la vez.

### Migración aplicada en esta PR

`src/components/map/map-popups.ts`:

1. **Badge visited/pending** (`buildVisitedHeroOverlay`): clase `popup-hero-chrome popup-hero-chrome--bl`. Inline retira `position/bottom/left/z-index/pointer-events/display/align-items/justify-content`. Contraste reforzado: `bg rgba(0,0,0,0.5)`, borde `rgba(255,255,255,0.4)`, sombra `0 1px 3px rgba(0,0,0,0.45)`.
2. **Wrapper controles foto** (`buildImageSection`, branch `isOwn`): clase `popup-hero-controls popup-hero-chrome popup-hero-chrome--br`. `popup-hero-controls` sigue gobernando OPACIDAD (reveal-on-hover P-POPUP-7C). `popup-hero-chrome--br` gobierna POSICIÓN. Inline retira offsets.
3. **Curator avatar overlay** (`buildImageSection`, branch `curatorId`): clase `popup-hero-chrome popup-hero-chrome--br` sobre el div del avatar; el contenedor interior pasa a `class="popup-hero"` para alinearse al contrato.

### Verified visual

Se mantiene retirado del hero chrome (decisión P-POPUP-7D base). No reaparece.

### Tests

- `src/test/popup-visited-hero-overlay.test.ts` — verifica `popup-hero-chrome--bl` y ausencia de offsets inline en el badge.
- `src/test/popup-hero-chrome.test.ts` — bloque "Hero chrome safe-area" verifica clases canónicas en badge y wrapper de controles **y guardrail negativo**: ningún `position/bottom/left/right` numérico en `style` inline.

### QA visual

- Estado **visitado** → ✓ verde 24×24 completamente dentro de la hero, esquina inferior-izquierda. Sin clipping.
- Estado **pendiente** → ○ blanco visible y legible sobre fondos claros y oscuros.
- **Hover** sobre la hero → upload/delete aparecen en bottom-right (reveal P-POPUP-7C intacto), sin clipping.
- POI **curator con avatar** → avatar en bottom-right, sin clipping.
- Tap/click fuera → cierra popup (sin regresión vs P-POPUP-7D base).

---

## Superseded by P-POPUP-15 (2026-05-18)

La sección "Badge visited/pending icon-only" descrita arriba **queda anulada**. P-POPUP-15 retira el overlay visited/pendiente del hero por completo:

- `buildVisitedHeroOverlay` → no-op (`''` siempre).
- `isVisitedHeroOverlayActive` → `false` siempre.
- `buildImageSection` ya no inyecta hooks `data-visited-hero-overlay` / `data-action="toggle-visited"` / `popup-hero-visited-badge`.

El hero sólo renderiza imagen + acciones foto. El estado personal (visited/pendiente/rating) vive exclusivamente en el ratings block canónico P-POPUP-14.2. Las clases `popup-hero-chrome` y safe-area siguen vigentes para el resto de chromes (controles foto, curator avatar). Ver `mem://style/popup/hero-no-personal-state`.

Además P-POPUP-15 retira en runtime los badges debug `P-POPUP-2 ON` / `P-POPUP-3 ON` (la función `isPopupDiagBadgeVisible` ha sido eliminada). Los atributos `data-popup-*` del root permanecen como hooks de test.
