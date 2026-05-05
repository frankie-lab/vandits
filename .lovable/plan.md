## Problema

Al refrescar, el store Zustand se resetea: `running=false` aunque la base de datos siga teniendo puntos sin geocodificar. El banner aparece (porque mira `totalUnclassified` en DB) pero el botón muestra "Geocodificar todos" en lugar de "Parar", y el bucle real está parado.

## Solución

Persistir el estado del job en `localStorage` con un heartbeat, y al montar la app retomar automáticamente si el job estaba activo.

## Cambios

### 1. `src/stores/geocoding-job-store.ts`

- Persistir `{ running, scope, totalUpdated, initialPending, startedAt, heartbeatAt }` en `localStorage` bajo la clave `geocoding-job-state`.
- Actualizar `heartbeatAt = Date.now()` después de cada punto procesado dentro del bucle.
- Al pulsar "Parar" o al terminar, limpiar el localStorage.

### 2. Auto-reanudación

Añadir un helper `resumeIfPending()` exportado del store:

- Lee el estado persistido.
- Si `running === true` y `Date.now() - heartbeatAt < 30s` → considera que otra pestaña sigue activa, no hace nada (evita doble worker).
- Si `running === true` y `heartbeatAt` viejo (>30s) → considera que el bucle murió por refresh y relanza `start(remainingFromDB, scope)` automáticamente.
- Si `running === false` → no hace nada.

Llamar `resumeIfPending()` una sola vez al montar la app (en `App.tsx` o en `main.tsx` con un `useEffect`).

### 3. UI: forzar lectura inmediata

En `GeographyTree.tsx` ya consume `useGeocodingJobStore`, así que en cuanto el store hidrate desde localStorage (síncrono al cargar) el botón mostrará "Parar" desde el primer render. No requiere cambios extra.

## Notas técnicas

- Usamos heartbeat (no solo el flag `running`) porque sin él, si el usuario cierra el navegador a mitad, al volver mañana relanzaríamos un job sin que el usuario lo pidiera. 30s es margen suficiente: el bucle hace 1 punto/seg, así que un heartbeat más viejo = pestaña muerta.
- Multi-pestaña: si el usuario abre dos pestañas mientras el job corre en una, la segunda detecta heartbeat fresco y NO arranca otro worker. Solo refleja el progreso.
- Cancelación inmediata sigue funcionando porque el flag `cancelFlag` se evalúa entre cada punto.

## Archivos tocados

- `src/stores/geocoding-job-store.ts` — añadir persistencia + `resumeIfPending`.
- `src/App.tsx` (o similar punto de entrada) — invocar `resumeIfPending()` al montar.
