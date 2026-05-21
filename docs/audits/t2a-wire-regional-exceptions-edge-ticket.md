# T2A-wire-regional-exceptions — Edge follow-up ticket

**Estado:** Abierto. No ejecutado.
**Origen:** Cierre de T2A-wire Fase 1 (v1.3.16). El hook en `resolveAllFks` quedó como TODO sin enforcement server-side real.
**Tipo:** Wire edge (Deno) + posible migración SQL menor.
**Bump al ejecutar:** patch.

---

## 1. Contexto

T2A-wire Fase 1 (v1.3.16) extendió el canon territorial cliente y Deno con
`regionsWithoutProvincia: ['PT-20', 'PT-30']` y cableó:

- `getLocationHierarchy` (cliente) — `zone` se suprime cuando la región es insular.
- `GeographyTree` — colapsa el nivel Distrito para PT-20 / PT-30.
- `applyCanonToParsed` — descarta `zone` / `zoneId` en POIs nuevos cuyo `regionIsoCode` cae en la excepción y emite `canon-region-zone-forbidden`.
- `resolveAllFks` — **sólo hook + TODO**: declara la intención pero NO consulta `admin_areas` para conocer el `iso_code` de la región resuelta, por lo que NO descarta `zone_id` en el resolver si llega un Nominatim "completo".

Resultado: la defensa client-side es completa, pero el **resolver server-side puede aún persistir `zone_id` no-NULL para POIs PT-20/PT-30** si la pipeline (edge function `resolve-admin-area`) le pasa un admin2 resuelto.

---

## 2. Objetivo

Cerrar la defensa en profundidad: garantizar que el resolver de FKs (cliente y edge) descarta `zone_id` cuando la región resuelta pertenece a `regionsWithoutProvincia`, sin depender del orden de llegada de los campos.

---

## 3. Alcance

### 3.1 `resolveAllFks` cliente (`src/shared/geography/resolve-admin-fks.ts`)

- Tras resolver `region_id`, consultar `iso_code` de `admin_areas` (cache local ya cargada por `useAdminAreas` u hook equivalente).
- Si `regionHasNoProvincia(iso2, regionIsoCode)` ⇒ forzar `zone_id = null` y emitir warning `canon-region-zone-forbidden`.

### 3.2 Espejo edge (`supabase/functions/resolve-admin-area/index.ts` + helpers `_shared/`)

- Equivalente server-side. La función YA hace lookup a `admin_areas` por nombre; al resolver `region_id`, leer su `iso_code` en la misma consulta (SELECT extendido) o segunda consulta indexada.
- Aplicar el mismo veto: `regionHasNoProvincia(country_iso2, region_iso_code)` ⇒ `zone_id = null`.
- Mantener `zone` (texto) coherente: descartar también el texto si proviene del mismo nivel administrativo.

### 3.3 Migración SQL (opcional)

Si el lookup de `iso_code` por `region_id` en runtime es costoso, considerar un trigger en `locations` `BEFORE INSERT OR UPDATE` que aplique el veto a partir de un view/lookup. Decisión queda en el ticket de ejecución.

**No** necesario si la edge function ya hace el join.

---

## 4. Tests (mínimo aceptable)

1. `resolve-fks-pt-insular.test.ts` (cliente)
   - Mock de `admin_areas` con PT-20 ⇒ resolver descarta `zone_id` aunque `input.zone` venga poblado.
   - PT continental ⇒ `zone_id` se preserva.
2. `resolve-admin-area-pt-insular.test.ts` (edge, Deno)
   - Fixture Funchal: reverse-geocode mock devuelve `admin1=Madeira`, `admin2=algo` ⇒ payload final tiene `zone_id=null`, `zone=null`.
3. Integración: smoke con un import KML de un POI en Açores que llega al pipeline completo ⇒ persistencia final tiene `zone_id=NULL`.

---

## 5. Restricciones

- **No tocar datos.** Sólo wire + tests.
- **No Nominatim.** Mock en tests.
- **No re-enrich.**
- Mantener paridad cliente/Deno del canon (`regionsWithoutProvincia`).
- Bump patch al ejecutar.

---

## 6. Riesgos

- `resolve-admin-area` es función crítica de import; cualquier regresión rompe la creación de POIs. Exigir vitest + deno test pasando antes de deploy.
- Si el lookup `region_id → iso_code` añade latencia perceptible al pipeline batch (`batch-enrich`, `backfill-admin-fks`), considerar cachear `admin_areas` en memoria por invocación.

---

## 7. Out of scope

- Datos residuales (Santa Cruz da Graciosa, Bolhão, Braga Parque) — ticket `T2.3-P2-residual-data`.
- Extensión a otros países (ES Canarias, etc.) — datos suficientes para abrir el caso, pero queda fuera de este edge ticket.
- Re-evaluación de PT continental — sin cambios.

---

## 8. Criterio de éxito

- Un POI PT-20/PT-30 creado vía edge **nunca** persiste `zone_id` no-NULL, aunque el reverse-geocode externo devuelva admin2.
- `resolveAllFks` cliente y edge son consistentes (mismo veto, misma fuente: `regionsWithoutProvincia`).
- Contract test `territorial-canon-parity` sigue verde.
- `territorial-canon-no-hardcode` sigue verde con FORBIDDEN_REGION_ISO/NAMES activos.

---

## 9. Cierre

**Estado:** CERRADO en v1.3.17 (T2A-wire-regional-exceptions-edge).

- Edge `resolve-admin-area`: lookup de `iso_code` (country+region) + veto `regionHasNoProvincia` + `meta.region_iso_code` en respuesta + warn `canon-region-zone-forbidden`.
- Cliente `resolveAllFks`: consume `meta.region_iso_code` y aplica defensa en profundidad (TODO eliminado).
- Tests: `territorial-canon-wire-resolver-pt-insular`, `territorial-canon-wire-resolver-edge-contract`. Lint anti-hardcode extendido a `supabase/functions/resolve-admin-area/index.ts`.
- Roadmap: §5.2 y §5.3 cerrados; global 2/6 → 4/6.
