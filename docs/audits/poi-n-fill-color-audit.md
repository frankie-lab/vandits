# Auditoría — Color del fill POI-N (disco interior)

**Fecha:** 2026-05-21 · **Versión:** v1.3.7 · **Alcance:** SOLO el fill principal del disco del marker. Health rings, collection tint, owner identity, selección/focus, halos y bordes quedan **fuera** salvo para descartarlos.

## 1. Cadena canónica del fill

```
computePoiMaturity(loc)          → level ∈ {0,1,2,3,4,5,6,7,8,9,10}
  → getPoiMaturityColor(level)   → token poi.maturity.<level>
  → resolvePoiVisualGrammar      → levelVisual.fillHsl
  → createCustomIcon (map-icons) → baseColor = `hsl(${fillHsl})`
  → SVG <circle>/<path> fill = linearGradient(baseColorLight, baseColor)
```

`baseColorLight = adjustHslLightness(baseColor, +15)` — el fill no es plano, es un gradiente vertical entre el token y una variante +15% L. Único color saturado del marker.

## 2. Tokens actuales (fuente única: `src/design-system/tokens/source/poi.json` § `poi.maturity`)

| Nivel | Token CSS | HSL | Familia cromática |
|-------|-----------|-----|-------------------|
| POI-0  | `--poi-maturity-0`  | `220  8% 55%` | gris frío (S=8% → casi neutro) |
| POI-1  | `--poi-maturity-1`  | `30  10% 60%` | gris cálido claro |
| POI-2  | `--poi-maturity-2`  | `30  10% 48%` | gris cálido medio |
| POI-3  | `--poi-maturity-3`  | `50  55% 65%` | amarillo apagado |
| POI-4  | `--poi-maturity-4`  | `50  90% 55%` | amarillo |
| POI-5  | `--poi-maturity-5`  | `48  96% 48%` | amarillo intenso |
| POI-6  | `--poi-maturity-6`  | `38  90% 60%` | ámbar claro |
| POI-7  | `--poi-maturity-7`  | `32  92% 50%` | ámbar/naranja |
| POI-8  | `--poi-maturity-8`  | `80  60% 50%` | verde-amarillento |
| POI-9  | `--poi-maturity-9`  | `130 50% 50%` | verde suave |
| POI-10 | `--poi-maturity-10` | `142 71% 38%` | verde |

## 3. HTML/CSS renderizado del fill (ejemplo por nivel)

Fragmento real generado por `createCustomIcon` (rama dot, `renderMode=standard`). Solo el bloque relevante; rings/tint/halo omitidos.

```html
<!-- POI-5, ejemplo -->
<svg width="14" height="14" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="dotGrad-…" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   style="stop-color:hsl(48 96% 63%)"/>   <!-- baseColorLight (+15L) -->
      <stop offset="100%" style="stop-color:hsl(48 96% 48%)"/>   <!-- token poi.maturity.5 -->
    </linearGradient>
  </defs>
  <circle cx="12" cy="12" r="9" fill="url(#dotGrad-…)" stroke="white" stroke-width="2"/>
</svg>
```

Sustituir el par `(baseColorLight, baseColor)` por nivel:

| Nivel | `stop 0%` (baseColorLight) | `stop 100%` (token) |
|-------|----------------------------|---------------------|
| 0  | `hsl(220 8% 70%)`  | `hsl(220 8% 55%)` |
| 1  | `hsl(30 10% 75%)`  | `hsl(30 10% 60%)` |
| 2  | `hsl(30 10% 63%)`  | `hsl(30 10% 48%)` |
| 3  | `hsl(50 55% 80%)`  | `hsl(50 55% 65%)` |
| 4  | `hsl(50 90% 70%)`  | `hsl(50 90% 55%)` |
| 5  | `hsl(48 96% 63%)`  | `hsl(48 96% 48%)` |
| 6  | `hsl(38 90% 75%)`  | `hsl(38 90% 60%)` |
| 7  | `hsl(32 92% 65%)`  | `hsl(32 92% 50%)` |
| 8  | `hsl(80 60% 65%)`  | `hsl(80 60% 50%)` |
| 9  | `hsl(130 50% 65%)` | `hsl(130 50% 50%)` |
| 10 | `hsl(142 71% 53%)` | `hsl(142 71% 38%)` |

## 4. Comparación esperado-producto vs. token actual

