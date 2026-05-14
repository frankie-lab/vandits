# Fix: paginación estable en fetch de locations

## Problema
`fetchPageWithRetry` en `src/domains/content/lib/db-transformers.ts` consulta `v_locations_resolved` con `.range(from, to)` sin `.order(...)`. Postgres no garantiza orden estable entre páginas, así que con 5097+ filas algunas se duplican en una página y se pierden en otra. Las 7 POIs de Explorador Alpha caen en ese hueco.

## Cambio (1 línea, transversal)
En `src/domains/content/lib/db-transformers.ts`, dentro de `fetchPageWithRetry`, añadir `.order('id', { ascending: true })` antes de `.range(from, to)`.

```ts
.from('v_locations_resolved' as any)
.select('*')
.is('deleted_at', null)
.order('id', { ascending: true })   // ← nuevo
.range(from, to);
```

## Validación post-fix
1. Recargar app y reaplicar filtro Explorador Alpha.
2. Confirmar en el log `[user-filter funnel]`:
   - `dbLocs_in_uid_docs: 7`
   - `dbLocs_owner_uid: 7`
   - `annotated_of_uid_via_owner: 7`
3. Confirmar 7 marcadores (triángulos invertidos OKLCH) en mapa.

## Limpieza posterior (sólo tras validación verde)
- Quitar `__dbSyncSnapshot__` y la sección expandida de debug `[user-filter funnel]` (mantener la versión compacta).
- El mapeo `ownerUserId` en `dbLocationToGeoLocation` se queda (deuda canónica ya cerrada).

## Fuera de alcance
- `batch-enrich` `ERR_HTTP_PROTOCOL_ERROR` → PR aparte.
- `LocationMap.tsx:2065` `getAllChildMarkers` undefined en clusters Leaflet → PR aparte.
