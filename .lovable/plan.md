## Estado actual

Fase 1 ya está implementada en código (loop anterior):

- `src/shared/geography/coord-validity.ts` ✅
- `supabase/functions/_shared/coord-validity.ts` ✅
- `src/test/coord-validity.test.ts` ✅ (7 casos, pasaban)
- Entry gates aplicados en `enrich-location`, `batch-enrich`, `scrape-tick`, `src/domains/content/lib/enrich-location.ts` ✅

Falta únicamente el cierre de versión y documentación (bump patch 1.2.9 → 1.2.10).

## Plan

### 1. Verificación previa (read-only)

- `code--view` de los 4 archivos de gates y del test para confirmar que siguen como se dejaron.
- Ejecutar `bunx vitest run src/test/coord-validity.test.ts` para reconfirmar verde.

### 2. Bump de versión (patch)

- `package.json`: `"version": "1.2.9"` → `"1.2.10"`.
- `src/lib/app-version.ts`: `APP_VERSION = '1.2.9'` → `'1.2.10'`.

### 3. Documentación

- `README.md`: añadir entrada de changelog `v1.2.10` resumiendo Fase 1 (entry gates WGS84, rechazo `(0,0)`/NaN/null/out-of-range, `validation_required: true` con `reason: 'invalid_coordinates'`).
- `docs/releases/version-history.md`: añadir hito `v1.2.10 — Coord-coherence Fase 1: entry gates duros`.
- `docs/tech-debt.md` ítem 7 (“Coherencia coordenadas-enriquecimiento”): estado → **En progreso — Fase 1 aplicada** con nota de qué cubre y qué queda (Fases 2–7).

### 4. Verificación final

- Ejecutar de nuevo el test de contrato.
- Reportar archivos modificados, resultado de tests y confirmaciones de scope (no datos, no migraciones, no re-enrich, no `LocationMap.tsx`).

## Fuera de scope (explícito)

- Fases 2–7 (resolve-coordinates obligatorio, R9 name-coord, prompt, geo_health, quarantine, places_trunk).
- Datos, migraciones, RLS, UI map.
- Backfill de POIs corruptos existentes.

## Version impact

`patch` — 1.2.9 → 1.2.10.
