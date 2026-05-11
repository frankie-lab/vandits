# Unificar fila de token de color

## Problema actual

Cada token de color hoy ocupa dos zonas que dicen casi lo mismo:

1. **Header del row**: swatch partido claro/oscuro + columna derecha con `CLARO #DF6C20` / `OSCURO #E87A30`.
2. **Bloque "Vista previa" expandido**: dos tarjetas grandes "Modo claro" y "Modo oscuro" con el mismo color aplicado a un botón/ejemplo.

Resultado: cuatro hits visuales para el mismo dato, el color picker queda detrás de un swatch diminuto y el bloque expandido aporta poca cosa nueva.

## Propuesta

Una sola **fila de token** con cabecera compacta + **dos columnas grandes** (Claro / Oscuro) siempre visibles, cada una funcionando como botón → abre el color picker (`EditableTokenSurface` ya existente).

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Color de marca  → brand.500   [Modificado]                          │
│  Botones primarios (CTA), anillo de foco… Emite --brand-primary…     │
├──────────────────────────────┬───────────────────────────────────────┤
│  CLARO            #DF6C20    │  OSCURO            #E87A30            │
│  ┌────────────────────────┐  │  ┌────────────────────────────────┐   │
│  │  swatch grande clicable│  │  │  swatch grande clicable        │   │
│  │  (sobre fondo claro)   │  │  │  (sobre fondo oscuro)          │   │
│  └────────────────────────┘  │  └────────────────────────────────┘   │
└──────────────────────────────┴───────────────────────────────────────┘
```

- Sin chevron de expandir/colapsar para tokens `lightDark` (no hay nada que ocultar).
- Click en cualquier punto de la columna izquierda → popover color picker del modo claro. Idem oscuro.
- En modo lectura (editMode off): swatches no clicables, hex visible, sin hover ring.
- En modo edición: ring de focus + cursor pointer + popover con `TokenValueEditor`.
- Fondo del swatch claro: `bg-background`; del oscuro: bloque oscuro tipo `bg-foreground/90` (mismo truco que el preview actual) para que ambos se lean en contexto.

## Tokens no-color y `single`

- `single` con valor color (poi.\*, map.\*): una sola columna grande del mismo estilo, sin partición.
- `single` no-color (radius, density, motion, typography, z-index, elevation): se conserva el comportamiento expandible actual (chevron + preview específico). Solo cambia el caso `lightDark`/color.

## Cambios

### `src/components/admin/design-system/TokenRow.tsx`
- Detectar `row.kind === 'lightDark'`: renderizar nuevo layout de cabecera + grid 2 columnas, **sin** estado `open` ni chevron, **sin** invocar `<TokenPreview>` para este caso.
- Detectar `row.kind === 'single'` con color: layout cabecera + 1 columna grande clicable, también sin expand.
- Resto de casos (`single` no-color): se mantiene el comportamiento actual (header compacto + chevron + `TokenPreview`).
- Quitar `Swatch` y `ValueColumn` del header en los casos color (quedan inlined en las columnas grandes); seguir usándolos para no-color.

### `src/components/admin/design-system/TokenPreviews.tsx`
- `ColorPreview` deja de usarse (los rows color ya no expanden). Se puede eliminar la función y su rama en `TokenPreview` para evitar código muerto.
- `LiveColorExample` / `ColorExample` se eliminan o se reciclan dentro de `TokenRow` como `ColorColumn` (mantienen el patrón "fondo claro/oscuro + swatch grande clicable", pero sin el botón "Guardar"/"Eliminar"/"Acción" que confunde — el preview decorativo dentro del swatch es opcional y queda fuera de scope salvo que se pida).

## Out of scope
- Taxonomía de tokens (ya definida en pasos previos).
- Tokens no-color y su preview expandible.
- Inspector lateral, búsqueda, agrupación.
- Cambios en `EditableTokenSurface` o `TokenValueEditor` (se reutilizan tal cual).

## Riesgos
- Pérdida del mini-ejemplo "botón Guardar / Eliminar" del `ColorPreview` actual. Si se quiere conservar como decoración, puede ir embebido dentro del swatch grande (texto blanco/negro encima del color). Pendiente de decisión del usuario.
- Algunos tokens color que hoy expanden a un preview específico (background, border, ring) pierden ese matiz. Si interesa conservarlo, se puede mantener el chevron solo para esos casos concretos.
