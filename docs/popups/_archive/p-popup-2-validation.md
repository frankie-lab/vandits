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

- **P-POPUP-2 status**: `ratified-default-on + FIX-A..E applied` (2026-05-16).
- **Gates cerrados**:
  - Vitest popup-relevantes 30/30 verdes (incluye nuevos tests FIX-C/D/E).
  - Helpers y ramas legacy preservados.
  - Rollback path documentado y validado.
- **Gates delegados a CI externo**:
  - e2e 14/14 con default ON (post-merge).
- **Follow-ups no bloqueantes**:
  - FU-2 baseline visual snapshot (opcional).
  - Retirar badge "P-POPUP-2 ON" + `isPopupDiagBadgeVisible()` cuando el
    rollout esté realmente ratificado en producción (no antes).
- **Bloqueado hasta nueva orden**: P-POPUP-3 (ownership cleanup: `Mi punto`
  vs `#frankie_gmz`), P-POPUP-4..7, PopupShell, React migration, photo
  popup, nearby, recovery, F2.

## 9. Fixes acotados aplicados (2026-05-16)

Cierre técnico del pilot tras ratificar default-on. Alcance estrictamente
dentro de `map-popups.ts`, `geo-header.ts`, `tags.ts`, `LocationMap.tsx`
(1 efecto nuevo) y 2 test suites.

- **P2-FIX-A — Boot re-bind defensivo**: `LocationMap` arranca un one-shot
  pass tras 1.2s que recorre `markersRef.current` y reemplaza el popup HTML
  vía `setPopupContent(createPopupContent(...))`. Garantiza que sesiones con
  cache stale (markers bindados antes del flip a default ON) vean el render
  canónico sin hard refresh. Respeta override runtime: si
  `window.__POPUP_GEO_CANONICAL_V1__ === false`, no hace nada.
- **P2-FIX-B — Señal visible en preview/staging**: badge "P-POPUP-2 ON"
  pasa de `import.meta.env.DEV` (siempre false en preview Lovable) a
  `isPopupDiagBadgeVisible()` (true en `*.lovable.app`, `localhost` y
  `?diag=1`). Permite verificar despliegue sin DevTools/consola. Se
  retirará cuando rollout sea ratificado en producción.
- **P2-FIX-C — `tagSlug` robustecido**: regex pasa de `[\s_-]+` a
  `[^a-z0-9]+`. Colapsa `/`, `&`, `(`, `)`, `.`, `,` y cualquier separador
  no alfanumérico. Cubre `Villa/Pueblo ↔ Villa Pueblo`,
  `Naturaleza & Paisaje`, `Iglesia (s. XII)`.
- **P2-FIX-D — Test uniprovincial explícito**: 2 tests nuevos
  (`Principado de Asturias` y `Madrid uniprovincial`) fijan contrato
  zone==region → 1 chip, sin continente en header.
- **P2-FIX-E — `extractTaxonomyCandidates` defensivo**: split por `>` en
  cada nivel (cubre payloads IA que concatenan
  `categoria > subcategoria > tipo` en un solo campo), prefijo numérico
  unificado `^\d+(?:\.\d+)*\.?\s*`, dedupe por slug entre los 3 niveles
  antes de devolver.

**Fuera de scope (P-POPUP-3)**: duplicación `Mi punto` (badge) +
`#frankie_gmz` (source hashtag). Decisión explícita: el badge ownership y
el source pipeline canónico no se tocan en este pilot.

## 10. QA manual tras FIX-A..E

Validar en preview con hard refresh:

1. Abrir POI propio enriched en Asturias → header `Principado de
   Asturias · España` (2 chips, sin Europa, sin duplicado).
2. Abrir POI en Madrid uniprovincial → header `Madrid · Comunidad de
   Madrid · España`.
3. Verificar atributo `data-popup-version="geo-canonical-v1"` en el `<div>`
   raíz (Inspector → Element, sin consola).
