## Objetivo

Que cada POI cambie de color en el mapa **en el momento exacto** en que llega su UPDATE de Postgres, no en lotes. El usuario debe ver un goteo continuo de marcadores virando a verde, sin percibir que existe un proceso de "batch".

## Diagnóstico

Hoy el repaint del marcador depende de `realtimeTick`, que `useCoalescedRealtimeTick` solo bombea cada **350ms** (con `requestIdleCallback`). Si llegan dos UPDATEs en esa ventana, ambos cambian de color a la vez al siguiente tick → se percibe como bloque. Además durante batch-enrich el hilo principal está ocupado y `requestIdleCallback` puede demorarse hasta su `timeout: 200`, agrandando aún más la ventana.

La coalescencia se introdujo para evitar full-sweep del mapa (5k markers). Pero un `marker.setIcon()` aislado es barato; el problema no era el setIcon por POI sino el sweep completo.

## Plan

### 1. Repaint inmediato por POI (sin esperar al tick)
Nuevo listener directo en `LocationMap` para `location-realtime-update`:
- Si `detail.locationId` existe **y `detail.kind` es `'enrich'` o `'update'`** → buscar marker + location, llamar `marker.setIcon(createCustomIcon(...))` y `marker.setPopupContent(...)` **al instante**.
- Encolar el id en `pendingRealtimeIdsRef` solo como red de seguridad por si el marker aún no existía (entonces el tick coalescido lo recoge cuando se cree).
- Si `detail.locationId` ausente (`store-updated` o invalidación masiva) → ruta actual (tick coalescido + full sweep).

### 2. Tick coalescido pasa a ser solo "fallback / full sweep"
Mantener `useCoalescedRealtimeTick` pero usarlo solo cuando `ids === null` (invalidaciones globales). Esto evita el latido de 350ms para el caso común (enrichment puntual).

### 3. Source-of-truth de "is enriched"
En la ruta inmediata, leer la location desde el store (`useLocationsStore.getState().documents.flatMap...`) en vez de depender del closure de `locations` filtradas — para que el tinte pinte aunque el componente aún no se haya re-renderizado. `getPointVisualState(loc)` sigue siendo el único decisor de paleta.

### 4. Tracker (sonido/foco) no se toca
Su coalescencia de 250ms se mantiene; ahí sí queremos agrupar el ruido para no spamear toasts ni sonido. El visual del marcador y el feedback emocional son canales distintos.

### 5. Verificación
- Probar batch-enrich de 20 puntos: cada gris debe virar a verde con el espaciado real del backend (~500ms), no a saltos.
- Verificar que mapa no se vuelve gris (no debe haber regresión del bug anterior, porque seguimos sin hacer sweep completo).

## Archivos a tocar

- `src/components/LocationMap.tsx` — añadir listener directo `location-realtime-update` con repaint per-id inmediato; tick coalescido queda para `ids === null`.
- (sin cambios en) `use-coalesced-realtime-tick.ts`, `useEnrichmentTracker.ts`, `use-realtime-locations.ts`, `sounds.ts`.

## Fuera de alcance

- No tocamos popup regeneration en bloque, animaciones de pulse, ni el throttle del sonido.
