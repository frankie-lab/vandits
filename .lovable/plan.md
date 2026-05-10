## Cambio respecto al plan anterior

Tienes razón: duplicar strings en `locations` obligaría a mantener sincronizadas dos copias (la de `admin_areas.name` y la de `locations.admin_level_3`). Eso es exactamente lo que pasó hasta ahora con `continent / country / region / zone` y por eso el back office y el filtro divergían.

**Propuesta nueva**: una **única fuente** que sirva tanto a "Buscar y Filtrar" como a "Geografía universal". El back office ya usa `v_location_geo_health` (vista que JOIN-ea `admin_areas`). Replicamos ese patrón con una vista mínima y hacemos que el cliente lea de ella, sin tocar la tabla `locations`.

## Diagnóstico

- `admin3_id` poblado en 4 775 / 5 074 filas, `locality_id` en 4 779 / 5 074. **Los datos existen.**
- El back office los muestra porque consulta `v_location_geo_health`, que expone `admin_level_3 = a3.name`, `locality = lc.name`, `sublocality = sl.name`.
- El cliente no los muestra porque `fetchAllLocationsPaginated()` (`src/domains/content/lib/db-transformers.ts:50`) hace `from('locations').select('*')` y `locations` no tiene esos strings, solo los UUIDs.
- `getLocationHierarchy` en `src/shared/geography/hierarchy.ts:90` solo lee `enriched_data.datos_geograficos.admin_nivel_3`, que la mayoría de puntos no tiene.

## Solución (una sola fuente)

### 1. Vista canónica `v_locations_resolved`

Vista delgada en SQL, **`security_invoker = true`** para que la RLS de `locations` se aplique igual:

```sql
CREATE VIEW public.v_locations_resolved
WITH (security_invoker = true) AS
SELECT
  l.*,                              -- toda la fila tal cual
  co.name AS continent_resolved,
  cu.name AS country_resolved,
  rg.name AS region_resolved,
  zn.name AS zone_resolved,
  a3.name AS admin_level_3,         -- NUEVO accesible al cliente
  lc.name AS locality,              -- NUEVO
  sl.name AS sublocality            -- NUEVO
FROM public.locations l
LEFT JOIN public.admin_areas co ON co.id = l.continent_id
LEFT JOIN public.admin_areas cu ON cu.id = l.country_id
LEFT JOIN public.admin_areas rg ON rg.id = l.region_id
LEFT JOIN public.admin_areas zn ON zn.id = l.zone_id
LEFT JOIN public.admin_areas a3 ON a3.id = l.admin3_id
LEFT JOIN public.admin_areas lc ON lc.id = l.locality_id
LEFT JOIN public.admin_areas sl ON sl.id = l.sublocality_id;
```

`v_location_geo_health` se reescribe para apoyarse en esta vista, así **una sola JOIN canónica** sirve a todo:
- Back office sigue consultando `v_location_geo_health`.
- Filtro/cliente consulta `v_locations_resolved`.
- Si mañana necesitamos cualquier otro string admin (street, postal_locality, etc.) se añade aquí y aparece en TODAS las UIs sin migración de datos.

### 2. Cliente — un único cambio de origen

En `src/domains/content/lib/db-transformers.ts` el `fetchAllLocationsPaginated` apunta a `v_locations_resolved` en lugar de `locations`:

```ts
.from('v_locations_resolved' as any)   // mismas columnas + 3 extra
.select('*')
.is('deleted_at', null)
```

Y `dbLocationToGeoLocation` lee también `loc.admin_level_3 / locality / sublocality` y los pasa al objeto `GeoLocation`.

`useRealtimeLocations` sigue suscribiéndose a la **tabla** `locations` (el postgres_changes solo funciona sobre tablas). Cuando llega un INSERT/UPDATE, en vez de transformar la fila directamente, hace un `select('*').from('v_locations_resolved').eq('id', payload.new.id)` para enriquecer con los strings resueltos. Una sola lectura puntual por evento, sin duplicar lógica.

### 3. `getLocationHierarchy`

Una línea por nivel; lee de la vista, fallback a `enriched_data` para puntos antiguos sin FK:

```ts
admin_level_3: norm(loc.admin_level_3 ?? gd?.admin_nivel_3),
locality:      norm(loc.locality      ?? gd?.localidad),
sublocality:   norm(loc.sublocality   ?? gd?.sublocalidad),
```

### 4. Tipos

`GeoLocation` añade los 3 campos opcionales (`admin_level_3?`, `locality?`, `sublocality?`). Nada más cambia en componentes.

## Qué NO se toca

- Tabla `locations`: ningún `ALTER TABLE`, ningún trigger nuevo, ningún backfill de strings.
- `admin_areas`: igual.
- `resolve-admin-area`, `backfill-admin-fks`, `geocoding-job-tick`: igual. La vista refleja sus FKs en tiempo real.
- Back office "Geografía universal": sigue funcionando contra `v_location_geo_health`.
- Filtros, mapa, popups: solo reciben 3 strings nuevos en `GeoLocation`.

## Beneficio frente al plan anterior

| Aspecto | Plan A (cache duplicado) | Plan B (vista única, este) |
|---|---|---|
| Fuente de verdad | `admin_areas.name` + cache en `locations` | **Solo `admin_areas.name`** |
| Trigger | Extender `locations_sync_admin_cache` + 3 columnas | — |
| Backfill datos | Sí (~4 779 filas) | — |
| Riesgo de divergencia | Alto si trigger falla | **Cero**: la vista siempre refleja FKs |
| Coste lectura | 0 ms | ~5 LEFT JOIN, indexed PK lookup → marginal |
| Líneas de código tocadas | Migración + trigger + tipo + helper + select | Migración (vista) + select + tipo + helper |

## Verificación

1. `SELECT count(*) FILTER (WHERE admin_level_3 IS NOT NULL) FROM v_locations_resolved` ≈ 4 775.
2. UI: Galicia → A Coruña despliega Barbanza, Barcala, Bergantiños, Betanzos, Eume, Ferrol, Fisterra, Noia, Ortegal, Santiago, Tierra de Soneira, (sin comarca) — idéntico al back office.
3. Si el back office reclasifica una comarca, el filtro la ve **en cuanto recarga**, sin job de sync.
4. `count(padre) === sum(count(hijos))` en todos los niveles.