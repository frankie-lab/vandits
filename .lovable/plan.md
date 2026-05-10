## Objetivo

Encontrar qué puerta del pipeline está ocultando "Monte de San Pedro" (y los 580 puntos restantes de la colección `Atlas Obscura_España`) aunque la colección tenga el ojo encendido, y arreglar la causa real **transversalmente**, sin hardcodear ningún punto ni id concreto.

## Hallazgos de la exploración

1. `catalogMembership` (Map in-memory) se construye **una sola vez** durante `initSessionCollectionVisibility` a partir de `collectionService.findByUser`. Si una edge function (scraper/OneDrive/import) inserta `collection_items` después de ese init y NO emite `collection-items-changed`, el índice queda obsoleto y `isPointInAnyVisibleCatalogCollection` devuelve `false` aunque la colección esté visible → el punto se oculta.
2. La INSERT realtime de `locations` ya está escuchada (`useRealtimeLocations`), pero no hay nada equivalente para INSERTs en `collection_items` desde edge functions → confirma la sospecha del índice rancio.
3. `place_type = "2.3.4"` y `is_orphan = true` los confirmamos en DB, pero no son la causa de la invisibilidad (no hay filtros activos por defecto sobre esos campos).
4. En `src/lib/parsers/shared.ts:227` se escribe `name: p.name` sin `.trim()`. En `supabase/functions/scrape-tick/index.ts:99 y :273` también (`ld.name` y `place.name`). Esto explica los 9 nombres con espacio inicial — defecto general, no específico de un punto.

## Plan (transversal, sin hardcodeos)

### 1. Helper de diagnóstico genérico

Nuevo `src/domains/content/lib/visibility-debug.ts` que expone `window.__whyHidden(locationId: string)` y recorre, **por id genérico**, exactamente las mismas puertas del pipeline real:

```
text
1. ¿Está en state.locations?            → si no → "no en store (RLS/paginación)"
2. is_approved=true?                     → si no → "pending approval"
3. _docUserId === currentUserId?         → si no → "ownership/follower"
4. isPointInAnyCatalogCollection(id)?    → membership snapshot
5. isPointInAnyVisibleCatalogCollection? → si false → "colección catálogo apagada O índice rancio"
6. isLocationVisibleInGlobalMap(loc)?    → resultado canónico
7. matchesLocationFilters(loc, filters)? → muestra qué filtro lo descarta
```

Output: `console.table` con cada puerta y el motivo del primer `false`. No toca producción, solo lee. Sirve para CUALQUIER punto, no para uno concreto.

### 2. Fix transversal: rebuild de `catalogMembership` ante INSERTs externos

En `src/domains/content/lib/collection-visibility.ts`:

- Suscribir un canal realtime postgres_changes sobre `collection_items` filtrado por el `userId` actual (vía join lógico con `collections.owner_user_id` o lista de IDs ya conocidos). Al recibir INSERT/DELETE → `await rebuildCatalogMembership(currentUserId); broadcast();`. Esto cierra el agujero para scraper, OneDrive, y cualquier futura edge function que escriba directamente.
- Como red de seguridad adicional, en `useRealtimeLocations` cuando llega un INSERT de `locations` con `is_approved=true`, disparar un debounced `rebuildCatalogMembership(currentUserId)` (300ms) porque suele acompañar a inserts en `collection_items`.

### 3. Fix transversal del espacio inicial en `name`

- `src/lib/parsers/shared.ts:227` → `name: (p.name ?? '').trim()`.
- `supabase/functions/scrape-tick/index.ts:99` → `ld.name.trim()`, y `:273` → `place.name.trim()`.
- Defensa cliente: en `dbLocationToGeoLocation` aplicar `name: (row.name ?? '').trim()` como red final.
- Backfill puntual (vía herramienta de datos): `UPDATE locations SET name = btrim(name), updated_at = now() WHERE name <> btrim(name) AND deleted_at IS NULL;` — afecta a 9 filas reales, no es hardcodeo: es limpieza de datos sucios pre-fix.

### 4. Validación

Tras desplegar:
1. Ejecutar `window.__whyHidden('b9389d79-...')` y cualquier otro id → confirma qué puerta era la culpable.
2. `SELECT count(*) FROM locations WHERE name <> btrim(name)` debe devolver 0.
3. Reimportar un lote pequeño de Atlas Obscura → los puntos deben aparecer en el mapa sin recargar y sin tocar el ojo de la colección.

## Archivos tocados

- **Nuevo**: `src/domains/content/lib/visibility-debug.ts` (helper genérico).
- **Modificados**: `src/domains/content/lib/collection-visibility.ts` (canal realtime `collection_items` + rebuild), `src/domains/content/hooks/use-realtime-locations.ts` (rebuild debounced en INSERT aprobado), `src/lib/parsers/shared.ts` (`.trim()`), `src/domains/content/lib/db-mappers.ts` (`.trim()` defensivo en mapper), `supabase/functions/scrape-tick/index.ts` (dos `.trim()`).
- **Datos**: backfill `btrim` (9 filas).

## Garantías

- Cero ramas `if (id === '...')`, cero menciones a "Monte de San Pedro", cero menciones a "Atlas Obscura" en código.
- El helper de debug es solo lectura y vive en su propio fichero; se puede borrar sin afectar nada.
- El rebuild realtime es la misma función ya usada por `collection-items-changed`, solo añadimos un trigger más.
