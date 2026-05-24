# Audit — POI Counts: Global Sources

> Status: **AUDIT — FASE 1 (read-only)**. Inventario transversal de
> contadores de POIs en UI operativa. Ratifica y aplica el contrato
> [`../contracts/poi-counts-canon.md`](../contracts/poi-counts-canon.md).
>
> Companions:
> - [`./search-filter-selection-state-cross-mode-postflight.md`](./search-filter-selection-state-cross-mode-postflight.md)
> - [`./search-filter-debt-subtab-count-mismatch-ticket.md`](./search-filter-debt-subtab-count-mismatch-ticket.md)
>
> Owner: Content domain. Sin cambios de código en este PR.

---

## 1. Metodología

1. Ripgrep sobre `src/` con patrones: `length|count|total|stats|
   bucket|universe|ratio` cruzado con `loc|poi|catalog|filter|
   select|debt|enrich|export`.
2. Lectura puntual de cada call site detectado.
3. Cruce con helpers canónicos declarados en
   `poi-counts-canon.md` §7.
4. Clasificación por universo (A–E) y verificación de etiqueta visible
   contra el diccionario cerrado §5.
5. Hallazgos previos ya documentados se incorporan sin re-investigar.

---

## 2. Tabla maestra de contadores

| # | Componente (archivo:línea) | Texto visible | Fuente actual | Universo (canon) | Helper usado | ¿Redondea? | ¿Cumple canon? | Riesgo | Fix propuesto |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `FloatingToolbar.tsx:406-407` | indicador verde / azul | `filteredLocations.length`, `allLocations.length` | A intentado, hoy híbrido | `getBucketStats(allLocations, uid)` | No | Parcial — `allLocations` viene de `getAllLocations()` (annotated sin detached); coincide con A pero no comparte helper con FilterBar | medio | PR-COUNTS-1: cablear `getVisibleCatalogUniverse()` |
| 2 | `FloatingToolbar.tsx:659,672` | `myCatalogCount`, `totalCatalogCount` | `stats.myCatalogCount`, `stats.catalogTotal` | A | `getBucketStats` | No (`formatCount` = Intl) | Sí | bajo | — |
| 3 | `FilterBar.tsx:128` | base de cálculo | `filteredLocations.length` | depende del modo | local | No | OK como derivado | bajo | — |
| 4 | `FilterBar.tsx:142-143` | counts de subtab Con deuda / Sin enriquecer | `resolveUniverseBase('debt'/'unenriched', allLocationsForUniverseSource).length` | C | `resolveUniverseBase` | No | Sí (depende de fuente A correcta) | medio | depende de PR-COUNTS-1 + cierre del ticket subtab 22 vs 18 |
| 5 | `FilterBar.tsx:278` | header `0 / T` | `universeBaseLocations.length` | A/C según modo | `resolveUniverseBase` | No | Sí | bajo | — |
| 6 | `FilterBar.tsx:401` | "mostrando X% del total" | `Math.round(filteredCount/stats.total*100)` | porcentaje, no count | `Math.round` | Sí (legítimo) | Sí (excepción §2.1 — es %) | bajo | añadir tooltip con count exacto |
| 7 | `FilterBar.tsx:496,520-521` | footer "(N)" / "N POIs sin enriquecer" | `effectiveActionSet.length` | D | `effectiveActionSet` | No | Sí | bajo | — |
| 8 | `FilterBar.tsx:117-119,160,172` | toasts "N ubicaciones" | `locations.length`, `filteredLocations.length` | varios | inline | No | Etiqueta genérica "ubicaciones" sobre universos distintos | medio | renombrar a "X seleccionadas" / "X actualizadas en <modo>" |
| 9 | `HealthFilterActionCTA` | CTA "Mantener X" | (consume `subtabCounts` de FilterBar) | C | `resolveUniverseBase` | No | Sí | bajo | — |
| 10 | `GeographyTree` / `ClassificationTree` / `TagsTree` | sum de hojas | derivado del subset filtrado | C/A según modo | derivado | No | Sí salvo que reciba subset distinto | medio | invariante de árbol (test) |
| 11 | `PlaceTypeFilter` | conteo por tipo | derivado | A/C | derivado | No | Sí | bajo | — |
| 12 | `EffectiveActionFooter` | acciones disponibles | `effectiveActionSet` / `destructiveActionSet` | D | helpers SoT | No | Sí | bajo | mantener guard "delete usa destructive" |
| 13 | `ExportPanel` (`src/components/ExportPanel.tsx`) | origen / elegibles / excluidos | `source.locations` + `evaluatePoiExport` | E | `evaluatePoiExport` | No | Parcial — no siempre muestra N=E+X explícito | medio | PR-COUNTS-4: cards separados N/E/X |
| 14 | `SelectionActions` | "X seleccionados" | `selectedLocations.size` | D | — | No | Sí | bajo | — |
| 15 | Popup POI (`createPopupContent`) | rara vez muestra counts; "X cercanos" | derivado de proximidad | distinto (proximity) | — | No | Etiqueta debe ser "cercanos" (no "POIs") | bajo | verificar no decir "POIs" genérico |
| 16 | `GeographyBackfillPanel` | "X pendientes" | server count | C/maintenance backend | server | No | Etiqueta "Pendientes" OK (§5) | bajo | — |
| 17 | `RecoverImagesPanel` | métricas | `image-recovery-job-metrics` | maintenance | helpers store | No | Sí | bajo | — |
| 18 | `UsersSidebar` | "X POIs de seguido" (badge) | filtra por owner | B | `filterByUserId` matcher | No | Etiqueta genérica "POIs" sobre `mapVisibleUniverse` | bajo-medio | etiquetar "POIs en mapa" o "compartidos" |
| 19 | `IncompleteLocationsPanel` | listado de incompletos | server query | maintenance backend | server | No | Sí | bajo | — |
| 20 | `TrashPanel` | "X en papelera" | server query | maintenance | server | No | Sí | bajo | — |

