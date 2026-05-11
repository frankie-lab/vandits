## Unificar el ancho real de todos los popups

Haré que los popups no enriquecidos y enriquecidos usen exactamente el mismo ancho visual, fijándolo en el contenedor real de Leaflet y no solo en el contenido interno.

### Qué voy a cambiar

1. **Alinear el contenedor Leaflet con los tokens compartidos**
   - Sustituir los valores fijos del `bindPopup` en `src/components/LocationMap.tsx` (`minWidth: 280`, `maxWidth: 380`) para que usen la misma medida canónica de la ficha enriquecida.
   - Así el wrapper externo del popup no podrá encogerse o expandirse distinto según el contenido.

2. **Mantener el contenido interno sincronizado**
   - Verificar que ambos renderizadores en `src/components/map/map-popups.ts` sigan usando los mismos `CARD.minWidth` / `CARD.maxWidth`.
   - Si hace falta, convertir el root interno a ancho fijo consistente dentro de ese rango para evitar diferencias por contenido corto/largo.

3. **Revisar el wrapper visual del popup**
   - Ajustar, si aplica, el CSS de `.custom-popup` / `.leaflet-popup-content` para que no introduzca una segunda diferencia de ancho por padding o shrink del contenido.

### Resultado esperado

- Un popup enriquecido y uno no enriquecido deben abrir con el mismo ancho visible.
- El ancho de referencia será el de la ficha enriquecida actual.
- No cambiaré estructura, lógica de enriquecimiento ni contenido; solo la consistencia de ancho.

### Detalles técnicos

**Archivos implicados**
- `src/components/LocationMap.tsx`
- `src/components/map/map-popups.ts`
- `src/index.css` o estilos inline de `LocationMap.tsx` solo si el wrapper sigue pisando el ancho

**Causa probable detectada**
- El contenido interno ya usa `CARD.minWidth` / `CARD.maxWidth`, pero Leaflet sigue montando el popup con `minWidth: 280` y `maxWidth: 380` en `bindPopup`, por lo que el ancho final puede variar según el contenido.

### Verificación

- Abrir un punto enriquecido y un punto no enriquecido con conflicto.
- Confirmar que ambos tienen el mismo ancho exterior del popup.
- Confirmar que no se rompe el scroll interno ni el layout del bloque de recuperación.