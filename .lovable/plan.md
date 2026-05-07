# Bug: el color de una colección no se refleja en el mapa al editarlo

## Diagnóstico

`collection-visibility.ts` cachea `color`, `icon`, `inCatalog` y `locationIds` por colección visible (`state.visible[id]`). El anillo del marcador (`getTintForLocation`) lee de ese cache.

El cache se reconstruye en dos triggers:
- `initSessionCollectionVisibility` (login / re-mount).
- `collection-items-changed` (alta/baja de items).

`useCollections.update()` solo emite `collections-updated`. Ese evento NO está enganchado en `collection-visibility`, así que tras cambiar color/icono/inCatalog desde `CollectionAppearanceDialog`, el cache mantiene el color viejo y los marcadores siguen igual hasta cerrar sesión o togglear el ojo.

## Cambio (transversal, una sola fuente)

Editar `src/domains/content/lib/collection-visibility.ts`:

1. Añadir listener global a `COLLECTIONS_UPDATED_EVENT` (importado desde `use-collections.ts`) dentro de `initSessionCollectionVisibility`, junto al de `collection-items-changed`.
2. El handler:
   - Carga `collectionService.findByUser(currentUserId)`.
   - Para cada `id` en `state.visible`, si la colección sigue existiendo, actualiza `color`, `icon`, `inCatalog` (manteniendo `locationIds`/`routeIds` ya cacheados; opcionalmente recarga vía `loadEntry` si `inCatalog` cambió, para reconstruir membresía catálogo).
   - Si una colección visible fue eliminada, la quita de `state.visible` y persiste.
   - Si `inCatalog` de alguna cambió, llama `rebuildCatalogMembership(currentUserId)`.
   - `broadcast()` al final → `LocationMap` re-renderiza tints con el color nuevo.
3. Asegurar idempotencia: usar `removeEventListener` antes de `addEventListener` (mismo patrón que el handler existente).

No tocar `CollectionAppearanceDialog`, `useCollections`, ni el render del mapa: el bus ya existe, solo falta conectar el cache de visibilidad a él.

## Verificación

- Editar color de una colección visible → anillo de sus puntos cambia sin recargar.
- Editar icono → si LocationMap usa icono de colección en algún render, también se actualiza (tras broadcast).
- Cambiar `inCatalog` on/off de una colección con puntos no aprobados → sus puntos pasan/dejan de aparecer en mapa global según matriz ADR-004.
- Eliminar colección visible → desaparece tint sin recargar.

## Archivos

- `src/domains/content/lib/collection-visibility.ts` (único cambio).
