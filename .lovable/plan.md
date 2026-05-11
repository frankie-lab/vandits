# Plan: Taxonomía mínima de color (~25 tokens, 7 grupos)

## Estructura final

```text
color/
├── primitives/            ← paletas base (no editables como semánticas)
│   ├── neutral.{0,50,100,200,300,500,700,900,950}
│   ├── brand.{300,500,700}
│   ├── success.{500,600}
│   ├── warning.{500,600}
│   ├── danger.{500,600}
│   └── info.{500,600}
│
└── semantic/
    ├── brand/
    │   ├── primary           → --brand-primary, --ring
    │   └── accent            → --brand-accent
    │
    ├── surface/
    │   ├── background        → --surface-bg
    │   ├── card              → --surface-card, --surface-panel
    │   ├── popup             → --surface-popup, --surface-tooltip
    │   └── overlay           → --surface-overlay (scrim/modal backdrop)
    │
    ├── text/
    │   ├── primary           → --text-primary
    │   ├── secondary         → --text-secondary, --text-muted
    │   └── inverse           → --text-inverse (sobre superficies de color)
    │
    ├── state/
    │   ├── success           → --state-success
    │   ├── warning           → --state-warning
    │   ├── error             → --state-error
    │   └── loading           → --state-loading
    │
    ├── map/
    │   ├── background        → --map-bg (tile canvas neutro)
    │   ├── route             → --map-route (polyline base)
    │   └── selected          → --map-selected (focus ring / drag selection / route activa)
    │
    ├── poi/
    │   ├── mine              → --poi-mine (origen propio)
    │   ├── followed          → --poi-followed (origen seguido)
    │   ├── service           → --poi-service (origen servicio/partner)
    │   ├── enriched          → --poi-enriched (verde, estado canónico)
    │   ├── empty             → --poi-empty (naranja, estado canónico)
    │   └── error             → --poi-error (rojo, anillo de salud)
    │
    └── shadow/
        ├── sm                → --shadow-sm
        ├── md                → --shadow-md
        └── lg                → --shadow-lg
```

**Total**: 25 tokens semánticos (2 + 4 + 3 + 4 + 3 + 6 + 3) + primitivos.

---

## Cómo se preserva 100% el sistema POI

La regla canónica de marker (memoria `mem://style/map/health-rings-rule` + paleta de 3 estados) sigue intacta:

| Concepto actual | Token resultante |
|---|---|
| Verde = enriched | `poi.enriched` |
| Gris = imported | `text.secondary` (heredado) |
| Naranja = empty | `poi.empty` |
| Anillo rojo = error de enriquecimiento | `poi.error` |
| Anillo ámbar = cadena admin rota | `state.warning` |
| Anillo naranja = vacío | `poi.empty` (reutilizado) |
| Origen mío / seguido / servicio | `poi.mine` / `poi.followed` / `poi.service` |
| Collection tint ring | NO es un color fijo — se mantiene el cómputo dinámico desde `collection-chip-color.ts` (no entra en tokens) |
| Focused thumbnail (24px circular) | borde usa `map.selected` |
| Hero image en z≥17 | borde usa `map.selected` o color de estado correspondiente |

Helpers `getPointVisualState` y `getPointHealthRings` siguen siendo el único punto de decisión; cambia solo el path de origen del color que devuelven.

---

## Cómo se preserva el resto

| Lugar de uso actual | Token resultante |
|---|---|
| `--background`, `--card`, `--popover`, `--muted` (shadcn) | `surface.background` / `surface.card` / `surface.popup` / `surface.card` |
| `--foreground`, `--card-foreground`, `--popover-foreground` | `text.primary` |
| `--muted-foreground` | `text.secondary` |
| `--primary`, `--ring` | `brand.primary` |
| `--primary-foreground`, `--destructive-foreground` | `text.inverse` |
| `--secondary`, `--accent` | `brand.accent` |
| `--destructive` | `state.error` |
| `--border`, `--input` | derivado de `surface.card` con opacity (1 var compartida `--border-default`) |
| Route polyline base + alternativas | `map.route` (base) + tint dinámico desde preferencias (sin token) |
| Toast success/warning/error/info | `state.*` |
| Badge premium/sponsored | `brand.accent` |
| Skeleton base/shimmer | `surface.card` + opacity |
| Sidebar/topbar/tabs | `surface.card` + `text.primary` |

