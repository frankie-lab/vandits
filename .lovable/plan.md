# Fix: "Sin colección" no muestra los puntos en el mapa

## Diagnóstico

El usuario tiene 19 puntos contados como "Sin colección" pero al activar su ojo no se ven. Causa:

- Esos 19 huérfanos son `is_approved = false` (workspace puro sin colección).
- `isLocationVisibleInGlobalMap` aplica la regla del "ojo de huérfanos" SOLO en la rama `is_approved=true`.
- Para `is_approved=false` delega en `isPointVisibleViaCollections`, que solo conoce colecciones reales. El grupo virtual "Sin colección" no es una colección real → nunca pasa el filtro.

Resultado: el ojo del grupo virtual no tiene efecto sobre los puntos no aprobados, aunque esos sean precisamente los que el contador muestra.

## Decisión

El grupo virtual "Sin colección" se comporta como una **colección privada virtual del usuario**: cuando su ojo está ON, todos los puntos huérfanos deben verse en el mapa global, **independientemente de `is_approved`**. Esta es la única excepción coherente al "approval-gated" para puntos del propio usuario, porque el grupo virtual cumple el mismo rol que una colección privada (contenedor explícito decidido por el usuario).

Justificación: ya hoy las colecciones privadas pueden exponer puntos no aprobados en el mapa global (rama final de la función). El grupo virtual debe replicar ese comportamiento.

## Cambio (transversal, un único helper)

### `src/domains/content/lib/document-visibility.ts`
Reescritura limpia de `isLocationVisibleInGlobalMap` con tres ramas explícitas en este orden:

1. **Huérfano**: si `isOrphanLoaded() && isOrphan(loc.id)` → devolver `isOrphanGroupVisible()`. (Aplica tanto a aprobados como no aprobados; sustituye el chequeo enterrado en la rama "approved sin catálogo".)
2. **Aprobado**: misma lógica actual de catálogo (sin colección catálogo → visible; con catálogo → al menos una visible).
3. **No aprobado**: `isPointVisibleViaCollections(loc.id)` (colecciones reales privadas).

Nota: el comentario JSDoc se actualiza para reflejar la excepción del grupo virtual.

## Lo que NO cambia

- `orphan-points.ts` ya tiene la API correcta (`isOrphan`, `isOrphanGroupVisible`, `isOrphanLoaded`).
- `CollectionsListPanel` y `OrphanFocusView` ya disparan `setOrphanVisibility(true)` al entrar.
- Ninguna lógica de aprobación, RLS, ni colecciones reales se toca.

## Memoria

Actualizar `mem://logic/content/orphan-points-visibility` añadiendo:
> El grupo virtual "Sin colección" actúa como colección privada virtual: cuando su ojo está ON, expone TODOS los huérfanos en el mapa global, incluyendo los `is_approved=false`. Es la única excepción al approval-gated y vive centralizada en `isLocationVisibleInGlobalMap`.
