# Selection Counter — Ownership Ratios Postflight

Status: SHIPPED · Frontend-only · No core/data/schema/backend/bump.
Area: Discovery → FilterBar (Buscar y Filtrar).
Plan: `docs/audits/selection-counter-ownership-ratios-plan.md`.

---

## 1. Archivos modificados

- `src/domains/content/store/locations-store.ts`
  — Extraído `_computeFiltered({ ignoreSelection })` interno.
  — `getFilteredLocations()` → `_computeFiltered({ ignoreSelection: false })` (contrato intacto).
  — Nuevo `getFilteredUniverse()` → `_computeFiltered({ ignoreSelection: true })`.
  — Tipo añadido a la interfaz del store.
- `src/domains/content/hooks/use-filtered-locations.ts`
  — Nuevo hook `useFilteredUniverseIgnoringSelection()`. Deps: `[docVersion, filters, currentUserId]` (omite `selectedLocations` deliberadamente).
- `src/components/FilterBar.tsx`
  — `bucketStats` y `ownershipRatios` consumen `filteredUniverse`.
  — Header con selección muestra `X / T seleccionados`.
  — Fila inferior intacta: sólo `Seleccionar todo · Limpiar`.
- `src/test/selection-counter-ratios.test.ts`
  — Guard antiguo reemplazado por test positivo + escenarios de universo independiente + contract test del store.

---

## 2. Causa raíz

`getFilteredLocations()` del store recortaba el resultado a `selectedLocations` cuando había selección:

```ts
const restricted = sel && sel.size > 0
  ? filtered.filter(l => sel.has(l.id))
  : filtered;
```

`FilterBar` consumía esa salida y la trataba como "universo" para denominadores. Resultado: al seleccionar 41 POIs, `filteredLocations.length === 41`, por tanto `T = Tm = 41`.

La fórmula de `ownershipRatios` era correcta sobre lo que recibía; el bug estaba aguas arriba — la entrada ya venía recortada. El recorte por selección es contrato necesario del mapa, GeographyTree y marker layers, pero NO debe alimentar denominadores de UI.

Fix: separar dos vistas del mismo pipeline. `getFilteredLocations()` mantiene su contrato. `getFilteredUniverse()` devuelve el universo sin recorte. FilterBar usa universo para denominadores (T/Tm/Ts) y la intersección con selección para numeradores (X/Xm/Xs).

---

## 3. Antes / Después

**Antes** (41 seleccionados):
```
41 seleccionados
Míos 41 / 41 · Seguidos 0 / 0
```

**Después** (41 sobre 5095 visibles, 4739 míos / 356 seguidos):
```
41 / 5095 seleccionados
Míos 41 / 4739 · Seguidos 0 / 356
```

**Sin selección** (sin cambios visibles):
```
5095 ubicaciones
4739 míos · 356 seguidos
```

Consistente en Explorar / Mantener / Seleccionar (el header se renderiza fuera del switch `panelMode`).

---

## 4. Tests

### Suite específica

`bunx vitest run src/test/selection-counter-ratios.test.ts` → **21/21 PASS** (16 ms).

Cobertura:
- Fórmula `computeRatios` (9 casos): sin selección, 100% míos, 100% seguidos, mixta, fuera de filtro recortada, anónimo, cross-document, fallback `_docUserId`, filtros reducen universo.
- UX copy (2): singular/plural.
- Source-level guards FilterBar (4): header muestra `X / T`, conserva botones `Seleccionar todo / Limpiar`, copy de aviso secundario, `ownershipRatios` consume `useFilteredUniverseIgnoringSelection` + `getBucketStats(filteredUniverse, …)` + `const T = filteredUniverse.length`.
- Universo independiente de selección (5): 41 míos / 5095, 100% seguidos no colapsa Tm, mixta, fuera de universo no infla X, filtros reducen universo.
- Contract test del store (1): `getFilteredUniverse` + `_computeFiltered({ ignoreSelection })` + branch `ignoreSelection ? null : state.selectedLocations`.

### Suite global

`bunx vitest run` → **1287 verdes / 29 fallos preexistentes**.

Dominios afectados (NO relacionados con este PR):
- `territorial-canon-wire-resolver-edge-contract` (canon territorial).
- `enrichment-helpers` (status enriched).
- `index-composition` (presupuesto de líneas en Index.tsx).
- `is-shareable-poi`, `poi-shareability` (frontera shareable).
- `poi-curation-level` (niveles canónicos POI-9/10).
- `popup-curation-validate-geo` (pipeline validate-geo).
- `backoffice-ux-canon-5-contract` (geography taxonomy).

Todos son `AssertionError` de dominios ajenos al contador / selección / store-filter pipeline. **No bloquean este PR.**

---

## 5. Confirmaciones de no regresión

- **`getFilteredLocations()` conserva contrato.** Su body es ahora `_computeFiltered({ ignoreSelection: false })` y el flag se evalúa idénticamente al código previo (`hasSelection = state.selectedLocations.size > 0` + `restricted = sel.size > 0 ? filtered.filter(sel.has) : filtered`). El array devuelto es exactamente el mismo que antes del refactor.
- **Mapa / GeographyTree / marker layers** siguen consumiendo `getFilteredLocations()` (vía `useFilteredLocations()`). No se cambió ningún call site fuera de FilterBar.
- **PR-EXPORT-2 core intacto.** `evaluatePoiExport`, `POI_EXPORTERS`, `runPoiExport`, serializers (`kml-parser`, etc.), `ExportPanel`, `export-source-resolver`, `share-eligibility`, `ShareSheet`: ninguno tocado.
- **Lógica de selección intacta.** `selectedLocations`, `toggleSelection`, `selectAll`, `clearSelection`, `selectByFilter`: sin cambios.
- **Sin cambios en datos / schema / RLS / edge functions / backend / bump.**

---

## 6. Riesgos residuales

- `bucketStats` ahora se calcula sobre el universo en lugar del subset recortado. Cuando hay selección, el desglose "catálogo / mesa / seguidos" de la línea inferior ya no se renderiza (se sustituye por `Míos / Seguidos`) — comportamiento ya vigente, sin cambio funcional.
- Coste extra: una segunda pasada O(n) sobre ~5k locations sin el recorte por selección, memoizada con deps `[docVersion, filters, currentUserId]`. < 1 ms en práctica.
- Si en el futuro se introducen más consumidores de "universo visible" (faceting estable bajo selección, ExportPanel Fase 3B), reutilizar `useFilteredUniverseIgnoringSelection()` — no duplicar el cálculo.

---

## Fuera de alcance (no tocado)

ExportPanel, PR-EXPORT-2 core, serializers, `runPoiExport`, share/export contracts, lógica de selección, schema, RLS, datos, backend, bump.
