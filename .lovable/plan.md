## Objetivo
Eliminar el badge de rol en la esquina inferior-derecha de los avatares en `UsersSidebar` para limpiar la vista social.

## Cambios

**`src/components/UsersSidebar.tsx`**
- Eliminar el `<div className="absolute -bottom-0.5 -right-0.5ed bg-card rounded-full p-0.5 shadow-sm">…</div>` que renderiza `roleIcons[primaryRole]`.
- Eliminar la línea `const primaryRole = getPrimaryRole(user.roles);` si no se usa en otro lugar de la fila.
- Si los imports `roleIcons`, `getPrimaryRole` y el icono fallback `Users` quedan sin uso tras la limpieza, eliminarlos también.

## Fuera de alcance
- No tocar lógica de roles ni la fuente de datos `user.roles`.
- No alterar el contorno de color del avatar (identidad OKLCH) ni el resto de la fila.
