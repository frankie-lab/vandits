## Diagnóstico

Revisando `createCustomIcon` en `src/components/map/map-icons.ts`:

- **`micro` (z≤9)**: SÍ cambia el tamaño — devuelve un divIcon plano de 5px (propios 9px). Esto debería funcionar a zoom global.
- **`compact` (z10–13)**: NO cambia el tamaño. Solo desactiva `gradient` y `healthRings`. El tamaño sigue saliendo de `getBaseSize(entry)` (config de BD), idéntico al de `standard`/`rich`.
- **`standard` (z14–16)** y **`rich` (z17+)**: tamaño idéntico entre sí.

Resultado: entre los zooms en los que normalmente trabaja el usuario (10–18), los markers son del **mismo tamaño**. Solo cambia la fidelidad del SVG, no la escala. Esa es la causa de "el tamaño es igual cerca y lejos".

Además, en `micro` la diferencia 5px vs ~14px existe, pero al pasar de micro→compact (al cruzar z9→z10) hay un salto brusco; y dentro del rango cercano (z10 a z18) no hay progresión.

## Objetivo

Que el tamaño del marker progrese de forma perceptible con el zoom, manteniendo las invariantes ya congeladas (3 estados verde/gris/naranja, health rings, collection tint, paneles mine/others).

## Plan

### 1. Añadir un factor de escala por render mode

En `map-icons.ts`, introducir un multiplicador aplicado sobre `size` y `containerSize` que dependa del modo:

```
micro    → 0.5  (ya cubierto por el divIcon plano, no aplica al SVG)
compact  → 0.7
standard → 1.0  (tamaño canónico de BD)
rich     → 1.15 (un toque mayor para foco cercano)
```

- Los anillos de salud y el `collection-tint-ring` se escalan proporcionalmente porque dependen de `size`/`containerSize` ya calculados.
- `iconAnchor` y `popupAnchor` siguen siendo `containerSize/2`, así que el centro del marker no se desplaza.
- El borde blanco (`stroke-width`) se mantiene constante; solo escala el círculo.

### 2. Escalar también los anillos de salud y el gap

`RING_GAP` y `RING_WIDTH` se recalculan en `compact` para no aplastar el marker (proporcional al factor). En `rich` quedan igual.

### 3. Sub-progresión dentro de `standard` (opcional, fase 2)

Para suavizar la transición 9→10 y 16→17, podemos hacer que `getBaseSize` reciba el zoom actual y aplique un factor continuo `lerp(0.7, 1.15, t)` entre z10 y z17. No hace falta tocar BD.

### 4. Verificación

- Repintar todos los markers en cada `map-render-mode-changed` (ya existe).
- Confirmar visualmente a z3 (micro 5px), z10 (compact ~0.7x), z14 (standard 1x), z18 (rich 1.15x).
- Comprobar que el `collection-tint-ring`, los health rings y los markers tipo `pin` (lágrima) escalan sin descentrarse.

## Archivos afectados

- `src/components/map/map-icons.ts` — único cambio. No se tocan call-sites ni `LocationMap.tsx`.

## Riesgos / invariantes preservadas

- Paleta de 3 estados (verde/gris/naranja) intacta.
- `getPointHealthRings`, `getPointVisualState`, `getTintForLocation`, ownership panes: sin cambios.
- BD (`marker_size_config`) sigue siendo la fuente del tamaño base; el factor por modo es un multiplicador local.

## Pregunta abierta

¿Quieres que también suavice la transición con `lerp` continuo (paso 3), o basta con los 4 escalones discretos? Por defecto haré los 4 escalones — son visibles y baratos.
