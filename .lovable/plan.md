## Problema

El diálogo "Geografía universal" (y otros modales del `AdminPanel`) sigue tocando la barra de progreso inferior porque:

1. El overlay aplica `padding-bottom: var(--bottom-progress-h)` correctamente.
2. Pero el contenido interno usa `h-[92vh]` como **altura preferida**. `max-h-full` clampa, pero "full" del padre = `100vh - padding-bottom - p-4 (32px)`, y `92vh` queda apenas 7px por debajo. El resultado visual es que ambos bloques se rozan, sin gap.
3. La barra está a `z-[2100]` y el overlay a `z-[2000]`, así que cualquier overlap se ve como "barra encima del diálogo".

## Solución (CSS transversal — no toca AdminPanel.tsx)

Único cambio en `src/index.css`, sobre la regla ya existente `[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], .overlay-respect-progress`:

1. Sustituir `padding-bottom: var(--bottom-progress-h, 0px)` por:
   ```
   padding-bottom: calc(var(--bottom-progress-h, 0px) + 12px);
   ```
   Los 12px son un gap visual mínimo (token: `--overlay-progress-gap`) entre cualquier overlay y la barra. Se aplica a TODOS los overlays automáticamente, no solo Geografía universal.

2. Añadir una regla hermana que limite el `max-height` real del contenido interno de cualquier overlay, sin tener que tocar cada modal:
   ```
   .overlay-respect-progress > * {
     max-height: calc(100vh - var(--bottom-progress-h, 0px) - 2rem - 12px);
   }
   ```
   Así el `h-[92vh]` del AdminPanel queda capado siempre por la altura disponible real, no por una proporción del viewport completo. Si la barra mide 80px, el diálogo se encoge a 80px+gap menos. Si la barra está oculta, recupera sus 92vh.

3. (Opcional, recomendado) Exponer el gap como variable CSS en `:root` para mantener el sistema centralizado:
   ```
   --overlay-progress-gap: 12px;
   ```
   y usarla en los dos cálculos anteriores. Cualquier ajuste futuro del gap se hace en un único punto.

## Lo que NO se toca

- `AdminPanel.tsx`: sigue con `h-[92vh] max-h-full`. La regla CSS hace el trabajo transversalmente.
- `BottomProgressBar.tsx`: la publicación de `--bottom-progress-h` sigue exactamente igual.
- Ningún Radix Dialog/Sheet del proyecto: heredan la mejora automáticamente porque ya estaban incluidos en el selector.

## Validación

- Abrir Geografía universal con un job activo: debe verse un margen claro de ~12px entre el borde inferior del diálogo y la barra.
- Cerrar el job (barra desaparece, `--bottom-progress-h = 0`): el diálogo recupera 92vh.
- Repetir con cualquier Radix Dialog (eliminar documento, confirmaciones) para confirmar que ninguno queda detrás de la barra.
