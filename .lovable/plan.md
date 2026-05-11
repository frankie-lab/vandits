# Click directo en el color para editarlo (sin modo edición)

## Problema

- Hoy, hacer click sobre el swatch no abre nada: `EditableTokenSurface` solo se vuelve clicable cuando `editMode === true`.
- El botón "Editar tema" alterna `editMode`, pero no genera feedback visible cerca del row, así que parece que "no hace nada".
- El usuario espera comportamiento directo: **un click sobre el color abre el picker**. Punto.

## Cambios

### 1. `EditableTokenSurface.tsx` — quitar el gate de `editMode`
- Siempre que haya `path` válido + `leaf` en el registry, envolver `children` en el `<button>` con popover.
- Eliminar la rama `if (!editMode) return <>{children}</>`.
- Resultado: cualquier swatch del inspector (color, radius, density…) es clicable directo.

### 2. `TokenRow.tsx` — EditButton fallback siempre disponible
- Quitar `if (!editMode) return null` dentro de `EditButton`. El lápiz fallback para no-color (poco usado ahora que los color rows ya tienen swatch clicable, pero válido para rows raros sin superficie clicable) deja de depender de editMode.

### 3. `DesignSystemPanel.tsx` — eliminar el toggle "Editar tema"
- Quitar el `<Button variant={editMode ? 'cta' : 'outline'}>Editar tema / Editando tema</Button>` de la cabecera del panel. Ya no hay modo que activar.

### 4. `HistoryTab.tsx` — eliminar "Activar modo edición"
- Quitar el botón al final del listado de historial.

### 5. `EditModeBar.tsx` — barra reactiva a cambios, no a modo
- Mostrar siempre que `changeCount > 0` (hay drafts sin publicar), independientemente de `editMode`.
- Texto: "Cambios sin publicar · N" (en lugar de "Editando tema").
- Quitar botón "Salir". Solo quedan **Descartar** y **Publicar**.

### 6. `edit-mode-store.ts` — `editMode` deja de filtrar
- `editMode` queda obsoleto. Para minimizar superficie tocada se inicializa en `true` y `setEditMode` se vuelve no-op (o se elimina, pero hace falta limpiar los pocos lugares que aún lo importan: `useResolvedTokenValue`, `EditableTokenSurface`).
- Limpieza preferida: eliminar `editMode` y `setEditMode` del state; los consumidores ya no los necesitan tras los cambios anteriores.

## Conexión con dónde se aplica (no se pierde)

La descripción del glosario (`entry.usage`) sigue en la cabecera de cada row: *"Botones primarios (CTA), anillo de foco, enlaces activos. Emite --brand-primary, --primary y --ring."* Eso es exactamente la conexión con dónde se aplica. No se toca.

Adicionalmente, los `AliasChips` (cuando el row tiene varios CSS vars asociados) siguen renderizándose debajo de la descripción.

## Out of scope

- Cambiar el layout 2 columnas (ya hecho en el turno previo).
- Tocar el editor de color (`TokenValueEditor`).
- Mover el popover / cambiar su tamaño.
