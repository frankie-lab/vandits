## Cambio

En `src/components/admin/RecoverImagesPanel.tsx`:

1. Eliminar el bloque JSX (líneas 591–604) con los dos inputs `Creados antes de` / `Creados después de`.
2. Eliminar los estados `createdBefore` / `setCreatedBefore` y `createdAfter` / `setCreatedAfter` (líneas 166–167).
3. En el payload del job (líneas 444–445), eliminar las claves `createdBefore` y `createdAfter` (siempre se enviarán como ausentes; el backend ya las trata como opcionales).

No se toca backend ni el contrato de métricas. Es un cambio puramente de UI: dos campos que ya no se usarán.
