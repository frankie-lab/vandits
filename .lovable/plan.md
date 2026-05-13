## Diagnóstico

Al pulsar el botón "Filter" de un seguido en el sidebar:

1. Se setea `filters.filterByUserId = user.id` y aparece el chip + banner.
2. `getFilteredLocations` SÍ restringe correctamente (Sandbox Agent → ~295 puntos visibles).
3. Pero la cámara no se mueve. En zoom mundial los ~295 puntos colapsan en un único cluster diminuto en Galicia, así que el usuario percibe "no veo nada".

El contrato canónico (`mem://logic/map/subset-fit-contract`) cubre exactamente este caso: cualquier consola que quiera "ver su subconjunto" debe delegar en `requestSubsetFit(ids, { mode, reason })`. El filtro por usuario es una **acción explícita de foco**, no un filtro descriptivo Geo/Tipo/Tags — debe mover cámara.

## Cambios

Un único fichero, sin tocar pipeline ni RPC.

### `src/components/UsersSidebar.tsx` — handler `handleFilterByUser`

Tras `setFilters({ filterByUserId, filterByUserName })`, esperar un tick para que el store reprocese y disparar fit con el resultado real de `getFilteredLocations()` (ya restringido por el filtro recién aplicado, sin volver a filtrar por `_docUserId`):

```ts
import { requestSubsetFit } from "@/components/map/subset-fit";
import { useLocationsStore } from "@/domains/content/store/locations-store";

// dentro del handler, después de setFilters({...})
setTimeout(() => {
  const ids = useLocationsStore.getState()
    .getFilteredLocations()
    .map(l => l.id);

  if (ids.length > 0) {
    requestSubsetFit(ids, { mode: "always", reason: "user-filter" });
  }
}, 50);
```

Notas:
- **No re-filtrar por `_docUserId`**: el subset ya es el universo del usuario filtrado, e incluye toda la lógica de visibility/curated/hidden.
- `mode: "always"`: el usuario activó explícitamente el foco y espera feedback visual aunque ya estuviera "dentro".
- Cooldown manual 4s y clamp z12 del listener canónico siguen activos.
- **No-op si `ids.length === 0`** (seguido sin puntos visibles tras curated boundary).
- **Quitar filtro NO dispara fit** — la cámara se queda donde esté para no marear.

### Sin cambios

- `locations-store.ts`, RPC, privacidad, banner, chip, counters del top-bar.

## Memoria

Actualizar `mem://logic/map/subset-fit-contract` añadiendo a la lista de triggers cableados: **filtro por usuario en `UsersSidebar`** (mode `always`, reason `user-filter`).

## QA manual

1. Desde z2-3, filtrar Sandbox Agent → cámara encuadra Galicia con sus puntos visibles.
2. Quitar filtro → cámara se queda donde esté.
3. Filtrar a un seguido sin puntos compartidos visibles → no-op, sin errores.
4. Filtrar a uno mismo (`isCurrentUser`) → fit a mi universo entero.
5. Re-filtrar a otro seguido en menos de 4s → respeta cooldown manual del listener (no spam).
