# Audit Backlog — findings accionables

Tabla normativa. Cada finding listado en `docs/audits/*.md` debe tener entrada aquí.

Severities: `critical` (bloquea release) / `high` (regresión visible) / `medium` (deuda activa) / `low` (vigilancia).
Status: `open` / `mitigated` (workaround activo) / `pending-manual-qa` (code-level validated; runtime QA humana pendiente; cierre condicionado a confirmación de los casos descritos en §QA Manual Pendiente) / `resolved` / `accepted-debt` (consciente, sin plan).

| ID | Finding | Source audit | Severity | Impact | Owner | Status | PR / ADR |
|---|---|---|---|---|---|---|---|
| BL-001 | Stale closures per-marker en `popupclose` (histórico) | stale-closures H1 | high | Deselect incorrecto al cerrar popup tras filtros | map | resolved | ADR-0001 |
| BL-002 | Listeners globales en `LocationMap` con dep `[]` — riesgo de duplicación si se añaden deps | duplicate-listeners H2, H4, H6 / stale-closures H4 | medium | Doble handler en `subset-fit` o `popupclose` causaría fits/cierres duplicados | map | open (vigilancia) | — |
| BL-003 | Cooldown `subset-fit` bloqueaba `mode:'always'` | global-guards H1 | high | Popover Mis POI no encuadraba subset disperso | map | pending-manual-qa | ADR-0005 |
| BL-004 | Callers de `requestSubsetFit` que no pasan `coords` cuando markers están culled | subset-fit-contract anti-patrón | medium | Fit parcial bajo viewport culling z≥7 | discovery / map | mitigated | — |
| BL-005 | Watchdog `HeavyOps` puede disparar `failOperation` falso en ops legítimas >10s | global-guards H3 | low | Falsos negativos de timeout | shared/operations | accepted-debt | ADR-0006 |
| BL-006 | `HeavyOps` Phase 1 — solo `MyCatalogQuickFilters` cableado; `finishOperation` significa "lanzado" no "completado" | source-of-truth (deuda fase) / heavy-operations-contract | medium | Feedback inconsistente entre lanes (enrichment/import/geocoding aún por su cuenta) | shared/operations | open | ADR-0006 |
| BL-007 | `getMyCatalogQuickCounts` retornaba 0 para todas las filas | source-of-truth H4 | high | Counts incorrectos en popover Mis POI | discovery | open | — |
| BL-008 | Legacy `_docUserId` como fallback de `getLocationOwnerUserId` | source-of-truth H2 | medium | Ambigüedad de ownership en POIs heredados | content | mitigated | PR-USER-FILTER-PIPELINE |
| BL-009 | Coupling UI↔domain: lectura directa de `loc.enriched_data?.descripcion` desde UI | ui-domain-coupling H5 | low | Bypass de helpers (`isPointEnriched`) | content / ui | open (regla de review) | — |
| BL-010 | Side-effects de cámara distribuidos en hooks que reaccionan a `filters` | ui-domain-coupling H6 | medium | Riesgo de hooks compitiendo por la cámara | discovery / map | open | filter-axis-contract |
| BL-011 | Refactor de `LocationMap.tsx` (archivo gigante) en subhooks por capa | stale-closures H2 | medium | Re-render coste creciente; deps lists pesadas | map | accepted-debt | — |
| BL-012 | Single listener `subset-fit` no testeado (sin assert de count en runtime) + pendiente test E2E con control de tiempo y eventos Leaflet (`movestart`/`zoomstart`/`dragstart`); bloquea cierre de BL-003 a `resolved` hasta tener cobertura automatizada | duplicate-listeners H2 (recomendación) | low | Regresión silenciosa si se duplica | map / qa | open | — |
| BL-013 | `openPopupLocationId` solo accesible vía LocationMap — no expuesto a otros componentes | source-of-truth H1 | low | Si futuro consumidor necesita conocer el popup activo, hay que decidir vía ADR antes de promoverlo | map | accepted-debt | — |
| BL-014 | Bypass de `getLocationOwnerUserId` en `LocationMap.tsx:2124` (lectura inline `ownerUserId ?? _docUserId`) + duplicación de resolver entre `getBucketStats` y `getMyCatalogQuickCounts` | hardcoded-behaviors HI-001 / uniformity U1, U5 | high | Cualquier evolución del resolver no propaga a este callsite ni al popover | content / map | open | — |
| BL-015 | Coexisten dos buses de fit: canónico (`requestSubsetFit`) + legacy (`map-fit-bounds` window event) con 9+ callers, fuera del cooldown y del pipeline canónico | hardcoded-behaviors HI-007 / uniformity U2, U7 | high | Fits divergentes (sin cooldown, sin clamp z12, padding/maxZoom inline) y dificulta cualquier cambio de política | map / discovery / content / routes | open | subset-fit-contract |
| BL-016 | `localStorage` sin registro central: 14 archivos, 3 convenciones de prefijo (`vandits-`, `vandits_`, `geodata-`) + keys sin prefijo (`enrichment-criteria`, `REMEMBER_ME_KEY`, …) | hardcoded-behaviors HC-008 | medium | Riesgo de colisión, lecturas duplicadas, migraciones sin trazabilidad | shared / storage | open | — |
| BL-017 | Sin tokens de fit: `maxZoom`/`padding`/`COOLDOWN_MS`/`DEBOUNCE_MS`/`minZoom floor` hardcodeados por caller (9+ callsites de `maxZoom: 14`, política de `minZoom` divergente entre 6 hooks) | hardcoded-behaviors HC-001..004 / HI-003 | medium | Cambiar la política de fit requiere editar N sitios; documentación se desincroniza | map / design-system | open | subset-fit-contract |
| BL-018 | Eventos `lovable:*` (9 distintos) sin registro central de schema ni allowlist dispatcher/listener | uniformity U11 | low | Detalle de payload no tipado, riesgo de divergencia silenciosa entre emisor y consumidor | shared / events | open | — |
| BL-019 | `setTimeout` con números mágicos (toasts, highlights, min spinner, rate limits, retry backoff) sin módulo `src/shared/timings.ts` | hardcoded-behaviors HC-005, HC-009 | low | Timings inconsistentes; difícil ajustar UX o respetar rate limits sin cazar literales | shared / ui | open | — |
| BL-020 | Hex colors inline para markers/paletas (`MarkerStateRulesPanel.SAMPLE_COLORS`, `CollectionAppearanceDialog`, defaults `#3b82f6`/`#16a34a` en LocationMap) sin pasar por design-system | hardcoded-behaviors HC-007 | medium | Paletas fuera del codemod fase 4; futuras rebrandings parciales | design-system / ui | open | — |
| BL-021 | Fase B RBAC — **NO PROCEDE (deuda aceptada)**. Intento 2026-05-18 falló: `DROP FUNCTION has_role(uuid, app_role)` requiere CASCADE sobre 44 policies + view `v_geo_coverage`. Valores `'curator'`/`'user'` permanecen en `pg_enum` por dependencia estructural de `has_role` en RLS. Estado neutralizado: 0 usuarios asignados, 0 capabilities, 0 uso activo en policies/funciones DB; frontend y edge functions ya purgados por Fase A. Purga sólo en futura ventana dedicada con tooling automático de dump/recreate policies — no a mano. | rbac-canon | low (accepted) | Valores enum inertes; sin impacto funcional ni de seguridad | identity / db | accepted-debt | mem://governance/rbac-canon |
| BL-022 | Branches `isCurator` en `src/components/map/map-popups.ts` + tests asociados — lógica defensiva huérfana (no depende del enum `app_role`, lee flag `curatorId` del payload que ya nadie inyecta). Decisión pendiente como parte del canon P-POPUP / P-POI-CURATION, NO de RBAC. | rbac-canon (referencia cruzada) | low | Confusión semántica en el renderer; no produce fallo runtime | popup / content | open | — |
## QA Manual Pendiente

