
## Objetivo

Cuando `batch-enrich` reciba un 402 (`kind: 'no_credits'`) de `enrich-location`, **pausar el job entero** en vez de marcar el POI como error. Así, cuando el usuario recargue AI balance, basta con pulsar **Reanudar** y continúa desde donde se quedó, sin perder POIs en `error_ids`.

## Cambios (un solo archivo)

`supabase/functions/batch-enrich/index.ts`

1. **Detección 402 en el worker (`processSingleLocation`)**
   - Cuando el `catch` recibe un error con `__structured.kind === 'no_credits'`, en vez de empujar el id a `error_ids` y guardar el mensaje, lanza un sentinel especial `NO_CREDITS_SENTINEL` que la ola superior reconoce.
   - El POI NO se cuenta como error ni como procesado: se devuelve a la cola pendiente (queda dentro de `location_ids` y fuera de `processed_ids`/`error_ids`).

2. **Pausa automática a nivel de ola**
   - Tras `Promise.allSettled` de la ola, si alguno de los workers devolvió el sentinel `no_credits`:
     - `UPDATE enrichment_jobs SET status='paused', last_error='no_credits', current_location_name=null` (campo nuevo opcional `pause_reason` reutilizando `error_messages.__pause_reason = 'no_credits'` para no migrar schema).
     - `break` del bucle de olas. Devuelve respuesta `{ paused: true, reason: 'no_credits' }`.
   - Antes de lanzar cada ola sigue leyendo `status`; si está `paused` o `cancelled`, sale.

3. **UI: aviso de pausa por falta de créditos**
   - En el componente que ya muestra el estado del job de enriquecimiento (banner / toolbar), si `status === 'paused'` y `error_messages.__pause_reason === 'no_credits'`, mostrar mensaje:
     > "Job pausado: AI balance agotado. Recarga en Settings → Workspace → Cloud & AI balance y pulsa Reanudar."
   - El botón **Reanudar** existente sigue funcionando sin cambios (relanza `batch-enrich` con el mismo jobId; los `location_ids` pendientes se reanudan).

## Lo que NO cambia

- `enrich-location`: sigue devolviendo 402 igual.
- Concurrencia (8), back-off 429, escritura de progreso por ola: idénticos.
- Realtime, marker palette, sonidos, `places_trunk`: sin cambios.
- POIs ya marcados como error duro (Wikipedia/coherencia/etc.) siguen en `error_ids` como hoy.

## Resultado

- Sin AI balance → job se pausa limpiamente, 0 POIs perdidos.
- Recargas balance → botón Reanudar reactiva los POIs que faltaban.
- Si quieres puedo añadir además un toast en el cliente cuando llegue el cambio realtime de `enrichment_jobs.status → 'paused'`.
