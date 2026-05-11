# Estabilizar Fase 4A — Map Lab (v2, tokens HSL)

Aprobación incorporada: los tokens nuevos van en HSL (`"45 93% 81%"`), no en hex. Al revisar el build actual descubrimos que los tokens POI existentes (`poi.state.enriched/imported/empty`, `poi.ring.*`) **ya están en hex**, lo que rompe la gramática del DS. Por coherencia transversal, esta fase de estabilización los migra todos a HSL.

## Diagnóstico ampliado

1. **Gramática de color mixta en tokens.** `source/color.json` usa HSL triplet (`"24 75% 50%"`). `source/poi.json` usa hex (`"#22c55e"`, `"#f97316"`, `"#dc2626"`). Dos gramáticas conviviendo en el mismo DS.
2. **Imports de tokens incoherentes en stories.** Las 9 stories importan `@/design-system/tokens/build/tokens` (ruta interna al artefacto generado). Regla acordada en Fase 1: barrel `@/design-system/tokens`.
3. **Hex literales en `PoiPreview.tsx` y stories.** `ORIGIN_BORDER`, `MapCanvas` (fondo simulado), tintes de colección en `CollectionRing` y `MapDensityStress`. Contradicen "cero literales de color en stories".
4. **`storybook-static/` no está en `.gitignore`.**
5. **No se ha verificado** `npm run build-storybook` tras añadir las 9 stories.
6. **Devdeps redundantes**: `@storybook/react` y `@storybook/blocks` listados directamente aunque entran transitivamente. Ruido menor.

## Plan

### Paso 1 — Migrar TODOS los tokens POI a HSL (transversal)
En `src/design-system/tokens/source/poi.json`, reemplazar hex por HSL triplet manteniendo el mismo color. Equivalencias:
```
state.enriched:  "#22c55e" → "142 71% 45%"
state.imported:  "#9ca3af" → "220 9% 65%"
state.empty:     "#24 95% 53%" → "24 95% 53%"  (#f97316)
ring.empty:      "#f97316" → "24 95% 53%"
ring.chain:      "#eab308" → "45 93% 47%"
ring.error:      "#dc2626" → "0 72% 51%"
```
Y añadir los nuevos sets también en HSL:
```
originBorder.my:       "0 0% 100%"
originBorder.followed: "45 93% 81%"   (#fde68a)
originBorder.service:  "199 95% 86%"  (#bae6fd)
originBorder.catalog:  "251 91% 92%"  (#ddd6fe)

collectionTintSample.violet:  "258 90% 66%"
collectionTintSample.sky:     "199 89% 48%"
collectionTintSample.pink:    "330 81% 60%"
collectionTintSample.emerald: "160 84% 39%"
collectionTintSample.amber:   "38 92% 50%"
```
Y en `source/map.json` añadir:
```
canvas.tileA:   "40 18% 88%"  (#e7e3da)
canvas.tileB:   "40 12% 84%"  (#ddd9d0)
canvas.tileSize: "24px"
```
Marcar cada uno con `_css` para que el build emita la CSS var correspondiente (`--poi-origin-border-*`, `--map-canvas-tile-*`).

### Paso 2 — Adaptar consumidores TS al cambio de gramática
Cualquier sitio que use `tokens.poi.state.X` directamente como valor CSS debe envolverlo en `hsl(...)`:
- `src/design-system/map/__stories__/PoiPreview.tsx`: `STATE_COLOR`, `HEALTH_COLOR`, `ORIGIN_BORDER` pasan a devolver `` `hsl(${tokens.poi.state[s]})` ``.
- Cualquier otro consumidor TS de `tokens.poi.*` (grep para confirmar). Esperado: ninguno en producto todavía; el helper Leaflet `createCustomIcon` sigue usando su propia lógica legacy hasta Fase 5.
- Tailwind `tailwind.tokens.cjs` no se ve afectado porque ya consume las CSS vars con `hsl(var(--token))`.

### Paso 3 — Normalizar imports en stories
- `PoiPreview.tsx`, `ZoomLevelMatrix.stories.tsx` → `import { tokens } from '@/design-system/tokens'` (barrel).
- Stories que pintan tintes (`CollectionRing`, `MapDensityStress`) → leer de `tokens.poi.collectionTintSample.*`.
- `MapCanvas` background construido con `linear-gradient` interpolando `hsl(var(--map-canvas-tile-a))` y `hsl(var(--map-canvas-tile-b))`.

### Paso 4 — Higiene del repo
- Añadir `storybook-static/` al `.gitignore`.
- Quitar `@storybook/react` y `@storybook/blocks` de devDependencies directas (siguen disponibles transitivamente; si Storybook se queja, se reinsertan).

### Paso 5 — Verificación obligatoria antes de cerrar
Como pide el revisor:
1. `npm run tokens:build` → confirma que los HSL nuevos se emiten en `tokens.ts`, `tokens.css` (CSS vars `--poi-*`, `--map-canvas-*`) y `tailwind.tokens.cjs`.
2. `npm run build-storybook` → build estático de las 9 stories sin errores.
3. `npm run lint` → cero nuevos warnings/errores introducidos por la fase.

Si alguno falla, se corrige en sitio antes de marcar la fase como cerrada.

### Paso 6 — Registro
Actualizar `mem://architecture/design-system-phase-4a.md` con la nota de estabilización (tokens POI en HSL, imports normalizados, build verificado). Sin entrada nueva en el índice de memoria — sigue siendo "Fase 4A".

## Fuera de alcance (Fase 4B / 5)
- No tocar `src/design-system/map/{rules,icons,adapters}`.
- No migrar primitives (`src/components/ui/*` → `src/design-system/primitives/*`).
- No endurecer ESLint contra imports de `@/components/ui/*`.
- No tocar el `createCustomIcon` legacy de Leaflet (sigue leyendo de su sitio actual hasta Fase 5).

## Riesgos y mitigación
- **Riesgo**: algún consumidor TS de `tokens.poi.*` rompe al recibir un triplet en vez de hex. **Mitigación**: grep antes de migrar; si aparece consumo en producto, se envuelve en `hsl(...)` o se migra al CSS var equivalente.
- **Riesgo**: `build-storybook` falla por peer deps SB 8.6 vs declarados ^8.4. **Mitigación**: si falla, alinear `package.json` a `^8.6.0` (semver compatible).
- **Riesgo**: pérdida de fidelidad visual al convertir hex→HSL. **Mitigación**: equivalencias calculadas con redondeo estándar; diff visual revisable en Storybook tras el build.