### BL-003 — subset-fit cooldown bypass para `mode:'always'`

Code-level validated en `docs/contracts/subset-fit-contract.md` (Validation Notes). Runtime pendiente de confirmar manualmente los dos casos siguientes:

**Caso A (positivo — `mode:'always'` debe ignorar cooldown):**
1. Pan/zoom manual sobre el mapa.
2. Antes de 4s: abrir popover "Mis POI" → click "Enriquecidos".
3. Esperado: SÍ encuadra (cámara se mueve a bounds del subset, clamp z12).

**Caso B (negativo — `mode:'if-outside'` debe respetar cooldown):**
1. Reset: pan/zoom manual sobre el mapa.
2. Antes de 4s: click chip Salud (FilterBar, `reason:'health-filter'`, `mode:'if-outside'`).
3. Esperado: NO encuadra (cooldown bloquea fit).

**Cierre:**
- Ambos casos confirmados → BL-003 pasa a `resolved`, anotar fecha + revisor en esta sección.
- BL-012 sigue `open` hasta cobertura E2E automatizada.

## Reglas

1. Toda entrada nueva debe nacer aquí antes de cualquier PR de fix.
2. `Status` se actualiza en la misma PR que cambia el código.
3. Findings nuevos descubiertos durante reviews → entrada con `open` antes de mergear.
4. `accepted-debt` requiere ADR o nota explícita de por qué no se va a resolver.
5. Findings con código mergeado pero sin validación runtime quedan en `pending-manual-qa` hasta que QA humana confirme los casos descritos en §QA Manual Pendiente. No se permite saltar de `open` a `resolved` sin pasar por este estado cuando la validación estática no cubre el comportamiento end-to-end.
