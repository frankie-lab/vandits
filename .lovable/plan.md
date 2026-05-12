# PR-1 · Health Rings v2 (visual/semántico) — APROBADO

Solo capa visual/semántica. **PR-2 (Health Filter Axis)** queda fuera y se aborda después.

## Objetivo

Pasar la capa de "salud" del marker de 3 a 4 rings con semántica operativa clara, manteniendo intacto el canon POI (paleta, bandas, tamaños, tint, polaroid, renderer único).

## Principio rector

```
Estado visual del POI  ≠  Estado operativo del POI
        (canon)                  (health rings v2)
```

---

## 1. Nueva matriz de rings

Reescribir `src/domains/content/lib/point-health-rings.ts`:

| Ring | Token CSS estable | Fuente de verdad | Significado |
|---|---|---|---|
| `partial` | `--poi-health-partial` (HSL `45 96% 64%`) | `loc.geoHealth === 'partial'` | Rellenar huecos |
| `chain` | `--poi-health-chain` (HSL `45 93% 47%`) | `loc.geoHealth ∈ {broken, stale_name}` | Reparar cadena admin |
| `review` | `--poi-health-review` (HSL `326 77% 50%`) | `enrichmentFailureStore.kind ∈ {coherence, llm_unverifiable, no_match}` | Revisar (coords/nombre/sin verificar) |
| `hardError` | `--poi-health-hard-error` (HSL `0 72% 51%`) | `enrichmentFailureStore.kind ∈ {rate_limit, no_credits, timeout, network, unknown}` | Reintentar |

Reglas invariantes:
- Verde nunca marca `review` ni `hardError` (regla `isPointEnriched`).
- Orden de DENTRO → FUERA: `[partial, chain, review, hardError]` (más severo afuera).
- Acumulables (un POI puede tener `partial` + `review`, etc.).
- Ancho 5px y hueco 5px sin cambios.

Cambios derivados:
- `enrichment-failure-state.ts` añade helper único `getEnrichmentFailureBucket(loc): 'review' | 'hardError' | null` mapeando los 8 `kind`s a 2 buckets.
- Verificar que `enrichmentFailureStore` persiste también `mismatchKind` (lo necesita el glyph). Si no, ampliarlo.

## 2. Tokens — condición técnica #1 (nombres CSS estables)

Añadir a `src/design-system/tokens/source/poi.json` bajo `healthRings.colors` (los 4 valores HSL).

Build pipeline (`build-tokens.cjs`) debe emitir CSS vars con **nombres planos y estables** que el SVG pueda leer directamente:

```css
:root {
  --poi-health-partial:    45 96% 64%;
  --poi-health-chain:      45 93% 47%;
  --poi-health-review:     326 77% 50%;
  --poi-health-hard-error: 0 72% 51%;
}
```

(No dependemos del path JSON anidado en el nombre CSS — se aplana en el build.)

`RING_COLORS` en TS se construye así (cero hex hardcoded):

```ts
const RING_COLORS: Record<HealthRing, string> = {
  partial:   'hsl(var(--poi-health-partial))',
  chain:     'hsl(var(--poi-health-chain))',
  review:    'hsl(var(--poi-health-review))',
  hardError: 'hsl(var(--poi-health-hard-error))',
};
```

El SVG/HTML string que genera `createCustomIcon` puede entonces usar directamente `hsl(var(--poi-health-review))` sin romper el flujo actual.

## 3. Bandas que pintan rings — sin hardcoding

Regla canónica:

> **Los health rings se pintan únicamente cuando `renderMode ∈ {'standard', 'rich'}`.**

`createCustomIcon`:
```ts
const skipHealthRings = renderMode !== 'standard' && renderMode !== 'rich';
```

Cualquier futuro re-shuffling de umbrales en `map.json` no requiere tocar este archivo.

## 4. Glyph overlay para sub-estado de `coherence` — condición técnica #2 (SVG inline)

Solo cuando bucket es `review` Y `kind` original es `coherence` Y trae `mismatchKind`:

- `mismatchKind = 'coordinate'` → glyph estilo MapPin (coords dudosas).
- `mismatchKind = 'name'` → glyph estilo Type/Aa (nombre dudoso).

**Implementación**:
- **NO** instanciar `<MapPin />` ni `<Type />` de `lucide-react` por marker. El divIcon es un HTML string — meter React dentro multiplicaría coste DOM y rompería el patrón.
- Usar **SVG inline mínimo con `path` estático** copiado de Lucide (mismos viewBox/path que MapPin y Type), embebido como string al construir el HTML del marker. Igual que ya se hace con el placeholder `image` de la polaroid en `map-icons.ts`.
- Posición: esquina superior derecha de la polaroid header, 14×14, fondo `hsl(var(--poi-health-review) / 0.95)`, círculo, foreground blanco, stroke 2.
- Solo en `renderMode === 'rich'`.
- Helper único: `getCoherenceGlyph(loc): 'coordinate' | 'name' | null` en el mismo `point-health-rings.ts`.
- Dos constantes string (`COHERENCE_GLYPH_PATH_COORDINATE`, `COHERENCE_GLYPH_PATH_NAME`) con los `<path d="...">` exactos de Lucide para `MapPin` y `Type`. Cero React, cero dependencias nuevas.
- `llm_unverifiable` y `no_match` NO disparan glyph — solo `coherence` con `mismatchKind`.

## 5. Tests

`src/test/health-rings.test.ts` (nuevo):
- 4 buckets aislados.
- Combinaciones (`partial`+`chain`, `partial`+`review`, `chain`+`hardError`, etc.).
- Regla "verde nunca marca `review` ni `hardError`".
- `getEnrichmentFailureBucket` mapea los 8 `kind`s correctamente a 2 buckets.
- `getCoherenceGlyph` devuelve `null` para `llm_unverifiable`/`no_match` y el `mismatchKind` correcto para `coherence`.

## 6. Storybook

Story `HealthRingMatrix` en `src/design-system/map/__stories__/`:
- 4×3: cada ring × cada estado base (verde/gris/naranja).
- Render en `standard` y `rich`.
- Fila con combinaciones múltiples (2 y 3 rings simultáneos).
- Fila con `review` + glyph `coordinate` y `review` + glyph `name` (solo rich).

## 7. Memoria

- Reescribir `mem://style/map/health-rings-rule` (matriz v2, 4 rings, regla "solo standard/rich vía renderMode", glyph overlay coherence).
- Actualizar core entry de `mem://index.md` (Marker palette / Anillos de salud) → 4 estados.

---

## Lo que NO se toca (canon intacto)

- `createCustomIcon` salvo: `skipHealthRings` por modo, bucle de rings ya genérico, rama `rich` añade glyph opcional via SVG path estático.
- Bandas/umbrales en `map.json`.
- Tamaños base 12/16/18/24 ni `modeScale`.
- Paleta de los 3 estados base (verde/gris/naranja).
- `collection-tint-ring`, stroke blanco, polaroid 50×56.
- Viewport culling, popup matrix, V2 marker grammar.
- Filtros / discovery store / filter bar (PR-2).

## Jerarquía visual final

```
hardError ring (rojo)              ← más severo, más afuera
review ring (magenta)
chain ring (amarillo)
partial ring (amber claro)
collection tint ring
white stroke
fill_color (verde/gris/naranja)
polaroid + coherence glyph (solo rich)
```

## Fuera de alcance (PR-2 posterior)

- `healthFilter` en `discovery-store`.
- Chips de filtro en filter bar.
- Integración en matcher central + `resetAllFilters`.
- Lasso / batch actions desde mapa.
