# T1-fix — `*_resolved` como SoT textual cliente (patch)

Refs: `docs/audits/t1-zone-text-null-with-zone-id-dry-run.md`, `docs/contracts/territorial-equivalence-canon.md`.

## Cambios

### 1. `src/types/location.ts` — `GeoLocation`

Añadir campos opcionales (puramente aditivos, no breaking):

- `continentResolved?: string`
- `countryResolved?: string`
- `regionResolved?: string`
- `zoneResolved?: string`
- `admin3Resolved?: string`
- `localityResolved?: string`

JSDoc señalando que `continent`/`country`/`region`/`zone`/`comarca`/`localidad` son **cache textual legacy** y que `*Resolved` (derivado de FK → `admin_areas.name` vía `v_locations_resolved`) es la fuente textual canónica.

### 2. `src/domains/content/lib/db-transformers.ts`

Dentro de `dbLocationToGeoLocation`:

- Poblar los seis `*Resolved` desde `loc.*_resolved` directos (sin fallback — `undefined` si la vista no los trae).
- Mantener `continent/country/region/zone` con `*_resolved || legacy` (ya existe).
- Añadir mismo patrón a `comarca` (`loc.admin3_resolved || loc.admin_level_3`) y `localidad` (`loc.locality_resolved || loc.locality`).

### 3. `src/shared/geography/hierarchy.ts`

En `getLocationHierarchy`, orden canónico por nivel:

1. `loc.*Resolved` (FK SoT)
2. legacy text (`loc.region`, `loc.zone`, `loc.comarca`, `loc.localidad`, `loc.country`, `loc.continent`, `loc.sublocalidad`)
3. `enriched_data.datos_geograficos.*` (fallback)

Niveles tratados: `continent`, `country`, `region`, `zone`, `admin_level_3`, `locality`. `sublocality` y `street` no cambian (no hay `*Resolved`).

`getFilledLocationHierarchy` no requiere cambios (delega en `getLocationHierarchy`).

### 4. Tests (Vitest)

`**src/test/db-transformers.test.ts**` (extender) — caso `{ zone_id: 'x', zone_resolved: 'Barcelona', zone: null }`:

- `result.zone === 'Barcelona'`
- `result.zoneResolved === 'Barcelona'`
- Mismo patrón para `region`, `admin3`, `locality`.

`**src/test/geography-hierarchy-resolved.test.ts**` (nuevo):

- Sólo `zoneResolved` → hierarchy.zone correcto.
- `zoneResolved` + legacy `zone` diferentes → gana `zoneResolved`.
- Sólo legacy `zone` → fallback funciona.
- Sólo `enriched_data.datos_geograficos.admin_nivel_2` → fallback final funciona.
- Repetir el patrón para `region` / `admin_level_3` / `locality` (1 caso cada uno).

### 5. Documentación

`**docs/contracts/territorial-equivalence-canon.md**` — añadir sección "SoT textual cliente":

- `*Resolved` (vía `v_locations_resolved`) = SoT textual.
- Legacy `loc.zone`/etc = cache denormalizada (no escribir desde cliente).
- `enriched_data.datos_geograficos.*` = último fallback heurístico.
- Orden canónico de lectura aplicado en `getLocationHierarchy`.

`**docs/tech-debt.md**`:

- Marcar **item 8 (T1-fix)** como APLICADO con fecha y ref de PR.
- Dejar pendiente sub-item: inventario y migración progresiva de los ~30 call sites `.from('locations')` que no pasan por `v_locations_resolved` (riesgo: si pasan por `dbLocationToGeoLocation`, los `*Resolved` quedan `undefined` y la UI cae al legacy text).

## Out of scope (explícito)

- Migrar call sites `.from('locations')`.
- Backfill SQL de `locations.zone`.
- Tocar `v_locations_resolved`, edge functions, migraciones, datos, re-enrich.
- Bump mayor; impacto = **patch**.

## Orden de archivos a tocar

1. `src/types/location.ts`
2. `src/domains/content/lib/db-transformers.ts`
3. `src/shared/geography/hierarchy.ts`
4. `src/test/db-transformers.test.ts` (extend)
5. `src/test/geography-hierarchy-resolved.test.ts` (new)
6. `docs/contracts/territorial-equivalence-canon.md`
7. `docs/tech-debt.md`