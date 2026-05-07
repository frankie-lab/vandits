# Cerrar los 835 puntos y blindar el origen

## Estado actual verificado en BD

- 5074 locations activas en total.
- 834 puntos recuperados con la migración anterior (ahora tienen `continent_id` correcto vía hierarquía canónica).
- **Queda 1 punto huérfano**: `The Inselbergs` → `country = "GF"`, `country_id` apunta a una fila huérfana `admin_areas.name = "GF"`, `depth = 0`, sin `parent_id`, sin `iso_code`.
- Causa: `GF` (Guayana Francesa) no estaba en el seed canónico de países y por eso la fusión recursiva no encontró pareja.

## Plan en 2 pasos

### 1. Ampliar el catálogo canónico de países (migración de datos)

Añadir como canónicos los países que faltaban en el primer seed, todos con `iso_code` + `aliases` y `parent_id` apuntando al continente correcto. Lista mínima detectada como necesaria:

- `GF` → "Guyane française" / "French Guiana" → parent: South America
- Barrido genérico: para cualquier fila `admin_areas` con `depth = 0`, `type = country`, `parent_id IS NULL` y `name` de exactamente 2 caracteres en mayúsculas (patrón ISO-2), intentar resolver vía tabla canónica ISO → si existe canónico, fusionar con `_merge_admin_area`; si no, crear el canónico mínimo (continent inferido por ISO).

Esto cubre `GF` y cualquier otro huérfano ISO que pueda haber quedado o entrar en el futuro por scraping.

### 2. Endurecer `resolve-admin-area` (edge function)

Sustituir el match por `ilike(name)` por una resolución determinista:

1. Si llega `country` con patrón ISO-2 (`/^[A-Z]{2}$/`): buscar por `iso_code`. Si existe canónico → usar ese row y propagar `parent_id` como `continent_id`.
2. Si llega `country` como nombre: buscar por `aliases @> ARRAY[lower(name)]`, fallback a `name ilike`.
3. Mismo patrón para `continent` (aliases ES/EN, M49 si llega).
4. **Nunca** crear una fila nueva si ya existe una canónica con ese `iso_code` o `alias`.
5. Si se crea una fila nueva (caso desconocido), forzar `parent_id` no nulo cuando el `type = country` (continente inferido o lanzar warning en logs).

Esto elimina el origen del bug: el scraper de Atlas Obscura (que envía `country: "FR"`) y el importador KML (que envía `country: "France"`) acabarán siempre en la misma fila canónica.

## Verificación post-cambios

```sql
-- Debe ser 0
SELECT COUNT(*) FROM locations 
WHERE country_id IS NOT NULL AND continent_id IS NULL AND deleted_at IS NULL;

-- Debe ser 0
SELECT COUNT(*) FROM admin_areas 
WHERE depth = 0 AND parent_id IS NULL 
  AND id IN (SELECT type_id FROM place_types WHERE code = 'country');
```

## Archivos a tocar

- `supabase/migrations/<ts>_seed_remaining_iso_countries.sql` — ampliación canónica + barrido genérico de huérfanos ISO-2.
- `supabase/functions/resolve-admin-area/index.ts` — resolución por `iso_code` / `aliases` con fallback, propagación automática de `parent_id` → `continent_id`.

Sin cambios de frontend. El trigger `locations_sync_admin_cache` resincroniza los strings cache automáticamente.  
  
  
antes de perder un punto, debes advertir de ello  
cada punto es oro en esta APP

&nbsp;