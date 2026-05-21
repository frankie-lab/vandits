# T1 — GeographyTree post-fix visual audit

**Fecha:** 2026-05-21
**Alcance:** Validación visual del árbol Geo tras T1-fix (`*Resolved` como SoT textual cliente).
**Tipo:** Solo lectura (SELECT + revisión de código). Sin cambios.

---

## TL;DR

- **T1-fix está APLICADO y consumido correctamente por `GeographyTree`**. La cadena `useLocationsStore.getAllLocations()` → `useDatabaseSync` → `fetchAllLocationsPaginated` (lee `v_locations_resolved`) → `dbLocationToGeoLocation` (puebla `*Resolved`) → `getFilledLocationHierarchy` → `getLocationHierarchy` (orden `*Resolved → legacy → enriched_data`) → render es la única vía global.
- **Los nodos no canónicos observados NO son regresión de T1-fix.** Son combinaciones de:
  1. **Datos realmente faltantes en `admin_areas`** (Portugal `(sin región)`).
  2. **Bug menor preexistente en el fallback por bbox de continente** (`continentLabelFromCoords` devuelve etiquetas en español sin canonicalizar → duplica `Europe`/`Europa` cuando faltan continent/continent_resolved).
  3. **Fixtures E2E con país vacío** (`(sin país)`).
- Conclusión por hipótesis del prompt:
  - [ ] T1-fix aplicado pero no consumido por el árbol → **FALSO**.
  - [ ] T1-fix incompleto → **FALSO**.
  - [x] Datos realmente faltantes + un fallback no canonicalizado preexistente → **VERDADERO**.

---

## 1. Cadena de datos verificada

| Capa | Fichero | Comportamiento |
|---|---|---|
| Bulk load | `src/domains/content/hooks/use-database-sync.ts:72` | `await fetchAllLocationsPaginated(...)` |
| Fetch | `src/domains/content/lib/db-transformers.ts:69` | `.from('v_locations_resolved' as any)` con paginación |
| Transform | `src/domains/content/lib/db-transformers.ts:26-37` | Mapea `*_resolved || legacy` a `loc.{continent,country,region,zone,comarca,localidad}` y además puebla los campos espejados `*Resolved` |
| Tree build | `src/components/filters/GeographyTree.tsx:67-138` | Itera con `getFilledLocationHierarchy(loc)` |
| Hierarchy SoT | `src/shared/geography/hierarchy.ts:74-104` | Orden canónico `loc.*Resolved ?? loc.* ?? gd?.*` + `canonicalCountry`/`canonicalContinent` + `isPlaceholderValue` para colapsar `(sin ...)` |

**Verificado:**
- `GeographyTree` NO agrupa por campos legacy crudos. Toda la jerarquía la calcula `getLocationHierarchy`.
- Realtime (`src/hooks/use-realtime-locations.ts:251`) también pasa por `v_locations_resolved` + `dbLocationToGeoLocation`.
- El loader per-doc legacy `loadLocationsFromDatabase(docId)` (`db-operations.ts:203-235`) NO se usa para alimentar `GeographyTree`. Solo lo invocan `BatchEnrichmentPanel` y `EnrichmentProgressIndicator` (vistas internas que no alimentan el árbol global). Riesgo cero para el árbol Geo, pero pendiente en el inventario de migración (T1-fix marcó esto como deuda residual).

---

## 2. Casos observados

### 2.1 Portugal `(sin región)` × 249

**Diagnóstico: datos faltantes en `admin_areas`. NO es bug de T1-fix.**

Query directa:

```sql
SELECT region_id, region, region_resolved, COUNT(*)
FROM v_locations_resolved
WHERE deleted_at IS NULL AND country ILIKE 'portugal'
GROUP BY 1,2,3;
-- → 250 filas, todas con region_id=cbeeecd6…, region='', region_resolved='(sin región)'
```

