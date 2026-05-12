## Objetivo

Alinear el código al 100% con la matriz canónica POI por zoom. Esto NO cambia las bases absolutas 12/16/18/24, pero sí **aumenta la presencia visual antes** porque fija los umbrales en su posición canónica (un zoom más bajo que la versión histórica) y sube el micro max de z9 de 5px → 6px.

---

## Bandas canónicas (objetivo final)

```
micro      z ≤ 9
compact    z 10–11
standard   z 12–14
rich       z 15+
```

---

## Cambios

### 1. `src/design-system/tokens/source/map.json`

Asegurar / fijar los umbrales canónicos:

```json
"zoom": {
  "microMax":    { "value": 9,  ... },
  "compactMax":  { "value": 11, ... },
  "standardMax": { "value": 14, ... },
  "heroMin":     { "value": 15, ... },
  "richMin":     { "value": 15, ... }
}
```

### 2. `src/design-system/tokens/source/poi.json`

Restaurar / confirmar `poi.renderScale.byZoom`:

```json
"byZoom": {
  "z10": 0.85,
  "z11": 0.95,
  "z12": 1.00,
  "z13": 1.05,
  "z14": 1.10,
  "z15": 1.15,
  "z16": 1.15
}
```

Si en alguna iteración previa quedaron valores subidos (ej. 0.95→1.30), hay que **revertirlos** a estos valores canónicos.

### 3. `src/components/map/map-icons.ts` — rampa micro

Sustituir la fórmula actual `Math.min(5, currentZoom - 4)` por:

```ts
const microSize = currentZoom <= 6 ? 2 : Math.min(6, currentZoom - 4);
```

Resultado:

| Zoom | Tamaño |
|------|--------|
| z ≤ 6 | 2px |
| z 7   | 3px |
| z 8   | 4px |
| z 9   | 6px (micro max) |

Nota: el salto 4 → 6 entre z8 y z9 es intencional (la versión `Math.min(6, …)` da `min(6, 5) = 5` en z9 sólo si el cap fuera 5; con cap 6 da `min(6, 5) = 5`… ❗ revisar fórmula). 

Fórmula verificada que produce 2/3/4/6:
- `z≤6` → 2 (rama explícita)
- `z=7` → `min(6, 3) = 3`
- `z=8` → `min(6, 4) = 4`
- `z=9` → `min(6, 5) = 5` ← **incorrecto**, daría 5px no 6px

Para llegar a **z9=6px** la fórmula tiene que ser `Math.min(6, currentZoom - 3)` ó usar mapa explícito. Usaremos un mapa explícito para evitar ambigüedad:

```ts
const microSize =
  currentZoom <= 6 ? 2 :
  currentZoom === 7 ? 3 :
  currentZoom === 8 ? 4 :
  6; // z9 (último escalón micro antes de compact)
```

Esto produce exactamente: z≤6=2 · z7=3 · z8=4 · z9=6.

Comentario adyacente actualizado a:
> Rampa explícita por zoom (z≤6→2, z7→3, z8→4, z9→6). Cap micro = 6px en z9 antes de saltar a SVG compact en z10.

### 4. `src/components/map/viewport-culling.ts`

Asegurar / fijar:

```ts
export function shouldCullByViewport(zoom: number): boolean {
  return zoom >= 10;
}

export function getViewportPadForZoom(zoom: number): number {
  if (zoom >= 15) return 0.5;
  if (zoom >= 12) return 0.75;
  if (zoom >= 10) return 1.0;
  return 0;
}
```

(Ya está aplicado; verificar que no se haya revertido.)

### 5. Rebuild

```bash
node src/design-system/tokens/build-tokens.cjs
```

### 6. Memoria — actualizar `mem://style/map/poi-zoom-canon`

- Banda micro: tope = 6px en z9 (no 5).
- Resto de tablas (bandas, modeScale, bases, modificadores, polaroid, culling, excepciones) sin cambio.
- Añadir nota: el canon usa umbrales **un zoom más bajos** que la versión histórica → aumenta la presencia visual de los POIs sin tocar las bases.

### 7. Verificación

- Recarga preview, barrer zoom 6 → 16 sobre una colección densa.
- z9 = microdot 6px (más grande que z8=4px).
- z10 = SVG compact (no microdot).
- z12 = SVG con gradient + health rings + doble sombra.
- z15 = polaroid hero.

---

## Fuera de alcance

- Bases POI (12/16/18/24) — sin cambios.
- Paleta, decoraciones, polaroid, health rings, tipos especiales (`home`, `user_gps`, `nearby_result`, `photo_thumbnail`, `route_*`) — sin cambios.

---

## Nota explícita

Este plan **no cambia las bases absolutas 12/16/18/24**, pero sí **aumenta la presencia visual antes**, porque adelanta un zoom la entrada a `compact`, `standard` y `rich`, y sube el micro max de z9 de 5px → 6px. El culling también se adelanta para que el rendimiento siga compensando el aumento de densidad visible.
