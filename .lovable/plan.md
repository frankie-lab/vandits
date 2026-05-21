## Fase de estabilización visual del mapa

Objetivo: cerrar dos invariantes visuales sin reabrir el debate cromático.

### 1. Verificación — fill POI-N

`map-icons.ts` (línea 264-400) resuelve el fill del marker propio desde `visualGrammar.levelVisual.fillHsl`, que proviene de `getPoiMaturityColor` → `tokens.poi.maturity[level]`. La leyenda inferior (`LocationMap.tsx` 2837-2880) pinta cada chip con `hsl(var(--poi-maturity-${lvl}))`, los **mismos tokens**.

| Nivel | Token | Fill marker | Chip leyenda | Correcto |
|---|---|---|---|---|
| POI-0 | `poi.maturity.0` (gris neutro) | sí | sí | sí |
| POI-1 | `poi.maturity.1` (gris cálido) | sí | sí | sí |
| POI-2 | `poi.maturity.2` (gris cálido) | sí | sí | sí |
| POI-3 | `poi.maturity.3` (amarillo apagado) | sí | sí | sí |
| POI-4 | `poi.maturity.4` (amarillo) | sí | sí | sí |
| POI-5 | `poi.maturity.5` (amarillo intenso) | sí | sí | sí |
| POI-6 | `poi.maturity.6` (ámbar suave) | sí | sí | sí |
| POI-7 | `poi.maturity.7` (ámbar) | sí | sí | sí |
| POI-8 | `poi.maturity.8` (verde amarillento) | sí | sí | sí |
| POI-9 | `poi.maturity.9` (verde suave) | sí | sí | sí |
| POI-10 | `poi.maturity.10` (verde) | sí | sí | sí |

Conclusión: regla 1 ya cumplida, no hace falta tocar nada.

### 2. Verificación — collection tint sobre fill POI-N

Estado actual tras Fase A (`index.css` 356-364): `border: 2px dashed var(--collection-tint)` + `opacity: 0.45`.

| Fill bajo el tinte | Tinte visible | Comentario |
|---|---|---|
| POI-3 (amarillo apagado) | marginal | dashed 2px @ 0.45 sobre fondo claro queda muy débil |
| POI-7 (ámbar saturado) | marginal | el fill domina y el dashed casi desaparece |
| POI-10 (verde) | marginal | igual: lectura de pertenencia a colección se pierde |

Diagnóstico: Fase A subordinó correctamente el tinte, pero **se pasó**: la pertenencia a colección ya no se lee de un vistazo. Hay que recuperar legibilidad sin volver a competir con el fill.

### Recomendación única

Subir `opacity` del `.collection-tint-ring` de **0.45 → 0.60**. Mantener `dashed` y `2px`. Sin tocar nada más.

Justificación: el patrón dashed ya diferencia visualmente "tinte" de "fill sólido", así que recuperar algo de opacidad no devuelve la competencia cromática que tenía la versión sólida 0.8. Es el cambio mínimo que reequilibra sin reabrir el resto.

### Alcance del cambio (cuando se implemente)

Un solo edit, una sola línea:
- `src/index.css` → `.collection-tint-ring { opacity: 0.60; }`
- Version bump patch (1.3.7 → 1.3.8).
- Entrada en `README.md`.

### Fuera de alcance (no tocar)

- `computePoiMaturity`, `getPoiMaturityColor`, tokens `poi.maturity.*`.
- Health rings (`point-health-rings.ts`), halos, bordes.
- Datos, edge functions, migraciones, RLS.
- Escala POI-N y leyenda.

### Validación post-cambio

- Mapa sigue respondiendo a escala POI-N (fill manda).
- Collection tint vuelve a ser legible sobre POI-3 / POI-7 / POI-10.
- Tests existentes (`map-icon-rings-gate.test.ts`, `poi-visual-grammar.test.ts`) siguen verdes (no tocan opacity del tint).
