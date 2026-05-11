## Causa raíz

`loadFromDatabase` siempre hace `_resetStoreState()` + `addDocument` doc a doc. Entre el reset y el último `addDocument`, el mapa queda vacío. La `CatalogLoadingCard` existe para tapar ese hueco. Por eso la tarjeta vuelve aunque los datos finales sean idénticos: el bloqueo depende del patrón destructivo, no de si hay cambios.

> **Principio**: la card no representa "hay una sincronización en curso", representa "no hay catálogo usable todavía". Todo lo demás es barra superior no-bloqueante.

## Diseño

### 1. `applyCatalogSnapshot` con scope (en `locations-store.ts`)

Firma:

```ts
applyCatalogSnapshot(
  docs: KMLDocument[],
  opts: { ownerScope: 'mine' | 'social' | 'all'; currentUserId: string }
): void
```

Reglas:

- **ownerScope='mine'** → solo aplica diff a docs cuyo `userId === currentUserId`. Docs sociales del store NO se tocan.
- **ownerScope='social'** → solo a docs con `userId !== currentUserId`. Docs propios intactos.
- **ownerScope='all'** → diff completo sobre todo el conjunto.
- En todos los casos, "missing" solo elimina dentro del scope, nunca fuera. Esto evita el parpadeo social que se producía si la primera llamada (solo own) interpretaba los sociales como "desaparecidos".

Diff por capa:

- **Documentos**: clave `id`. Add / replace / remove (solo dentro del scope).
- **Locations dentro de cada doc**: clave `id`. Add / update / remove.
- **Preservar referencias** cuando `_renderHash` y `_dataHash` no cambian (ver §2).
- **`selectedLocations`**: limpiar solo IDs que ya no existen tras el merge.
- **`filters`**: preservados vía `getPersistentFilters` (igual que hoy).

`_resetStoreState` queda reservado para `SIGNED_OUT`.

### 2. Hashes dobles por location

En `dbLocationToGeoLocation` (o en el propio store al ingestar), calcular:

- `_renderHash` (afecta a cómo se PINTA el marker): `latitude`, `longitude`, `name`, `getPointVisualState(loc)`, `user_image_url`, `enrichedData?.imagen`, `is_approved`, `_layerType`, `custom_data.adopted_from`, `collection_ids` (sky-blue/tint), `place_type/effectivePlaceType`, `geoHealth`, `userId` (mine vs followed).
- `_dataHash` (afecta a la FICHA): `description`, `enriched_data.descripcion`, `notes`, `rating`, `visited`, `updatedAt`.

Reglas en el merge:

- Si `_renderHash` antiguo === nuevo → conservar el mismo objeto (Leaflet no re-crea el marker, no hay flicker).
- Si solo `_dataHash` cambia → reemplazar objeto pero ese ID conserva su marker DOM (el render hash es igual).
- Si `_renderHash` cambia → reemplazar objeto (Leaflet redibuja ese marker concreto).

### 3. Dos niveles de versión

- `doc._docVersion` (existente) → incrementa SOLO si cambia membership de locations del doc o metadata del doc (`status`, `name`, `ownerName`). No incrementar por updates internos de locations.
- `_docVersion` global del store → incrementa solo si `documents` cambia en estructura (add/remove de doc, cambio de array de locations dentro de algún doc). Así `_cachedAnnotated` se invalida lo justo y no se pierde la optimización.

### 4. `useDatabaseSync.loadFromDatabase`

Reemplazar el bloque destructivo por:

```ts
const storeHadDocs = useLocationsStore.getState().documents.length > 0;
const blocking = !storeHadDocs;

if (!silent) {
  startLoading('db-sync',
    blocking ? 'Cargando catálogo' : 'Sincronizando catálogo',
    { blocking });
}
// … fetch paginado idéntico a hoy …

applyCatalogSnapshot(ownDocs, { ownerScope: 'mine', currentUserId });
ensureEndLoading(); // mapa interactivo desde aquí

setSyncPhase('social');
applyCatalogSnapshot(otherDocs, { ownerScope: 'social', currentUserId });
setSyncPhase('done');
```

Cold start sigue funcionando igual (store vacío → blocking=true → card visible). Reload con datos cargados → blocking=false → solo barra superior.

### 5. `CatalogLoadingCard` — render guard doble

Sustituir la condición actual por:

```ts
const documents = useLocationsStore(s => s.documents);
const shouldShow =
  !!task &&
  task.id === 'db-sync' &&
  task.blocking === true &&
  documents.length === 0;
if (!shouldShow) return null;
```

Defensa en profundidad: aunque un futuro bug marque `blocking: true` con datos cargados, la card no aparece. La frase técnica que cierra el contrato: "card = no hay catálogo usable todavía".

### 6. `loading-bus`

Exponer `blocking` en el shape que devuelve `useActiveLoadings` (ya se guarda internamente para `body.is-blocking-load`). Cambio puramente de tipo + propagación al objeto público.

### 7. Tests

`src/domains/content/store/__tests__/apply-catalog-snapshot.test.ts` — casos mínimos:

1. **Scope mine no borra sociales**: store con doc propio + doc social. `applyCatalogSnapshot([propio], { ownerScope: 'mine' })` → social sigue presente.
2. **Add doc nuevo en scope all**: snapshot incluye un doc nuevo → aparece. Doc existente sin cambios conserva la misma referencia.
3. **Render hash estable**: location con `_renderHash` idéntico antes/después → `Object.is(prev, next) === true`.
4. **Data hash cambia render hash no**: location con descripción nueva pero misma lat/lng/visual → referencia distinta pero `_renderHash` igual.
5. **Remove**: doc faltante en snapshot scope='all' → removido. IDs huérfanos eliminados de `selectedLocations`.

Tests existentes (`document-visibility.test.ts`, `collection-visibility.test.ts`) que mockean `startLoading` siguen pasando porque la API pública de loading no cambia.

## Lo que NO se toca

- Endpoints SQL, RLS, paginación, ETA.
- `GlobalLoadingBar` superior (ya es no-bloqueante).
- `useRealtimeLocations` y los eventos `reload-locations`/`locations-updated` (siguen pasando por la ruta silent + delta).
- Reglas de marker palette, hover/zoom hero, popup, cluster.

## Resultado esperado

| Escenario | Antes | Después |
|---|---|---|
| Cold start (store vacío) | Card bloqueante | Card bloqueante (igual) |
| Refresh con sesión activa | Card bloqueante 3-10s | Sin card; mapa interactivo desde t=0; barra fina arriba |
| SIGNED_IN tras token refresh | Card bloqueante | Sin card; delta in-place |
| Snapshot idéntico al store | Reset + re-add (flicker) | 0 mutaciones; markers conservan referencia |
| 1 POI cambia | Reset + re-add de todo | Solo ese marker redibuja |
| Doc social borrado durante refresh de "mine" | Riesgo de borrado falso | Imposible (scope='mine' no toca sociales) |
