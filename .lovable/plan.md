# Vandits Design System — Plan v3 (aprobado, con 3 ajustes finales)

Cambios v3 respecto a v2:
- `map/` se descompone en **`rules` / `icons` / `adapters` / `types`** para desacoplar reglas visuales de la implementación Leaflet
- Tipos canónicos compartidos en `map/types.ts` para eliminar strings inventados
- Story obligatoria **`MapDensityStress`** (100 / 500 / 2 000 puntos) para validar saturación visual
- Norma de gobernanza: **fases no se mezclan**; Storybook llega solo cuando tokens/map están estables, ESLint se endurece solo cuando los re-exports legacy ya funcionan

## Servicios

| Capa | Herramienta |
|---|---|
| Tokens | **Style Dictionary** (JSON → CSS / TS / Tailwind) |
| Componentes | shadcn + Radix + CVA |
| Catálogo | **Storybook 8** (Vite builder) |
| Hosting Storybook | Cloudflare Pages o GitHub Pages |
| Validación | ESLint `import/no-restricted-paths` + `no-restricted-syntax` |

Cero servicios de pago. Cero monorepo. Cero Figma sync.

## Arquitectura

```text
src/design-system/
├── tokens/
│   ├── source/                  ← FUENTE DE VERDAD (JSON, committed)
│   │   ├── color.json
│   │   ├── typography.json
│   │   ├── density.json
│   │   ├── motion.json
│   │   ├── radius.json
│   │   ├── z-index.json
│   │   ├── map.json             ← zoom thresholds, panes, scale
│   │   ├── poi.json             ← sizes, origins, health rings, collection rings, focus thumb
│   │   └── elevation.json       ← sombras, blur, layering físico
│   ├── build/                   ← generado, COMMITTED en Fases 1-4
│   │   ├── tokens.css
│   │   ├── tokens.ts
│   │   └── tailwind.tokens.cjs
│   ├── style-dictionary.config.cjs
│   └── index.ts                 ← sub-barrel
│
├── primitives/                  ← Button, Input, Tooltip, EmptyState, Spinner, Skeleton, Dialog, Badge…
│   └── index.ts
│
├── patterns/                    ← Panel*, FilterChip, ToolbarButton, ListRow
│   └── index.ts
│
├── map/                         ← LENGUAJE CARTOGRÁFICO PROPIO (descompuesto)
│   ├── types.ts                 ← CONTRATOS CANÓNICOS (ver abajo)
│   ├── rules/                   ← DECISIONES visuales puras (sin Leaflet)
│   │   ├── poi-visual-rules.ts  ← state + origin + zoom → PoiRenderMode
│   │   ├── poi-render-modes.ts
│   │   ├── zoom-thresholds.ts
│   │   └── marker-shapes.ts     ← SVG paths canónicos (sin DOM, solo strings)
│   ├── icons/                   ← FÁBRICAS de iconos visuales (DOM/SVG, agnósticas)
│   │   ├── create-custom-icon.ts
│   │   ├── create-micro-dot-icon.ts
│   │   ├── create-poi-svg.ts
│   │   └── create-health-ring.ts
│   ├── adapters/                ← INTEGRACIÓN con librerías concretas
│   │   └── leaflet-icon-adapter.ts   ← envuelve icons/ en L.DivIcon
│   ├── panes.ts                 ← registry de panes (consume tokens.map.pane.*)
│   └── index.ts                 ← sub-barrel
│
├── motion/
│   ├── presets.ts
│   └── index.ts
│
├── icons/                       ← Lucide controlado
│   ├── index.ts
│   └── registry.ts
│
├── docs/                        ← Storybook MDX
│   ├── Introduction.mdx
│   ├── Tokens.mdx
│   ├── MapLanguage.mdx
│   ├── Principles.mdx
│   └── ChangeLog.mdx
│
└── index.ts                     ← barrel raíz (re-exporta sub-barrels)
```

### Por qué `rules` / `icons` / `adapters` separados

