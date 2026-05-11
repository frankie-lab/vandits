# Sistema de color semántico y adaptativo (light/dark pares)

## Objetivo

Cada rol visual de color deja de ser un valor único reutilizado entre temas y pasa a existir como **par semántico** `{light, dark}` con equivalencia perceptual, no matemática. El editor genera el par cuando el usuario edita un lado, valida contraste WCAG contra el fondo destino y permite ajustar cada modo de forma independiente.

## Estado actual (resumen)

- `src/design-system/tokens/source/color.json` ya tiene ramas `color.light.*` y `color.dark.*`, pero:
  - `map.route`, `map.selected`, y **todos los `poi.*`** apuntan al MISMO `$ref` en light y dark (no hay par real).
  - `surface.overlay` dark/light usan el mismo primitivo neutral.900/950 sin pensar en contraste sobre el fondo destino.
- `TokenRow.tsx` ya renderiza dos columnas Claro/Oscuro, pero el editor (`ColorEditor` en `TokenEditors.tsx`) edita un solo valor y no conoce el modo opuesto ni el fondo destino.
- `color-conversions.ts` cubre HEX↔RGB↔HSL pero no contraste WCAG ni mapeo light↔dark.

## Cambios

### 1. Helper de equivalencia perceptual y contraste

Nuevo archivo `src/components/admin/design-system/color-adaptive.ts`:

- `relativeLuminance(rgb) → number` y `contrastRatio(a, b) → number` (fórmula WCAG 2.1).
- `wcagLevel(ratio, { largeText }) → 'AAA' | 'AA' | 'AA-large' | 'fail'`.
- `deriveOppositeMode(hsl, { from: 'light'|'dark', targetBgHsl })`:
  - LIGHT→DARK: mantener H ±2, S `*= 0.85` (rango 10–20% menos), L `+= 12` (rango 10–20% más), clamp.
  - DARK→LIGHT: mantener H ±2, S `*= 1.1`, L `-= 12`, clamp.
  - Tras la transformación, si el contraste con `targetBgHsl` es < 4.5 (AA texto) o < 3 (AA UI), iterar ajustando L en pasos de 4 hasta cumplir o tope.
- `suggestPair(hsl, role) → { light, dark, contrast: {light, dark}, wcag: {...} }` resolviendo el `targetBg` según el rol semántico (ver tabla 2).

### 2. Mapa rol → fondo destino

En `color-adaptive.ts` exportar `ROLE_SURFACE_MAP`:

```text
brand.primary        → surface.background
brand.accent         → surface.card
text.primary         → surface.background
text.secondary       → surface.background
text.inverse         → brand.primary
state.success/...    → surface.card
map.route/selected   → map.background
poi.mine/followed/.. → map.background
poi.enriched/empty   → map.background
surface.overlay      → surface.background (overlay sobre)
```

El editor resuelve `targetBg` leyendo del registry el valor actual del token de surface correspondiente en el mismo modo.

### 3. Tokens: separar pares POI / mapa / shadow

En `color.json`:

- Añadir primitivos POI por modo:
  ```text
  color.primitives.light.poi.{mine,followed,service,enriched,empty,error}
  color.primitives.dark.poi.{...}
  ```
  con valores derivados (dark = pair adaptativo de los light actuales preservando la paleta vigente, sin cambio visual perceptible).
- Reescribir `color.light.poi.*` y `color.dark.poi.*` para apuntar a sus primitivos correspondientes (no al mismo `poi.originBorder.*`).
- Mismo tratamiento para `color.{light,dark}.map.route`, `map.selected`.
- Añadir `color.light.shadow.{sm,md,lg}` (hoy solo existen en dark) para que la rama shadow exista simétrica.

Mantener compat: los CSS vars emitidos (`--color-poi-mine`, etc.) no cambian de nombre, solo de origen.

### 4. Build pipeline

`build-tokens.cjs`:

