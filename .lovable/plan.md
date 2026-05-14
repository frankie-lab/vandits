## Objetivo

Compactar las acciones a la derecha de cada fila en `UsersSidebar`. Solo cambia presentación en `src/components/UsersSidebar.tsx`.

## Layout final por fila

```
[avatar] Nombre                                  [Siguiendo] [⋮]
         🔗329  🔒336  🕐22h
```

Orden: **acción principal (botón follow) primero, menú "⋮" después**. Se eliminan los badges "Sigues" / "Te sigue" bajo el nombre (su info pasa al texto del botón).

## Botón de follow (texto contextual)

Estado a partir de `user.followStatus` + `user.followsMe`:

| Estado | Texto | Acción | Estilo |
|---|---|---|---|
| `none`, no te sigue | `Seguir` | follow | primary outline |
| `none`, `followsMe = true` | `Seguir también` | follow | primary (acento, reciprocidad) |
| `pending` | `Solicitado` (icono `Clock`) | cancelar solicitud | amber sutil |
| `accepted`, no te sigue | `Siguiendo` | unfollow (hover → "Dejar de seguir") | primary suave |
| `accepted`, `followsMe = true` | `Os seguís` (icono `UserCheck`) | unfollow (hover → "Dejar de seguir") | primary suave |
| `isCurrentUser` | (nada) | — | — |

Notas:
- Compacto: `h-7`, `px-2.5`, `text-[11px] font-medium`.
- Tooltip mantiene la acción literal por usuario (p. ej. "Dejar de seguir a frankie").
- "Mutuo" como variante móvil queda fuera de scope ahora; este sidebar es desktop. Si más adelante hay que comprimir en breakpoints estrechos, se introduce el fallback en una iteración aparte.

## Menú "⋮" (acciones secundarias)

- Componente: `DropdownMenu` de `@/components/ui/dropdown-menu` (ya en uso en el proyecto).
- Trigger: icono `MoreVertical` (lucide), `h-7 w-7`, ghost.
- Items (mismo gating que hoy):
  - **Ver solo sus puntos en el mapa** (`Filter`) → `handleFilterByUser(user)`. Visible si `followStatus === 'accepted'` o `isCurrentUser`.
  - **Ocultar / Mostrar sus puntos del mapa** (`EyeOff` / `Eye`) → `toggleUserVisibility(user.id)`. Visible solo si `followStatus === 'accepted'`.
- Si no aplica ningún item, el "⋮" no se renderiza.
- "Bloquear" no se añade (no existe esa acción todavía).

## Detalles técnicos

Archivo único: `src/components/UsersSidebar.tsx`.

1. Reescribir `getFollowButton` (líneas 413-472): devolver botón con icono + texto según matriz de estados.
2. Sustituir el bloque de iconos sueltos (líneas 783-816) por: `[ getFollowButton(user) ] [ DropdownMenu con MoreVertical ]`, en ese orden.
3. Eliminar el bloque de badges "Sigues"/"Te sigue" (líneas 771-780).
4. Imports: añadir `MoreVertical` de lucide y los 4 símbolos de `@/components/ui/dropdown-menu`. Mantener `Filter`, `Eye`, `EyeOff`, `UserCheck`, `Clock` (se siguen usando dentro del menú o del botón).
5. Sin cambios en lógica de datos, hooks, store, RLS, `subset-fit`, ni en otras vistas.
