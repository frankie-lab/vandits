## Lo que el usuario está viendo y por qué tiene razón

Dos problemas reales en el panel de Diseño:

### Problema 1 — UX: el color no es clicable

Para editar un color hay que apuntar al lápiz pequeño de la derecha. El swatch del row, los hex `#DF6C20 / #E87A30`, los chips `→ brand.500` y los previews "Guardar" en claro/oscuro **muestran color pero no responden al click**. Es contraintuitivo y desperdicia mucho espacio horizontal.

### Problema 2 — Bug: lo que se muestra no es lo que está aplicado

`TokenRow.tsx` y `TokenPreviews.tsx` leen `row.light.value` y `row.value` resueltos por `token-grouping.ts`, que es un snapshot **estático del JSON**. No mira `draft` ni `published` del store. Resultado: si editas un primitivo (`brand.500`) o un alias (`color.light.primary`), el row del alias y su preview "Guardar" siguen pintando el color baseline mientras el resto de la app ya muestra el nuevo. De ahí el "no son los que aparecen".

El editor sí funciona (`getLeaf` + draft/published en `EditButton`), pero la presentación del row no.

## Plan

### A. Bug: una sola fuente de verdad para el color mostrado

1. Sustituir todas las lecturas estáticas `row.value` / `row.light.value` / `row.dark.value` por un helper único `useResolvedTokenValue(path: string)` que devuelve `draft[path] ?? published[path] ?? leaf.baseValue`.
2. Aplicarlo en:
   - `TokenRow.tsx` › `Swatch` (header), `ValueColumn` (columna hex), `RefChip`.
   - `TokenPreviews.tsx` › `ColorPreview`, `ColorExample` y el resto de previews que pintan color (`Poi`, `Popup`, `Map`).
3. El helper se suscribe al store (`useDesignSystemEdit`), así cualquier cambio en el draft re-renderiza row + preview en vivo. Cero más snapshots desactualizados.

### B. UX: clicar el color = editar el color

1. **Nuevo wrapper `<EditableTokenSurface token>`** (un solo helper) que en `editMode=ON` envuelve a `children` en un `Popover` con el editor del token; en `editMode=OFF` lo deja decorativo. Reutiliza el `Popover + TokenValueEditor` existente.
2. Lo aplicamos a:
   - **Swatch del header** del row (claro/oscuro: cada mitad abre su editor).
   - **ValueColumn** (línea claro / línea oscuro, cada hex es clicable).
   - **Previews** del bloque expandido (`Guardar`, `Acción`, tarjeta, borde, ring, texto…): el propio botón/elemento es el trigger.
3. El **botón lápiz desaparece** salvo en rows que no tengan superficie clicable (caso raro). Se recupera espacio horizontal.

### C. Color editor: paleta, HEX/RGB y picker estándar

Rediseñar `ColorEditor` con un layout tipo Figma/Tailwind. Mismo `value` (`H S% L%`) por dentro, mejor UI por fuera:

```text
┌────────────────────────────────────────────┐
│  ┌────────┐   HEX  [ #DF6C20         ]    │
│  │ swatch │   RGB  [ 223 ] [108] [ 32 ]   │
│  │ 64×64  │   HSL  [ 22 ] [73%] [50%]    │
│  └────────┘                                │
│  Paleta primitiva (presets clicables)      │
│  ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢   (10–12 swatches)   │
│  Picker nativo  [ <input type="color"> ]   │
│  Sliders  H ━●━ S ━●━ L ━●━                │
│  Base: 22 73% 50%      [Restablecer]       │
└────────────────────────────────────────────┘
```

- **Input HEX**: pegar `#DF6C20` o `DF6C20` actualiza HSL automáticamente.
- **Inputs RGB** (3 campos numéricos 0–255): edita por canales.
- **Inputs HSL** (3 numéricos): edita por canales con la misma semántica que el `value` interno.
- **Paleta primitiva**: en aliases, muestra los 12 primitivos del modo actual (`neutral.0..950 + brand + info + danger`) como swatches clicables → asigna el valor del primitivo (no relink, asigna valor directo; el "Desvincular/relink" sigue donde está).
- **Picker nativo**: `<input type="color">` para los que prefieren el selector del SO.
- **Sliders H/S/L** se conservan como ajuste fino.
- Conversiones HEX↔RGB↔HSL en un único `src/components/admin/design-system/color-conversions.ts` (sin dependencias).

### D. Tocar solo presentación

No se modifica: persistencia (`app_settings.design_system_overrides`), historial, `build-tokens.cjs`, JSON de tokens, modelo primitives/alias, ni la lógica de `setDraft`/`relink`.

## Archivos

**Modificar**
- `src/components/admin/design-system/TokenRow.tsx` — usar helper resuelto + envolver swatch y ValueColumn en `EditableTokenSurface`; degradar lápiz a fallback.
- `src/components/admin/design-system/TokenPreviews.tsx` — leer valor resuelto y envolver previews clicables.
- `src/components/admin/design-system/TokenEditors.tsx` — rediseñar `ColorEditor` (HEX/RGB/HSL + paleta + picker nativo + sliders).

**Crear**
- `src/components/admin/design-system/EditableTokenSurface.tsx` — wrapper único.
- `src/components/admin/design-system/useResolvedTokenValue.ts` — hook único de lectura.
- `src/components/admin/design-system/color-conversions.ts` — HEX/RGB/HSL helpers.

## Fuera de alcance

- No se cambia ningún color del propio panel admin.
- No se altera la estructura de primitives/alias ni el comportamiento de "Desvincular/relink".
- No se introduce librería externa de color picker; todo nativo (`<input type="color">` + inputs numéricos).
