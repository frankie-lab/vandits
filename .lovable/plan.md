## Diagnóstico

El árbol está roto porque **el modelo no distingue provincia de comarca**. El resolver actual mete A Coruña, Pontevedra, Lugo, Ourense (provincias ISO 3166-2) en el mismo nivel `zone` que las 47 comarcas gallegas. Y como entra por **texto libre** (Nominatim devuelve `county` para unas cosas y `state_district` para otras), cada importación añade duplicados (`A Coruña` / `La Coruña` / `Coruña, A`).

Galicia tiene **4** provincias. Hoy hay **51 hijos `zone`**. Eso lo prueba.

Además el resolver es **textual**: si el nombre llega distinto del canónico, crea un nodo nuevo en vez de reusar. No hay verificación geométrica (point-in-polygon) contra un catálogo cerrado.

## Objetivo

Árbol canónico **fijo**, con un slot por nivel, sembrado desde estándares oficiales y resuelto por **coordenadas** (no por nombre).

```
L0 Planeta
L1 Continente            ← UN M.49 (7 + Antártida)
L2 País                  ← ISO 3166-1 alpha-2
L3 Región                ← ISO 3166-2 nivel 1 (Galicia, California, Île-de-France)
L4 Provincia             ← ISO 3166-2 nivel 2 / NUTS-3 / GADM-2 (A Coruña, Pontevedra)
L5 Comarca/Condado       ← GADM-3 / GeoNames admin3 (Barbanza, Bergantiños)
L6 Municipio             ← GeoNames admin4 / GADM-4 (Santiago de Compostela)
L7 Distrito/Parroquia    ← GeoNames admin5 / OSM admin_level=10
L8 Calle/Zona            ← OSM highway / addr:street
L9 Edificio/Vivienda     ← OSM building / addr:housenumber
```

## Cambios

### 1. Catálogo cerrado (admin_areas) sembrado desde fuentes oficiales

- **L1 Continentes**: 8 filas fijas con `m49_code` y aliases multiidioma. Ya existe.
- **L2 Países**: ISO 3166-1 (alpha-2 + alpha-3 + M.49 + nombres oficiales en es/en/fr). Ya existe parcialmente; completar a 249.
- **L3 Regiones**: ISO 3166-2 completo (~5 000 filas), con `iso_code` (`ES-GA`, `US-CA`), aliases y centroides.
- **L4 Provincias**: ISO 3166-2 nivel 2 donde exista (España, Italia, Francia, Japón…) + GADM-2 como respaldo. Cada fila lleva `iso_code` (`ES-C`, `ES-PO`) y aliases (`A Coruña`, `La Coruña`, `Coruña`, `Corunha`).
- **L5–L7**: GeoNames admin3/admin4/admin5 con `geonames_id` como clave única.
- **L8–L9** se quedan en `locations` (no son admin_areas).

Seed reproducible vía edge functions `seed-iso-geography` (ya existe; ampliar) + nueva `seed-gadm-geonames`.

### 2. Resolución determinista por coordenadas (no por texto)

Nueva edge function **`resolve-geography-by-coords`** que reemplaza el flujo Nominatim → resolve-admin-area:

1. Llama a Nominatim/Photon SOLO para obtener candidatos textuales por nivel.
2. Llama a **GeoNames findNearbyPlaceName + admin1/2/3** para obtener `geonames_id` por nivel (clave dura).
3. Resuelve cada nivel contra `admin_areas` por **clave dura** en este orden:
   - `geonames_id` → match exacto
   - `iso_code` → match exacto (cuando aplique)
   - `(parent_id, lower(name) ∈ aliases ∪ name)` → match
   - **Si no hay match: NO se crea nada nuevo**. Se devuelve `null` y se registra en `location_geo_provenance` como `unresolved`. El catálogo es cerrado.
4. Devuelve los 7 FKs garantizando coherencia padre-hijo (rechaza la cadena si rompe el árbol).

El cliente ya no inserta admin_areas. La creación de nodos nuevos solo ocurre vía seed scripts auditados.

