## Objetivo

Reorganizar la jerarquía geográfica para que respete los 17 niveles definidos, deduplicar admin_areas, y reasignar los puntos de los usuarios a los nodos canónicos.

## Fase 1 — Ampliar la taxonomía `place_types`

Añadir los niveles que faltan, manteniendo los actuales como aliases compatibles:

```
continent → country → region → province → admin_level_3 (comarca)
  → municipality → locality (city) → village → hamlet
  → sublocality (neighborhood) → street
```

Y los tipos no-administrativos (sin jerarquía padre, todos hijos de `locality`/`sublocality` o sin parent):
```
landform, road, airport, station, building, establishment, poi, unclassified
```

Cada `place_type` recibe `sort_admin_level` para poder ordenarlos.

## Fase 2 — Deduplicación de `admin_areas`

Pasada SQL idempotente que usa el helper existente `_merge_admin_area`:

1. **Países**: fusionar `España`→`Spain`, y cualquier país sin ISO con su gemelo ISO (regla: ganador = el que tiene `iso_code` no nulo).
2. **Regiones**: fusionar `Galicia` (sin ISO)→`Galicia` (ES-GA). Generalizable a todas las regiones con duplicados por nombre.
3. **Provincias mal clasificadas**: nodos tipo `region` con ISO `ES-PO`, `ES-LU`, `ES-C`, `ES-OR` (y resto de provincias españolas) → reclasificar a `province` y reparentarlos a `Galicia`/`Spain` según ISO 3166-2.
4. **Comarcas en slot `zone`**: las que tienen parent=Galicia y no son provincia → mantener como `admin_level_3` (comarca) pero reparentadas bajo su provincia correcta vía centroide (PostGIS-less: mediante tabla auxiliar de mapeo comarca→provincia que se siembra en la migración para España; otros países en fases siguientes).
5. **Ciudades como `zone`**: nodos tipo `zone` cuyo nombre coincide con un `locality` existente (Vigo, Lugo, Santiago, Ferrol, A Coruña…) → fusionar al `locality`.

## Fase 3 — Reescribir `resolve-admin-area`

Edge function:
- **Clave de unicidad** = `iso_code` cuando exista, si no `(parent_id, lower(name), type_id)`.
- **Nunca** crea un `zone` si ya existe el mismo nombre como `region`/`province`/`locality` bajo el mismo padre.
- Clasifica al `place_type` correcto a partir de `admin_level` OSM o `instanceOf` Wikidata.
- Devuelve los 8 FKs (`continent_id…sublocality_id`) consistentes con la jerarquía canónica.

## Fase 4 — Re-lanzar el job sobre tus puntos

Sobre los 4.747 puntos del usuario, marca `geo_resolved_at = NULL` para los que sigan apuntando a admin_areas eliminadas o reclasificadas, y deja que el job server-side existente (`geocoding-job-tick` + `backfill-admin-fks`) reasigne FKs a los nodos canónicos.

## Fase 5 — `GeographyTree` (frontend)

No cambia: ya consume `path`/`depth` de `admin_areas` vía el helper `getLocationHierarchy`. Solo verificamos que muestre todos los `place_types` nuevos en orden por `sort_admin_level`.

## Detalles técnicos

- Migración SQL única para Fase 1+2 (idempotente).
- Tabla auxiliar **temporal** `_es_comarca_provincia(comarca_name, provincia_iso)` con las ~50 comarcas gallegas + asturianas + catalanas + vascas para reparentar correctamente. Países adicionales en fases sucesivas (mismo patrón).
- `resolve-admin-area` queda con tests por país (España como referencia).
- El cron `geocoding-job-tick` ya está activo, no requiere cambios.
- Memoria `mem://database/canonical-admin-areas` se actualiza con la nueva estructura.

## Fuera de alcance (fases siguientes)

- Tipos no-administrativos para puntos sin clasificar (POI, building, road, airport, station): la migración los crea pero no reasigna puntos masivamente — eso lo hace el enriquecimiento natural.
- Reparentado de comarcas fuera de España: requiere fuente de mapeo equivalente.
- UI nueva en GeographyTree para los niveles añadidos.

## Archivos

- `supabase/migrations/<new>.sql` — Fase 1 + 2.
- `supabase/functions/resolve-admin-area/index.ts` — Fase 3.
- Re-deploy `geocoding-job-tick` (sin cambios de código, solo asegurar consistencia).
- `mem://database/canonical-admin-areas` — actualizar.

## Confirmación

¿Procedo con este plan en una sola tanda (España como caso piloto, resto de países en fases sucesivas)?
