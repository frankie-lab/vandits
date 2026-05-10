## Objetivo
Conseguir que el hashtag de colección sea un elemento constante del popup del mapa: si un punto pertenece a una o varias colecciones visibles por RLS, siempre deben mostrarse todas, también en puntos nuevos que acaban de importarse o enriquecerse.

## Diagnóstico
El problema no está en la relación de datos básica sino en el mecanismo del popup:

- La ficha lateral ya usa una solución transversal estable: `LocationCollectionChips` + `useLocationCollections`.
- El popup del mapa usa otro camino distinto: placeholder HTML + carga asíncrona con `innerHTML` + caché manual por `locationId`.
- Ese camino imperativo puede cachear vacío cuando el popup se abre antes de que exista o sea visible la fila de `collection_items`, y luego no siempre se invalida en los flujos automáticos de puntos nuevos.
- Además, el popup no reutiliza el mismo ciclo de vida que la ficha lateral, por eso el comportamiento no es constante ni transversal.

## Plan
### 1. Unificar la fuente transversal de render
Reemplazar en el popup la inyección HTML manual por el componente reutilizable `LocationCollectionChips`, montado dentro del popup igual que ya se hidrata `UnenrichedRecoveryBlock`.

Resultado esperado:
- mismo origen de datos en popup y ficha
- mismo comportamiento para puntos antiguos y nuevos
- sin HTML manual ni reintentos por timeout

### 2. Eliminar la causa del parpadeo/desaparición
Retirar la caché manual de chips del popup y su lógica de “resultado vacío”.

Resultado esperado:
- no se guarda un estado vacío transitorio
- abrir un popup nuevo no bloquea la aparición posterior de sus colecciones
- desaparece la inconsistencia de “a veces sale, a veces no”

### 3. Reenganchar el ciclo de vida del popup
Asegurar que cuando Leaflet hace `bindPopup`, `setPopupContent` o reabre un popup ya abierto, el mount de colecciones se vuelve a hidratar correctamente con el `locationId` actual.

Resultado esperado:
- el bloque de hashtags existe siempre como contenedor estable del popup
- los popups regenerados tras enrichment, notas o fotos vuelven a montar las colecciones correctamente

### 4. Verificar el refresco transversal tras cambios de colección
Alinear los eventos del flujo automático de aprobación/materialización de colección con la misma ruta que ya escucha `useLocationCollections`.

Resultado esperado:
- cuando un punto nuevo entra en `collection_items`, el popup reacciona igual que la ficha lateral
- no dependemos de eventos paralelos que hoy no invalidan el popup

### 5. Validación funcional
Comprobar estos casos:
- punto antiguo con una colección
- punto con varias colecciones
- punto nuevo creado/importado y luego aprobado/materializado
- popup abierto antes y después de la materialización
- popup regenerado por actualización del marker

## Alcance
Solo voy a atacar la transversalidad del render y refresco de hashtags de colección en popups. No tocaré reglas de negocio de visibilidad más allá de asegurar que el popup consuma correctamente lo que ya permite RLS.

## Resultado final esperado
Todos los popups mostrarán de forma consistente el bloque de hashtags de colección, con todas las colecciones visibles del punto, sin parpadeos ni desapariciones, y también en los puntos nuevos.