| Carpeta | Qué contiene | Depende de |
|---|---|---|
| `rules/` | Lógica pura: decisiones visuales en TS, sin DOM, sin Leaflet | tokens |
| `icons/` | Producción de SVG/DOM (string o HTMLElement), agnóstica de librería | tokens + rules |
| `adapters/` | Envoltorios para Leaflet (u otra librería futura) | tokens + icons |

Si mañana se cambia Leaflet por MapLibre, solo se reescribe `adapters/`. `rules/` e `icons/` siguen funcionando.

### Tipos canónicos — `src/design-system/map/types.ts`

```ts
export type PoiOrigin       = 'mine' | 'followed' | 'service' | 'unknown';
export type PoiRenderMode   = 'micro' | 'dot' | 'pin' | 'pin-focused' | 'hero-thumb';
export type PoiVisualState  = 'enriched' | 'imported' | 'empty';
export type PoiHealthState  = 'ok' | 'error' | 'broken' | 'stale-name' | 'empty';
export type PoiLayerKind    = 'catalog' | 'workspace' | 'service' | 'route-waypoint';
export type MapZoomBand     = 'world' | 'country' | 'region' | 'city' | 'standard' | 'rich';

export interface PoiVisualSpec {
  origin: PoiOrigin;
  state: PoiVisualState;
  health: PoiHealthState[];          // 0..3 anillos concéntricos
  layer: PoiLayerKind;
  collectionTints: string[];         // HSL desde tokens.poi.origin.* o de la colección
  focused: boolean;
  zoomBand: MapZoomBand;
}

export interface PoiRenderDecision {
  mode: PoiRenderMode;
  sizePx: number;
  color: string;                     // resuelto desde tokens
  rings: { color: string; strokePx: number }[];
  showThumb: boolean;
}
```

Todas las firmas en `rules/`, `icons/`, `adapters/` consumen estos tipos. Cero strings sueltos.

## Tokens vs reglas — frontera obligatoria

| | Tokens (JSON) | Reglas (TS) | Icons (TS) | Adapters (TS) |
|---|---|---|---|---|
| **Naturaleza** | Valores | Decisiones | Producción visual | Integración librería |
| **Ejemplo** | `poi.size.pin = 18px` | `if (state==='empty') → 'pin'` | `<svg width="18">…</svg>` | `new L.DivIcon({html})` |
| **Literales numéricos/hex** | OK | PROHIBIDO | PROHIBIDO (vienen de rules) | PROHIBIDO |
| **Conoce Leaflet** | No | No | No | Sí |

## Tokens map / poi / elevation (extracto)

Idénticos al plan v2 — `tokens/source/{map,poi,elevation}.json` desde el día 1, con `zoom thresholds`, `pane z-index`, `poi.size.*`, `poi.state.*`, `poi.healthRing.*`, `poi.origin.*`, `poi.collectionRing.*`, `elevation.shadow.*`, `elevation.blur.*`.

## ESLint — el mapa también respeta las reglas

- Whitelist quirúrgica: hex literales permitidos solo en `src/design-system/map/icons/marker-shapes.ts` y `map/icons/create-poi-svg.ts` **cuando provienen de `tokens.ts`** (regex valida la procedencia).
- `src/components/map/**` queda sin excepción: cualquier hex literal nuevo falla el build (lista blanca por archivo documentada en `.eslintrc-map-whitelist.md`).
- `no-restricted-syntax` pasa de `warn` → `error` solo en Fase 5.

## Pipeline de tokens

```bash
npm run tokens:build   # genera build/*.css|ts|cjs
npm run tokens:watch   # regenera al editar JSON
```

Hooks `predev` y `prebuild`. CI verifica que `build/` está sincronizado con `source/`.

Commits:
- `tokens/source/*.json` → **committed siempre**
- `tokens/build/*` → **committed en Fases 1-4**, evaluar `.gitignore` desde Fase 5

## Storybook 8 — catálogo obligatorio

Vite builder, addons: `essentials`, `themes`, `a11y`, `viewport`.

### Stories mínimas (no negociables)

