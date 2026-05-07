
## Causa raíz única (confirmada en BD)

Los **3 síntomas que reportas** son el mismo bug:

1. "Buscar y Filtrar" muestra 159/249 de Portugal → faltan 90.
2. La colección Atlas Obscura_Portugal dice "Sin localizar · 90" pero los puntos están dibujados sobre Portugal en el mapa.
3. Esos 90 puntos aparecen con color de colección en el mapa general, pero no en el filtro Geo.

**Confirmado por query**: los 90 puntos de la colección tienen `country_id = 67ed072b…` (PT) y `continent_id = NULL`. Y `admin_areas` tiene **dos filas para Portugal**:

| id | name | parent | uses |
|---|---|---|---|
| `67ed072b…` | **PT** | NULL (huérfano) | 90 puntos (los de la colección) |
| `cb47a8fd…` | **Portugal** | Europe | 159 puntos (los que sí ves) |

Mismo problema con `FR`/`France` (163 puntos perdidos) y `ES`/`Spain` (580 puntos perdidos). Total: **~835 puntos invisibles en el árbol y marcados como "Sin localizar"** porque cuelgan de un país huérfano sin continente.

### Por qué se generaron los duplicados

`resolve-admin-area` busca admin_areas por `ilike(name)` puro. Los dos pipelines de ingestión hablan idiomas distintos:
- **Scraper Atlas Obscura** → `country: "PT"` (ISO‑2), sin continente → crea fila "PT" huérfana.
- **Importador KML/Nominatim** → `country: "Portugal", continent: "Europe"` → encuentra/crea "Portugal" hijo de Europe.

Sin clave canónica (ISO) ni mapa de aliases, son dos filas distintas para el mismo país.

### Por qué "Sin localizar"

`getLocationHierarchy()` (frontend) lee la columna string `continent` para clasificar. Como esos 90 tienen `continent = NULL` (porque su country huérfano no tiene padre), caen en el bucket "Sin localizar". El mapa los pinta porque tienen lat/lng, pero el árbol no los agrupa.

---

## Plan — arreglar el origen, no parchear

### 1. Migración SQL única

**a) Schema canónico**
- Añadir `admin_areas.iso_code text` y `admin_areas.aliases text[]`.
- Índice único parcial `(type_id, iso_code) WHERE iso_code IS NOT NULL`.

**b) Seed canónico**
- 7 continentes con aliases ES/EN: `Europe ↔ Europa`, `Africa ↔ África`, `North America ↔ América del Norte`, etc.
- Países comunes con `iso_code` ISO‑3166‑alpha2 y aliases (`PT ↔ Portugal`, `FR ↔ France`, `ES ↔ Spain`, `GB ↔ United Kingdom`, `US ↔ United States`, `IT ↔ Italy`, etc.).

**c) Fusión genérica (one‑shot dentro de la misma migración)**
Para cada par detectado donde un `admin_areas` huérfano (depth=0, type=country, sin parent) coincide con la fila canónica por iso_code o alias:
1. `UPDATE locations SET country_id = canonical_id WHERE country_id = orphan_id`.
2. Idem para `continent_id` (rellenar desde el padre del canónico).
3. Re-parentear cualquier hijo del huérfano al canónico.
4. `DELETE` huérfano.

Idem para continentes duplicados (`Europa` → `Europe`, `África` → `Africa`).

El trigger `locations_sync_admin_cache` resincroniza los strings cache (`country`, `continent`) automáticamente al cambiar el FK. Cero cambios en frontend.

### 2. `resolve-admin-area` — blindar el origen

Cambiar la búsqueda de `ilike(name)` a:
1. Si input matchea un `iso_code` → resolver a la fila canónica.
2. Si input está en `aliases[]` de alguna fila → resolver a esa.
3. Si no, fallback al matching actual por nombre.

Para países con ISO‑2: si la fila canónica tiene `parent_id` definido, propagarlo automáticamente como `continent_id`. Esto cierra el bug en origen: futuros scrapes de Atlas Obscura ya no podrán crear "PT" huérfano.

### 3. Verificación post-migración

```sql
-- Debe ser 0
SELECT COUNT(*) FROM admin_areas a
JOIN place_types pt ON pt.id = a.type_id
WHERE pt.code = 'country' AND a.parent_id IS NULL;

-- Debe ser 0  
SELECT COUNT(*) FROM locations 
WHERE country_id IS NOT NULL AND continent_id IS NULL AND deleted_at IS NULL;
```

---

## Impacto

- **Cero código frontend tocado**. El árbol "Buscar y Filtrar", el contador "Sin localizar" de colecciones y el coloreado se arreglan solos al sincronizarse el string cache.
- **Cero cambios en `geo-normalizer`, `backfill-admin-fks` o el flujo de import**.
- **Bug cerrado en origen**: nuevos imports no podrán recrear duplicados.

## Archivos

```text
supabase/migrations/<ts>_canonical_admin_areas.sql   ← schema + seed + fusión + verificación
supabase/functions/resolve-admin-area/index.ts       ← lookup por iso_code y aliases
```

## Pregunta previa

¿Apruebo el plan tal cual o quieres que primero te muestre la lista completa de pares duplicados que la migración va a fusionar (para que valides cuáles son canónicos antes de tocar nada)?
