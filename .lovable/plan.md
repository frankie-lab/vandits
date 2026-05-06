## Objetivo

Liberar espacio en cada fila de colección para que se vea el nombre completo. Dejar visibles solo el ojo (visibilidad) y un menú "kebab" (3 puntos verticales) a la derecha que agrupa Renombrar, Color/Icono y Eliminar.

## Cambios

Archivo único: `src/components/CollectionsListPanel.tsx`

1. **Importar** `MoreVertical` desde lucide-react y `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` desde `@/components/ui/dropdown-menu`.

2. **Reemplazar el bloque de acciones** (líneas 171-209) por:
   - Botón Eye/EyeOff (igual que ahora, sin cambios de comportamiento ni tinte).
   - `DropdownMenu` con trigger `MoreVertical` (`h-6 w-6 p-0 rounded-full`).
   - Items del menú:
     - Renombrar → llama `onStartRename`
     - Cambiar color e icono → llama `onEditAppearance`
     - Separador
     - Eliminar (variante destructiva) → llama `onDelete`
   - Cada item con su icono Lucide (Pencil, Palette, Trash2) a la izquierda.

3. **No tocar** el botón principal (icono+nombre+badge+counts), ni la lógica de visibilidad, ni el contenido expandido.

## Resultado visual

```
[chevron] [icon] Nombre completo de la colección  [CATÁLOGO] [123]   [ojo] [⋮]
```

El nombre dispone de `flex-1` y ahora compite con menos botones, por lo que se trunca mucho menos. Las opciones secundarias quedan accesibles en un solo click vía kebab.

## Fuera de alcance
- No se cambian estilos del marcador ni del anillo.
- No se cambia la lógica de visibilidad ni la persistencia.
