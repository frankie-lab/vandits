# Normalización lingüística y territorial ISO 3166 / 639 / 19112

Objetivo: que todo punto (existente o recién importado) muestre su jerarquía geográfica en un único idioma coherente según el perfil del usuario, sobre una base canónica deduplicada por ISO.

## 1. Modelo de datos

**Migración SQL:**

- `profiles.language` (text, default `'es'`) y `profiles.language_fallback` (text, default `'en'`). ISO 639-1.
- `admin_areas`: añadir `confidence smallint`, asegurar `iso_code` (3166-1 α2) y `iso_code_alpha3` ya presentes; `centroid_lat/lng`, `timezone` ya presentes. Índice único parcial `(iso_code) WHERE iso_code IS NOT NULL AND type_id = country` y `(iso_code) WHERE type_id = region`.
- Nueva tabla `admin_area_names`:
  - `area_id uuid → admin_areas.id`
  - `language text` (ISO 639-1)
  - `name text`
  - `name_kind text` check in (`official`, `common`, `exonym`, `historical`, `alias`)
  - `source text`, `confidence smallint`
  - `UNIQUE (area_id, language, name_kind, name)`
  - RLS: lectura autenticados, escritura masters.
- Nueva tabla `place_types_i18n`: `(code, language, label)` para traducir tipos de lugar.
- Nueva tabla `location_geo_provenance`:
  - `location_id uuid`, `field_type text` (continent/country/region/zone/admin3/locality/sublocality/street)
  - `area_id uuid` (canónica resuelta), `original_value text`, `original_language text`
  - `normalized_value text`, `normalized_language text`
  - `source text`, `confidence smallint`, `resolved_at timestamptz`
  - `UNIQUE (location_id, field_type)`
  - RLS: lectura por dueño del location vía `can_view_location`, escritura masters/service.

## 2. Canonicalización one-shot del histórico

**Edge function `canonicalize-admin-areas`** (master only):

1. Detecta duplicados por `iso_code` (países y regiones).
2. Detecta duplicados por `(parent_id, normalize(name))` usando `unaccent + lower + strip("Estado de"|"Condado de"|"Región de"|...)`.
3. Elige canónica priorizando: tiene `iso_code` > nombre con tilde español > más antigua.
4. Llama `_merge_admin_area(orphan, canonical)` (ya existe) para re-puntar los 8 FKs en `locations`, fusionar hijos y borrar la orfana.
5. Mueve los nombres descartados a `admin_area_names` como `alias`.
6. Registra cada fusión en `place_merge_history`.

Refrescar cache de `locations` (continent/country/region/zone) al final con un UPDATE join a `admin_areas` por los 4 FKs principales.

## 3. Resolver endurecido

**`supabase/functions/resolve-admin-area/index.ts`:**

Orden estricto para cada nivel:
1. Si llega `iso_code` (país o región) → buscar fila canónica con ese ISO. Si existe, usarla y completar `iso_code` si estaba vacío.
2. Si no, buscar en `admin_area_names` (cualquier idioma/kind) por nombre normalizado + `parent_id` resuelto.
3. Si no, buscar en `aliases` o `name` normalizado de `admin_areas` con mismo `parent_id`.
4. Solo crea fila nueva si trae `iso_code` (países y regiones) o si es nivel local (zone/locality/sublocality) sin canónica equivalente en el mismo `parent_id`. Cualquier nombre extranjero adicional se inserta en `admin_area_names` (no como duplicado).

## 4. Pipeline de geocoding endurecido

**`supabase/functions/reverse-geocode/index.ts`:** capturar de Nominatim los `name:es`, `name:en`, `name:fr`, `name:de`, `name:it`, `name:pt`, `name:ca`, `name:gl`, `name:eu`, `ISO3166-1`, `ISO3166-2`, `timezone`, `postcode`. Devolver un `CanonicalGeo` con todos esos nombres por nivel.

