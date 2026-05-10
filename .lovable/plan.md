# Mantener mapa + barra inferior visibles durante enriquecimiento

## Diagnóstico

Durante un batch de enriquecimiento se dispara realtime sobre `locations` → cada UPDATE emite `locations-updated` → `requestGlobalReload()` → `loadFromDatabase()` con `blocking: true`. Eso provoca, cientos de veces seguidas:

1. `body.is-blocking-load` se enciende → `pointer-events: none` sobre `.leaflet-container` (mapa "congelado", parece gris porque no responde a interacciones y el cluster/markers se redibujan en cada ciclo).
2. `_resetStoreState()` vacía `documents` momentáneamente → `BottomProgressBar` (que filtra jobs por `documents.map(d => d.id)`) ve la lista vacía y desaparece.

Resultado: cada vez que un POI se enriquece, el mapa se pone gris y la barra inferior parpadea fuera. La barra superior central que rediseñamos no llega a pintarse.

## Cambios

### 1. `src/domains/content/hooks/use-database-sync.ts` — recargas en silencio

Aceptar opciones en `loadFromDatabase`:

```ts
const loadFromDatabase = useCallback(async (opts?: { silent?: boolean }) => {
  const silent = opts?.silent === true;
  if (!silent) startLoading('db-sync', 'Cargando catálogo', { blocking: true });
  try {
    ...
    if (!silent) updateLoading('db-sync', dbLocations.length, dbLocations.length);
  } finally {
    if (!silent) endLoading('db-sync');
  }
}, ...);
```

`requestGlobalReload` y los listeners de `reload-locations` / `locations-updated` pasan `{ silent: true }`. Solo la carga inicial (al montar / SIGNED_IN) sigue siendo visible y bloqueante.

Esto elimina:
- El bloqueo del mapa durante el batch (sin `is-blocking-load` recurrente).
- El parpadeo de la tarjeta "Cargando catálogo" cada vez que entra un UPDATE.

### 2. `src/components/BottomProgressBar.tsx` — independiente de `documents`

Hoy filtra jobs por `documents.map(d => d.id)`. Durante la recarga `documents` se vacía y la barra desaparece. La RLS de `enrichment_jobs` ya limita a los jobs cuyos `document_id` son del usuario, así que el filtro cliente es redundante.

- Eliminar el corto-circuito `if (documentIds.length === 0) setActiveJob(null)`.
- Cambiar la query a:
  ```ts
  supabase.from('enrichment_jobs')
    .select('*')
    .in('status', ['pending', 'running', 'paused'])
    .order('updated_at', { ascending: false });
  ```
- Quitar la dependencia `documents` del `useCallback` y del `useEffect`. Mantener `useEffect` arrancando con `userId` o simplemente al montar (poll incondicional cada 2s; RLS filtra por usuario).

Mismo cambio para la rama de "recently completed".

`refreshLocations` sigue dependiendo de `selectedDocument`; lo mantenemos tal cual.

## Validación

- Lanzar batch-enrich: la barra inferior con la nueva UI (verde/rojo/ámbar/gris + ETA) permanece visible mientras se procesan los POIs.
- El mapa sigue interactivo (pan/zoom funcionan) durante el enriquecimiento; los tiles permanecen pintados.
- La tarjeta "Cargando catálogo" sólo aparece en la carga inicial, no parpadea durante el batch.
