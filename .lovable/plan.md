# Paso intermedio: catálogo de tipos + áreas administrativas deduplicadas

Objetivo: dejar de duplicar strings (`country`, `region`, `zone`, `localidad`, …) en cada fila de `locations` y dejar de tratar `place_type` como texto libre. Sin reescribir la app: las columnas actuales se mantienen como **denormalización derivada** (cache) y el código sigue leyéndolas igual.

## Resultado para el usuario

- "Madrid" deja de existir 500 veces como string: existe **1 fila** en `admin_areas` y todas las demás filas la referencian por FK.
- Los tipos (`monument`, `restaurant`, `street`, …) son un catálogo navegable con jerarquía padre/hijo y categoría (`natural` / `administrative` / `urban` / `building` / `poi` / `business`).
- Queries jerárquicas baratas: "todos los puntos en Aragón" = `WHERE area_path @> ARRAY[aragon_id]` con índice GIN.
- La UI sigue funcionando sin cambios el día 1.

## Esquema nuevo

### 1. `place_types` (catálogo de tipos, jerárquico)

```text
id              uuid PK
code            text UNIQUE NOT NULL    -- 'country', 'restaurant', 'monument'
name            text NOT NULL
parent_type_id  uuid REFERENCES place_types(id)
category        text CHECK IN ('natural','administrative','urban','building','poi','business')
icon            text                    -- nombre Lucide
sort_order      int DEFAULT 0
is_active       bool DEFAULT true
```

Seed inicial: continent, country, region, zone, admin_level_3, locality, sublocality, street, building, monument, landform, establishment, restaurant, bar, cafe, hotel, museum, viewpoint, beach, mountain, waterfall (alineado con clasificación IA actual).

RLS: read-only para autenticados, gestión por master.

### 2. `admin_areas` (entidades administrativas deduplicadas)

```text
id              uuid PK
type_id         uuid NOT NULL REFERENCES place_types(id)
                -- solo tipos de category='administrative'
name            text NOT NULL
parent_id       uuid REFERENCES admin_areas(id)
                -- continent → country → region → zone → admin_level_3 → locality → sublocality
path            uuid[] NOT NULL          -- ancestros + propio id (materialized path)
depth           smallint NOT NULL        -- 0 continent, 1 country, ...
osm_id          bigint                   -- referencia OSM cuando se conozca
wikidata_id     text                     -- Q-id wikidata
centroid_lat    double precision
centroid_lng    double precision
created_at      timestamptz DEFAULT now()

UNIQUE (parent_id, name, type_id)
INDEX GIN (path)
```

`path` permite "todos los hijos de Aragón" sin recursión:
`SELECT * FROM admin_areas WHERE aragon_id = ANY(path) AND id <> aragon_id`.

### 3. Cambios en `locations`

```text
+ type_id         uuid REFERENCES place_types(id)        -- reemplaza place_type text
+ continent_id    uuid REFERENCES admin_areas(id)
+ country_id      uuid REFERENCES admin_areas(id)
+ region_id       uuid REFERENCES admin_areas(id)
+ zone_id         uuid REFERENCES admin_areas(id)
+ admin3_id       uuid REFERENCES admin_areas(id)
+ locality_id     uuid REFERENCES admin_areas(id)
+ sublocality_id  uuid REFERENCES admin_areas(id)
+ street_name     text   -- la calle no se deduplica como entidad (alto coste, bajo valor)

-- columnas existentes (continent/country/region/zone, place_type) se MANTIENEN
-- como cache denormalizado para no romper código actual.
```

Trigger `locations_sync_admin_cache` antes de INSERT/UPDATE: si `country_id` cambia, copiar `admin_areas.name` al string `country`. Idéntico para los otros niveles. Esto garantiza que las columnas planas siguen consistentes sin que el código cliente cambie.

Mismo tratamiento para tabla `places` (V2) cuando empiece a usarse.

### 4. Helper de resolución (edge function `resolve-admin-area`)

Input: `{ continent, country, region, zone, admin3, locality, sublocality }` (cualquier subset).
Lógica: buscar/crear cada nivel `(parent_id, name, type_id)` con `INSERT ... ON CONFLICT DO NOTHING RETURNING id`. Devuelve los UUIDs de cada nivel.

Lo usan: importadores (KML/GPX/CSV), `enrich-location` (cuando Nominatim devuelve la cadena administrativa), backfill.

## Migración de datos (script idempotente, una sola vez)

