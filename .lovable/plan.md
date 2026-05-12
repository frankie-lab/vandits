## Objetivo

Aplicar la matriz canónica de POIs como única verdad transversal. La fórmula `size = round(base × modeScale(zoom))`, los estados visuales y los modificadores ya existen — el cambio principal son **los umbrales de banda** (corren un zoom hacia abajo) y la rampa **modeScale por zoom** se realinea, además de actualizar culling y memorias para que la documentación coincida con el código.

`createCustomIcon` sigue siendo el único renderer; ningún archivo introduce overrides locales.

---

## Cambios

### 1. Tokens de zoom (`src/design-system/tokens/source/map.json`)

Shift de un zoom hacia abajo:

| Token | Antes | Después |
|---|---|---|
| `map.zoom.microMax` | 10 | **9** |
| `map.zoom.compactMax` | 12 | **11** |
| `map.zoom.standardMax` | 15 | **14** |
| `map.zoom.heroMin` | 16 | **15** |
| `map.zoom.richMin` | 16 | **15** |

### 2. Tokens de escala por zoom (`src/design-system/tokens/source/poi.json`)

`poi.renderScale.byZoom` realineado a las nuevas bandas:

| Zoom | Antes | Después | Banda |
|---|---|---|---|
| z10 | (no listado) | **0.85** | compact |
| z11 | 0.85 | **0.95** | compact |
| z12 | 0.95 | **1.00** | standard |
| z13 | 1.00 | **1.05** | standard |
| z14 | 1.05 | **1.10** | standard |
| z15 | 1.10 | **1.15** | rich |
| z16 | 1.15 | **1.15** | rich |

Tras editar los JSON se ejecuta `node src/design-system/tokens/build-tokens.cjs` para regenerar `tokens.css` / `tokens.ts` / `tailwind.tokens.cjs`.

### 3. Renderer canónico (`src/components/map/map-icons.ts`)

- **Rampa micro**: mantener `z≤6 → 2px`, `z7 → 3px`, `z8 → 4px`, `z9 → 5px`. Como `microMax` baja a 9, `z10` ya entra en `compact` (SVG). La función `getRenderModeForZoom` no cambia: lee directamente los tokens.
- Comentarios de bandas se actualizan a `compact (z10–11)` y `standard (z12–14)` y `rich (z≥15)`.
- Confirmar que `getModeScaleForZoom` sigue leyendo `poi.renderScale.byZoom.zNN` con fallback por banda — sin cambios funcionales.
- Verificar `getBaseSize` (`useMarkerSizeConfig.ts`): hoy ya devuelve `12 / 16 / 18 / 24` para `enriched/imported/empty`, alineado con la matriz. No requiere cambio.

### 4. Viewport culling (`src/components/map/viewport-culling.ts`)

Bajar los umbrales un zoom para que las nuevas bandas y el culling coincidan:

| Zoom | Antes | Después |
|---|---|---|
| z ≤ 9 | sin culling | **sin culling** |
| z 10–11 | culling pad 1.0 *(antes z11–12)* | **culling pad 1.0** |
| z 12–14 | culling pad 0.75 *(antes z13–15)* | **culling pad 0.75** |
| z ≥ 15 | culling pad 0.5 *(antes z≥16)* | **culling pad 0.5** |

Cambios: `shouldCullByViewport` pasa de `>= 11` a `>= 10`; `getViewportPadForZoom` usa los nuevos cortes (`>=15 → 0.5`, `>=12 → 0.75`, `>=10 → 1.0`).

### 5. Memorias (alinear documentación al nuevo canon)

- **Reemplazar** `mem://style/map/zoom-driven-hero` y `mem://style/map/micro-marker-size` por una única memoria canónica:
  `mem://style/map/poi-zoom-canon` con la matriz completa (bandas, modeScale, base sizes, modificadores, polaroid, culling, reglas transversales y excepciones home/gps/photo/route).
- Actualizar `mem://logic/map/viewport-culling-v1` con los nuevos umbrales (z10 inicia culling).
- Actualizar la entrada Core relevante en `mem://index.md` y refrescar la lista de Memories.

### 6. Verificación

- `node src/design-system/tokens/build-tokens.cjs` para regenerar tokens.
- Build automático para asegurar tipado.
- QA visual rápida: en preview cambiar zoom 8 → 16 sobre la misma colección y comprobar que un mismo POI:
  - z8–9 = microdot 4–5px sin tint ni rings
  - z10–11 = SVG compact con tint de colección, sin gradient/rings
  - z12–14 = SVG standard con gradient + health rings + doble sombra
  - z15+ = polaroid hero
- Confirmar que `refreshV2Icons` sigue regenerando icons en `zoomend` (sin cambios necesarios; ya conectado).

---

## Fuera de alcance

- No se tocan estados visuales ni paleta (verde/gris/naranja).
- No se tocan tipos especiales (`home`, `user_gps`, `nearby_result`, `photo_thumbnail`, `route_*`) — siguen con su tabla en `useMarkerSizeConfig`.
- No se exponen los tokens de zoom como preferencia de usuario (la gramática V2 sigue congelada).
- No se cambia la lógica de `keepIds` (focused + openPopup).
