# Árbol geográfico canónico — global, para todos los POIs

## Estado actual (medido en BD)

```
admin_areas por tipo:
  region          4.081   ← inflado: muchos son en realidad provincias
  zone            1.443   ← mezcla provincias + comarcas
  locality        6.203
  admin_level_3   2.001
  sublocality     2.001
  country           272
  continent           8
  province            4   ← solo Galicia (parche previo)
```

Ejemplos del problema (debería haber 1 capa "región" + 1 capa "provincia", pero todo está aplastado en `region`):

- Reino Unido: 238 "regiones" (debería ser 4 naciones + condados)
- Francia: 146 "regiones" (debería ser 18 régions + 101 départements)
- Italia: 128 "regiones" (debería ser 20 + 107 province)
- España (antes del parche): 51 "zonas" en Galicia siendo 4 provincias reales

Causa raíz: el resolver textual mete cualquier nivel administrativo que devuelva Nominatim en el slot que toque por orden de aparición, sin verificar la jerarquía ISO 3166-2.

## Objetivo

Una sola jerarquía canónica, **idéntica donde sea que se muestre** (mapa, filtros, admin, popup, sidebar):

```
Planeta
└── Continente            (continent_id)
    └── País              (country_id,  ISO 3166-1 α2)
        └── Región        (region_id,   ISO 3166-2 nivel 1 — state/CCAA/nation)
            └── Provincia (zone_id,     ISO 3166-2 nivel 2 — province/county/department)
                └── Comarca   (admin3_id)
                    └── Municipio   (locality_id)
                        └── Distrito (sublocality_id)
```

## Plan de ejecución

### 1. Catálogo cerrado ISO 3166 (semilla global)

Edge function nueva `seed-iso-3166` que carga desde un JSON empaquetado:

- ISO 3166-1: 249 países con `iso_code` (α2), continente padre, nombre EN/ES/local.
- ISO 3166-2: ~5.000 subdivisiones con `iso_code` (`ES-GA`, `ES-C`, `FR-IDF`, `FR-75`...), `parent_country`, `level` (1=region, 2=province), nombre canónico + aliases.

Inserta/actualiza en `admin_areas` haciendo **upsert por iso_code**. No borra nada todavía.

### 2. Reclasificación masiva por ISO

Migración `reclassify-admin-areas-by-iso`:

```sql
-- Nodos con iso_code de nivel 1 → region
-- Nodos con iso_code de nivel 2 → province (slot zone_id)
-- Nodos sin iso_code y type='region' bajo un país que ya tiene regiones ISO 
--   → degradar a province o admin_level_3 según firma de raw_geocode
```

Usa `_reclassify_admin_area` y `_merge_admin_area` (ya existen) para fusionar twins.

### 3. Re-slot de locations por proximidad jerárquica

Para cada `location` con `raw_geocode`:

```
country_id   ← match por ISO α2 (raw_geocode.address.country_code)
region_id    ← match por ISO 3166-2 si existe, si no por nombre+parent
zone_id      ← match nivel 2 ISO o nombre Nominatim "county/state_district/province"
admin3_id    ← Nominatim "municipality/admin_level_6" si distinto a county
locality_id  ← city/town/village
sublocality_id ← suburb/neighbourhood
```

Implementación: edge function `recanonicalize-locations` por lotes (1000 puntos), encolada vía `geocoding_jobs` para que corra server-side (ya tenemos pg_cron `geocoding-job-tick`).

### 4. Resolver `resolve-admin-area` actualizado

Ya migrado para `province`. Añadir:
- Para cualquier país, primero busca por `iso_code`, después por `(parent_id, name)`.
- Si Nominatim devuelve `admin_level=4` → slot region; `admin_level=6` → slot province; `admin_level=8` → admin3/locality según `place_type`.
- Si no hay match en catálogo cerrado → devuelve `null` (no crea nodos huérfanos).

### 5. UI — un solo árbol, en todas partes

Helper único `getLocationHierarchy()` (ya existe) ya cubre los 8 niveles. Verificar consumidores:

- `GeographyTree` (filtros)
- `GeographyScopeTree` (admin)
- `LocationCard` / popup
- Sidebar de documento

Ningún componente puede inventarse su propio orden ni saltarse niveles.

### 6. Validación

- Vista `v_geo_coverage` ampliada con `province_count` por país.
- Test manual: Reino Unido → 4 regiones (England, Scotland, Wales, NI) + N condados como `province`. Francia → 18 régions + 101 départements. España → 17 CCAA + 50 provincias.
- Volver a importar el mismo KML → cero nuevos `admin_areas`.

## Archivos afectados

- `supabase/functions/seed-iso-3166/index.ts` (nuevo)
- `supabase/functions/recanonicalize-locations/index.ts` (nuevo)
- `supabase/functions/resolve-admin-area/index.ts` (extender)
- migración SQL (reclasificación masiva + vistas)
- `src/shared/geography/hierarchy.ts` (verificar)
- `mem://geography/canonical-tree-spec` (actualizar a global)

## Notas

- ISO 3166-2 cubre el 95% de países. Para el 5% restante (sin subdivisiones publicadas) caemos a GeoNames admin1/admin2 como fallback.
- El proceso de re-slot es **idempotente**: se puede correr varias veces sin duplicar.
- Mientras corre el job, los puntos siguen consultables. La UI muestra "normalizando" en el badge de cada documento.

¿Procedo con la implementación en este orden, o prefieres que primero ejecute solo el paso 1+2 (catálogo + reclasificación) sin tocar locations todavía, para validar los conteos antes del re-slot masivo?
