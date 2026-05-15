# Audit — Stale Closures

## Patrón vigilado
Handlers o efectos que capturan valores por closure y dejan de reflejar el estado actual tras re-renders.

## Hallazgos

### H1 — `marker.on('popupclose')` per-marker (RESUELTO)
- **Síntoma**: el handler leía `focusedLocationId` por closure → deselect incorrecto.
- **Resolución**: ADR-0001. Centralizado en `map.on('popupclose')` único, lee `useLocationsStore.getState()`.
- **Guardarraíl**: comentario en `LocationMap.tsx:1801`.

### H2 — `useEffect`s del renderer con dependency lists pesadas
- **Ubicación**: `LocationMap.tsx` líneas ~1939, ~1983, ~2108, ~2142, ~2158, ~2173, ~2212, ~2235, ~2282.
- **Síntoma**: dependencias `[selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, currentUserId, …]`. Cualquier cambio re-corre todos los efectos.
- **Estado**: aceptable, pero cualquier nueva dependencia debe revisarse para evitar pintados redundantes.
- **Acción recomendada**: extraer subhooks por capa (own/followed/app/source) si crece más.

### H3 — Hook handler captura `currentUserId` (VIGILAR)
- **Ubicación**: `use-my-catalog-popover-fit.ts` usa `userIdRef` + `userIdRef.current = currentUserId` en cada render. Patrón correcto.
- **Estado**: OK. Cualquier copia debe seguir el patrón ref para evitar stale uid.

### H4 — Listeners `subset-fit` y `popup` re-creados (VIGILAR)
- Los `useEffect` que registran listeners globales en `LocationMap` tienen dependency `[]`. Si en el futuro alguien añade dependencias, re-crearán listeners y duplicarán handlers.
- **Acción**: añadir test de "listener count" antes de tocar esas deps.

## Anti-patrones a rechazar
- Registrar listeners globales con dependency lists que cambian.
- Capturar `focusedLocationId` o `currentUserId` por closure en handlers de eventos persistentes.
- Inventar refs para "esquivar" dependencias correctas (caso a caso, justificar).
