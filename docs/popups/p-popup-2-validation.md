# P-POPUP-2 — Validation log

> Segundo pilot del canon de popups: geo header canónico
> (locality·zone·region·country) + dedupe 4-bucket de tags + overflow caps.
> Flag `popup_geo_canonical_v1` — **default ON desde 2026-05-16**.
> Override runtime y legacy path preservados como rollback.

## 1. Scope ejecutado

- ✅ 2 helpers nuevos (single-source-of-truth):
  - `src/shared/popup/geo-header.ts` — `getCanonicalGeoChips` + `buildGeoHeaderHtml`
  - `src/shared/popup/tags.ts` — `tagSlug` + `extractTaxonomyCandidates` + `dedupePopupTagBuckets` + `getCanonicalPopupTags` + `POPUP_TAG_CAPS`
- ✅ 2 test suites nuevos (escritos ANTES de tocar render):
  - `src/test/popup-geo-header.test.ts` — 8 tests
  - `src/test/popup-tags-canonical.test.ts` — 10 tests
- ✅ Flag `POPUP_GEO_CANONICAL_V1_DEFAULT` + runtime override
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

## 4. Resultados CI

### Vitest popup-relevantes (post-P2-FIX-A..E, 2026-05-16)

```
src/test/popup-tokens-enriched.test.ts  ✓ 7/7   (P-POPUP-1 guard)
src/test/popup-geo-header.test.ts       ✓ 10/10 (P-POPUP-2 + FIX-D)
src/test/popup-tags-canonical.test.ts   ✓ 13/13 (P-POPUP-2 + FIX-C/E)
TOTAL popup-relevantes                  30/30 green
```

Duración: ~2.7s. Sin warnings, sin flakes.

### E2E 14/14

Suite e2e completa (la misma referenciada en P-POPUP-1 ratification) no es
ejecutable en el sandbox del agente (no hay script `e2e`/`playwright` en
`package.json`). El gate se delega al CI externo del repo: confirmar
14/14 verdes tras merge del flip de default. Si rojo → revert inmediato vía
§7.

## 5. Promoción a default ON

- **Fecha**: 2026-05-16
- **Cambio**: `POPUP_GEO_CANONICAL_V1_DEFAULT = false` → `true` en
  `src/components/map/map-popups.ts` (1 línea efectiva).
- **Justificación**: P-POPUP-1 ratified; helpers + 18 nuevos tests verdes
  desde implementación inicial; arquitectura gated permite rollback runtime
  instantáneo sin redeploy.
- **Validación visual humana**: se hará directamente en preview/app con
  default ON (decisión explícita del owner — no usar consola para QA).
- **Si visualmente no es correcto**: revert vía §7 (runtime o code).

## 6. Rollback readiness

### Runtime kill-switch (instantáneo, sin redeploy)

```js
window.__POPUP_GEO_CANONICAL_V1__ = false
```

Aplica antes de reabrir el popup. El helper `isPopupGeoCanonicalV1On()`
prioriza el override de `window` sobre el default, por lo que se restaura el
render legacy al vuelo. Útil para mitigación en producción mientras se
prepara fix o code revert.

### Code revert (1 línea)

```diff
- const POPUP_GEO_CANONICAL_V1_DEFAULT = true;
+ const POPUP_GEO_CANONICAL_V1_DEFAULT = false;
```

Path único en `src/components/map/map-popups.ts`. Sin migraciones SQL, sin
cambios en helpers ni tests.

### Estado de los assets que respaldan el rollback

- ✅ Helper `isPopupGeoCanonicalV1On()` intacto (lee override runtime).
- ✅ Rama legacy del geo header (4-chip inline) preservada intacta.
- ✅ Rama legacy del `case 'etiquetas'` preservada intacta.
- ✅ Helpers `geo-header.ts` y `tags.ts` no se invocan cuando flag OFF.
- ✅ Tests del path legacy siguen verdes (`popup-tokens-enriched` 7/7).

## 7. Estado

- **P-POPUP-2 status**: `ratified-default-on` (promovido 2026-05-16).
- **Gates cerrados**:
  - Vitest popup-relevantes 25/25 verdes.
  - Helpers y ramas legacy preservados.
  - Rollback path documentado y validado.
- **Gates delegados a CI externo**:
  - e2e 14/14 con default ON (post-merge).
- **Follow-ups no bloqueantes**:
  - FU-2 baseline visual snapshot (opcional).
  - Validación visual humana en preview/app con default ON (owner).
- **Bloqueado hasta nueva orden**: P-POPUP-3 (ownership cleanup), P-POPUP-4..7,
  PopupShell, React migration, photo popup, nearby, recovery, F2.

## 8. Persistencia

- `docs/popups/p-popup-2-validation.md` (este archivo)
- Plan original: `docs/popups/p-popup-2-implementation-plan.md`
- Sync GitHub automático vía Lovable
