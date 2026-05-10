## Diagnóstico

Durante el batch-enrich, cada POI procesado (~cada 500 ms) emite un `postgres_changes UPDATE` sobre `locations`. El hook `useRealtimeLocations` lo recoge y dispara `window.dispatchEvent('location-realtime-update')`. Hoy en `LocationMap.tsx` ese evento ejecuta:

```ts
const handleRealtimeUpdate = () => setForceUpdateCount(v => v + 1);
```

Eso provoca un re-render completo de `LocationMap` (un componente de 2 252 líneas) por cada POI enriquecido. Dentro del render se recalcula:

```ts
const locationIds = useMemo(
  () => locations.map(l => l.id).sort().join(','),
  [locations],
);
```

Con ~5 073 ubicaciones eso es un `sort + join` de 5 073 strings dos veces por segundo, más toda la reconciliación de marcadores y efectos derivados. El hilo principal se satura, Leaflet no llega a hidratar los tiles a tiempo y el contenedor queda en gris (el color base del `.leaflet-container`). Por eso ves un único marcador del POI actual y nada más: el mapa está vivo, simplemente no le da tiempo a pintar tiles.

Adicionalmente, `BottomProgressBar.refreshLocations` también dispara una recarga total del documento seleccionado cada vez que avanza el contador, agravando el problema cuando hay vista de documento activa.

## Objetivo

Que durante el batch enrichment el mapa siga pintándose con normalidad (tiles + marcadores) y se actualicen los puntos enriquecidos sin tirones.

## Plan

1. **Debounce/coalescer del evento `location-realtime-update` en `LocationMap`**
   - Helper único `useCoalescedRealtimeTick(delayMs = 350)` en `src/components/map/use-coalesced-realtime-tick.ts`.
   - Sustituye el `setForceUpdateCount(v => v + 1)` actual: agrupa todos los eventos llegados en una ventana de ~350 ms en un único re-render con `requestIdleCallback` cuando esté disponible.
   - Aplicado también en `FloatingToolbar.tsx` (mismo patrón, mismo helper) para que los contadores tampoco redibujen 2× por segundo.

2. **Eliminar el `locationIds = sort().join(',')` masivo**
   - Sustituirlo por `locations.length` + un contador incremental que ya emiten los eventos `store-updated`. La reconciliación de marcadores ya detecta altas/bajas por id internamente; el join de 5 k strings es una huella inútil.

3. **Refresco de mapa en `BottomProgressBar` solo cuando hay vista de documento**
   - Ya está condicionado a `selectedDocument`, pero además: limitar `refreshLocations` a un trailing-debounce de 1 s. Mientras el batch corre se acumula y se ejecuta una sola vez por segundo, no por cada POI.

4. **Salvaguarda visual mínima**
   - Asegurar en `index.css` que `.leaflet-container { background: hsl(var(--muted)); }` no se pisa por ninguna regla. (Actualmente está bien, lo verificamos para descartar regresión.)

5. **Verificación**
   - Arrancar batch sobre el mismo documento "Tavares".
   - Comprobar: (a) tiles se ven desde el primer segundo; (b) el contador y el marcador "current" se mueven; (c) los puntos enriquecidos cambian a verde sin parpadeo; (d) `Performance` muestra long tasks < 100 ms en lugar de los actuales > 500 ms.

## Detalles técnicos

- Archivos a tocar:
  - `src/components/map/use-coalesced-realtime-tick.ts` (nuevo helper, transversal).
  - `src/components/LocationMap.tsx` (usar helper, quitar `locationIds` sort+join).
  - `src/components/FloatingToolbar.tsx` (usar helper).
  - `src/components/BottomProgressBar.tsx` (debounce de `refreshLocations`).
- Sin cambios de schema, sin tocar edge functions, sin tocar la barra de progreso visual (que ya quedó bien).
- Cumple la norma transversal: el helper de coalescing es el único punto donde se decide la cadencia de re-render por eventos realtime, reutilizable por cualquier vista futura.

## Lo que NO se toca

- Diseño actual de la barra de progreso (te gustó como está).
- Lógica de coherencia nombre⇄coordenadas ni el bloque de recuperación por POI.
- Reglas de visibilidad ni paleta de marcadores.