- No requiere cambios estructurales: ya emite `.dark { }` para `color.dark.*`.
- Añadir aviso (warn) si un token `color.light.X` y `color.dark.X` resuelven al MISMO valor final (señal de par no diferenciado).

### 5. Editor de color por par

`TokenEditors.tsx` y `TokenRow.tsx`:

- Nuevo componente `ColorPairEditor` que reemplaza a `ColorEditor` cuando la fila es `kind: 'lightDark'`.
- Layout dentro del popover (un solo popover, dos columnas):
  ```text
  ┌──────────────────────────┬──────────────────────────┐
  │ Claro                    │ Oscuro                   │
  │ [swatch grande]          │ [swatch grande]          │
  │ HEX ___  H S L sliders   │ HEX ___  H S L sliders   │
  │ Contraste vs background  │ Contraste vs background  │
  │   4.8:1  AA OK           │   6.2:1  AAA OK          │
  │ [Generar opuesto desde ▶]│ [◀ Generar opuesto desde]│
  └──────────────────────────┴──────────────────────────┘
  ```
- Al editar un lado y pulsar "Generar opuesto", se llama `deriveOppositeMode` y se propone valor en el otro lado (no se aplica automáticamente; el usuario confirma). Botón secundario "Aplicar sugerencia" en cada columna muestra la diferencia ΔL/ΔS.
- Click directo en cualquier swatch de la fila abre el popover ya focalizado en esa columna.
- Mientras el popover está abierto, mostrar en vivo el contraste contra el fondo destino del rol (resuelto vía `ROLE_SURFACE_MAP`).

### 6. Validación WCAG en la fila

`TokenRow.tsx`:

- Junto al label de cada columna añadir badge compacto:
  - `4.8:1 AA` (verde token state.success)
  - `2.1:1 fail` (state.error) con tooltip "No cumple AA sobre {surface.background}".
- Solo para tokens cuyo rol esté en `ROLE_SURFACE_MAP` (no para primitivos crudos).

### 7. Storybook — stories de validación

`src/design-system/map/__stories__/`:

- Nueva story `ColorPairAudit.stories.tsx`: tabla con cada rol semántico, su par light/dark, contraste contra el surface correspondiente, y check WCAG.
- Extender stories existentes (`PoiPreview`, `PopupMatrix`, `PopupResponsive`) para renderizar ambas variantes y un toggle hover/selected/loading sobre el canvas del mapa.
- Story nueva `DensityStress` ya cubre densidad — añadir variante "dark canvas" para validar legibilidad POI sobre fondo oscuro.

### 8. Migración de valores existentes

Script de un solo uso `scripts/migrate-color-pairs.cjs`:

- Lee `color.json`, detecta tokens semánticos sin par real (mismo $ref/value en light y dark), aplica `deriveOppositeMode` y emite la versión actualizada. Output revisado a mano antes de commit.
- Aplica primero al subset POI/map/shadow descrito en (3).

### Fuera de alcance

- Animación / motion tokens.
- Densidad / tipografía.
- Refactor del runtime apply-overrides (sigue resolviendo `color.{mode}.X` igual).
- Migración masiva de los primitivos brand/neutral (ya están bien diferenciados).

## Detalles técnicos clave

- Conversión interna sigue siendo triplete HSL `"H S% L%"`; las utilidades nuevas viven aparte y consumen `parseHslTriplet` existente.
- `deriveOppositeMode` opera en HSL y solo cae a comparación de luminancia (sRGB linealizado) para el chequeo WCAG.
- El editor no escribe nunca dos tokens a la vez sin acción del usuario: la regla "se genera también el equivalente" se expone como sugerencia accionable + aviso si el usuario guarda un par no diferenciado.
- `useResolvedTokenValue` se extiende con un segundo arg opcional `mode: 'light'|'dark'` para que el editor pueda mirar el valor del modo opuesto sin recargar.

