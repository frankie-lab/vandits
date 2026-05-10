## Diagnóstico

`useEnrichmentTracker` (sonido, toast y `setView` al último POI enriquecido) sigue montado, pero su detección depende de dos cosas que se han debilitado al optimizar el render del mapa:

1. **`enrichmentKey` ya no muta por POI.** Antes recorría descripciones de todos los locations; ahora es solo `criteriaKey-docId-length`, así que solo cambia en cambios estructurales. La detección queda únicamente a merced de que `allLocations` cambie de referencia.
2. **`allLocations` cambia de referencia** cuando el store muta, pero **el efecto tracker se queda atrás** durante ráfagas de batch-enrich: como hicimos targeted refresh (no re-render completo) y el `refreshLocations` está debounced 1.5s, el efecto del tracker puede coalescer varios enriquecimientos en un mismo tick y entonces solo dispara animación/sonido para "uno" (el último), o ninguno si la diff de `descripcion.length` queda en cero porque otra actualización (foto, visited) llegó primero y rebajó el snapshot previo.

Resultado percibido: el sonido y el "flyTo + abrir popup" del POI recién enriquecido han desaparecido durante batch-enrich.

## Plan

### 1. Señal explícita "enriched" desde realtime (fuente de verdad)
En `src/hooks/use-realtime-locations.ts`, dentro de `handleLocationUpdate`, comparar `oldRecord.enriched_data?.descripcion` vs `updatedRecord.enriched_data?.descripcion`. Si pasa de vacío→no-vacío (o crece >50 chars) marcar `kind: 'enrich'` en el evento `location-realtime-update` además del `locationId`.

Beneficio: deja de depender de comparar arrays React; la verdad viene del payload de Postgres.

### 2. Tracker basado en evento, no en diff de array
Refactor de `src/components/map/useEnrichmentTracker.ts`:
- Escuchar `window` `location-realtime-update` con `kind === 'enrich'`.
- Mantener un buffer corto (≤250ms) para coalescer ráfagas, **pero emitir feedback por cada id** (sonido throttled a 1 cada 400ms, toast por POI, animación pulse por todos).
- Para `setView + openPopup`, usar siempre el último id del buffer (evita pelearse con animaciones encadenadas).
- Conservar el camino actual basado en diff como fallback (por si el evento no llega), pero quitarlo del path crítico.

### 3. No interferir con interacción del usuario
- Si el usuario tiene el mapa "agarrado" (drag/zoom reciente <2s, detectado vía listeners `movestart`/`zoomstart`), saltar el `setView` automático pero **mantener** sonido + toast + pulse.
- Esto evita que durante batch-enrich el mapa "salte" mientras el usuario navega; era una queja implícita del comportamiento previo.

### 4. Sonido en cliente y en bursts
- En `playEnrichmentComplete` añadir throttle interno (400ms) por si llegan 10 enriquecimientos en 1s; sonará una vez, no se solapa.

### 5. Tests rápidos
- `src/test/enrichment-helpers.test.ts` (o nuevo): simular dos eventos `location-realtime-update` con `kind:'enrich'` seguidos y verificar que el tracker registra ambos ids y emite sonido una sola vez (throttle).

## Archivos a tocar

- `src/hooks/use-realtime-locations.ts` — detectar y emitir `kind:'enrich'` en el detail del evento.
- `src/components/map/useEnrichmentTracker.ts` — pasar a modelo event-driven, throttle de sonido, respeto a interacción usuario.
- `src/lib/sounds.ts` — throttle interno en `playEnrichmentComplete`.
- (opcional) `src/test/` — un test ligero.

## Fuera de alcance

- No tocamos el targeted refresh de marcadores ni el debounce de `refreshLocations` (siguen siendo necesarios para que el mapa no se quede gris).
- No tocamos la barra de progreso.
