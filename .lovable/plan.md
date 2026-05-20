# Fase 5 — `geo_health` honesto (R2)

Defensa en profundidad: SQL trigger (fuente de verdad) + helper TS espejo (lectura defensiva). Sin backfill de datos históricos, sin re-enrich, sin tocar `LocationMap.tsx`, `places_trunk`, RLS/RBAC, UI panels, ni Fases 6–7.

## 1. Migración DDL (schema-only, sin UPDATE de filas)

Archivo nuevo en `supabase/migrations/`. Rewrites de funciones existentes — no toca filas históricas.

### 1.1 Ampliar `_compute_location_geo_health`

Añadir 2 parámetros al final: `_raw_geocode jsonb`, `_enrichment_status text`. Insertar bloque `WHEN ... THEN 'hardError'` ANTES del resto:

```sql
WHEN _lat IS NULL OR _lng IS NULL THEN 'hardError'
WHEN _lat = 0 AND _lng = 0 THEN 'hardError'
WHEN ABS(_lat) > 90 OR ABS(_lng) > 180 THEN 'hardError'
WHEN _enrichment_status = 'enriched' AND _raw_geocode IS NULL THEN 'hardError'
```

Quitar el viejo `WHEN _lat IS NULL OR _lng IS NULL THEN 'empty'` (ahora cae en hardError). El resto del CASE (broken/partial/stale_name/ok) intacto.

### 1.2 Ampliar `_compute_location_geo_health_lookup`

Añadir mismos 2 parámetros y propagarlos al `_compute_location_geo_health`.

### 1.3 Trigger `locations_set_geo_health`

Pasar `NEW.raw_geocode`, `NEW.enrichment_status`. Añadir esas columnas + `latitude/longitude` (ya están) al `UPDATE OF` del trigger:

```sql
BEFORE INSERT OR UPDATE OF
  latitude, longitude,
  continent_id, country_id, region_id, zone_id,
  country, region, zone, country_code,
  raw_geocode, enrichment_status
```

### 1.4 Trigger `admin_areas_invalidate_geo_health`

Pasar `l.raw_geocode, l.enrichment_status` en su UPDATE recomputador.

### 1.5 No backfill

Se omite intencionalmente el `UPDATE public.locations` final (la migración anterior sí lo tenía). Conforme a "Sin migración de datos" del contrato + "no tocar datos históricos" del usuario. Filas existentes recomputan su `geo_health` la próxima vez que cambien las columnas observadas.

## 2. Cliente — helper espejo defensivo

### 2.1 Nuevo: `src/shared/geography/compute-geo-health.ts`

```ts
export type GeoHealth = 'ok'|'broken'|'partial'|'stale_name'|'empty'|'hardError';

export function isHardErrorGeo(loc): boolean {
  // R2: lat/lng inválidos, (0,0), fuera WGS84, o enriched sin raw_geocode
}

export function computeHonestGeoHealth(loc): GeoHealth {
  if (isHardErrorGeo(loc)) return 'hardError';
  return (loc.geoHealth ?? 'empty');
}
```

Lee `loc.latitude`, `loc.longitude`, `loc.enrichmentStatus`, `loc.rawGeocode`. Reutiliza `isValidWgs84Coord` de Fase 1 para no duplicar lógica.

### 2.2 Espejo Deno: `supabase/functions/_shared/compute-geo-health.ts`

Misma lógica para futuras edges (no se cablea en esta fase, sólo se publica).

### 2.3 Actualizar `src/domains/content/lib/geo-health.ts`

`isHealthyShareableGeo` pasa por `computeHonestGeoHealth(loc) === 'ok'` (en lugar de `loc.geoHealth === 'ok'`). Defensivo: si la DB devuelve `'ok'` stale pero R2 falla, sharing/export rechazan.

### 2.4 Tipos

`src/types/location.ts` línea 271: añadir `'hardError'` al union `geoHealth`. No tocar `HealthFilter` (ya lo contempla).

`src/integrations/supabase/types.ts` se regenerará automáticamente tras la migración (no editar manualmente).

## 3. Tests

`src/test/geo-health-hard-error.test.ts` (Vitest, helper cliente):

- `(0, 0)` → hardError
- `lat=null` → hardError
- `lng=null` → hardError
- `lat=91` o `lng=-181` → hardError
- `enrichment_status='enriched'` + `raw_geocode=null` → hardError
- coords válidas + `raw_geocode` presente → respeta `loc.geoHealth` (`ok`/`partial`/etc, no fuerza hardError)
- coords válidas + status `pending` + raw_geocode null → no hardError (rule sólo aplica si enriched)

Test SQL contractual: nota en archivo de test indicando que la verificación funcional del trigger requiere ejecutar la migración (no automatizable en Vitest puro).

## 4. Versionado y documentación

- `package.json` → `1.2.14`
- `src/lib/app-version.ts` → `1.2.14`
- `README.md` changelog: entry 1.2.14 — Fase 5 (R2) `geo_health` honesto
- `docs/releases/version-history.md` — entry 1.2.14
- `docs/tech-debt.md` ítem 7: "En progreso — Fase 5 aplicada"

## 5. Constraints confirmados

- Sin tocar `LocationMap.tsx`, `places_trunk`, RLS/RBAC, UI panels
- Sin re-enrich
- Sin backfill de filas (DDL recomputa on-write)
- Fases 6–7 fuera de scope

## 6. Reporte final que entregaré

Archivos modificados, tests ejecutados (Vitest verde), versión final `1.2.14`, confirmación explícita de constraints.
