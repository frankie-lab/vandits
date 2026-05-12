## Objetivo

Suavizar la transición visual de tamaño entre la banda **micro** (hoy z≤9) y **compact** (z10–12) con una rampa progresiva por zoom, y añadir una **sombra de doble capa** a los markers a partir de **standard** (z≥13) para despegarlos del fondo del mapa.

Sin tocar lógica de negocio, paleta de colores ni anillos de salud — sólo tamaño y sombra.

---

## A) Rampa progresiva de tamaño entre micro y compact

### Estado actual

| Zoom | Banda | Tamaño |
|------|-------|--------|
| ≤6   | micro | 2px |
| 7    | micro | 3px |
| 8    | micro | 4px |
| 9    | micro | 5px |
| 10   | compact | base × 0.9 (~13–14px) ← **salto brusco** |
| 11–12| compact | base × 0.9 |
| 13–15| standard | base × 1.0 |
| ≥16  | rich    | base × 1.1 (polaroid) |

El salto z9→z10 pasa de 5px plano a ~14px SVG con tint, gradiente y borde. Visualmente "explota".

### Propuesta (corregida)

**1. Extender la rampa micro hasta z10** (un paso más antes de cambiar de banda):

| Zoom | Banda | Tamaño |
|------|-------|--------|
| ≤6   | micro | 2px |
| 7    | micro | 3px |
| 8    | micro | 4px |
| 9    | micro | 5px |
| 10   | micro | **6px** (último valor) |
| 11   | compact | base × **0.85** |
| 12   | compact | base × **0.95** |
| 13   | standard | base × **1.00** |
| 14   | standard | base × **1.05** |
| 15   | standard | base × **1.10** |
| ≥16  | rich    | base × **1.10–1.15** (sin cambios) |

Para ello:
- Mover `microMax` de `9` a `10` en `tokens/source/map.json`.
- Ajustar la fórmula en `map-icons.ts`:

```
microSize = currentZoom <= 6 ? 2 : Math.min(6, currentZoom - 4)
// z6→2, z7→3, z8→4, z9→5, z10→6
```

**2. Modular `modeScale` por zoom** (no sólo por banda) en compact y standard, con lookup tokenizado.

**3. Tokenizar la rampa** en `src/design-system/tokens/source/poi.json` bajo `poi.renderScale.byZoom` para que el cambio quede en el design system y no como números mágicos en el componente. La función `getRenderModeForZoom` no cambia; sólo se añade un helper `getModeScaleForZoom(zoom)` en `map-icons.ts` que reemplaza el ternario actual.

### Archivos tocados

- `src/design-system/tokens/source/map.json` → `microMax: 10` (era 9).
- `src/design-system/tokens/source/poi.json` → añadir:
  ```
  poi.renderScale.byZoom = {
    "11": 0.85, "12": 0.95,
    "13": 1.00, "14": 1.05, "15": 1.10,
    "16": 1.15
  }
  ```
- `src/components/map/map-icons.ts`:
  - Fórmula micro → `Math.min(6, currentZoom - 4)`.
  - Sustituir el ternario `modeScale` por lookup en token `byZoom` con fallback a los valores actuales por banda.

---

## B) Sombra más marcada en standard (z≥13)

### Estado actual

Sombra base en estado `normal`:
```
drop-shadow(0 2px 4px rgba(0,0,0,0.3))
```
Sutil; sobre tiles claros (Carto Positron / OSM beige) los puntos verdes pequeños se mimetizan, sobre todo en racimos.

### Propuesta

Sombra de dos capas, **sólo en banda standard y rich** (compact mantiene su sombra plana actual para no sobrecargar la vista intermedia, y micro sigue sin sombra):

```
drop-shadow(0 1px 1px rgba(0,0,0,0.35))
drop-shadow(0 3px 6px rgba(0,0,0,0.22))
```

- Capa 1 (1px nítida, 35%): contorno crisp que separa el dot del tile.
- Capa 2 (6px difusa, 22%): halo suave que da profundidad sin ensuciar.

Tokenizar como `poi.shadow` en `poi.json` para poder ajustar después sin tocar el componente:

```
poi.shadow = {
  "compact":  "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",      // = actual
  "standard": "drop-shadow(0 1px 1px rgba(0,0,0,0.35)) drop-shadow(0 3px 6px rgba(0,0,0,0.22))",
  "rich":     "drop-shadow(0 1px 1px rgba(0,0,0,0.35)) drop-shadow(0 3px 6px rgba(0,0,0,0.22))"
}
```

**Restricción explícita**: la sombra doble NO se aplica en `micro` ni en `compact`, para no ensuciar las vistas de densidad.

### Archivos tocados

- `src/design-system/tokens/source/poi.json` → nuevo bloque `poi.shadow`.
- `src/components/map/map-icons.ts`: el branch `currentState === 'normal'` lee la sombra del token según `renderMode`. `getStateShadow` para focused/selected/recent **no cambia** (anima por estado, no por zoom).

---

## Validación

1. **Transición clave z9→z10→z11** (Madrid, captura aportada): el paso debe sentirse fluido. 5px → 6px (sigue micro, plano) → ~12px (compact con SVG, tint, sombra simple). Sin "explosión".
2. **Continuidad z11→z15**: 0.85 → 0.95 → 1.00 → 1.05 → 1.10. Crecimiento monótono y suave, sin saltos perceptibles.
3. **Sombra**: en z13–15 sobre Carto Positron, los puntos verdes individuales deben tener contorno visible incluso sobre tile beige claro. En z≤12 NO debe verse halo difuso adicional (vistas de densidad limpias).
4. Health rings, collection tint, polaroid y focused/selected/recent siguen igual (paleta, posiciones y animaciones inalteradas).
5. La banda micro sigue resolviendo el caso 5.000+ puntos sin SVG (sólo cambia el techo de px, de 5 a 6, y el techo de zoom, de 9 a 10).

---

## Memoria a actualizar

- `mem://style/map/micro-marker-size` → nueva rampa `2/3/4/5/6 px` hasta z10, `microMax=10`.
- `mem://style/map/zoom-driven-hero` → bandas actualizadas: micro z≤10 · compact z11–12 · standard z13–15 · rich z≥16. Añadir nota sobre `poi.shadow` (doble capa sólo standard/rich) y `poi.renderScale.byZoom`.

Sin cambios en lógica de negocio, popups, filtros ni stores.
