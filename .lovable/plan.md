## Diagnóstico

La tarjeta **"Cargando catálogo"** no es un placeholder: está cableada al bus real (`startLoading('db-sync')` en `useDatabaseSync` → `CatalogLoadingCard` la lee vía `useActiveLoadings`). Pero tiene dos defectos que producen el síntoma que describes (modal visible con el mapa ya poblado y ETA poco creíble):

1. **Granularidad de progreso muy pobre.** Solo hay 3 actualizaciones:
   - `updateLoading(0, total)` justo después de `fetchAllLocationsPaginated()` — es decir, durante TODA la fase de fetch paginado (la más lenta) el contador está en `undefined` → la barra está indeterminada y el ETA es `null`.
   - `updateLoading(ownLocCount)` tras montar docs propios (de golpe).
   - `updateLoading(ownLocCount + otherLocCount)` tras montar docs ajenos.
   
   Con 3 saltos el ETA salta de "Calculando…" → cifra absurda → 100% en pocos cientos de ms. El ratio (`current/elapsed`) está dominado por el momento exacto del primer tick.

2. **La tarjeta sobrevive al render de los puntos.** `addDocument()` mete los puntos en el store ANTES de `endLoading('db-sync')`. Los marcadores aparecen en el mapa durante la fase "social" (docs ajenos) y siguen apareciendo hasta el `finally`, mientras la tarjeta sigue visible. Resultado: ves 4710/5073 arriba y la modal "Preparando datos…" simultáneamente.

## Cambios propuestos

### 1. Progreso real durante el fetch paginado (la fase larga)

`fetchAllLocationsPaginated` actualmente solo devuelve el array final. Le pasaremos un callback opcional `onPage(count, page)` y desde `useDatabaseSync` haremos `updateLoading('db-sync', count)` cada página (1000 filas). Para tener un `total` razonable usaremos un `count: 'exact', head: true` previo (1 round-trip barato) que nos da el número total real de filas accesibles → así la barra es determinada desde el primer momento y el ETA se calcula sobre 5 páginas reales en vez de 3 saltos artificiales.

```text
fetchPaginatedWithProgress({ onPage })
  ├── count(exact, head:true) → total
  ├── page 0 → onPage(1000, total)
  ├── page 1 → onPage(2000, total)
  └── ...
```

### 2. Cerrar la tarjeta en cuanto los puntos estén renderizables

Mover `endLoading('db-sync')` justo después de `addDocument` de los **docs propios** (que es cuando el mapa ya tiene contenido útil) y dejar la fase "social" (docs ajenos) como tarea silenciosa. Alternativa más prudente: dejar `endLoading` donde está, pero permitir que la tarjeta se oculte cuando `current >= total * 0.9` (umbral configurable) — así el usuario nunca ve la modal sobre un mapa poblado.

Voy con la primera opción (más limpia): la tarjeta se cierra al terminar la carga propia. Si los docs ajenos tardan, ya aparecerán los puntos en background sin modal bloqueante.

### 3. ETA más estable

Cambiar el cálculo en `CatalogLoadingCard` a una EMA (media móvil exponencial) de los últimos 3 ticks en lugar del ratio global. Con tick por página (1s aprox cada uno) la EMA estabiliza el ETA en pocos segundos. Detalle pequeño dentro del mismo componente.

### 4. Evitar recargas silenciosas que reaparezcan la tarjeta

Verificar que `requestGlobalReload` ya usa `silent:true` (sí lo hace). No requiere cambio. Sólo confirmar que ningún otro caller llama `loadFromDatabase()` sin `silent`.

## Archivos a tocar

- `src/domains/content/lib/db-transformers.ts` — añadir `fetchAllLocationsPaginated(opts?: { onPage?, withCount? })` retrocompatible.
- `src/domains/content/hooks/use-database-sync.ts` — pasar `onPage` con `updateLoading`, mover `endLoading` tras la carga propia, dejar docs ajenos sin tarjeta.
- `src/shared/loading/CatalogLoadingCard.tsx` — ETA por EMA de ticks recientes.

## Fuera de alcance

- No tocamos `GlobalLoadingBar` ni los demás carriles (geocoding, enrichment).
- No cambiamos el diseño visual de la tarjeta ni su copy, salvo el cálculo del ETA.
- No tocamos `_resetStoreState` ni el orden global de fases (`syncPhase`).

## Verificación

1. Recargar con sesión iniciada → la tarjeta aparece con barra determinada desde la primera página.
2. ETA visible en <2s y monótono decreciente.
3. La tarjeta desaparece en cuanto los marcadores propios están en el mapa; los docs ajenos siguen apareciendo en background.
4. Recargas silenciosas (`reload-locations`) no muestran la tarjeta (regresión cubierta).
