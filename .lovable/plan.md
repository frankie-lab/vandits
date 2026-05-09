## Diagnóstico

El job se lanzó correctamente con `location_ids = [70 ids]` y `total_in_scope = 70`, pero el primer tick lo sobrescribió a un universo mucho mayor. La causa está en `supabase/functions/backfill-admin-fks/index.ts`:

Cuando el modo es **Revisar normalizados** (o cualquier modo con `health_filter`), la edge function:

1. Pide al RPC `admin_user_geo_scope_ids` la página de IDs del **health_filter**, ignorando `location_ids` del cuerpo.
2. Aplica al query tanto `.in('id', locationIds)` como `.in('id', healthScopeIds)` — en PostgREST el segundo `.in` sobre la misma columna **sobrescribe** al primero, así que la selección de 70 IDs desaparece.
3. Recalcula `remaining` / `totalInScope` llamando otra vez al RPC con `_limit: 100000` y SIN filtrar por `location_ids`. Eso es lo que pisa `total_in_scope` al universo del health_filter (de ahí el "1000" / "1 / 1000" en pantalla; el RPC además parece tener un cap interno de 1000).

Resultado visible: con 70 seleccionados, el job procesa el universo entero del modo (4747 en review) y la barra muestra "Procesados 8 / 1000 · quedan 1000".

## Cambios

### 1. `supabase/functions/backfill-admin-fks/index.ts`

**Selección de filas (intersección):**
- Cuando llegan `location_ids` Y `health_filter`, NO llamar al RPC `admin_user_geo_scope_ids` con la página completa. Tratar `location_ids` como la verdad: usar solo `q.in('id', locationIds)` y dejar que el filtrado por estado lo aplique el RPC sobre el subconjunto, o más simple: omitir el path de `healthScopeIds` cuando `location_ids` está presente y aplicar el `health_filter` filtrando los IDs vía RPC `admin_user_geo_scope_ids` con `_limit: location_ids.length` después de pasar la lista (requiere parámetro nuevo) — alternativa simple y suficiente: cuando ambos llegan, **prevalece `location_ids`**, se ignora `health_filter` para selección y para el recount. Los 70 IDs ya fueron filtrados por estado en el cliente al construir la selección, así que esto es seguro.
- Añadir paginación local cuando `location_ids` está presente: `q.range(offset, offset + limit - 1)` para que cada tick procese su lote en lugar de intentar todo de golpe.

**Recount (`remaining` / `totalInScope`):**
- En la rama `healthScopeIds`, si vino `location_ids`, devolver `totalInScope = location_ids.length` y `remaining = max(0, totalInScope - (offset + processed))`.
- Mismo tratamiento en las ramas `fill` / `else` ya respetan `location_ids` en el `count('exact', head)`, pero hay que asegurarse de que el `total_in_scope` del **primer tick** no degrade lo que el cliente ya escribió. Para eso:

### 2. `supabase/functions/geocoding-job-tick/index.ts`

- Cuando `job.location_ids` tiene longitud `> 0`, **fijar `totalInScope = job.location_ids.length`** al inicio del tick y **no sobrescribirlo** con el `d.totalInScope` que devuelva backfill. Solo actualizar `remaining` (clamp a `[0, totalInScope]`).
- Activar `useOffset = true` cuando hay `location_ids` (aunque exista `health_filter`), para que la paginación avance y el job termine de forma natural en `offset >= totalInScope`.

### 3. (Opcional, defensivo) `src/components/admin/GeographyBackfillPanel.tsx`

- Cuando hay selección explícita, no enviar `healthFilter` en el `scope` (el cliente ya filtró por estado al construir la selección). Esto elimina la ambigüedad por completo desde el origen y vuelve la fix anterior redundante pero segura.

## Resultado

Con 70 seleccionados en "Revisar normalizados":
- `total_in_scope = 70` durante todo el job.
- Cada tick procesa hasta `page_size` IDs de los 70 hasta agotarlos.
- La tarjeta Lanzar muestra "Procesados N / 70 · quedan 70-N".
- El job completa al cubrir los 70.

## Fuera de alcance

- No se toca el RPC `admin_user_geo_scope_ids` ni el cap interno de 1000 (irrelevante una vez que `location_ids` manda).
- No se cambia el comportamiento sin selección (universo completo sigue funcionando como hoy).