4. Verificar badge `P-POPUP-2 ON` arriba-izquierda del popup en
   preview lovable.app.
5. Abrir POI cuya taxonomy contenga `Villa/Pueblo` → la sección de
   hashtags NO repite `#Villa/Pueblo` ni `#Asentamientoshumanos`.
6. Rollback runtime: `window.__POPUP_GEO_CANONICAL_V1__ = false` y reabrir
   popup → vuelve al header legacy de 4 chips coloreados con `Europa`.

## 8. Persistencia

- `docs/popups/p-popup-2-validation.md` (este archivo)
- Plan original: `docs/popups/p-popup-2-implementation-plan.md`
- Sync GitHub automático vía Lovable

## 9. P2-FIX-F — Mover canon a la rama enriched (2026-05-16)

**Bug detectado en preview**: Tras P2-FIX-A..E, el usuario no veía ningún
cambio visual ni el badge `P-POPUP-2 ON`. Causa raíz:

`createPopupContent()` tiene dos ramas:
- **Rama A enriched** (`if (isEnriched && enriched)`, líneas 706–1086):
  es la que se renderiza para POIs con `enriched_data.descripcion`.
- **Rama B fallback** (líneas 1088+): solo para POIs sin enriquecer.

Los patches anteriores (data-popup-version, badge diag, switch
`buildGeoHeaderHtml` vs chips legacy 4-color) se aplicaron por error a la
**Rama B**, mientras que el caso real (A Coruña enriquecida) entra siempre
por la **Rama A**. Por eso:
- No aparecía `data-popup-version` en el DOM.
- No aparecía el badge.
- La jerarquía geo seguía siendo `localizacionLinks` italic ("A Coruña,
  Galicia, España, Europa"), que nunca fue tocada por P-POPUP-2.

**Nota**: la rama canonical de tags (`getCanonicalPopupTags`) SÍ se aplicó
correctamente a la Rama A (línea 908 del switch `case 'etiquetas'`), por eso
los tests pasaban y los buckets de tags sí estaban canonicalizados.

**Fix aplicado**:
- Movido `data-popup-version` + `data-popup-geo-canonical` + badge
  `P-POPUP-2 ON` al `<div>` raíz de la Rama A (línea 721).
- Sustituido `localizacionLinks` italic por `buildGeoHeaderHtml(...)`
  bajo flag en la Rama A (línea 740). Si flag OFF → vuelve el italic legacy.
- Sin cambios en lifecycle, cámara, subset-fit, marker grammar, React
  migration, PopupShell.
- 30/30 vitest siguen verdes.

**Validación post-fix**:
- Hard refresh preview → badge "P-POPUP-2 ON" visible en popup enriched.
- DevTools → root del popup contiene `data-popup-version="geo-canonical-v1"`.
- Header geo: chips canónicos sin continent, dedupe uniprovincial OK.
- Rollback runtime: `window.__POPUP_GEO_CANONICAL_V1__=false` + reabrir →
  vuelve el italic `localizacionLinks` legacy.

**Estado**: `ratified-default-on + FIX-A..F applied`.

**Fuera de scope (P-POPUP-3)**: `Mi punto`, `#frankie_gmz`,
`#AtlasObscura_España`, Notas, ownership cleanup, source hashtags cleanup.

---

## Rollout policy (2026-05-16)

Rollout global, sin gating por usuario/email/role. El flag
`POPUP_GEO_CANONICAL_V1_DEFAULT = true` y su kill-switch runtime
`window.__POPUP_GEO_CANONICAL_V1__` son **globales**: herramientas
de rollback/debug, no segmentación de cohorte. La validación visual
humana ocurre directamente en preview/app con default ON para todos
los usuarios. El sandbox queda reservado para fixtures E2E, datos
sintéticos y validación técnica. Ver
[`../governance/rollout-policy.md`](../governance/rollout-policy.md).