**Primitives & patterns**:
- `Button`, `Panel` (form/library/workflow), `Tooltip`, `EmptyState`, `Spinner`, `Skeleton`, `FilterChip`, `ToolbarButton`, `ListRow`

**Map states** (cartografía):
- `MyPoiMarker`, `FollowedPoiMarker`, `ServicePoiMarker`
- `MicroPoiDot`
- `CollectionRing` (1/2/3+ apilados)
- `HealthRing` (error / broken / empty)
- `ZoomLevelMatrix` — todos los `(origin × state × zoomBand × render mode)` en una sola página
- `MapLoadingStates`
- **`MapDensityStress`** — 100 / 500 / 2 000 puntos en superficie SVG/HTML (sin Leaflet real) para validar saturación visual, contraste y solapamientos. Controls de Storybook permiten variar el count y la mezcla `origin/state`.

**Tokens** (autogeneradas):
- `Tokens / Color`, `Typography`, `Density`, `Motion`, `Map`, `POI`

Deploy: GitHub Action en push a `main` → Cloudflare Pages o `gh-pages`. URL: `design.vandits.lovable.app`.

## Gobernanza — fases no se mezclan

Reglas duras de orden:

1. **Tokens fundacionales** (color/typo/density/motion/radius/z-index). Cero cambios visuales esperados.
2. **Tokens de mapa + carpeta `map/` (rules + icons + adapters + types)**. Mueve helpers existentes. Re-exports en origen para compatibilidad.
3. **Primitives & patterns**. Mueve `components/ui/*` y `shared/components/ui/*`. Re-exports en origen.
4. **Storybook**. **Solo arranca cuando Fases 1-3 estén mergeadas y los re-exports funcionen en producción**. Si tokens/map siguen moviéndose, Storybook no se monta.
5. **ESLint hardening**. **Solo cuando los re-exports legacy estén verificados estables y no hay imports a paths antiguos en `src/components/` ni `src/pages/`**. Sube `no-restricted-syntax` a `error`, activa `import/no-restricted-paths`, elimina re-exports legacy.

Cada fase = un issue separado, un PR separado. No se solapan.

## Lo que NO se hace

- Sin paquete npm publicado, sin monorepo.
- Sin Figma sync.
- Sin Chromatic.
- Sin tocar `domains/`, Cloud, edge functions ni lógica de negocio.

## Riesgos & mitigación

| Riesgo | Mitigación |
|---|---|
| Romper imports masivos | Re-exports en origen durante Fases 2-3; se eliminan en Fase 5. |
| Tokens generados desincronizados | Build committeado + hooks `pre*` + check en CI. |
| Acoplamiento accidental a Leaflet | Separación `rules` / `icons` / `adapters` + types canónicos. |
| Storybook llega antes de tiempo y se queda obsoleto | Norma de gobernanza: Fase 4 bloqueada hasta cerrar Fases 1-3. |
| Endurecer ESLint rompe el build | Norma de gobernanza: Fase 5 bloqueada hasta verificar re-exports estables en prod. |
| Saturación visual no detectada | `MapDensityStress` story con 100/500/2000 puntos. |

## Entregables (un issue por fase, sin mezclar)

- **Issue #DS-1 / Fase 1**: "feat(ds): foundational tokens via Style Dictionary"
- **Issue #DS-2 / Fase 2**: "feat(ds): map types + map/{rules,icons,adapters} sub-package + map/poi/elevation tokens"
- **Issue #DS-3 / Fase 3**: "feat(ds): consolidate primitives & patterns under design-system"
- **Issue #DS-4 / Fase 4**: "feat(ds): Storybook with UI + map state catalog (incl. MapDensityStress)" — bloqueado hasta merge de #DS-1/2/3
- **Issue #DS-5 / Fase 5**: "chore(ds): enforce import paths + hex whitelist + remove legacy re-exports" — bloqueado hasta verificación post-merge de #DS-2/3

Empezamos por #DS-1 (tokens fundacionales) cuando deis luz verde. Toca cero UI: solo añade Style Dictionary y genera los mismos CSS vars que ya existen hoy.