```text
1. Insertar place_types seed.
2. Para cada combinación distinta (continent) en locations → upsert admin_areas.
3. Para cada (continent, country) → upsert con parent_id correcto.
4. Repetir nivel a nivel hasta sublocalidad. Lee `enriched_data.datos_geograficos.admin_nivel_*`.
5. UPDATE locations SET continent_id=…, country_id=…, … via JOIN por nombre+parent.
6. UPDATE locations SET type_id = (SELECT id FROM place_types WHERE code = locations.place_type).
   Fallback: si no matchea, type_id = id de 'unknown'.
7. UPDATE locations SET street_name = enriched_data.datos_geograficos.calle.
8. Validar: SELECT COUNT(*) FROM locations WHERE country IS NOT NULL AND country_id IS NULL.
```

Ejecutable en lote (2.452 filas → segundos). Idempotente: re-ejecutar no duplica.

## Cambios mínimos en código

Día 1, **no se rompe nada**: las columnas planas siguen poblándose por trigger.

Día 2+, oportunista (no bloqueante):

- `getLocationHierarchy` (en `src/shared/geography/hierarchy.ts`) puede opcionalmente leer de `admin_areas` vía join. No urgente.
- `enrich-location` edge function: tras resolver Nominatim, llamar a `resolve-admin-area` y guardar los `*_id` en lugar de strings sueltos. Los strings se llenan por trigger.
- Importadores: igual, llaman a `resolve-admin-area` con la cadena administrativa parseada.
- Filtros jerárquicos (`GeographyTree.tsx`): pueden migrar a leer `admin_areas` (un fetch único de todo el árbol con `path`) en vez de agregar strings de `locations`. Mejora rendimiento.
- Admin UI nueva: gestión de `place_types` (CRUD) + viewer de `admin_areas` (read-only excepto merge de duplicados).

## Ventajas concretas

- Filtro "todos los puntos en España" es 1 query con índice, no agregación de strings.
- Renombrar "Castilla y León" → "Castilla-León" se hace en 1 fila, no en N.
- Detectar duplicados administrativos (typos: "Madrid" / "MADRID" / "Madrid ") es trivial: aparecen como filas distintas en `admin_areas` y se mergean.
- Tipos navegables: `place_types` con `parent_type_id` permite UI de filtros tipo árbol (todos los `business` → bar/restaurant/cafe/…).
- Base preparada para crecer al modelo completo (place_relation, address) sin tirar nada.

## Lo que NO hacemos en este paso

- No tocar `route_waypoints`, `location_notes`, `location_photos`, `collection_items` (siguen apuntando a `locations.id`).
- No crear `place_relation`, `address`, `establishment`. Si más adelante se necesitan, se añaden encima.
- No deduplicar calles como entidades (`street_name` queda como string en `locations`). Coste alto, valor bajo: hay decenas de miles de calles únicas, raramente compartidas.
- No tocar la tabla V2 `places` (vacía hoy).

## Detalles técnicos clave

- **`path` materializado**: trigger que lo recalcula cuando cambia `parent_id`. Garantiza queries `@>` consistentes.
- **Unicidad**: `UNIQUE (parent_id, name, type_id)` previene duplicados al hacer upsert concurrente.
- **NULL en `parent_id`**: solo continentes (depth=0). Constraint `CHECK (depth = 0) = (parent_id IS NULL)`.
- **RLS**: `admin_areas` y `place_types` son read-only para autenticados; gestión solo master. No hay owner.
- **Trigger sync**: lee `admin_areas.name` y lo copia a `locations.continent/country/region/zone`. Si en el futuro queremos quitar esas columnas, basta eliminar el trigger y refactorizar lectores.
- **Índices**: `locations(country_id)`, `locations(region_id)`, `locations(locality_id)`, `admin_areas USING GIN (path)`.

## Estimación

| Fase | Tiempo |
|---|---|
| Migración SQL (tablas + índices + trigger sync + trigger path) | 0.5 día |
| Seed `place_types` + ADR breve | 0.25 día |
| Edge function `resolve-admin-area` | 0.5 día |
| Script de backfill + validación | 0.5 día |
| Integración en `enrich-location` e importadores | 1 día |
| Refactor opcional de `GeographyTree` para leer del árbol nuevo | 0.5 día |
| QA, índices afinados, observabilidad | 0.5 día |
| **Total** | **~3.5 días** |

## Plan de ejecución por pasos

1. Crear migración con `place_types`, `admin_areas`, columnas FK en `locations`, triggers, índices, RLS.
2. Insertar seed de `place_types`.
3. Desplegar edge function `resolve-admin-area`.
4. Ejecutar script de backfill (insertar áreas + actualizar FKs en `locations`).
5. Conectar importadores y `enrich-location` al resolver. Nuevos puntos ya nacen con FKs.
6. (Opcional) Migrar `GeographyTree` a leer `admin_areas`.
7. Actualizar memoria del proyecto: nueva regla "toda jerarquía geográfica nueva pasa por `resolve-admin-area`; columnas planas en `locations` son cache derivado".

¿Apruebas que prepare la migración SQL + script de backfill como primer paso?
