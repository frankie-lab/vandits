# Scope estricto por usuario + indicador global del job

## Diagnóstico

En BD acabo de comprobar:
- Tu cuenta tiene **4 747** puntos propios.
- El job activo dice `total_in_scope = 5 074` = total global de la tabla.
- El edge function `backfill-admin-fks` aplica `owner_user_id` solo si recibe `user_id` en el body. El tick lo manda, pero algo se rompió y procesó también puntos de otros usuarios.

Y el "Procesados / ETA / Detener" vive solo dentro del panel admin. Si lo cierras, no tienes señal de que el job sigue.

## Cambios

### 1. Forzar scope por usuario (defensivo y transversal)
- `backfill-admin-fks/index.ts`: si `callerUserId` queda en `null` al final de la resolución (sea JWT o service role), responder `400` y NO ejecutar. El backfill nunca puede correr sin `owner_user_id`.
- `geocoding-job-tick/index.ts`: si `job.user_id` falta, marcar el job `failed` con `last_error="missing user_id"`.

### 2. Cancelar el job actual
- Marcar `geocoding_jobs` `3e5d610f-…` como `canceled` con nota explicando el motivo. No tocamos los 65 FKs ya escritos (son correcciones reales, no datos corruptos), pero el conteo deja de avanzar sobre puntos ajenos.
- El usuario podrá relanzar desde el panel; ya correrá solo sobre sus 4 747.

### 3. Indicador flotante global del job
- Nuevo componente `src/shared/components/GeocodingJobIndicator.tsx`:
  - Pill `position: fixed`, esquina inferior derecha, sobre el mapa.
  - Visible siempre que `status ∈ {running, canceling}` (suscrito al store + realtime existente).
  - Muestra: ícono `Compass` ámbar + "200 / 4 747" + barra fina + ETA + botón cuadrado para Detener.
  - Click en el cuerpo: emite evento `admin:open-geography-panel` para abrir el panel grande con todos los detalles.
  - Tokens semánticos (`bg-card/95`, `backdrop-blur`, `border`, `shadow-lg`). Sin colores hardcoded.
  - Mobile (≤640px): icono + porcentaje, sin texto largo.
- Montaje en `src/App.tsx` dentro del árbol autenticado (junto a `GlobalLoadingBar`), para que persista entre rutas.
- `GeographyBackfillPanel.tsx`: escucha `admin:open-geography-panel` y delega al host (si el host del panel admin no soporta apertura por evento, se dispara via el mismo bus que ya abre el back office).

### 4. Memoria
- Actualizar `mem://logic/geocoding/unified-job` añadiendo: "scope siempre por `owner_user_id`; `backfill-admin-fks` rechaza ejecución sin user_id" + "indicador flotante global vive en App.tsx independiente del panel".

## Archivos
- `supabase/functions/backfill-admin-fks/index.ts`
- `supabase/functions/geocoding-job-tick/index.ts`
- `supabase--insert` para cancelar el job actual
- `src/shared/components/GeocodingJobIndicator.tsx` (nuevo)
- `src/App.tsx`
- `src/components/admin/GeographyBackfillPanel.tsx` (listener para abrir desde el pill)
- `mem://logic/geocoding/unified-job`
