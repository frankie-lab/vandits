# T2A-wire-regional-exceptions — Ticket spec

**Estado:** Abierto. Pendiente de planificación detallada y ejecución.  
**Ratificación origen:** `docs/audits/t-catalog-pt-ra-concelhos-p2-visual-regression-audit.md` § Opción A.  
**Tipo:** Wire (canon + UI + pipelines). Sin migración de datos.  
**Bump:** patch al ejecutar (no en este planning).

---

## 1. Objetivo

Extender el canon territorial cliente y su espejo Deno para soportar **excepciones regionales** dentro de un país que declara `hasProvincia=true`: regiones específicas que NO tienen nivel provincia/distrito.

Caso obligatorio inicial:

- **Portugal continental** conserva nivel Distrito.
- **PT-20 Açores** colapsa Distrito/Provincia.
- **PT-30 Madeira** colapsa Distrito/Provincia.

Diseño data-driven, **sin hardcode** en componentes.

---

## 2. Contrato API propuesto

`src/shared/geography/territorial-canon.ts` + espejo Deno `supabase/functions/_shared/territorial-canon.ts`.

### 2.1 Extensión de `CountryCanon`

```ts
export interface CountryCanon {
  readonly iso2: string;
  readonly hasProvincia: boolean;
  readonly municipioField: MunicipioField;
  readonly localityField: LocalityField;
  readonly regionEqZoneWhitelist: ReadonlyArray<string>;

  /**
   * Regiones (por `iso_code` de admin_areas, p.ej. "PT-20") cuyo nivel zone
   * se omite aunque el país tenga `hasProvincia=true`. Lookup case-sensitive
   * por iso_code (no por nombre, evita ambigüedad Açores/Azores).
   */
  readonly regionsWithoutProvincia?: ReadonlyArray<string>;
}
```

### 2.2 Configuración PT

```ts
PT: {
  iso2: 'PT', hasProvincia: true, municipioField: 'admin3', localityField: 'locality',
  regionEqZoneWhitelist: [],
  regionsWithoutProvincia: ['PT-20', 'PT-30'],
},
```

### 2.3 Helpers nuevos

```ts
export function regionHasNoProvincia(
  iso2: string | null | undefined,
  regionIsoCode: string | null | undefined,
): boolean;
```

- Devuelve `true` si la combinación país+región está declarada sin provincia.
- ISO2 desconocido o regionIsoCode vacío ⇒ `false`.

---

## 3. Wiring

### 3.1 `getLocationHierarchy` (`src/shared/geography/hierarchy.ts`)

**Hoy:** `zone = norm(loc.zoneResolved ?? loc.zone ?? gd?.admin_nivel_2)`.

**Cambio:**
- Resolver `regionIsoCode` desde la región: requiere lookup `region_id → iso_code` (vía `v_locations_resolved` extendida o cache `admin_areas`).
- Si `regionHasNoProvincia(iso2, regionIsoCode)` ⇒ `raw.zone = undefined` **antes** del fallback enriched_data.
- Esto neutraliza el revive de "Lisboa" en los 14 Madalena sin tocar `enriched_data`.

**Decisión pendiente sobre cómo llega `regionIsoCode` al cliente:**
- Opción A1: añadir `region_iso_code` a `v_locations_resolved`. Sub-ticket DB.
- Opción A2: lookup en cache `admin_areas` cargado en cliente.
- **Recomendado A1** (cero round-trip, paritario con Deno).

### 3.2 `GeographyTree` (`src/components/filters/GeographyTree.tsx`)

- `collapseZoneForCountriesWithoutProvincia`: extender o crear pareja `collapseZoneForRegionsWithoutProvincia` que recorra regiones y, si la región declara la excepción, promueva nietos a hijos (mismo patrón ya implementado a nivel país).
- Resultado esperado bajo PT-20/PT-30: sin nivel `(sin provincia)`, sin nodo `Lisboa`. Concelhos cuelgan directos de la región.

### 3.3 Imports — `applyCanonToParsed`

- Localizar el helper canónico de aplicación de canon en pipelines de import (KML/GPX/GeoJSON/CSV/web scrape).
- Si el POI parseado cae bajo PT-20/PT-30 (por iso_code o por reverse-geocode sobre coords con bbox conocido) ⇒ descartar `zone`/`zone_id` antes de persistir.
- Defensa en profundidad: aunque el parser detecte distrito, el canon lo veta.

### 3.4 `resolveAllFks` (`src/shared/geography/resolve-admin-fks.ts`)