**`supabase/functions/backfill-admin-fks/index.ts` (modo `reconcile`):** un punto cuenta como "needs update" si:
- algún FK apunta a fila no canónica (presente en `place_merge_history.source_place_id` o sin `iso_code` cuando debería tenerlo),
- `country_code/admin1_iso/timezone/raw_geocode/geo_resolved_at` están vacíos,
- los textos cache (`country/region/zone`) difieren del `name` de la canónica.

Cada nivel resuelto escribe/actualiza `location_geo_provenance` y, si hay `name:xx` nuevo, lo añade a `admin_area_names`.

**`geocoding-job-tick`:** sin cambios estructurales; reusa el `backfill-admin-fks` endurecido.

## 5. Importaciones nuevas

Sin cambios de orquestación. `processImportedDocument` sigue disparando geo-normalización en background. Los inserts a `locations` siguen pasando por `resolveAllFks()`, que internamente llama al `resolve-admin-area` endurecido. Resultado: cualquier KML/GPX/GeoJSON/CSV/manual/web nace con FKs canónicos y aporta sus `name:xx` a `admin_area_names`.

## 6. Capa de display

**Nuevo helper `src/shared/geography/display.ts`:**

```ts
buildLocationDisplay(loc, userLang, fallbackLang): {
  continent, country, region, zone, admin3, locality, sublocality
}
```

Para cada nivel: lee `admin_areas` + `admin_area_names` con prioridad `userLang` (`official` > `common`) → `fallbackLang` → `en` → `admin_areas.name`. Cachea por `area_id` en memoria del cliente.

`hierarchy.ts` y `canonical-names.ts` quedan como adaptadores delgados sobre `buildLocationDisplay` (no se borran para no romper imports).

## 7. UI

- `UserProfileEditor`: selector de idioma principal y fallback (ISO 639-1, lista corta inicial: es/en/fr/de/it/pt/ca/gl/eu).
- `GeographyTree`, `GeographyScopeTree`, `GeographyBackfillPanel`, popups, ficha completa: agrupar y etiquetar por `area_id` usando `buildLocationDisplay`. Sin strings sueltos.
- `GeographyBackfillPanel` mantiene su flujo (ya invoca `geocoding-job-tick`); solo cambia que, una vez ejecutada la canonicalización, los recuentos de "actualizados" reflejan FKs reapuntados o cache de texto refrescado.

## Archivos a tocar

- Migración SQL (perfil + 3 tablas nuevas + índices).
- `supabase/functions/canonicalize-admin-areas/index.ts` (nueva).
- `supabase/functions/resolve-admin-area/index.ts` (endurecido, multi-idioma).
- `supabase/functions/reverse-geocode/index.ts` (captura `name:xx`, ISO, TZ).
- `supabase/functions/backfill-admin-fks/index.ts` (criterio reconcile + provenance).
- `src/shared/geography/display.ts` (nuevo helper de UI).
- `src/shared/geography/hierarchy.ts`, `canonical-names.ts` (adaptadores).
- `src/components/admin/GeographyBackfillPanel.tsx` (botón "Canonicalizar catálogo" para masters).
- `src/components/admin/GeographyScopeTree.tsx`, `GeographyTree.tsx` (group by `area_id` + display helper).
- `src/components/profile/UserProfileEditor.tsx` (selector idioma).

## Orden de ejecución

1. Migración (perfil + tablas).
2. `canonicalize-admin-areas` + ejecutar one-shot.
3. `resolve-admin-area` endurecido + `reverse-geocode` enriquecido.
4. `backfill-admin-fks` con provenance + cache refresh.
5. `buildLocationDisplay` + migración de los 3 componentes de árbol/ficha.
6. Selector de idioma en perfil.
7. Verificación: re-ejecutar reconcile sobre los 76 puntos del usuario y comprobar `actualizados > 0`, árbol coherente en español, sin filas duplicadas en `admin_areas`.
