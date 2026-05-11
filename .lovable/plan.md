
## Objetivo

Garantizar que un punto recién enriquecido (verde) cuya geografía quede `broken`, `partial` o `stale_name` se **autoencole** en un job de `repair` para que el cron `geocoding-job-tick` lo arregle sin intervención del usuario.

Esto cierra el hueco actual: la IA marca el punto como verde pero deja FKs incompletos (sin `admin3/locality/sublocality`) o con cadena rota, y como "los verdes no se reenriquecen", nunca se vuelven a tocar.

## Diseño (100% server-side, transversal)

### 1. Trigger nuevo: `locations_auto_enqueue_geo_repair`

- Se dispara **AFTER INSERT OR UPDATE** sobre `public.locations`.
- Condición de ejecución (todas en `AND`):
  - `NEW.deleted_at IS NULL`
  - `NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL`
  - `NEW.geo_health IN ('broken', 'partial', 'stale_name')` (el trigger `locations_set_geo_health` ya lo calcula antes vía BEFORE, así que `geo_health` ya está al día)
  - En UPDATE: solo si **algo geo-relevante o el enriquecimiento ha cambiado**:
    - `OLD.enriched_data IS DISTINCT FROM NEW.enriched_data`, **o**
    - `OLD.geo_health IS DISTINCT FROM NEW.geo_health`, **o**
    - cualquiera de los 8 FKs (`continent_id..sublocality_id`) cambió.
  - `NEW.owner_user_id IS NOT NULL` (sin dueño no podemos encolar).

### 2. Acción del trigger: coalescing en un job abierto

En lugar de crear un job por cada punto (ruido enorme), el trigger:

1. Busca un job existente del usuario con `status IN ('running','pending')` y `mode = 'repair'` con `label` que empiece por `'auto-repair'`.
2. Si existe → hace `UPDATE` sumando `NEW.id` a `location_ids` (con `array_append` solo si no está ya), incrementa `total_in_scope` y `remaining`.
3. Si no existe → `INSERT` un job nuevo:
   - `user_id = NEW.owner_user_id`
   - `mode = 'repair'`
   - `label = 'auto-repair (enrichment fallout)'`
   - `location_ids = ARRAY[NEW.id]`
   - `total_in_scope = 1`, `remaining = 1`, `status = 'running'`
   - `created_by = NEW.owner_user_id`

Esto evita avalanchas: si un batch IA procesa 100 puntos, todos caen en el mismo job y el cron los va comiendo a su ritmo.

### 3. Función auxiliar `public._enqueue_geo_repair(_user_id uuid, _location_id uuid)`

`SECURITY DEFINER`, contiene la lógica de coalescing. El trigger solo la llama. Así si más adelante hay otra fuente (p. ej. `_merge_admin_area`) que quiera encolar puntos, reusa el helper.

### 4. Tope de seguridad

- Si el job abierto ya supera **N** puntos (configurable vía `app_settings`, default 5000), abrir uno nuevo. Evita arrays gigantescos en una sola fila.
- Si el cron ya procesa un job activo, no pasa nada: el siguiente tick lo recoge.

### 5. Compatibilidad con flujo manual

El panel "Geografía universal" sigue funcionando igual. El admin puede:
- Ver el job auto-encolado en la barra inferior multi-lane (lane Geo) con su label `auto-repair`.
- Pausarlo/detenerlo si quiere (mismo store `useGeocodingJobStore`).

## Migración

Una sola migración SQL:
1. `CREATE OR REPLACE FUNCTION public._enqueue_geo_repair(_user_id uuid, _location_id uuid)` — coalescing + insert.
2. `CREATE OR REPLACE FUNCTION public.locations_auto_enqueue_geo_repair()` — trigger function.
3. `CREATE TRIGGER trg_locations_auto_enqueue_geo_repair AFTER INSERT OR UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.locations_auto_enqueue_geo_repair();`
4. Pequeño backfill one-shot (opcional, dentro de la misma migración): para cada usuario con puntos `geo_health <> 'ok'` con `enriched_data ? 'descripcion'`, encolar todos sus IDs en un único job `auto-repair (initial backfill)`. Solo se ejecuta una vez.

## Memoria a guardar

`mem://logic/geocoding/auto-enqueue-on-enrichment` — Trigger AFTER INSERT/UPDATE en `locations` que detecta `geo_health <> 'ok'` tras enriquecer y encola el punto en un job `repair` coalescido por usuario. Helper único `_enqueue_geo_repair`. Cero código cliente; el cron existente se encarga.

## Lo que NO cambia

- `enrich-location.ts`, `batch-enrich`, `process-imported-document`, `useGeocodingJobStore`, `BottomProgressBar` y la UI de "Geografía universal": **intactos**.
- La regla "los verdes no se reenriquecen": **intacta** (no toca IA, solo geo).
- Filtros, RLS, vistas: **intactos**.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Bucle infinito (el cron actualiza la fila → re-dispara el trigger) | Condición de cambio incluye solo `enriched_data`, `geo_health`, FKs. Si la actualización del cron mejora `geo_health` a `ok`, el trigger no encola. Si sigue rota tras el intento, queda en el array pero el cron ya la procesó (idempotente por `processed_ids` del job). Añadiremos guarda `NEW.geo_health <> 'ok'` para no encolar OKs. |
| Avalancha en imports grandes | Coalescing en un solo job + tope de 5000 IDs por job. |
| Trigger pesa en INSERT masivos | Función trivial (1 SELECT + 1 INSERT/UPDATE). Indexamos `geocoding_jobs (user_id, status, mode)` si no existe ya. |
| Errores duros (Nominatim falla) | Ya gestionados por `backfill-admin-fks`. El punto seguirá `broken/partial` y volverá a encolarse en el próximo update. |