| Nivel | Esperado | Token actual | Veredicto |
|-------|----------|--------------|-----------|
| 0  | Gris neutro            | `220 8% 55%`  gris frío muy desaturado | ✅ acepta (S=8% → indistinguible de neutro) |
| 1  | Gris cálido            | `30 10% 60%`  warm gray claro          | ✅ |
| 2  | Gris cálido            | `30 10% 48%`  warm gray medio          | ✅ (mismo hue que POI-1, diferencia por L) |
| 3  | Amarillo apagado       | `50 55% 65%`                           | ✅ |
| 4  | Amarillo               | `50 90% 55%`                           | ✅ |
| 5  | Amarillo intenso       | `48 96% 48%`                           | ✅ |
| 6  | Ámbar suave            | `38 90% 60%`                           | ✅ |
| 7  | Ámbar                  | `32 92% 50%`                           | ⚠️ casi naranja (ver §5) |
| 8  | Verde amarillento      | `80 60% 50%`                           | ✅ |
| 9  | Verde suave            | `130 50% 50%`                          | ✅ |
| 10 | Verde                  | `142 71% 38%`                          | ✅ |

## 5. Hues prohibidos / saturaciones de riesgo

| Familia | Banda hue | Presencia en escala POI-N |
|---------|-----------|---------------------------|
| Rojo saturado | 350–20°, S>50% | **ninguno** |
| Naranja saturado | 20–35°, S>80% | **POI-7** (`32° 92% 50%`) — borderline (ver abajo) |
| Magenta | 290–340° | ninguno |
| Azul saturado | 200–250°, S>30% | ninguno (POI-0 está a S=8%, neutro) |
| Morado/violeta | 250–290° | ninguno |

**Único hallazgo objetivo (severidad media):** POI-7 (`32° 92% 50%`) colisiona perceptualmente con el token de estado `poi.state.empty` (`24° 95% 53%`, usado para POIs sin descripción cuando NO se aplica maturity). Aunque la cadena canónica garantiza que el fill viene de `poi.maturity.7` y no de `poi.state.empty`, ambos quedan en la misma franja naranja-saturada. El ojo no distingue "POI-7 ámbar" de "POI naranja vacío".

El resto de niveles cumple la escala aprobada gris→amarillo→ámbar→verde de forma monótona.

## 6. Descarte explícito de capas no auditadas

- **Health rings**: aplican `hsl(var(--poi-health-*) / 0.45)` con `RING_WIDTH=3` POR FUERA del disco. No mezclan con el fill.
- **Collection tint**: borde dashed @0.45 POR FUERA. No mezcla.
- **Owner identity**: aplica solo a POIs seguidos (triángulo, no círculo); no afecta el fill propio.
- **Selección/focus** (Fase A v1.3.7): `applyStateColor` es identidad. Solo halo externo.
- **Halo `own`**: drop-shadow blanco 1px. No mezcla.
- **Border**: stroke blanco 2px (`white`). Aporta separación, no color.

Confirmado: el color que el usuario lee en el disco proviene **exclusivamente** de `poi.maturity.<level>`.

## 7. Propuesta de corrección (opcional, no aplicada)

Solo se propone tocar **POI-7** para alejarlo de la franja naranja-vacío y reforzar la lectura monotónica de la escala. El resto queda OK.

```diff
- "7":  { "value": "32 92% 50%",   "_css": "--poi-maturity-7" }
+ "7":  { "value": "36 88% 52%",   "_css": "--poi-maturity-7" }   // ámbar verdadero, alejado de naranja
```

Justificación: subir hue 32→36 y bajar S 92→88 lo desplaza fuera de la órbita del token `empty` (24°) y lo acerca al ámbar canónico, manteniendo la progresión POI-6 (38°) → POI-7 (36°) → POI-8 (80°).

Coste: 1 línea en `poi.json` + rebuild de tokens. Sin cambios en código. No aplicado en esta auditoría.

## 8. Riesgos / fuera de alcance

- Tokens POI-3..POI-5 son amarillos puros (hue 48–50). Bajo basemaps amarillo-arena (Stamen Watercolor, OSM hillshading) pierden contraste. No requiere acción ahora.
- POI-9 (`130 50% 50%`) vs POI-10 (`142 71% 38%`): diferencia perceptual cómoda. OK.
- No se audita la cadena de cómputo (`computePoiMaturity`) — fuera de alcance.
- No se proponen cambios en `getPoiMaturityColor` ni en `createCustomIcon`.

## 9. Conclusión

La escala POI-N actual cumple la norma aprobada gris→amarillo→ámbar→verde sin colores prohibidos (rojo/magenta/azul/morado). **No hay bug.** Único refinamiento opcional: POI-7 está demasiado naranja y se solapa con la paleta `empty`; corrección de 1 línea propuesta en §7, sin aplicar.
