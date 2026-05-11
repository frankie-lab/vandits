# Plan: cerrar el episodio `stale_name=2527` / `broken=49`

## Contexto

Tras localizar `admin_areas.name` a idioma nativo (España, Francia, Italia, Alemania…), la recomputación masiva de `geo_health` ha aflorado desajustes preexistentes entre:

- El **cache legacy** en `locations.country / region / zone` (mayoritariamente en inglés desde imports antiguos).
- La **verdad canónica** en `admin_areas.name` (ahora en idioma nativo).

Mientras ambos estaban en inglés, coincidían por casualidad. Ahora no.

La Core rule del proyecto dice: **"Vista única para geografía resuelta — cero columnas-cache duplicadas"**. El cliente lee siempre `v_locations_resolved`. Por tanto el `stale_name` actual es un anillo amarillo que **compara contra un cache que ya no es fuente de verdad**.

## Objetivo

Dejar el sistema en un estado coherente con esa Core rule: `geo_health` sólo debe avisar de problemas reales (FK roto, cadena incompleta), no de divergencias entre el cache legacy y el canónico.

## Pasos

### Paso 1 — Refrescar el cache legacy desde el canónico (one-shot)

Operación de mantenimiento, no cambio de modelo:

```sql
UPDATE locations l
SET
  continent = ac.name,
  country   = aco.name,
  region    = ar.name,
  zone      = az.name
FROM admin_areas ac
LEFT JOIN admin_areas aco ON aco.id = l.country_id
LEFT JOIN admin_areas ar  ON ar.id  = l.region_id
LEFT JOIN admin_areas az  ON az.id  = l.zone_id
WHERE ac.id = l.continent_id
  AND l.deleted_at IS NULL
  AND l.geo_health IN ('stale_name','partial');
```

Esto alinea el cache con los nombres nativos sin re-geocodificar.

### Paso 2 — Reparar los 49 `broken`

Investigar primero (consulta read-only) si son:

- **a)** FKs huérfanos por los merges de `_merge_admin_area()` (apuntan a `admin_areas.id` ya borrados).
- **b)** Puntos con coordenadas válidas pero sin ningún `admin_areas` que las contenga.

Si (a): redirigir FKs a la fila canónica resultante del merge usando `place_merge_history` si existe, o por matching de nombre+depth.
Si (b): encolar en `geocoding_jobs` (auto-repair) para re-resolver vía `resolve-admin-area`.

### Paso 3 — Recomputar `geo_health` final

```sql
UPDATE locations
SET geo_health = _compute_geo_health(continent, country, region, zone,
                                     continent_id, country_id, region_id, zone_id)
WHERE geo_health IN ('stale_name','broken','partial');
```

Verificación: `SELECT geo_health, count(*) FROM locations WHERE deleted_at IS NULL GROUP BY 1` debe quedar dominado por `ok`.

### Paso 4 (opcional, fuera de scope hoy) — Deprecar el cache

Documentar en memoria que `locations.country/region/zone` es **derivado y sólo refresca via trigger** desde `admin_areas`. Cualquier UPDATE manual a esos strings queda prohibido. La fuente de verdad es FK + `v_locations_resolved`.

## Riesgos

- El UPDATE masivo del paso 1 toca ~2.500 filas. Es seguro: sólo reescribe strings ya derivables de los FKs.
- Los 49 `broken` requieren inspección antes de actuar; no aplicar fix ciego.
- No tocar `_compute_geo_health` ni la lógica de anillos: la regla "cadena rota = amarillo / error = rojo" sigue intacta.

## Fuera de scope

- No se cambia client code.
- No se modifica `name_translations` ni la vista `v_locations_resolved`.
- No se re-geocodifica nada que tenga FKs ya resueltos.
