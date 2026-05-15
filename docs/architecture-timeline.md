# Architecture Timeline

Cronología de contratos y ADRs. Cada entrada contesta:
- **Cuándo** nació el contrato.
- **Qué bug** lo motivó.
- **Qué ADR** lo congeló.

Orden cronológico inverso (más reciente arriba).

---

## 2026-05 — Subset-fit `mode:'always'` ignora cooldown
- **ADR**: ADR-0005
- **Contrato**: subset-fit-contract
- **Bug motivador**: clicks en "Enriquecidos / Sin actualizar / Vacíos / Ver todos" del popover Mis POI no encuadraban el subset cuando el usuario había gesticulado en los últimos 4s. El cooldown global `lastUserInteractionAt` aplicaba a todos los modos.
- **Cambio**: introducir `mode: 'always' | 'if-outside'`. `'always'` salta cooldown. `'if-outside'` mantiene umbral 40% + cooldown 4s.
- **Backlog**: BL-003.

## 2026-05 — Coords pre-resueltas en `requestSubsetFit`
- **ADR**: ADR-0005 (extensión)
- **Contrato**: subset-fit-contract
- **Bug motivador**: viewport culling z≥7 sólo monta markers en bounds ampliados. Resolver bounds desde `markersRef` producía fits parciales para subsets dispersos.
- **Cambio**: `SubsetFitDetail.coords` opcional, prioritario sobre `markersRef`. Caller pasa coords del subset filtrado completo.
- **Backlog**: BL-004.

## 2026-05 — Documentación viva
- **Acción**: creación de `docs/` con contratos, ADRs, audits, flows, glossary.
- **Motivación**: conversaciones recientes mostraron que cada bug nacía de violar un contrato no escrito (popup, focus, subset-fit, heavy-ops).

## 2026-05 — HeavyOperations Phase 1
- **ADR**: ADR-0006
- **Contrato**: heavy-operations-contract
- **Bug motivador**: feedback inconsistente entre operaciones (filtros vs enrichment vs import). Ausencia de lifecycle común.
- **Cambio**: `useHeavyOpsStore` con `pending → running → done|error`, watchdog y `blockReentry`. Phase 1: solo `MyCatalogQuickFilters` cableado.
- **Backlog**: BL-005, BL-006.

## 2026-05 — Separación FilterBar vs popover Mis POI
- **ADR**: ADR-0007
- **Contrato**: filter-axis-contract
- **Bug motivador**: `visualState` y `healthFilter` duplicados entre FilterBar y popover, con ownership ambiguo de quién forzaba `ownershipFilter='mine'`.
- **Cambio**: popover es UI especializada que SIEMPRE fuerza `ownershipFilter='mine'` y emite `lovable:my-catalog-popover-applied`. FilterBar mantiene ejes generales sin tocar `ownershipFilter='mine'`.

## 2026-04 — visualState como eje operativo
- **ADR**: ADR-0003
- **Contrato**: filter-axis-contract
- **Bug motivador**: `visualState` (enriched/imported/empty) era un campo derivado pero también filtro UI. Sin ownership claro de cómo se setteaba.
- **Cambio**: declarado eje canónico en `filters`. Único escritor: setters del store. Helper único `getPointVisualState`.

## 2026-04 — Popover "Mis POI"
- **ADR**: ADR-0004
- **Contrato**: filter-axis-contract + subset-fit-contract
- **Bug motivador**: necesidad de quick-filters sobre el catálogo propio sin contaminar la FilterBar.
- **Cambio**: `MyCatalogQuickFilters` + `useMyCatalogPopoverFit`. Mutua exclusión visualState/healthFilter dentro del popover.

## 2026-03 — Pipeline POI Source
- **Memoria**: `mem://logic/poi/source-pipeline-canonical`
- **Contrato**: marker-grammar-contract + visibility-contract
- **Bug motivador**: clasificación física (`resolveLayerGroupKey`) y visibilidad (`resolveLayerVisibility` + zoom gates) estaban mezcladas. Cambios en uno rompían el otro.
- **Cambio**: orden inmutable `resolvePoiSource → resolveShareability → filterBySource → resolveMarkerGrammar → resolveLayerGroupKey → applyLayerVisibility → createCustomIcon`.

## 2026-03 — Owner identity v2.6 (no green / no gray)
- **Memoria**: core memory PR-OWNER-IDENTITY-2.6
- **Contrato**: marker-grammar-contract
- **Bug motivador**: identidades cromáticas asignadas a followed colisionaban con verde "enriched" o caían en grises desaturados.
- **Cambio**: dos exclusiones cromáticas duras (verdes + grises) en allocator OKLCH. Identidad solo a `followStatus === 'accepted'`.

## 2026-03 — Owner resolver único
- **Memoria**: PR-USER-FILTER-PIPELINE
- **Contrato**: visibility-contract
- **Bug motivador**: `ownerUserId` y `_docUserId` se leían directamente desde múltiples sitios. `_docUserId` era inconsistente.
- **Cambio**: helper único `getLocationOwnerUserId(loc) = ownerUserId ?? _docUserId`. `_docUserId` declarado fallback legacy.
- **Backlog**: BL-008.

## 2026-02 — Separación visibilidad vs grammar
- **ADR**: ADR-0002
- **Contrato**: visibility-contract + marker-grammar-contract
- **Bug motivador**: el renderer decidía "qué se ve" Y "cómo se ve". Cualquier cambio de gramática afectaba la visibilidad.
- **Cambio**: `applyLayerVisibility` decide qué se monta. `createCustomIcon` lee `MarkerGrammar` y solo renderiza.

## 2026-02 — Centralización `popupclose`
- **ADR**: ADR-0001
- **Contrato**: popup-contract
- **Bug motivador**: cada marker registraba `marker.on('popupclose')` con stale closure sobre `focusedLocationId`. El deselect resultante era incorrecto tras filtros.
- **Cambio**: único `map.on('popupclose')` que lee `useLocationsStore.getState()`.
- **Backlog**: BL-001.

## 2026-02 — Viewport culling v1
- **Memoria**: `mem://logic/map/viewport-culling-v1`
- **Contrato**: visibility-contract
- **Bug motivador**: rendimiento degradado con miles de POIs.
- **Cambio**: en z≥7 solo se montan markers en viewport ampliado. `filteredLocations ⊇ markerLocations`.
- **Consecuencia indirecta**: motivó BL-004 (callers de `subset-fit` debían pre-resolver coords).

---

## Cómo añadir entradas

Cualquier ADR nuevo debe añadir entrada arriba (más reciente). Formato fijo:
- Fecha (YYYY-MM)
- Título corto
- ADR/Memoria de referencia
- Contrato afectado
- Bug motivador
- Cambio
- Backlog IDs relacionados (si aplica)