Lo que **no necesita token propio** (se resuelve por composición):
- Hover/active/subtle de brand → opacity sobre `brand.primary` (CSS `color-mix` o alpha).
- Disabled → opacity 0.5 sobre el color base.
- Border subtle/strong → opacity sobre `text.secondary`.
- Bg de estados (success-bg, error-bg) → `color-mix(state.X 12%, surface.card)`.

---

## Plan de ejecución (7 pasos)

### 1. Reescribir `src/design-system/tokens/source/color.json`
Estructura nueva con `primitives` + `semantic.{7 grupos}`. Cada token semántico:
```json
{
  "value": "{neutral.50}",
  "_css": ["--surface-bg"],
  "_description": "Fondo general de la app"
}
```
`_css` array permite que un mismo token alimente varios CSS vars compartidos (ej. `surface.card` → `--surface-card` y `--surface-panel`).

### 2. Actualizar `build-tokens.cjs`
- Recorrido recursivo de `semantic.*`.
- Emite una línea `--var: hsl(value);` por cada entrada de `_css`.
- Genera `tokens.css`, `tokens.ts` y `tailwind.tokens.cjs` con la nueva jerarquía.

### 3. Reescribir bloques de color en `src/index.css`
Eliminar los ~20 CSS vars shadcn antiguos. Emitir los nuevos ~30 CSS vars (algunos tokens producen 2 vars).

### 4. Actualizar `tailwind.config.ts`
Mapping plano legible:
```ts
colors: {
  "brand-primary": "hsl(var(--brand-primary))",
  "brand-accent":  "hsl(var(--brand-accent))",
  "surface-bg":    "hsl(var(--surface-bg))",
  "surface-card":  "hsl(var(--surface-card))",
  "surface-popup": "hsl(var(--surface-popup))",
  "surface-overlay":"hsl(var(--surface-overlay))",
  "text-primary":  "hsl(var(--text-primary))",
  "text-secondary":"hsl(var(--text-secondary))",
  "text-inverse":  "hsl(var(--text-inverse))",
  "state-success": "hsl(var(--state-success))",
  "state-warning": "hsl(var(--state-warning))",
  "state-error":   "hsl(var(--state-error))",
  "state-loading": "hsl(var(--state-loading))",
  "map-bg":        "hsl(var(--map-bg))",
  "map-route":     "hsl(var(--map-route))",
  "map-selected":  "hsl(var(--map-selected))",
  "poi-mine":      "hsl(var(--poi-mine))",
  "poi-followed":  "hsl(var(--poi-followed))",
  "poi-service":   "hsl(var(--poi-service))",
  "poi-enriched":  "hsl(var(--poi-enriched))",
  "poi-empty":     "hsl(var(--poi-empty))",
  "poi-error":     "hsl(var(--poi-error))",
}
```

### 5. Codemod transversal — renombrado total
Script `scripts/codemod-color-tokens-v2.cjs` aplica:

| Antiguo | Nuevo |
|---|---|
| `bg-background` | `bg-surface-bg` |
| `bg-card`, `bg-muted` | `bg-surface-card` |
| `bg-popover` | `bg-surface-popup` |
| `text-foreground`, `text-card-foreground`, `text-popover-foreground` | `text-text-primary` |
| `text-muted-foreground` | `text-text-secondary` |
| `bg-primary`, `ring-ring` | `bg-brand-primary`, `ring-brand-primary` |
| `text-primary-foreground`, `text-destructive-foreground` | `text-text-inverse` |
| `bg-secondary`, `bg-accent` | `bg-brand-accent` |
| `bg-destructive`, `text-destructive` | `bg-state-error`, `text-state-error` |
| `border-border`, `border-input` | `border-surface-card` (con opacity vía clase utilitaria) |

