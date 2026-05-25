## Diagnóstico

El catálogo no carga porque dos bugs encadenados bloquean el flujo `useDatabaseSync`:

### 1. Columna inexistente — `collections.owner_user_id`

`src/domains/content/lib/collection-visibility.ts` consulta `.eq('owner_user_id', userId)` sobre `collections` en dos sitios (línea 286 + filtro realtime línea 319). La columna real es `user_id` (la tabla `collections` NO tiene `owner_user_id`).

Evidencia: postgres logs muestran repetidamente `column collections.owner_user_id does not exist` durante la sesión actual. Esto deja `collectionIds = []`, rompe el filtro del canal realtime e inutiliza la suscripción a INSERT de `collections`.

### 2. Avalancha de `collection_items` que asfixia la red

`rebuildCatalogMembership` y `loadEntry` cargan **todas las colecciones de catálogo en paralelo**, y cada una pagina por chunks de 1000 items. Hay colecciones con 2448 / 580 / 535 / 397 / 381 items (consulta DB), así que se disparan decenas de GETs concurrentes a `/rest/v1/collection_items`, cada uno respondiendo ~500 KB de JSON.

Evidencia: la pestaña Network muestra exclusivamente respuestas de `collection_items` (cientos de filas), y **cero requests a `v_locations_resolved`**. La consola registra `[useDatabaseSync] Fetching locations...` pero nunca `Locations fetched: N`. El autodiag `[P-POPUP-7B]` confirma `totalLocations: 0` tras 30 s. El plan SQL del catálogo es rápido (<1 s para 1000 filas), así que el cuello es cliente/red, no Postgres.

## Plan de cambios (mínimos, quirúrgicos)

### A) Corregir nombre de columna (`collection-visibility.ts`)

- Línea 286: `.eq('owner_user_id', userId)` → `.eq('user_id', userId)`.
- Línea 319: `filter: 'owner_user_id=eq.${userId}'` → `filter: 'user_id=eq.${userId}'`.
- No tocar nada más del módulo (semántica idéntica).

### B) Serializar la precarga de membership

En `rebuildCatalogMembership` (líneas 68–87):

- Reemplazar `Promise.all(catalog.map(...))` por un bucle secuencial `for...of` que cargue una colección catálogo a la vez vía `collectionService.getItems(c.id)`.
- Mantener la paginación interna de `getItems` (correcta).
- Conserva todo el resto del flujo y el `console.warn` de fallback.

Justificación: la precarga es one-shot al arrancar; pasarla a secuencial elimina la asfixia de HTTP/2 sin cambiar la API ni el contrato. El catálogo del usuario suele tener pocas colecciones marcadas `inCatalog=true`, así que el coste latente es marginal y la diferencia frente al estado actual es enorme.

### C) Verificación post-fix

1. Recargar la preview con sesión `frankie@gmz.wtf`.
2. En consola debe aparecer `[useDatabaseSync] Locations fetched: ~5100` en pocos segundos.
3. En Network debe verse al menos un GET a `v_locations_resolved` con `200`.
4. El autodiag `[P-POPUP-7B]` debe reportar `totalLocations > 0`.
5. Postgres logs ya no deben emitir el ERROR `collections.owner_user_id does not exist`.

## Fuera de alcance

- Schema, RLS, parsers, scrapers, edge functions, UI.
- Refactor del módulo `collection-visibility` más allá de los dos fixes.
- Versionado / memoria / contract tests (cambio puntual de bug, no canon).
