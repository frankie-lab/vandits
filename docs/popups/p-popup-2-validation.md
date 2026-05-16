# P-POPUP-2 — Validation log

> Implementación controlada del segundo pilot del canon de popups: geo header
> canónico + dedupe de tags + overflow caps. Flag `popup_geo_canonical_v1`,
> default **OFF** en producción.

## 1. Scope ejecutado

- ✅ 2 helpers nuevos (single-source-of-truth):
  - `src/shared/popup/geo-header.ts` — `getCanonicalGeoChips` + `buildGeoHeaderHtml`
  - `src/shared/popup/tags.ts` — `tagSlug` + `extractTaxonomyCandidates` + `dedupePopupTagBuckets` + `getCanonicalPopupTags` + `POPUP_TAG_CAPS`
- ✅ 2 test suites nuevos (escritos ANTES de tocar render):
  - `src/test/popup-geo-header.test.ts` — 8 tests
  - `src/test/popup-tags-canonical.test.ts` — 10 tests
- ✅ Flag `POPUP_GEO_CANONICAL_V1_DEFAULT = false` + runtime override
  `window.__POPUP_GEO_CANONICAL_V1__` en `map-popups.ts`.
- ✅ Render gated:
  - Geo header chips: legacy 4-chip inline render preservado intacto cuando
    flag OFF; cuando ON usa `buildGeoHeaderHtml`.
  - `case 'etiquetas'` del switch: legacy preservado intacto cuando flag OFF;
    cuando ON usa `getCanonicalPopupTags` + `POPUP_TAG_CAPS`.
- ✅ Ningún cambio fuera de: `map-popups.ts` + 2 helpers + 2 tests.

## 2. ZONE semantics — confirmación explícita (P-POPUP-2)

Documentada en cabecera de `src/shared/popup/geo-header.ts` y guardada por
test `confirms ZONE is rendered BETWEEN locality and region (semantic spec)`:

- **Cuándo existe**: cuando el POI ha sido geocodificado al menos a nivel
  provincia. Fuente: `loc.zone` || `enrichedData.datos_geograficos.admin_nivel_2`,
  resuelto vía `getLocationHierarchy()` (placeholders `(sin provincia)`
  stripped).
- **Qué representa**: PROVINCIA / departamento / condado / distrito
  (admin_nivel_2). NUNCA comarca, NUNCA municipio.
- **Posición en header**: entre `locality` y `region`. Orden canónico
  específico→general: `{locality} · {zone} · {region} · {country}`.
- **Continent**: omitido del header (implícito por país).

## 3. Contratos preservados

- ✅ `.filter-link` con `data-filter-type` ∈ {country, region, zone} — handler
  en `map-popup-handlers.ts` no extendido.
- ✅ `locality` rendea como chip estático (no clickable) — el handler no
  soporta `locality` y extenderlo cambiaría el click contract. Diferido.
- ✅ Lifecycle popup intacto (`setPopupContent`, `openPopup`, `popupclose`
  centralizado).
- ✅ Cámara / subset-fit intactos.
- ✅ Marker grammar intacto.
- ✅ Sin React, sin scroll horizontal, sin Collapsible Radix. Overflow vía
  chip estático "+N".

## 4. Resultados CI (vitest)

```
src/test/popup-tokens-enriched.test.ts  ✓ 7/7   (P-POPUP-1 guard)
src/test/popup-geo-header.test.ts        ✓ 8/8   (P-POPUP-2 new)
src/test/popup-tags-canonical.test.ts    ✓ 10/10 (P-POPUP-2 new)
TOTAL popup-relevantes                   25/25 green
```

Suite completa popup-relevante (P-POPUP-1 ratificado: 9 archivos / 117 tests)
+ 2 nuevos archivos / 18 nuevos tests = **11 archivos / 135 tests green**.

QA manual sandbox, e2e completa, baseline visual snapshot y ratificación
quedan pendientes (FU-1 P-POPUP-2 — gated, mismo flujo que P-POPUP-1).

## 5. Rollback plan

1. **Runtime**: `window.__POPUP_GEO_CANONICAL_V1__ = false` (default ya OFF
   en producción) — revierte a render legacy sin redeploy.
2. **Code**: revert de un solo commit (1 archivo modificado + 2 helpers
   nuevos + 2 tests nuevos). Sin migraciones SQL.
3. P-POPUP-1 sigue independiente y ratified.

## 6. Estado

- **P-POPUP-2 status**: `implemented-flag-off-pending-ratification`
- **Gates abiertos hasta ratificación**:
  - QA manual sandbox (FU-1) con flag ON
  - e2e 14/14 verdes con flag OFF (default prod)
  - Baseline visual snapshot opcional (FU-2)
- **Bloqueado hasta cierre**: P-POPUP-3 (ownership cleanup), P-POPUP-4..7,
  PopupShell, React migration, photo popup, nearby, recovery.

## 7. Persistencia

- `docs/popups/p-popup-2-validation.md` (este archivo)
- Plan original: `docs/popups/p-popup-2-implementation-plan.md`
- Sync GitHub automático vía Lovable
