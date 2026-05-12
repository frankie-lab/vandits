## Objetivo

Que los health rings (`partial`/`chain`/`review`/`hardError`) sean visibles **2 niveles de zoom antes** que ahora.

- Hoy: visibles solo en `standard` (z9–11) y `rich` (z≥12).
- Después: visibles también en `compact` (z7–8). Es decir, **a partir de z7**.
- `micro` (z≤6) sigue **sin rings** — los dots planos miden 2–6px y los aros de 5px no caben (regla "no rings por debajo de compact" se mantiene como tope técnico).

## Cambio único (transversal, helper único)

Toda la decisión vive en `createCustomIcon` (`src/components/map/map-icons.ts`, línea 204):

```ts
// antes
const skipHealthRings = renderMode === 'compact';
// después
const skipHealthRings = false; // micro ya retornó arriba; compact/standard/rich pintan rings
```

`getPointHealthRings` no cambia (sigue siendo la única fuente de qué aros aplican). El gradient sigue saltado en compact (`skipGradient` queda intacto) — solo añadimos los aros.

## Consecuencias visuales

- En z7–8 (compact) los markers planos ganan halos de 5px. Padding del divIcon (`ringPad = ringCount * RING_GAP + 2`) ya está calculado en cada render → no hay clipping ni recolocación manual.
- El `collection-tint-ring` y el stroke blanco interior siguen entre el marker y los health rings (regla aditiva intacta).
- `rich`-only sigue exclusivo del glyph MapPin/Type para `coherence + mismatchKind` (no se baja a compact).

## Tokens y memoria

- Actualizar el bloque "Canon POI por zoom" en `mem://index.md` y `mem://style/map/poi-zoom-canon`: la línea de `compact` pasa a "SVG plano + tint **+ health rings**, sin gradient/polaroid".
- Actualizar `mem://style/map/health-rings-rule` y el bloque core "Health Rings v2": condición `renderMode ∈ {compact, standard, rich}`.
- Stories Storybook (`HealthRing.stories.tsx > NoRingsBelowStandard`) — renombrar a `NoRingsInMicro` y dejar solo el caso `micro` como negativo. El caso `compact` pasa a positivo (con rings) en una nueva story.

## Verificación (QA)

1. Mapa global a z7 y z8 con un punto naranja en `partial` + `hardError`: deben verse los dos aros (amber + rojo) alrededor del SVG plano.
2. Mismo punto a z6: **sin rings** (sigue siendo dot 3px).
3. Punto verde con `chain`: aro amarillo visible desde z7.
4. Densidad: comprobar que en z7 con muchos puntos los aros no producen overlap visible molesto (el culling de viewport en z7–8 ya limita a la ventana ampliada).

## Archivos a tocar

- `src/components/map/map-icons.ts` — 1 línea (204).
- `src/design-system/map/__stories__/HealthRing.stories.tsx` — story `NoRingsBelowStandard` se actualiza.
- `mem://index.md`, `mem://style/map/poi-zoom-canon`, `mem://style/map/health-rings-rule` — texto de la regla.

## No-cambios

- `getPointHealthRings`, `getEnrichmentFailureBucket`, tokens de color (`--poi-health-*`), grosor de aro (`RING_WIDTH=5`), gap, glyph rich-only: intactos.
- `home`/`auto`, `createCustomIcon` para V2, photo, preview: heredan automáticamente porque todos pasan por el mismo helper.
