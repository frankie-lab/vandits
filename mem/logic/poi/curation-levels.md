---
name: POI curation levels (P-POI-CURATION-1)
description: Capa lógica canónica de niveles de curación del POI (0/1/3/5/9/10) + renderer invariance del popup.
type: feature
---

Niveles canónicos POI-0/1/3/5/9/10 (sólo estos seis; prohibido inventar POI-2/4/6/7/8). Derivan tres ejes:

- **healthState**: red / yellow / green
- **shareability**: no / limited / yes
- **primaryAction**: name / validate-geo / resolve-conflict / heal / rate-experience / none

Helpers únicos en `src/domains/content/lib/poi-curation-level.ts`:
`getPoiCurationLevel`, `getPoiPrimaryHealingAction`, `isPoiShareable`, `getPoiCurationHealth`. Delegan 100% en `isPointEnriched`, `getPointHealthRings`, `loc.geoHealth`, `customData.visited|user_rating`. Coherencia obligatoria: `shareability='yes'` ⇒ `isShareablePoi(loc)=true`.

**Renderer invariance (regla DURA — literal):**
*Curation levels never fork popup renderer. They modify only logic, health, shareability and the `data-curation-action` attribute of the single canonical footer.*

Esto significa:
- NO crear `data-popup-footer="v2+"`, NO `data-popup-variant`, NO `popup-v2-*`, NO ramas `legacy-popup`.
- NO alterar shell, hero, breadcrumb, composer, ratings block (P-POPUP-14.2), taxonomía, PopupShell, F2, ni marker grammar.
- El único marker nuevo admisible es `data-curation-action` / `data-curation-level` dentro del botón principal del footer canónico (`data-popup-footer="v1"`).
- POI-10 (estado final) NO emite botón principal.
- Se omite el botón para curator points y popups en contexto nearby (paridad con P-POPUP-14.2).

Tests obligatorios:
- `src/test/poi-curation-level.test.ts` (6 niveles + coherencia).
- `src/test/popup-curation-primary-action.test.ts` (footer + guards de invariance).
- `src/test/popup-golden-poi-contract.test.ts` § `los niveles de curación NO bifurcan el renderer`.

Ver `docs/contracts/poi-curation-levels.md`.