### 3. Migración de saneo (one-shot)

Edge function `canonicalize-admin-areas` reescrita:

1. **Reclasifica L4**: para cada hijo de Galicia/Andalucía/etc., si su nombre coincide con un código ISO 3166-2 de provincia, mueve el `type_id` a `province` y conserva el id.
2. **Fusiona duplicados**: A Coruña ← La Coruña ← Coruña, A. Usa `_merge_admin_area` ya existente.
3. **Re-parenta comarcas**: para cada comarca hija de Galicia, calcula su provincia real por **point-in-polygon** sobre los centroides de sus localizaciones, y la cuelga de la provincia correcta.
4. **Re-resuelve `locations`**: para cada punto con coordenadas, llama a `resolve-geography-by-coords` y reescribe los 7 FKs. Lo que no resuelva queda en `partial`/`broken` y aparece en el panel admin.
5. Dedupe final con `_collapse_admin_duplicates` por nivel.

### 4. Schema

Añadir tipo `province` a `place_types` (entre `region` y `zone`). Renombrar `zone`→`comarca` semánticamente (mantener code para no romper FKs) y reusar la FK existente `zone_id` como **provincia**, y `admin3_id` como **comarca**. Es un mapping limpio sin migración de columnas:

| Columna locations | Antes        | Después   |
| ----------------- | ------------ | --------- |
| continent_id      | continente   | continente |
| country_id        | país         | país       |
| region_id         | región       | región     |
| **zone_id**       | zona/comarca | **provincia** |
| **admin3_id**     | nivel 3      | **comarca**   |
| locality_id       | localidad    | municipio  |
| sublocality_id    | barrio       | distrito/parroquia |

UI/labels y memoria geo se actualizan en consecuencia.

### 5. Validación dura

- Constraint funcional: `country_id.parent_id = continent_id`, `region_id.parent_id = country_id`, etc. Ya existe la vista `v_location_geo_health`; se amplía para reportar **slot mismatch** (un nodo `comarca` colgando como hijo directo de `region`).
- Job nocturno `pg_cron` que ejecuta `_collapse_admin_duplicates` por cada parent_id y reporta delta.

## Detalle técnico

- Nuevas tablas no se necesitan; se reusa `admin_areas`.
- `place_types`: insertar `province` con `sort_admin_level=4`, mover `zone` a `5`, `admin_level_3` a `6`.
- `resolve-admin-area` queda **deprecada** (solo lectura de catálogo); todos los callers migran a `resolve-geography-by-coords`.
- `enrich-location.ts`, `saveDocumentToDatabase`, `backfill-admin-fks`, `geocoding-job-tick`: pasan a usar el nuevo resolver.
- Front-end: `GeographyTree`, `GeographyScopeTree`, filtros y panel admin ganan un nivel "Provincia" entre Región y Comarca.

## Plan de ejecución

1. Migración schema + seed ISO 3166-2 completo.
2. `resolve-geography-by-coords` + tests con coordenadas conocidas (Santiago, Vigo, Lugo capital, Pontevedra capital, una comarca).
3. Reescribir `canonicalize-admin-areas` y correrlo en background.
4. Migrar callers al nuevo resolver. Marcar `resolve-admin-area` como deprecated.
5. Re-correr backfill sobre todas las `locations` del usuario.
6. Verificar en UI que Galicia tiene exactamente 4 provincias y que sus comarcas cuelgan de la provincia correcta.

## Aceptación

- `SELECT count(*) FROM admin_areas WHERE parent_id = (SELECT id FROM admin_areas WHERE name='Galicia') AND type_id=(SELECT id FROM place_types WHERE code='province')` = **4**.
- Cualquier punto en Santiago tiene cadena `Europa → España → Galicia → A Coruña → Santiago (comarca) → Santiago de Compostela`.
- El árbol del filtro y el del admin son idénticos en orden y estructura.
- Importar el mismo KML dos veces no crea ningún `admin_areas` nuevo.