## Filas de colección — fondo y borde neutros, color sólo en el icono

### Problema
Cada fila de colección visible pinta su borde, sombra y color del ojo con `collection.color`. Cuando hay varias colecciones visibles con colores distintos, el panel se vuelve ruidoso e inteligible.

### Cambio
En `src/components/CollectionsListPanel.tsx` (subcomponente `CollectionRow`):

1. **Borde y fondo uniformes** para todas las filas, visible o no:
   - Quitar el `style={{ borderColor: tint, boxShadow: '0 0 0 1px <tint>33' }}`.
   - Mantener clases neutras: `border-border/60 bg-card hover:bg-accent/30`.
   - Estado "visible" se diferencia con tokens neutros del sistema (`border-primary/30 bg-primary/5 shadow-sm`) — sin color de la colección.

2. **Ojo (toggle visibilidad) neutro**: quitar `style={{ color: tint }}`. Usar `text-foreground` cuando visible y `text-muted-foreground` cuando oculto.

3. **El color de la colección sólo aparece en el chip del icono** (`<span style={{ backgroundColor: tint }}>`) tanto en modo normal como en rename. Sin cambios ahí.

4. **Mini-iconos de items expandidos** (`MapPin`, `RouteIcon` con `style={{ color: tint }}`): mantener neutros (`text-muted-foreground`) para coherencia. El usuario ya identifica la colección por el header.

### Archivos
- `src/components/CollectionsListPanel.tsx` — subcomponente `CollectionRow` (líneas ~110-260).

### No cambia
- Color del anillo en marcadores del mapa (es la SoT visual de pertenencia).
- Color de polilíneas de rutas en el mapa.
- Diálogo de apariencia (color editable).
