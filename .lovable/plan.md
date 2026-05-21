# Fase A — Subordinación visual de capas secundarias (patch 1.3.6 → 1.3.7)

Aplicar SOLO Fase A. No tocar Fase B, escala POI-N, `computePoiMaturity`, `getPoiMaturityColor`, marker fill, datos, edge functions ni migraciones.

## Cambios

### 1. Health rings — opacidad 0.45 + ancho 5→3px

`src/domains/content/lib/point-health-rings.ts`:

- `RING_COLORS`: hornear alpha 0.45 en el token usando `hsl(var(--…) / 0.45)`. Mantiene el hue semántico (amber/yellow/magenta/red) pero al 45% de peso visual. Cubre las dos ramas de render (border en dot, drop-shadow en pin) sin overrides.
- `RING_WIDTH`: `5 → 3`.

Efecto colateral controlado: `RING_GAP = RING_WIDTH` (en `map-icons.ts`) hereda → el padding total `ringPad = ringCount * 3 + 2` reduce el `containerSize` del dot, manteniendo centrado e iconAnchor correctos (lógica ya parametrizada).

### 2. Collection tint ring — opacity 0.45 + dashed

`src/index.css` regla `.collection-tint-ring`:

```css
.collection-tint-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: var(--collection-ring-width, 2px) dashed var(--collection-tint, #ffffff);
  opacity: 0.45;
  pointer-events: none;
  box-sizing: border-box;
}
```

Cambio: `solid → dashed`, `opacity: 0.8 → 0.45`. Solo render del tint; no toca lógica de colecciones ni el color elegido por el usuario.

### 3. Coherence/review chip — 14px → 10px, opacity 0.95 → 0.85

`src/components/map/map-icons.ts` (rama `renderMode === 'rich'`, construcción `glyphHtml`):

- Contenedor `width:14px;height:14px` → `width:10px;height:10px`.
- Posición `top:-4px; right:-4px` → `top:-3px; right:-3px`.
- Fondo `hsl(var(--poi-health-review) / 0.95)` → `/ 0.85`.
- Halo del chip `box-shadow:0 0 0 1.5px hsl(var(--background))` → `0 0 0 1px hsl(var(--background))`.
- SVG `width="9" height="9"` → `width="7" height="7"`, `stroke-width="2.5"` → `2`.

### 4. Selección/focus — halo externo, sin alterar fill

`src/components/map/map-icons.ts`:

- `applyStateColor` → identidad (devuelve `hex` siempre). El fill POI-N nunca se mezcla con color de estado.
- `shadow` para `currentState !== 'normal'` usa el mismo patrón halo externo blanco que ya empleaba `isMassSelect`:
  ```ts
  const HALO_EXTERNAL =
    'drop-shadow(0 0 0 2px hsl(var(--background))) ' +
    'drop-shadow(0 0 0 3px rgba(0,0,0,0.55)) ' +
    'drop-shadow(0 1px 3px rgba(0,0,0,0.35))';
  const shadow = (currentState !== 'normal' ? HALO_EXTERNAL : getShadowForMode(renderMode)) + ownHalo;
  ```
- `getStateShadow`/`getStateColor` siguen existiendo (otros call-sites, tests) pero `map-icons.ts` deja de invocarlos para `focused/recent/selected`. No se borran helpers en esta fase.

### 5. Version bump (patch)

- `package.json`: `1.3.6 → 1.3.7`.
- `src/lib/app-version.ts`: `APP_VERSION = '1.3.7'`.
- `README.md`: badge + entrada en historial v1.3.7 con resumen "Fase A subordinación visual capas marker".

## Tests / verificación

- `src/test/health-rings.test.ts`, `src/test/map-icon-rings-gate.test.ts`: actualizar referencias a `RING_WIDTH` y a strings de color si comparan literalmente (ajustar al nuevo formato con `/ 0.45`).
- `src/test/poi-visual-grammar.test.ts`: si afirma color exacto del ring, recalibrar.
- Verificación visual rápida en preview: POI-5 con `chain+review` + colección de color saturado → debe seguir leyéndose el fill POI-N como dominante.

## Out of scope (no aplicar ahora)

- Desaturar paleta health a banda neutra común (Fase B).
- Banda de hues prohibidos para collection tint.
- Diferenciación por grosor/dash entre health rings.
- Cambios en `computePoiMaturity`, `getPoiMaturityColor`, tokens `poi.maturity.*`.
- Datos, RLS, edge functions, migraciones.

## Riesgos

- Tests snapshot que comparen literal del color del ring fallarán → ajustar.
- Rings al 45% pueden parecer débiles bajo basemaps muy claros; si feedback negativo, subir a 0.55 en hotfix (1 línea).
- El halo de selección externo aumenta el bounding box visual ~2-3px; no afecta hit-test (Leaflet usa `iconSize`).
