## Objetivo

Permitir desde `GeographyBackfillPanel` acotar el backfill por:
1. **Cascada admin** (Continente → País → Región → Zona) usando `admin_areas`.
2. **Lista accionable de POIs** que caen en ese scope, con checkbox por fila para procesar solo los marcados.

Sin tocar lógica de enriquecimiento, mapa ni otros paneles. Cambio transversal al pipeline existente (`geocoding_jobs` → `geocoding-job-tick` → `backfill-admin-fks`).

## UX (en el panel actual)

Bajo "Cobertura" y antes de "Modo", nueva sección **"Ámbito"**:

```text
Ámbito
[Continente ▾] [País ▾] [Región ▾] [Zona ▾]   [Limpiar]
─────────────────────────────────────────────
Puntos en ámbito: 1.234        [Seleccionar todos] [Ninguno]
┌──────────────────────────────────────────┐
│ ☐  Nombre POI         · País · Región    │  ← virtualizada
│ ☐  ...                                   │
└──────────────────────────────────────────┘
Seleccionados: 87
```

Botón inferior cambia dinámicamente:
- 0 selección + ámbito vacío → "Lanzar (todos mis puntos)"
- ámbito activo, 0 marcados → "Lanzar sobre ámbito (1.234)"
- N marcados → "Lanzar sobre selección (N)"

## Implementación

### 1. Frontend (`GeographyBackfillPanel.tsx`)

- 4 `<Select>` en cascada. Cada uno consulta `admin_areas` filtrando por `parent_id` del nivel superior y por `type_id` del nivel correspondiente (resuelto vía `place_types.code` = continent/country/region/zone). Al cambiar un nivel superior se resetean los inferiores.
- Query de POIs: `locations` con `eq('owner_user_id', uid)`, `is('deleted_at', null)` y FK del nivel más profundo seleccionado (`continent_id` / `country_id` / `region_id` / `zone_id`). Paginada (50 inicial + scroll virtualizado con la lib que ya usa la app — ver `Document view tabs` mem).
- Estado local `selectedIds: Set<string>`. Checkboxes por fila + cabecera "Seleccionar todos / Ninguno".
- Botón único `handleStart` resuelve modo:
  - Si hay `selectedIds.size > 0` → manda `location_ids: Array.from(selectedIds)`.
  - Si no, mantiene comportamiento actual con `scope_filter` por FK admin.

### 2. Store (`stores/geocoding-job-store.ts`)

Extender `GeocodingScope`:
```ts
locationIds?: string[];           // selección explícita de POIs
adminScope?: {
  continentId?: string;
  countryId?: string;
  regionId?: string;
  zoneId?: string;
};
```
Persistir ambos en columnas nuevas del job: `location_ids uuid[]`, `admin_scope jsonb`. Reflejar en `applyRow`.

### 3. Migración SQL

```sql
ALTER TABLE public.geocoding_jobs
  ADD COLUMN IF NOT EXISTS location_ids uuid[],
  ADD COLUMN IF NOT EXISTS admin_scope jsonb;
```
Sin cambios de RLS (ya filtra por `user_id`).

### 4. Edge `geocoding-job-tick`

Pasar `location_ids` y `admin_scope` al body de `backfill-admin-fks` cuando estén presentes. También usarlos para calcular `total_in_scope` en la primera tick.

### 5. Edge `backfill-admin-fks`

Aceptar nuevos parámetros en body:
- `location_ids?: string[]` → si viene, sustituye TODA la selección por `.in('id', location_ids)`.
- `admin_scope?: { continent_id, country_id, region_id, zone_id }` → aplicar `eq()` por cada FK no nula (la más profunda implica las superiores, pero aplicar todas es inocuo y robusto si la jerarquía no estuviera completa).

Ambos se aplican antes del filtro de `mode === 'fill'` (que sigue añadiendo el OR de huecos).

Conteo total (líneas 220-232) replica los mismos filtros para que la barra de progreso refleje el ámbito real.

## Detalles técnicos

- **Cascada admin**: respeta lo que ya hay en mem `Geographic catalog` y `Canonical admin areas`. Lookups por `type_id` resueltos contra `place_types` (cacheados al montar el panel).
- **POIs sin FK**: si el usuario elige solo "Continente = Europa" y un POI no tiene `continent_id`, no aparece. Es correcto (esos puntos se cubren con "Lanzar todos" o modo `fill`).
- **Lista virtualizada**: reutilizar el patrón de `Document view tabs` (paginación 1000) — en este panel basta con 200 visibles + "Cargar más" para no inflar.
- **Persistencia entre sesiones**: NO. La selección es efímera; el job ya queda registrado en `geocoding_jobs.location_ids`.

## Out of scope

- Selectores por debajo de `zone` (admin3/locality/sublocality/street) — la cascada se queda en 4 niveles como pediste.
- Cambios en `EnrichmentCriteriaConfig`, `GeographyTree`, `Documents panel`.
- Cambios en `mode` (fill/reconcile/overwrite siguen igual).
- No se reintroducen botones "Geocodificar" en otros paneles (norma transversal vigente).

## Verificación

1. Elegir España → Galicia → ver lista de POIs, marcar 5, lanzar `reconcile`. Ver job con `location_ids` correctos y barra de progreso = 5.
2. Elegir solo Europa, sin selección → "Lanzar sobre ámbito (N)". Comprobar que `backfill-admin-fks` filtra por `continent_id`.
3. Sin scope ni selección → comportamiento actual intacto.
