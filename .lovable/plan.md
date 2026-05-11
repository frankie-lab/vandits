## Diagnóstico

Tienes razón: en `color.json` hay valores literales repetidos en tokens semánticamente equivalentes. Ejemplos en la captura:

- `#FFFFFF` aparece en `card`, `popover`, `primaryForeground`, `secondaryForeground`, `destructiveForeground`
- `#1D212B` aparece en `foreground`, `cardForeground`, `popoverForeground`
- `#FBFAF9` aparece solo en `background` pero conceptualmente es "neutral más claro del tema"
- Igual en oscuro: `#161A22` está en `card` y `popover`; `#F2F0ED` en los tres "foreground"

Hoy son strings literales sueltos. Editar "color de marca" no cascadea, y editar "fondo de tarjeta" no toca "fondo de popover" aunque casi siempre deban ir juntos. Por eso el inspector enseña filas duplicadas.

La solución correcta no es ocultarlas en UI: es introducir **dos niveles de tokens** (primitivos → semánticos) con referencias, y que el editor entienda esa cadena.

## Plan: Tokens primitivos + alias semánticos

### 1. Refactor `color.json` en dos capas

```text
primitives:
  neutral.0 / 50 / 100 / 200 / 500 / 800 / 900 / 950
  brand.500 / brand.600
  info.500
  danger.500 / danger.600
  (sin _css — son solo "paleta cruda")

color.light / color.dark:
  background:            { $ref: "primitives.neutral.50", _css: "--background" }
  card:                  { $ref: "primitives.neutral.0",  _css: "--card" }
  popover:               { $ref: "primitives.neutral.0",  _css: "--popover" }
  primary:               { $ref: "primitives.brand.500",  _css: "--primary" }
  primaryForeground:     { $ref: "primitives.neutral.0",  _css: "--primary-foreground" }
  …
```

El resolver de tokens (en `token-registry.ts` y en `apply-overrides.ts`) sigue el `$ref` hasta una hoja con `value`. Las CSS vars se escriben exactamente igual que ahora — cero cambios visuales.

### 2. Inspector con dos pestañas dentro de "Color"

```text
Color
 ├─ Paleta primitiva   ← 10–12 swatches base, fuente única de verdad
 └─ Tokens semánticos  ← cada uno muestra "→ primitives.neutral.0" y los alias que comparten esa referencia
```

Ejemplo de fila semántica colapsada:

```text
Fondo claro de superficie                       CLARO  → neutral.0
"card, popover, primaryForeground"              OSCURO → neutral.900
└─ 3 alias agrupados · click para expandir
```

### 3. Edición en cascada

- **Editar un primitivo** (`neutral.0`) → todos los semánticos que lo referencian cambian a la vez. Un solo color picker afecta a `card`, `popover`, `primaryForeground` simultáneamente. Esto es lo que pediste: dejar de tocar 3 sitios para el mismo color.
- **Editar un semántico** → opción "Desvincular del primitivo" antes de cambiar el valor (si no, sigue heredando). Útil para excepciones puntuales.
- **Volver al primitivo** → botón "Re-vincular" restaura el `$ref`.

### 4. Persistencia en `app_settings`

El override map ya guarda por path. Añadimos dos formas de override:

```json
{
  "primitives.neutral.0": "0 0% 100%",      // cascada
  "color.light.card": { "$ref": "primitives.neutral.0" },  // alias
  "color.light.border": "40 15% 85%"        // override directo (desvinculado)
}
```

`apply-overrides.ts` resuelve refs antes de escribir las CSS vars.

### 5. Mismo patrón aplicable después a:

- `typography` — `fontFamily.heading` → `fontFamily.sans`, varias escalas comparten weight
- `radius` — `rounded-token-sm/md/lg` muchas veces colapsan a 2 valores reales
- `motion` — durations base reutilizadas en varios tokens

Pero **esta primera entrega solo toca `color.json`** para validar el patrón.

## Detalles técnicos

**Archivos a tocar**:
- `src/design-system/tokens/source/color.json` — reescritura completa con `primitives` + `$ref`
- `src/design-system/runtime/token-registry.ts` — nuevo `resolveRef(node)` recursivo; `TokenLeaf` gana campos `refPath?`, `isPrimitive?`
- `src/design-system/runtime/apply-overrides.ts` — resolver refs antes de escribir CSS
- `src/design-system/runtime/edit-mode-store.ts` — `setDraft` acepta `{ $ref }` o valor crudo; nuevo `unlink(path)` y `relink(path, ref)`
- `src/components/admin/design-system/token-grouping.ts` — agrupa por `refPath` en lugar de por valor literal
- `src/components/admin/design-system/TokenRow.tsx` — chip "→ neutral.0" + acción "Desvincular"
- `src/components/admin/design-system/TokenEditors.tsx` — `ColorEditor` con toggle "Editar el primitivo vinculado" vs "Sobrescribir solo este alias"
- `src/components/admin/DesignSystemPanel.tsx` — sub-pestañas "Primitiva" / "Semánticos" dentro de Color

**Sin cambios**:
- CSS vars consumidas por componentes (`--background`, `--primary`, etc.) — los nombres no cambian
- `index.css` / Tailwind config — siguen leyendo las mismas variables
- Build pipeline `build-tokens.cjs` — solo necesita resolver refs antes de emitir
- Otros JSON de tokens (typography, density…) — fase siguiente, fuera de scope ahora

**Riesgo principal**: el build de tokens (`build-tokens.cjs`) hoy probablemente espera `value` directo. Si el script no resuelve `$ref`, los archivos generados (`tokens.css`/`.ts`) saldrían vacíos para los alias. Hay que añadir el resolver también ahí.

**Sin cambios visuales** al terminar: la app se sigue viendo idéntica hasta que un admin edite. Solo cambia la estructura interna y la UI del inspector.