> El alcance cubre los componentes enumerados en el ticket. Cualquier
> nuevo contador descubierto fuera de esta tabla cae bajo §6 (regla de
> extensión del canon) y debe añadirse en PR de seguimiento.

---

## 3. Hallazgos preliminares (incorporados)

1. **Top bar 5095 vs FilterBar 5100** (fila #1 vs #5)
   - Causa: FilterBar usa `getVisibleUniverseLocations()`
     (`mapVisibleUniverse`) como base para `Explorar`; top bar usa
     `getAllLocations()` (sin detached) → `catalogVisibleUniverse`.
   - 5 POIs detached/no-aprobados entran en FilterBar y no en top bar.
   - Etiqueta visible idéntica ("POIs"/"ubicaciones") → viola §5.
   - Documentado en chat previo y en
     `docs/audits/search-filter-selection-state-cross-mode-postflight.md`.

2. **Subtab "Con deuda" 22 vs CTA/árbol/footer 18**
   - Causa: predicado legacy local en cálculo de subtab fuera de
     `resolveUniverseBase('debt', …)`.
   - Ticket: `docs/audits/search-filter-debt-subtab-count-mismatch-ticket.md`.

3. **Etiqueta genérica "ubicaciones" en toasts**
   - Filas #8: mismos strings ("X ubicaciones") sobre universos
     distintos (filteredLocations en Explorar vs en Mantener vs
     selección manual). Riesgo de interpretación.

4. **Uso legítimo de `Math.round`** (fila #6)
   - Es porcentaje, no count. Excepción explícita §2.1 del canon.
   - Mejora opcional: tooltip con count exacto.

---

## 4. Lista de incumplimientos

### High
- **H1**: `FloatingToolbar` y `FilterBar (Explorar)` muestran misma
  etiqueta para universos distintos (filas #1, #5). Causa el gap
  5095/5100.
- **H2**: subtab "Con deuda" usa predicado legacy fuera de
  `resolveUniverseBase` (fila #4). Causa gap 22/18.

### Medium
- **M1**: `ExportPanel` no siempre expone N/E/X separados (fila #13).
- **M2**: Toasts en FilterBar usan etiqueta genérica "ubicaciones"
  sobre universos heterogéneos (fila #8).
- **M3**: `UsersSidebar` etiqueta "POIs" sobre `mapVisibleUniverse`
  (fila #18).

### Low
- **L1**: Counts sin `Intl.NumberFormat` consistente en algunos toasts
  (fila #8).
- **L2**: Popup POI no estandariza etiqueta "cercanos" (fila #15).

---

## 5. Propuesta de PRs de corrección (priorizada)

| PR | Severidad | Alcance | Cierra |
|---|---|---|---|
| **PR-COUNTS-1** | high | Crear `getVisibleCatalogUniverse` (sobre `getLocationBucket`) en `src/domains/content/lib/`. Cablear `FloatingToolbar` y `FilterBar` (`allLocationsForUniverseSource`). Mantener `getVisibleUniverseLocations` SOLO para markers/mapa. | H1, gap 5095/5100 |
| **PR-COUNTS-2** | high | Reemplazar predicado legacy del subtab "Con deuda" por `resolveUniverseBase('debt', catalogVisibleUniverse)`. Añadir test invariante. | H2, ticket subtab 22/18 |
| **PR-COUNTS-3** | medium | Tests de contrato §8 del canon: no-rounding guard, no-approx-language guard, invariantes Explorar/Debt/Unenriched, delete-uses-destructive, selection-intersection. | guard rails |
| **PR-COUNTS-4** | medium | `ExportPanel`: exponer cards N/E/X con etiquetas `Exportables` / `Elegibles` / `Excluidos`. Asserción `N=E+X`. | M1 |
| **PR-COUNTS-5** | medium | Renombrar toasts y badges genéricos: "ubicaciones" → etiqueta del modo (`seleccionadas`, `actualizadas en Con deuda`, etc.). `UsersSidebar`: "POIs en mapa". | M2, M3 |
| **PR-COUNTS-6** | low | Pasar toasts y métricas residuales por `Intl.NumberFormat('es-ES')`. Verificar popup POI usa "cercanos" no "POIs". | L1, L2 |

Orden recomendado: **PR-COUNTS-1 → PR-COUNTS-2 → PR-COUNTS-3** (los
tests cierran las invariantes que los dos primeros restauran). Luego
PR-COUNTS-4..6 en paralelo.

---

## 6. Resumen ejecutivo

- **Canon ratificado**: `poi-counts-canon.md` activo.
- **Contadores auditados**: 20 (FloatingToolbar, FilterBar y árbol,
  HealthFilterActionCTA, trees, PlaceTypeFilter,
  EffectiveActionFooter, ExportPanel, SelectionActions, popup,
  UsersSidebar, paneles de mantenimiento).
- **Incumplimientos**: 2 high (H1, H2), 3 medium (M1, M2, M3), 2 low
  (L1, L2).
- **PRs propuestos**: 6, encabezados por PR-COUNTS-1 (cierra el gap
  visible 5095/5100) y PR-COUNTS-2 (cierra subtab 22/18).
- **Ningún contador redondea** POIs en violación del canon. El único
  `Math.round` detectado (FilterBar:401) es un porcentaje y entra en
  la excepción explícita §2.1.

---

## 7. Fuera de alcance

- No se modifica código en este PR.
- No se tocan datos, schema, backend, edge functions, serializers, ni
  `PR-EXPORT-2 core`.
- No se modifica `getFilteredLocations` (markers).
- No hay bump de versión.
