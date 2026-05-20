
# Fase 3 — Name-coordinate identity gate (R9)

Pulsa **Implement plan** para que ejecute. Sigo en plan mode pese a "Build mode activado".

## Cambios

### Nuevos archivos
- `src/shared/geography/name-coord-identity.ts` — helper canónico isomorfo. Exporta `assertNameCoordinateIdentity`, `normalizeName`, `isGenericName`, `similarity`, `haversineMeters`. Lookups vía `search-nearby-osm` + `search-candidates` (skip `search-candidates` si nombre genérico). Inyectables `searchNearby` / `searchCandidates` para tests.
- `supabase/functions/_shared/name-coord-identity.ts` — espejo Deno verbatim.
- `src/test/name-coord-identity.test.ts` — 7 casos vitest (ok / mismatch / found_elsewhere / generic-ok / **both-fail → hard-block** / generic-nearby-fail → hard-block / similarity tolera acentos+artículos).

### Modificados
- `supabase/functions/enrich-location/index.ts`
  - Import: `assertNameCoordinateIdentity` desde `../_shared/name-coord-identity.ts`.
  - Tras R3 (`canonicalGeo` resuelto, ~L1887) y antes de `getGlobalEnrichmentConfig()` (~L1889), insertar bloque R9. Cualquier status ≠ `'ok'` devuelve `200` con `{ success:false, validation_required:true, reason }` y NO llama LLM. Reasons: `name_coordinate_mismatch` | `name_found_elsewhere` | `identity_lookup_unavailable`. Try/catch externo también bloquea como `identity_lookup_unavailable`.

- `supabase/functions/batch-enrich/index.ts`
  - Insertar 3 ramas específicas **antes** del `else if (enrichData.validation_required)` genérico (línea ~372). Cada rama lanza error estructurado con `kind` propio (`name_coordinate_mismatch` | `name_found_elsewhere` | `identity_lookup_unavailable`). Sin reintento, sin `no_credits`.

### Versionado + docs (patch 1.2.11 → 1.2.12)
- `package.json`: `"version": "1.2.12"`.
- `src/lib/app-version.ts`: `APP_VERSION = '1.2.12'`.
- `README.md`: badge + título → v1.2.12; nuevo entry changelog.
- `docs/releases/version-history.md`: añadir `1.2.12` al árbol; mover `current` de 1.2.11 → 1.2.12; añadir anchor + fila tabla 1.x + entrada `[ ] v1.2.12` pendientes Git.
- `docs/tech-debt.md` ítem 7: estado `en progreso — Fase 3 aplicada (2026-05-20)`; bullet 3 `✅ Aplicada en v1.2.12 …`.

## Comportamiento aprobado (cambio vs propuesta original)

Si **ambos** lookups fallan/timeout → `identity_lookup_unavailable` es **bloqueo duro**, NO continúa como ok:
- `enrich-location`: `{ success:false, validation_required:true, reason:'identity_lookup_unavailable' }`, NO LLM.
- `batch-enrich`: `kind:'identity_lookup_unavailable'`, sin reintento, sin contar `no_credits`.

## Fuera de scope
Datos, migraciones SQL, re-enrich, `LocationMap.tsx`, `places_trunk`, RLS/RBAC, UI panels, Fases 4–7.

## Validación
- `bunx vitest run src/test/coord-validity.test.ts src/test/name-coord-identity.test.ts` → verde.
- Deno `enrich-location/index.test.ts` → sigue verde (no se tocan tests existentes).

## Version impact
patch — 1.2.11 → 1.2.12.
