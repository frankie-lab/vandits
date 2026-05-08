## Objetivo

Hacer que el panel **"Geografía universal"** (Rellenar / Reconciliar / Reescribir) produzca la jerarquía correcta para cualquier punto del mundo — sin scripts ad-hoc por país. Cero código España/Galicia. Toda la lógica vive en el motor que el panel ya invoca.

## Diagnóstico (universal)

El panel y el job server-side ya funcionan. Lo que falla es el motor que invocan:

1. **`reverse-geocode` ignora `osm_admin_level`**. Nominatim devuelve `address.state/county/municipality/city/...` pero los volcamos a slots fijos sin mirar el nivel administrativo real. Resultado: provincias, condados, comarcas y municipios caen todos en `zone`.
2. **`resolve-admin-area` no reclasifica entre niveles**. Si el mismo nombre (Galicia, Île-de-France, Tokyo, California…) llega una vez como `region` y otra como `zone`, crea duplicados en lugar de fusionar al nodo canónico.
3. **`backfill-admin-fks` modo `fill`** tiene un fast-path que solo rellena `continent_id` desde `country.path` y se salta el resto — los puntos legacy nunca completan jerarquía.
4. **`place_types` ya tiene los niveles extendidos** (Phase 1 añadió `province`, `municipality`, `village`, `hamlet`, etc.), pero el resolver solo emite los 7 legacy.

## Cambios (todos detrás del panel — el panel NO se toca)

### 1. `supabase/functions/_shared/geo-normalizer.ts`
- Extender `CanonicalGeo` con un mapa `admin_levels: Record<'2'|'4'|'6'|'7'|'8'|'9'|'10', { name; type?; iso? }>` y poblarlo desde el `address` de Nominatim.
- Mantener los slots derivados (`region/zone/admin3/locality/sublocality`) como vista compatibilidad para el resto del código.

### 2. `supabase/functions/_shared/reverse-geocode.ts`
- Pedir `extratags=1&namedetails=1`.
- Mapear el `admin_level` OSM a slots canónicos (regla universal):
  - `4` → `region`        (estado/comunidad/región)
  - `6` → `zone`          (provincia/condado/département/prefecture)
  - `7` → `admin3`        (comarca/arrondissement/distrito)
  - `8` → `locality`      (municipio/ciudad/pueblo)
  - `10` → `sublocality`  (barrio)
- Conservar el dato local en `*_type` (`province`, `condado`, `comarca`, `arrondissement`…) para escribirlo en `admin_type_local`.

### 3. `supabase/functions/resolve-admin-area/index.ts`
- **Clave de unicidad** por nivel: `iso_code` cuando exista; si no, `(parent_id, lower(name), type_id)`.
- **Anti-duplicado entre niveles**: antes de insertar, buscar el mismo nombre bajo el mismo padre con cualquier `type_id`; si existe en otro nivel y el nuevo es más específico, ejecutar `_reclassify_admin_area` (helper SQL ya existe) en lugar de duplicar.
- Aceptar `place_type` derivado del meta (`region | province | municipality | village | hamlet | sublocality | …`) y elegir el `type_id` real, no el del LEVELS[i] hardcodeado.
- Escribir `admin_type_local` con el tipo OSM/local cuando venga.

### 4. `supabase/functions/backfill-admin-fks/index.ts`
- Eliminar el fast-path de `mode='fill'` (líneas 142-161): que `fill` recorra la misma ruta canónica que `reconcile`/`overwrite` cuando falte cualquier FK alto. Lógica única.
- Pasar al resolver el meta con `osm_admin_level` y `place_type` por nivel.

### 5. Migración SQL (estructural — sin datos país-específicos)
- Índice único parcial `UNIQUE (type_id, parent_id, lower(name)) WHERE iso_code IS NULL` sobre `admin_areas` para impedir duplicados futuros.
- Índice GIN sobre `aliases` (acelera el lookup del resolver).
- `_collapse_admin_duplicates(_parent_id uuid)` que recorre hijos y aplica `_merge_admin_area` / `_reclassify_admin_area` a colisiones nombre+padre. Lo invoca el resolver al detectar reclasificación.

## Flujo final desde el panel (UI sin cambios)

1. Usuario elige modo y pulsa "Lanzar".
2. `geocoding-job-store` inserta en `geocoding_jobs` (ya hace esto).
3. `pg_cron` dispara `geocoding-job-tick` cada minuto (ya configurado).
4. Tick procesa lotes invocando `backfill-admin-fks`.
5. Cada punto: reverse-geocode → mapeo OSM `admin_level` → resolver clasifica al `place_type` correcto → 8 FKs canónicos → fusiones automáticas si detecta colisión nombre+padre en otro nivel.
6. Job sigue aunque cierre el navegador. Al terminar, `v_geo_coverage` y `GeographyTree` reflejan la cascada real para cualquier país.

## Detalles técnicos

```text
admin_areas (estructura existente, sin cambios)
  ├─ continent  (sin parent)
  ├─ country     iso_code = ISO 3166-1 α2/α3
  ├─ region      iso_code = ISO 3166-2          (admin_level=4)
  ├─ zone        provincia/condado/préfecture   (admin_level=6)
  ├─ admin3      comarca/arrondissement         (admin_level=7)
  ├─ locality    municipio/ciudad               (admin_level=8)
  └─ sublocality barrio                          (admin_level=10)
```

`place_types` ya contiene los códigos extendidos. Los slots de FK en `locations` no cambian.

## Verificación tras el cambio

1. Lanzar `Reconciliar` desde el panel.
2. `v_geo_coverage`: `with_admin1` sube y aparecen valores en niveles `zone`/`admin3`.
3. `SELECT name, parent_id, count(*) FROM admin_areas GROUP BY 1,2 HAVING count(*)>1` → cero filas.
4. Abrir `GeographyTree` y comprobar la cascada en puntos de varios países (España, Francia, Japón, US) — todos siguen la regla OSM `admin_level`.

## Fuera de alcance

- Tocar UI del panel (ya está bien).
- Scripts ad-hoc para España/Galicia o cualquier país.
- Tipos no-administrativos (POI/landform/airport…): los resuelve `enrich-location` por separado.
- Cambios en `GeographyTree` (consume `path`/`depth`, queda automático).
