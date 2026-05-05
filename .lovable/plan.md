# Sonido transversal "punto importado"

Un único helper de sonido se dispara en el handler INSERT del realtime de `locations`, cubriendo todas las fuentes (scraper, OneDrive, KML/GPX manual, edge functions) sin duplicar lógica.

## Cambios

### 1. `src/lib/sounds.ts`
- Añadir nueva acción `'point_imported'` al tipo `SoundAction`.
- Añadir entrada a `SOUND_ACTIONS` (label "Punto importado", description "Al importar un punto desde cualquier fuente", iconName `map-pin`).
- Añadir `point_imported: true` a los defaults de `getSoundPreferences()`.

### 2. `src/hooks/use-realtime-locations.ts`
- Importar `playActionSound` de `@/lib/sounds`.
- En el handler `INSERT` ya existente, llamar `playActionSound('point_imported')`.
- Añadir throttle simple via `useRef<number>` para limitar a 1 sonido cada 150 ms (evita spam en ráfagas del scraper).

### 3. `src/domains/content/components/BackgroundScrapeJobs.tsx`
- Eliminar `audioCtxRef`, `playTick` y la lógica de delta `items_imported` que dispara ticks dentro de `loadJobs`. El sonido pasa a salir del realtime de `locations`.
- Mantener el resto del componente (refresco de jobs, presets, etc.) intacto.

## Resultado

- Suena un beep corto en cada punto recién insertado, da igual la fuente.
- Se silencia desde Ajustes → Sonidos (toggle global o por acción "Punto importado").
- Sin duplicación: `BackgroundScrapeJobs` ya no toca audio.
- Throttle evita saturación cuando llegan 5+ inserts en ráfaga.

## Memoria

Actualizar `mem://logic/realtime/locations-insert-and-new-docs` añadiendo: "Realtime INSERT también dispara `playActionSound('point_imported')` (throttle 150 ms). Único punto donde suena el feedback de import."