El `region_id` apunta a `admin_areas.id=cbeeecd6-a4b8-4b06-ac15-c40532da63d7`, cuyo `name='(sin región)'` y `is_placeholder=true`. Es decir, el catálogo `admin_areas` para Portugal NO tiene poblada la división nivel-2 (CCAA equivalente — `Norte`, `Centro`, `Algarve`, etc.) en el path correcto, así que la geocodificación los apunta al placeholder.

El cliente hace lo correcto:
1. `dbLocationToGeoLocation` pone `regionResolved='(sin región)'`.
2. `getLocationHierarchy` aplica `isPlaceholderValue('(sin región)')` → `true` → `raw.region = undefined`.
3. `getFilledLocationHierarchy` repone el placeholder canónico de UI: `LEVEL_PLACEHOLDER_LABELS.region = '(sin región)'`.

Resultado: una rama Portugal → `(sin región)` con los 250 POIs. La UI muestra italic + texto silenciado (`/^\(sin /i.test(node.name)`), tal y como dicta el contrato.

**Corrección sugerida (fuera de scope de T1-fix):** repoblar `admin_areas` para Portugal a nivel 2 con regiones canónicas reales y re-asignar `locations.region_id` desde un job de canonicalización geográfica. Esto se enmarca en **deuda residual T2** (backfill `admin3/locality_resolved`) ampliada a **T2-bis: backfill `region_id` para países con catálogo incompleto**.

### 2.2 Duplicado `Europe` / `Europa`

**Diagnóstico: bug preexistente menor en `continentLabelFromCoords`. NO es regresión de T1-fix.**

Distribución cruda en el view:

```
continent | continent_resolved | rows
Europa    | Europa             | 4556
Europe    | Europe             |    1
(NULL)    | (NULL)             |    2  ← E2E fixtures
África    | África             |   95
Africa    | Africa             |    3
```

`canonicalContinent('Europa') = 'Europe'` y `canonicalContinent('Africa') = 'Africa'`. Por tanto los 4 557 POIs con continente poblado deben colapsar en un único nodo `Europe`.

El problema vive en `src/shared/geography/hierarchy.ts:89`:

```ts
continent: canonicalContinent(norm(loc.continentResolved ?? loc.continent ?? gd?.continente))
           ?? continentFallback,
```

`continentFallback = continentLabelFromCoords(lat, lng)` devuelve **literales en español sin canonicalizar** (`'Europa'`, `'África'`, `'Asia'`, etc., ver `src/shared/geography/continent-bbox.ts:8-9`). El `??` está aplicado **después** de `canonicalContinent`, así que cualquier POI sin `continent_resolved/continent/gd.continente` aterriza con la etiqueta cruda del bbox y aparece como nodo separado.

En la práctica esto solo se dispara con las **2 fixtures E2E** sin país (lat/lng dentro de la bbox EU → fallback devuelve `Europa`). Esos 2 POIs no se acumulan bajo `Europe` con los otros 4 556 porque el matcher de fila del árbol compara `value === value` literal.

Esto explica también el nodo `(sin país)` bajo `Europa` observado en la captura: las mismas 2 filas (`country=''`, lat≈40.4, lng≈-3.7) tienen continente fallback `Europa` + país placeholder.

**Corrección mínima (1 línea, futura):**

```ts
// hierarchy.ts:89
continent: canonicalContinent(
  norm(loc.continentResolved ?? loc.continent ?? gd?.continente) ?? continentFallback,
),
```

Mover el `?? continentFallback` **dentro** de `canonicalContinent` garantiza que también la etiqueta del bbox pase por el alias y `Europa` colapse en `Europe`. Cambio aislado, sin impacto en datos ni en imports.

### 2.3 `(sin país)` bajo Europa

**Diagnóstico: 2 fixtures E2E con `country=''`. Datos sintéticos esperados.**

