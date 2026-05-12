## Objetivo

Adelantar un zoom todas las bandas POI: lo que ahora ocurre en z15 debe ocurrir en z14, z14→z13, etc. Sin tocar bases (12/16/18/24), `byZoom`, culling padding, polaroid ni renderer.

## Cambios

### 1. `src/design-system/tokens/source/map.json`

```json
"zoom": {
  "microMax": 8,
  "compactMax": 10,
  "standardMax": 13,
  "heroMin": 14,
  "richMin": 14
}
```

(antes: 9 / 11 / 14 / 15 / 15)

### 2. `src/design-system/tokens/source/poi.json` — `byZoom`

Reasignar la rampa para que cada zoom entero conserve la escala que tenía un zoom más arriba:

```
z9  → 0.85  (antes 0.95, era última de micro)
z10 → 0.95  (antes 0.85, primera compact) → ahora primera compact con la escala que tenía z11
z11 → 1.00
z12 → 1.05
z13 → 1.10
z14 → 1.15  (entrada rich)
z15 → 1.15
```

Equivalente: misma curva 0.85→1.15 pero desplazada un zoom a la izquierda.

### 3. Reconstruir tokens

`node scripts/build-tokens.cjs` para regenerar `tokens.css` / `tokens.ts` / `tailwind.tokens.cjs`.

### 4. Verificar consumidores deterministas

Solo lectura, sin cambios esperados:
- `src/components/map/map-icons.ts` — `getRenderModeForZoom`, `getModeScaleForZoom` leen de tokens.
- `src/components/map/viewport-culling.ts` — pad por zoom usa los mismos thresholds (z10–11 / z12–14 / z≥15). Como las bandas se desplazan, hay que decidir si el culling también se desplaza.

### 5. Culling — pregunta abierta

Dos opciones, elijo por defecto **B** salvo indicación contraria:

- **A.** Mantener el culling tal cual (pad 1.0 z10–11, 0.75 z12–14, 0.5 z≥15). Resultado: el culling deja de coincidir con las bandas visuales (compact ahora es z9–10 pero culling sigue empezando en z10).
- **B.** Desplazar también el culling un zoom (pad 1.0 z9–10, 0.75 z11–13, 0.5 z≥14) para que siga acoplado a las bandas. Coherente con la regla "el culling empieza con compact".

### 6. Memoria

Actualizar `mem://style/map/poi-zoom-canon` con los nuevos umbrales (micro≤8 / compact 9–10 / standard 11–13 / rich≥14) y la nueva curva `byZoom`. Index core line también.

## Fuera de alcance

Bases absolutas, polaroid, health rings, V2 renderer, repaint legacy (ya arreglado), filtros, tipos.

## Criterio de cierre

- z13 muestra polaroid 50×56 (antes z15).
- z11 → z12 → z13 crece dentro de standard.
- z9 → z10 crece dentro de compact.
- Sin saltos visuales bruscos al cruzar bandas.
