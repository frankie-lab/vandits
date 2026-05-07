## Objetivo

Enriquecer la barra de progreso del backfill geográfico (`GeographyBackfillPanel` y `GeocodingProgressBar`) con:

- Tiempo transcurrido
- Velocidad real (puntos/min)
- ETA (tiempo restante estimado)
- Hora estimada de finalización

Sin tocar la lógica del worker (Nominatim 1 req/s sigue mandando el ritmo real).

## Cambios

### 1. `src/stores/geocoding-job-store.ts`

- Añadir al estado: `startedAt: number | null` y `lastTickAt: number | null`.
- En `start()`: guardar `startedAt = Date.now()` (y persistirlo, ya existe `startedAt` en `PersistedJob`).
- En cada vuelta del bucle: actualizar `lastTickAt`.
- En `resumeIfPending()`: rehidratar `startedAt` desde `persisted.startedAt` para que el ETA sobreviva al refresh.
- Limpiar `startedAt` en el `finally`.

No cambia la red ni la cancelación.

### 2. Nuevo helper `src/shared/geography/eta.ts`

Función pura `computeEta({ startedAt, totalUpdated, remaining })` que devuelve:

```ts
{
  elapsedMs: number;
  ratePerMin: number;     // media móvil sencilla: totalUpdated / elapsedMin
  etaMs: number | null;   // null si rate≈0 o aún no hay muestras (<5s o <2 puntos)
  finishAt: Date | null;
}
```

Formateadores: `formatDuration(ms)` → `"2 min 14 s"`, `"1 h 03 min"`, y `formatClock(date)` → `"18:42"`.

### 3. `src/components/admin/GeographyBackfillPanel.tsx`

Bajo la barra de progreso, mientras `job.running`, mostrar una fila compacta:

```
Transcurrido 1 min 12 s · 38 pts/min · ETA ~4 min · termina ~18:46
```

Si aún no hay datos suficientes: `"Calculando ETA…"`.

### 4. `GeocodingProgressBar` (banner global)

Mismo bloque ETA en formato más corto para no romper el header:

```
2 min · ~4 min restantes
```

Solo se añade si `etaMs !== null`; si no, se omite y queda como ahora.

## Detalles técnicos

- ETA se recalcula en render (cada vez que `totalUpdated` cambia el store hace `set`, así que los suscriptores re-renderizan). No hace falta `setInterval`.
- Para que el reloj avance también cuando no llega un tick (Nominatim lento), el panel monta un `setInterval(1000)` ligero **solo mientras `job.running`** que fuerza un `forceUpdate` local. Cero impacto fuera del job.
- Respeta el sistema de tokens (`text-muted-foreground`, `bg-primary`) — sin colores hardcoded.
- No se introduce sistema paralelo de progreso: sigue siendo `useGeocodingJobStore` la única fuente.

## Archivos

- editar `src/stores/geocoding-job-store.ts` (añadir `startedAt`, `lastTickAt`)
- crear `src/shared/geography/eta.ts`
- editar `src/components/admin/GeographyBackfillPanel.tsx`
- editar `src/components/GeocodingProgressBar.tsx` (banner global)