```sql
SELECT id, name, latitude, longitude FROM v_locations_resolved
WHERE deleted_at IS NULL AND (country IS NULL OR country='');
-- → f04b3b95-…-e2e000000001 'E2E Fixture — Imported POI' 40.4168/-3.7038
-- → f04b3b95-…-e2e000000002 'E2E Fixture — Empty POI'    40.4170/-3.7040
```

Ambos también tienen `country_id IS NULL` y `country_resolved IS NULL`. Comportamiento esperado por el contrato sandbox (`sandbox-agent@vandits.test`). No accionable.

### 2.4 España — niveles inferiores

Sample verificado en el árbol (España → Andalucía / Galicia):
- Nivel `region` (CCAA) → texto canónico vía `regionResolved` (`Andalucía`, `Galicia`, `Comunidad de Madrid`, `Illes Balears`, etc.).
- Nivel `zone` (Provincia) → poblado vía `zoneResolved` para el 100 % de POIs ES con `zone_id IS NOT NULL`; los 314 ES con `zone IS NULL` ya muestran provincia tras T1-fix.
- Casos región-uniprovincial (`Comunidad de Madrid`, `Principado de Asturias`, `Illes Balears`) muestran `region == zone` legítimo. Documentado en `docs/contracts/territorial-equivalence-canon.md §7` como esperado. Pendiente colapso visual en UI (T3 en `docs/tech-debt.md`), no es bug.

Resultado conteo país (`v_locations_resolved`, `zone_id IS NOT NULL AND zone IS NULL`):

| País | total | con zone_id | sin zone txt | con zone_resolved |
|---|---:|---:|---:|---:|
| España | 1310 | 1310 | 314 | 1310 |
| Francia | 1067 | 1065 | 168 | 1065 |
| Italia | 989 | 988 | 918 | 988 |
| Reino Unido | 402 | 391 | 15 | 391 |
| Estados Unidos | 349 | 347 | 17 | 347 |

Los 1.432 POIs originalmente afectados (314 ES + 168 FR + 918 IT + 15 GB + 17 US) ya consumen `zoneResolved`. T1-fix funciona end-to-end.

---

## 3. Veredicto

| Hipótesis del prompt | Estado |
|---|---|
| T1-fix aplicado pero no consumido por árbol | NO |
| T1-fix incompleto | NO |
| Datos realmente faltantes | **SÍ — Portugal placeholder, 2 fixtures E2E** |
| (Adicional) Fallback bbox sin canonicalizar | **SÍ — preexistente, 1 línea, no T1** |

---

## 4. Corrección mínima recomendada (no aplicada en esta auditoría)

**Cambio acotado en `src/shared/geography/hierarchy.ts`:**

```ts
// Antes
continent: canonicalContinent(norm(loc.continentResolved ?? loc.continent ?? gd?.continente)) ?? continentFallback,
// Después
continent: canonicalContinent((norm(loc.continentResolved ?? loc.continent ?? gd?.continente)) ?? continentFallback),
```

Reusa el helper único `canonicalContinent`, no añade dependencias, fusiona `Europa`/`Europe`/`Africa`/`África` en un único nodo cuando el fallback por coordenadas se dispara.

**Conviene además, en próximas PRs:**
- Mantener el principio actual: el árbol Geo se construye **exclusivamente** desde `getLocationHierarchy(location)`. No reintroducir agrupaciones por `loc.region`/`loc.zone` crudos en `GeographyTree`, `GeographyScopeTree`, `FilterBar` ni en panels admin.
- Backfill catálogo `admin_areas` Portugal nivel-2 (deuda T2-bis a añadir a `docs/tech-debt.md` en próxima iteración — no se modifica ahora por contrato del prompt).

---

## 5. Restricciones respetadas

- Sin cambios en datos, código, migraciones, edge functions, re-enrich, ni bump.
- Solo SELECT + lectura de fuentes.
- No se ha tocado `.lovable/plan.md`.
