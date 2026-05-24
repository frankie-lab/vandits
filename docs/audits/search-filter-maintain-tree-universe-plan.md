# Plan UX — Árbol Geo/Tipo/Tags/Legacy unificado por universo activo

Estado: plan congelado (aprobado con ajuste `effectiveActionSet`).
Alcance: documentación. No incluye código, datos, schema, backend ni bump.

## 1. Modelo conceptual

Las tres vistas del panel "Buscar y Filtrar" (Explorar, Mantener→Con deuda, Mantener→Sin enriquecer) comparten exactamente la misma estructura de navegación jerárquica (Geo / Tipo / Tags / Legacy). Lo único que cambia entre vistas es el **universo base** sobre el que se calculan nodos, counts, selección y acciones.

Variables canónicas:

- `activeModeUniverse ∈ { 'all' | 'debt' | 'unenriched' }` — derivado del tab activo de `PanelModeTabs` y del sub-tab de Mantener.
- `universeBase` = subconjunto de `getAllLocations()` resuelto por `resolveUniverseBase(activeModeUniverse, allLocations)` (helper único conceptual; SoT).
- `treeSelection` = refinamiento jerárquico Geo/Tipo/Tags/Legacy (campos `filters.{continent,country,region,zone,comarca,localidad,sublocalidad,street,classificationCode,tag,tags,placeType}`).
- `userSelection` = `selectedLocations` (selección manual del mapa).
- `effectiveActionSet` (regla canónica para CTAs y acciones):
  ```text
  effectiveActionSet =
    si userSelection no está vacía:
      universeBase ∩ treeSelection ∩ userSelection
    en caso contrario:
      universeBase ∩ treeSelection
  ```

Pipeline conceptual inmutable:

```text
activeModeUniverse → universeBase
                       │
                       ├─► treeNodes(universeBase)            (counts del árbol)
                       │
                       └─► effectiveActionSet                  (input de acciones)
                              ▲
                              ├── treeSelection (refina)
                              └── userSelection (opcional, restringe si presente)
```

Reglas duras:

- El árbol **siempre** representa `universeBase`. Sus counts nunca mezclan global con subconjunto.
- `effectiveActionSet` jamás es vacío "por no haber selección manual". Si no hay `userSelection`, las acciones operan sobre `universeBase ∩ treeSelection`. Si tampoco hay `treeSelection`, operan sobre `universeBase` completo.
- "Seleccionar todo" siempre actúa sobre `universeBase ∩ treeSelection` (no añade `userSelection` como restricción; es justamente lo que la materializa).

## 2. Universos base

- `all`: universo visible/autorizado actual. Igual al `getFilteredUniverse()` de hoy, sin aplicar los ejes que el árbol va a controlar (Geo/Tipo/Tags/Legacy).
- `debt`: subset de `all` con deuda objetiva. Criterio canónico (ya en uso por `HealthFilterActionCTA` y `getPointCurationLevel`):
  - `getPointHealthRings(loc).length > 0`, o
  - `geoHealth ∈ { partial, stale_name, empty }`.
- `unenriched`: subset de `all` con `!isPointEnriched(loc)` y `sourceKind === 'imported'` (mismo criterio que el contador "Sin enriquecer" hoy).

Helper único propuesto (conceptual, no implementar aún):

```ts
resolveUniverseBase(mode: 'all' | 'debt' | 'unenriched', locs: GeoLocation[]): GeoLocation[]
```

## 3. Comportamiento por pestaña

- **Explorar**: tabs Geo/Tipo/Tags/Legacy idénticas a hoy. `universeBase = all`.
- **Mantener → Con deuda**: mismas 4 tabs. `universeBase = debt`. El CTA "resolver/enriquecer/revisar deuda" pasa a operar sobre `effectiveActionSet` (antes operaba sobre `filteredLocations` global).
- **Mantener → Sin enriquecer**: mismas 4 tabs. `universeBase = unenriched`. La acción "enviar a enrichment" opera sobre `effectiveActionSet`.

Persistencia de estado entre vistas: la tab activa (Geo/Tipo/Tags/Legacy) y `treeSelection` se preservan al alternar Explorar ↔ Mantener (intersección esperada por el usuario).

## 4. Cálculo de counts

- Los 4 árboles (`GeographyTree`, `ClassificationTree`, `TagsTree`, `PlaceTypeFilter`) deben aceptar conceptualmente `universeBase` (o consumir un selector único). Hoy todos leen `getAllLocations()` directamente. La regla nueva: leer `resolveUniverseBase(activeModeUniverse, allLocations)`.
- Se mantiene la norma "filter axes": cada árbol cuenta intersectando con los **otros** ejes activos (vía `matchesLocationFilters(loc, filters, { include<ejePropio>: false })`), pero el universo de partida es `universeBase`, no `allLocations`.
- Invariante de suma por raíz: en Con deuda con 13 POIs, la suma de continentes en el árbol Geo = 13. Idéntico para Tipo, Tags, Legacy.
- El nodo "Sin clasificar / Sin geo / Sin tags" también se calcula sobre `universeBase`.

## 5. Interacción con selección