- Tras resolver `region_id`, si la región está en `regionsWithoutProvincia` ⇒ `zone_id = null` aunque el geocoder/Nominatim devuelva un nivel intermedio.
- Aplicar simétricamente en espejo Deno.

### 3.5 Espejo Deno

- Replicar extensión en `supabase/functions/_shared/territorial-canon.ts`.
- Extender contract test `territorial-canon-parity` para incluir `regionsWithoutProvincia`.

---

## 4. Tests (mínimo aceptable)

Crear en `src/test/`:

1. `territorial-canon-regional-exceptions.test.ts`
   - PT continental: `hasProvincia=true`, `regionHasNoProvincia('PT','PT-01')=false`.
   - PT-20 / PT-30: `regionHasNoProvincia('PT','PT-20')=true`, idem PT-30.
2. `geography-tree-pt-insular-collapse.test.ts`
   - Fixture: 14 POIs Açores con `zoneResolved=NULL` y `enriched_data.admin_nivel_2='Lisboa'` ⇒ árbol NO emite nodo `Lisboa` ni `(sin provincia)`; concelhos cuelgan directos de `Açores`.
   - Fixture Madeira similar.
   - Fixture PT continental: nivel `Distrito` se preserva.
3. `hierarchy-pt-insular-no-enriched-fallback.test.ts`
   - Aislar `getLocationHierarchy`: con `regionIsoCode='PT-20'` y `enriched_data.admin_nivel_2='Lisboa'` ⇒ `zone === undefined`.
4. `import-canon-pt-insular.test.ts`
   - Parser KML con waypoint en Funchal con `<ExtendedData>` que incluye distrito ⇒ `zone_id` queda `null` tras `applyCanonToParsed`.
5. `resolve-fks-pt-insular.test.ts`
   - Reverse-geocode mock devuelve `admin1=PT-20`, `admin2=algo` ⇒ resolver descarta `zone_id`.
6. `territorial-canon-parity.test.ts` (extender)
   - Verifica que `regionsWithoutProvincia` está paritario cliente/Deno.
7. `territorial-canon-no-hardcode.test.ts` (extender)
   - Anti-hardcode: ningún componente puede comparar `region === 'Açores'` o `iso_code === 'PT-20'` directamente. Solo a través de `regionHasNoProvincia`.

---

## 5. Restricciones

- **No hardcode** de `PT-20`/`PT-30` en componentes — todo via canon.
- **No tocar datos** (`locations`, `admin_areas`, `enriched_data`) en este ticket.
- **No Nominatim** call alguno.
- **No re-enrich** de POIs.
- Bump patch en `package.json` SOLO al ejecutar código.
- Mantener paridad cliente/Deno en todo cambio del canon.

---

## 6. Riesgos

- `getLocationHierarchy` afecta a TODOS los consumidores (FilterBar, popups, breadcrumbs, parsers indirectos, location-bucket-matrix, location-filtering). Requiere `vitest run` completo.
- Si `region_iso_code` no se añade a `v_locations_resolved` (Opción A2), el cliente necesita garantía de que `admin_areas` está cargado antes de cualquier render de árbol — riesgo de UI inconsistente durante hidratación.
- El canon `regionsWithoutProvincia` debe documentarse en `docs/contracts/territorial-equivalence-canon.md` como excepción canónica, no como hack.
- Memoria de roots: actualizar `mem://geography/canonical-tree-spec` para reflejar excepción regional.

---

## 7. Entregables

1. Código:
   - `src/shared/geography/territorial-canon.ts` + espejo Deno.
   - `src/shared/geography/hierarchy.ts`.
   - `src/components/filters/GeographyTree.tsx`.
   - Import parsers + `resolveAllFks`.
   - Migración SQL si Opción A1 (añadir `region_iso_code` a vista).
2. Tests (7 archivos listados §4).
3. Doc:
   - `docs/contracts/territorial-equivalence-canon.md` § excepción regional.
   - Actualización memoria.
4. Bump patch.

---

## 8. Fuera de alcance

- Datos residuales (Santa Cruz da Graciosa, Bolhão, Braga Parque) — ver ticket separado `T2.3-P2-residual-data`.
- Limpieza `enriched_data.admin_nivel_2='Lisboa'` legacy (opcional, sub-lote independiente; el canon ya neutraliza el efecto visual).
- Extensión a otros países (Canarias ES, etc.) — futuras iteraciones cuando aparezcan casos.