Cobertura: todo `src/components/ui/*` + `src/components/**` + `src/pages/**` + `src/domains/**`. El build de Tailwind falla si queda algún huérfano → señal clara.

### 6. Reescribir el inspector admin
- `token-grouping.ts`: 7 grupos finales (brand, surface, text, state, map, poi, shadow).
- `token-glossary.ts`: labels humanos por path.
- `TokenRow` ya soporta el editor HEX/RGB/HSL + paleta — solo cambia el origen del registro.
- Sin árbol colapsable (no es necesario con 25 tokens): lista plana agrupada por sección, búsqueda en cabecera.
- Eliminar `EditableTokenSurface` superflua si la matriz queda obvia.

### 7. Conectar helpers POI/mapa a los nuevos tokens
- `getPointVisualState(loc)` lee de `--poi-enriched / --poi-empty` + `text.secondary` para imported.
- `getPointHealthRings(loc)` lee de `--poi-error / --state-warning / --poi-empty`.
- `createCustomIcon` (focused thumb): borde = `--map-selected` o color de estado.
- Route polyline base = `--map-route`; alternativas usan tint dinámico existente (sin token).

---

## Limpieza colateral

- **Borrar** `src/design-system/tokens/source/poi.json` (su contenido de color migra; las reglas de zoom/tamaño no son color y van a `map-rules.json` aparte si aplica).
- **Borrar** `src/design-system/tokens/source/map.json` (idem).
- **Mantener** `elevation.json` solo si contiene offsets/blur (no color). Si solo era color, se elimina y entra en `shadow.{sm,md,lg}`.
- **Reconsiderar** `EditableTokenSurface` y `useResolvedTokenValue`: simplificar si el árbol nuevo lo permite.

---

## Archivos afectados

**Reescritos**:
- `src/design-system/tokens/source/color.json`
- `src/design-system/tokens/build-tokens.cjs`
- `src/index.css` (bloque colores)
- `tailwind.config.ts` (sección colors)
- `src/components/ui/*` (vía codemod)
- Todo `src/` con clases Tailwind de color (vía codemod)

**Nuevos**:
- `scripts/codemod-color-tokens-v2.cjs`

**Actualizados**:
- `src/components/admin/design-system/token-glossary.ts`
- `src/components/admin/design-system/token-grouping.ts`
- `src/design-system/runtime/apply-overrides.ts`
- `src/design-system/runtime/token-registry.ts`
- `src/domains/content/lib/point-visual-state.ts` (lectura de tokens)
- `src/domains/content/lib/point-health-rings.ts` (lectura de tokens)

**Borrados**:
- `src/design-system/tokens/source/poi.json`
- `src/design-system/tokens/source/map.json` (si solo color)

---

## Riesgos y mitigaciones

1. **Bordes**: hoy hay `--border` y `--input` con valores distintos en dark mode. Solución: 1 CSS var `--border-default` derivada de `surface.card` con opacity; si en QA visual aparece un caso que necesita borde fuerte, se introduce `--border-strong` (1 token más).
2. **Pérdida de matices `hover/active`**: se resuelven con `color-mix()` o utilidades Tailwind (`bg-brand-primary/90`). Si algún componente lo necesita explícito, se añade en una segunda iteración.
3. **Anillo ámbar (admin chain broken)**: comparte color con warnings de UI vía `state.warning`. Es semánticamente correcto (es una alerta) y reduce duplicación.
4. **Codemod incompleto**: el build de Tailwind falla con clases inválidas, lo que sirve como red de seguridad. Tras el codemod, recorrido manual por 6 vistas: home/mapa, vista doc, admin design system, popup POI, panel itinerarios, signin.

---

## Out of scope

- Typography, radius, density, motion, z-index — sin cambios.
- Cambios visuales (los valores se preservan; solo cambia la organización).
- Colección tint (sigue calculándose dinámicamente desde `collection-chip-color.ts`).
- Route alternative tints (siguen viniendo de preferencias usuario).