- `treeSelection`: refina visualmente y para counts dentro de `universeBase`. No es selección manual.
- `userSelection` (`selectedLocations`): selección manual del mapa, opcional.
- "Seleccionar todo": materializa `universeBase ∩ treeSelection` como `userSelection`. Etiqueta y count contextualizados al modo activo (p. ej. "Seleccionar 47 POIs sin enriquecer de France").
- Acciones: usan **siempre** `effectiveActionSet`. No requieren `userSelection` previa para tener input no vacío.
- Contador superior (`FloatingToolbar`): denominadores reflejan `universeBase`. Etiqueta clara cuando el modo no es `all` (sufijo "(con deuda)" / "(sin enriquecer)") para evitar confusión con counts globales.

## 6. Interacción con ExportPanel

- `ExportPanel` mantiene el contrato `evaluatePoiExport` y la propagación de `scope` + `scopeProvided: true` (PR-EXPORT-1; ver `mem://logic/export/poi-export-contract` y `docs/contracts/poi-export-contract.md`). No cambia ninguna regla de elegibilidad.
- Lo único que cambia es el **input**: en lugar de `filteredLocations` global o `userSelection`, recibe `effectiveActionSet`.
  - Compat: con `activeModeUniverse='all'`, sin `treeSelection` y sin `userSelection`, `effectiveActionSet = all` → equivalente al comportamiento actual.
- Idem para futuras acciones (Enriquecer, Etiquetar, Reclasificar): el contrato `(input: GeoLocation[]) => …` no cambia; solo cambia el conjunto pasado. Cero refactor en la lógica de cada acción.

Ejemplo decisivo (motivo del ajuste `effectiveActionSet`):

> Mantener → Sin enriquecer → France → Exportar
> opera sobre los POIs sin enriquecer de France, aunque el usuario no haya hecho "Seleccionar todo" antes.

## 7. Riesgos

- **Desincronización contador / árbol**: si el contador superior y la suma de raíces del árbol Geo no coinciden, el usuario pierde confianza. Mitigación: SoT única `resolveUniverseBase` consumida por ambos.
- **Performance**: recomputar 4 árboles sobre `universeBase` en cada `setFilters` puede ser costoso con 5k+ POIs. Mitigación: memoizar `universeBase` por `(activeModeUniverse, docVersion, filtros base)`.
- **Confusión semántica al cambiar de modo**: si el usuario tenía `country=France` en Explorar y cambia a Con deuda, debe ver Francia ya filtrada (intersección). Esto se documenta explícitamente como comportamiento esperado.
- **Acciones sobre conjunto grande sin confirmación**: con `effectiveActionSet` permitiendo operar sin `userSelection`, una acción destructiva podría aplicarse a miles de POIs sin selección manual. Mitigación: confirmación tipada (`DestructiveConfirmDialog`) cuando `|effectiveActionSet| > N` y no hay `userSelection`.
- **CTA vacío**: si `effectiveActionSet` queda vacío (p. ej. Con deuda + filtro Geo sin matches), el CTA debe quedar disabled con mensaje claro ("No hay POIs con deuda en este subset").
- **Subset-fit**: cambios de `activeModeUniverse` o de `treeSelection` no deben mover cámara automáticamente; respetar `subset-fit-contract` (solo se mueve por trigger explícito).
- **Realtime**: nuevos POIs vía realtime deben recalcular `universeBase` correctamente; la memoización debe invalidarse por `docVersion`.

## 8. Tests necesarios (a planificar, no escribir)

- Unit:
  - `resolveUniverseBase(mode, locs)` con fixtures mixtos cubre `all/debt/unenriched`.
  - Counts de cada árbol con `universeBase=debt` suman exactamente `|debt|` por raíz (invariante).
  - Counts intersectan con otros ejes (ej. Geo cuenta respetando `placeType` activo).
- Integration:
  - Explorar → Con deuda preserva tab activa y `treeSelection`.
  - "Seleccionar todo" en `Sin enriquecer + France` selecciona exactamente los POIs sin enriquecer con `country='France'`.
  - `effectiveActionSet` con `userSelection` vacío = `universeBase ∩ treeSelection`.
  - `effectiveActionSet` con `userSelection` no vacío = `universeBase ∩ treeSelection ∩ userSelection`.
  - ExportPanel recibe el subset esperado en cada combinación (modo × treeSelection × userSelection).
- Contract:
  - Contador superior y suma de raíces del árbol Geo coinciden para los 3 modos.
- Regresión:
  - `activeModeUniverse='all'`, sin filtros, sin selección → comportamiento idéntico al actual (snapshot de counts y de input de ExportPanel).

## 9. Out of scope

- Implementación. Cambios de código en `FilterBar`, `GeographyTree`, `ClassificationTree`, `TagsTree`, `PlaceTypeFilter`, `HealthFilterActionCTA`, `ExportPanel`, `FloatingToolbar`.
- Cambios de schema, RLS, edge functions.
- Bump de versión.
- Confirmaciones tipadas sobre conjuntos grandes (se mencionan como mitigación de riesgo, no como entregable de este plan).
