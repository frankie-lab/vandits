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

## Reglas

1. Toda entrada nueva debe nacer aquí antes de cualquier PR de fix.
2. `Status` se actualiza en la misma PR que cambia el código.
3. Findings nuevos descubiertos durante reviews → entrada con `open` antes de mergear.
4. `accepted-debt` requiere ADR o nota explícita de por qué no se va a resolver.
