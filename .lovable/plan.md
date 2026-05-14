## Objetivo
Eliminar el indicador "TrendingUp + N" (contribuciones de 7 días) de las filas de usuarios en `UsersSidebar`.

## Cambios

**`src/components/UsersSidebar.tsx`**
- Eliminar el bloque `{user.contributions7d != null && user.contributions7d > 0 && (<span>...<TrendingUp/>+N</span>)}` (líneas ~773-778).
- Quitar la entrada `+N en los últimos 7 días` del array que arma el `title` del contenedor de stats (líneas ~746-749) para que el tooltip no mencione algo que ya no se muestra.
- Si `TrendingUp` no se usa en ningún otro sitio del archivo, eliminar su import.

## Fuera de alcance
- No tocar la fuente de datos `contributions7d` ni el feed que la calcula — el campo sigue disponible por si se reutiliza más adelante.
- No alterar el resto de stats (compartidos, total, última contribución) ni los badges Sigues/Te sigue.
