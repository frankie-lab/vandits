# Zoom bands v2 — progresión proporcional sin saltos

Aplicamos tu propuesta con los dos ajustes finales.

## Bandas finales

```
z ≤ 6       micro          2px
z 7–9       micro-grown    3 / 4 / 5 px (progresivo por zoom)
z 10–12     compact        SVG dot, collection-tint, sin health rings, modeScale 0.9
z 13–15     standard       dot grande, health rings, collection-tint, SIN polaroid, modeScale 1.0
z ≥ 16      rich           polaroid + hero/placeholder + dot pleno, modeScale 1.1
```

Excepción única: **`isFocused` (click directo)** puede escapar de su banda y renderizar `rich` antes. **`isSelected` NO escapa** — riesgo de bulk/filtro/ruta.

## Cambios concretos

### 1. Tokens (`src/design-system/tokens/source/map.json`)

```json
"zoom": {
  "microMax":    9,
  "compactMax":  12,
  "standardMax": 15,
  "heroMin":     16,
  "richMin":     16
}
```

(Hoy `richMin=11`, `compactMax=13`. Restaura `standard` como banda real y mueve la polaroid a z≥16.)

Tras editar, regenerar tokens: `node src/design-system/tokens/build-tokens.cjs`.

### 2. `getRenderModeForZoom` — sin cambios

Ya lee `microMax`, `standardMax`, `richMin` desde `ZOOM_THRESHOLDS`. Con los nuevos tokens, las 4 bandas (`micro` / `compact` / `standard` / `rich`) vuelven a coexistir.

### 3. `modeScale` corregido (`src/components/map/map-icons.ts`)

Hoy:
```ts
const modeScale = renderMode === 'compact' ? 0.9 : renderMode === 'rich' ? 0.9 : 1;
```

Cambio:
```ts
const modeScale =
  renderMode === 'compact' ? 0.9 :
  renderMode === 'standard' ? 1.0 :
  renderMode === 'rich' ? 1.1 :
  1.0;
```

Así el dot en `rich` gana presencia bajo la polaroid, en lugar de quedar reducido.

### 4. Modo `micro` con crecimiento progresivo (z7–z9)

Hoy `micro` devuelve un divIcon plano de **2px fijo**. Lo sustituimos por una rampa por zoom:

```
z ≤ 6 → 2px
z = 7 → 3px
z = 8 → 4px
z = 9 → 5px
```

Implementación: añadir `currentZoom` paralelo a `currentRenderMode` en `map-icons.ts`, con `setCurrentZoom(z)` invocado desde el mismo handler de `zoomend` en `LocationMap` que ya llama a `setCurrentRenderMode`. En la rama `micro`:

```ts
const microSize = currentZoom <= 6 ? 2 : Math.min(5, currentZoom - 4);
```

Sin cambios en halo/own/paleta: 3 colores (verde/gris/naranja) intactos.

### 5. Modo `standard` (z13–z15) — restaurado

`standard` lleva tiempo absorbido por `rich`. Verificamos que la rama "default circle" funcione sin polaroid:

- `polaroidHtml` solo se construye cuando `effectiveMode === 'rich'` (ya es así).
- `skipHealthRings` y `skipGradient` solo se activan en `compact` (ya es así → `standard` ve health rings + gradiente).
- `modeScale` para `standard` = `1.0` (ver punto 3).
- Resultado: en z13–z15 se ven dots completos con gradiente, health rings y collection-tint, **sin polaroid**.

### 6. Excepción focused → rich (conservadora)

```ts
const effectiveMode = isFocused ? 'rich' : currentRenderMode;
```

Aplicar `effectiveMode` en lugar de `renderMode` para: decisión de polaroid, `modeScale`, `skipHealthRings`, `skipGradient`. No tocar `isSelected` — la selección masiva (filtros, ruta) no debe hacer aparecer polaroids en cascada.

### 7. Memoria

- Actualizar `mem://style/map/zoom-driven-hero` con las 5 bandas, `richMin=16`, `modeScale rich=1.1`, y la regla "polaroid solo z≥16 salvo `isFocused`".
- Actualizar `mem://style/map/micro-marker-size` para reflejar la rampa 2→5px en z6–9.
- Actualizar el Core de `mem://index.md` (entrada *Zoom-driven hero / polaroid*).

### 8. Storybook

`ZoomLevelMatrix.stories.tsx` ya muestra `z=4,8,11,14,16,18`. Tras regenerar tokens: z=8 cae en `micro-grown`, z=11/14 en `compact`/`standard`, z=16/18 en `rich`. Sirve como QA visual sin tocar la story.

## Archivos a tocar

- `src/design-system/tokens/source/map.json` — nuevos thresholds
- `src/design-system/tokens/build-tokens.cjs` — re-run para emitir `tokens.ts`/`tokens.css`/`tailwind.tokens.cjs`
- `src/components/map/map-icons.ts` — `currentZoom` + rampa micro + nuevo `modeScale` + `effectiveMode` (focused only)
- `src/components/LocationMap.tsx` — `setCurrentZoom(map.getZoom())` en el handler `zoomend` que ya llama a `setCurrentRenderMode`
- `mem://style/map/zoom-driven-hero`, `mem://style/map/micro-marker-size`, `mem://index.md` — actualizar reglas canónicas

## Riesgos

- La polaroid desaparece en una franja amplia (z11–z15) donde hoy estaba. Es exactamente lo pedido. QA visual urbano z13–z15 antes de cerrar.
- `modeScale` rich = 1.1 hace que el dot crezca un 10% sobre el tamaño base de la BD (`marker_size_config`). Si en QA resulta excesivo bajo la polaroid, ajustar a 1.0.
- Sin cambios de paleta, health rings, collection-tint ni ownership.
