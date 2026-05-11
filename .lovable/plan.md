# Plan: fila única de color con 3 columnas

Cambio acotado a `src/components/admin/design-system/TokenRow.tsx` y dependencias visuales. Sin tocar build pipeline ni `color.json`.

## Resultado visual

Cada token de color pasa de 2 filas (label + 2 swatches contextuales) a **1 fila con 3 columnas**:

```text
┌─────────────────────────┬───────────────────────┬───────────────────────┐
│ INFO                    │ CLARO                 │ OSCURO                │
│ token.name              │ ┌───────────────────┐ │ ┌───────────────────┐ │
│ [Modificado] → brand.500│ │  swatch grande    │ │ │  swatch grande    │ │
│ Descripción uso         │ │  CLARO            │ │ │  OSCURO           │ │
│ --css-var-1             │ │  #RRGGBB          │ │ │  #RRGGBB          │ │
│ --css-var-2             │ │  4.8:1 AA         │ │ │  6.2:1 AAA        │ │
│ [⛓ Auto-link]           │ └───────────────────┘ │ └───────────────────┘ │
└─────────────────────────┴───────────────────────┴───────────────────────┘
```

- **Columna 1 (info)**: nombre, badge "Modificado", chip `→ $ref`, descripción de uso, lista de CSS vars emitidas, toggle **Auto-link** (por fila, default ON).
- **Columna 2 (Claro)**: swatch grande clickable. Overlay con label "CLARO", HEX y badge WCAG contra `surface.background.light` (o el surface mapeado en `ROLE_SURFACE_MAP`). Click → popover con sliders HSL + input HEX.
- **Columna 3 (Oscuro)**: idéntico, contra `surface.background.dark`.

El swatch ocupa toda la altura de la columna (≈80–96px), texto superpuesto con contraste auto (claro/oscuro según luminancia del swatch).

## Comportamiento auto-link

**Toggle por fila**, persistido en `edit-mode-store` como `linkedPairs: Record<tokenPath, boolean>`. Default `true`.

- **Linked ON**: al editar Claro, se recalcula Oscuro vía `deriveOppositeTriplet` + iteración WCAG (ya existente en `color-adaptive.ts`). Y viceversa. La columna gemela muestra una sutil animación `pulse-once` cuando se recalcula.
- **Linked OFF**: las dos columnas son independientes; el usuario edita cada una a mano. Si los valores divergen del par perceptual sugerido, aparece un micro-hint "Sugerencia disponible" con botón para aplicarla puntualmente.

Se elimina el botón explícito "Generar opuesto" (queda implícito por el toggle).

## Picker inline

Un único componente `<ColorSwatchEditor mode="light|dark" />`:
- Click → `Popover` (shadcn) con:
  - HEX input
  - 3 sliders H/S/L
  - Preview del swatch sobre el surface destino
  - Badge WCAG en vivo
- Onchange → `setDraftValue(tokenPath, mode, hsl)`; si `linkedPairs[tokenPath]` → también `setDraftValue(tokenPath, oppositeMode, derived)`.

## Archivos a tocar

1. **`TokenRow.tsx`** — reescribir el render de filas de color (`isColorRow`) con el nuevo layout 3-col. El resto de tipos (number, shadow, etc.) sigue igual.
2. **`design-system/ColorSwatchEditor.tsx`** *(nuevo)* — swatch + popover picker.
3. **`design-system/ColorPairInfo.tsx`** *(nuevo)* — columna izquierda (nombre, ref, vars, toggle auto-link).
4. **`runtime/edit-mode-store.ts`** — añadir `linkedPairs` y acciones `setLinked(tokenPath, bool)` + `isLinked(tokenPath)`.
5. **`TokenEditors.tsx`** — ya no necesario para el caso color (queda para otros tipos); limpiar imports muertos.

## Fuera de alcance

- `color.json`, build pipeline, runtime apply-overrides: sin cambios.
- Storybook stories adicionales: sin cambios (se beneficiarán automáticamente).
- Otros tipos de token (number, duration, shadow): sin cambios.

## Detalle técnico clave

```ts
// edit-mode-store.ts
linkedPairs: Record<string, boolean>; // default true si ausente
setLinked(path, val): void;

// TokenRow.tsx (color branch)
const linked = isLinked(tokenPath);
const onChange = (mode, hsl) => {
  setDraft(tokenPath, mode, hsl);
  if (linked) {
    const target = ROLE_SURFACE_MAP[tokenPath] ?? 'surface.background';
    const targetBg = resolveTokenValue(target, oppositeMode);
    const derived = suggestPair(hsl, mode, targetBg).opposite;
    setDraft(tokenPath, oppositeMode, derived);
  }
};
```

Tras aprobación implemento directamente sobre estos archivos.
