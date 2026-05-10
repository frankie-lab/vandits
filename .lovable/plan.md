# Objetivo
Hacer que los hashtags de colección aparezcan siempre en los popups, también en puntos nuevos/enriquecidos, sin depender de un montaje React frágil dentro de Leaflet.

# Plan
1. **Crear una fuente transversal síncrona para chips de colección**
   - Añadir un store/helper centralizado para resolver `locationId -> collections[]`.
   - Exponer lectura síncrona, precarga, invalidación por punto y suscripción a cambios.
   - Reutilizar el helper de color ya creado para garantizar contraste.

2. **Sustituir el placeholder React del popup por HTML final estable**
   - Reemplazar `buildCollectionChipsPlaceholder(...)` por un bloque HTML que pinte directamente los hashtags de colección.
   - Mantener la misma semántica visual y posición en ambas ramas del popup (enriquecido y no enriquecido).
   - Evitar que el popup dependa de `MutationObserver`, `createRoot` y remontajes tras `setPopupContent`.

3. **Refrescar popups abiertos cuando cambian colecciones o contenido del punto**
   - Conectar el nuevo store a los eventos transversales existentes (`collections-updated`, `collection-items-changed`).
   - Cuando cambie un punto visible, regenerar su `popupContent` usando `createPopupContent(...)` y `marker.setPopupContent(...)`.
   - Mantener el mismo comportamiento para puntos nuevos, importados y recién enriquecidos.

4. **Retirar la capa frágil actual**
   - Eliminar `popup-collections-mount.ts` y su uso en `LocationMap.tsx`.
   - Dejar `LocationCollectionChips` y `useLocationCollections` para vistas React como `GalleryView`, pero hacer que compartan la misma lógica central si procede.

5. **Validación específica del bug**
   - Verificar: popup enriquecido, popup no enriquecido, punto recién creado, punto recién enriquecido, una colección, varias colecciones, color blanco y colores claros.
   - Confirmar que el hashtag no parpadea ni desaparece al reabrir o actualizar el popup.

# Detalles técnicos
- **Causa detectada**: la red devuelve correctamente `collection_items` y en la sesión se ve que el chip llega a montarse en DOM, pero el popup lo pierde al regenerarse con `setPopupContent(...)` y al depender de `MutationObserver` + `createRoot`.
- **No parece ser un problema de datos ni de RLS**: la consulta responde `200` con la colección asociada.
- **El ajuste de color ya ayuda al contraste**, pero no resuelve esta desaparición total.

# Resultado esperado
Los hashtags de colección quedarán renderizados de forma estable y transversal en todos los popups, incluidos los puntos nuevos y los recién enriquecidos.