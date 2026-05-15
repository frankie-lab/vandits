# PR Impact Matrix

Mapa normativo de archivos sensibles → contratos, ADRs y danger zones obligatorios.

**Cómo se usa**: si una PR toca cualquier path de la columna izquierda, el reviewer DEBE verificar que las columnas siguientes están actualizadas o explícitamente declaradas "no impact" en la sección `## Documentation impact` del PR (formato abajo).

Si una PR no se ajusta a ninguna fila pero introduce **estado global**, **listener global** o **mutación de store transversal**, aplica la fila genérica correspondiente al final.

---

## Matriz de impacto

| Path / patrón | Riesgo principal | Contratos obligatorios | ADRs relacionados | Danger zone | Checklist |
|---|---|---|---|---|---|
| `src/components/LocationMap.tsx` | Listener global, popup lifecycle, subset-fit, reconciliación markers, viewport culling, owner identity | popup-contract, focus-selection-contract, subset-fit-contract, visibility-contract, marker-grammar-contract | ADR-0001, ADR-0002, ADR-0005 | §1, §2, §3, §4, §6 | A, B, C, D, E |
| `src/components/map/subset-fit.ts` | Único helper emisor de fits | subset-fit-contract | ADR-0005 | §2 | A, B |
| `src/components/map/map-popups.ts` | Construcción / ciclo de vida del popup Leaflet | popup-contract, focus-selection-contract | ADR-0001 | §3 | A, B |
| `src/components/map/map-v2-renderer.ts` | Renderizado de markers v2 | marker-grammar-contract, visibility-contract | ADR-0002 | §1, §7 | A, D |
| `src/components/toolbar/MyCatalogQuickFilters.tsx` | Quick-filters propios; fuerza `ownershipFilter='mine'`; emite eventos | filter-axis-contract, subset-fit-contract, heavy-operations-contract | ADR-0004, ADR-0005, ADR-0007 | §5 | A, B, C |
| `src/components/toolbar/use-my-catalog-popover-fit.ts` | Caller `requestSubsetFit` con coords pre-resueltas | subset-fit-contract | ADR-0005 | §2, §5 | A, B |
| `src/components/toolbar/FloatingToolbar.tsx` | Top-bar counters; mount único de listeners de popover | filter-axis-contract, heavy-operations-contract | ADR-0004 | §5, §6 | A, C |
| `src/hooks/use-layer-visibility.ts` | Singleton compartido de toggles de capa | visibility-contract | ADR-0002 | §7 | A, D |
| `src/domains/content/lib/location-filtering.ts` | Matcher único `matchesLocationFilters` | filter-axis-contract, visibility-contract | ADR-0003, ADR-0004, ADR-0007 | — | A, D |
| `src/domains/content/lib/location-owner.ts` | `getLocationOwnerUserId` (resolver único) | visibility-contract, filter-axis-contract | — | — | A |
| `src/domains/content/lib/point-visual-state.ts` | `getPointVisualState` (paleta verde/gris/naranja) | marker-grammar-contract | — | — | A |
| `src/domains/content/store/locations-store.ts` | Store zustand: `selectedLocations`, `focusedLocationId`, `filters` | focus-selection-contract, filter-axis-contract | — | §9 | A, B |
| `src/domains/discovery/store/discovery-store.ts` | Store zustand de Discovery | filter-axis-contract | — | — | A |
| `src/domains/v2/marker-grammar.ts` | `resolveMarkerGrammar` (decisor único) | marker-grammar-contract | ADR-0002 | §1, §7 | A, D |
| `src/domains/v2/marker-validation.ts` | Validación previa al pipeline POI source | marker-grammar-contract, visibility-contract | — | §7 | A, D |
| `src/lib/color/identity-allocator.ts` | Allocator OKLCH; exclusiones cromáticas duras | marker-grammar-contract | — | §8 | A, D |
| `src/shared/operations/heavy-operations-store.ts` | Store de operaciones pesadas (lifecycle, watchdog) | heavy-operations-contract | ADR-0006 | — | A, C |
| `src/stores/duplicate-store.ts`, `src/stores/geocoding-job-store.ts`, `src/stores/image-recovery-job-store.ts` | Stores zustand de lanes paralelas a HeavyOps | heavy-operations-contract (Phase 2) | ADR-0006 | — | A, C |
| **Patrón**: cualquier `window.addEventListener(...)` nuevo | Listener global no declarado | (depende del evento) + auditoría duplicate-listeners | — | §6 | A, B, F |
| **Patrón**: cualquier `map.on(...)` nuevo en LocationMap | Handler Leaflet duplicado | popup-contract, subset-fit-contract | ADR-0001 | §1, §3, §6 | A, B, F |
| **Patrón**: cualquier `create<...>Store` (zustand) nuevo | Estado global nuevo sin contrato | — (requiere contrato nuevo) | — | §9 (si transversal) | A, E |
| **Patrón**: cambios en RLS / migrations sobre tablas sociales o de identidad | Boundary de privacidad | visibility-contract (sandbox mirror), curated-only sharing | — | — | A |

### Leyenda Checklist
- **A** — Validación contra contrato verificada (Validation Notes actualizadas si es contrato crítico).
- **B** — Listener / handler con cleanup `removeEventListener` o `map.off` verificado.
- **C** — Lifecycle de heavy-op (`startOperation`/`finishOperation`/`failOperation`) cerrado en todas las ramas.
- **D** — `markerLocations` y `filteredLocations` siguen cumpliendo `filteredLocations ⊇ markerLocations`.
- **E** — Si añade estado global o store: contrato nuevo creado en `docs/contracts/`.
- **F** — Entrada nueva en `docs/audits/duplicate-listeners-audit.md` o `global-guards-audit.md`.

### Leyenda Danger zones
Numeración fija de `docs/danger-zones.md`:
1. `LocationMap.tsx` (monolito)
2. Subset-fit listener
3. `popupclose` flow
4. Viewport culling
5. FilterBar ↔ popover sync
6. Listeners globales `window.addEventListener`
7. `applyLayerVisibility` + zoom gates
8. Owner identity allocator
9. `useLocationsStore`

---

## Sección obligatoria en la descripción de cada PR

Pegar literalmente:

```markdown
## Documentation impact

- [ ] No impact
- [ ] Contract updated
- [ ] ADR updated
- [ ] Backlog updated
- [ ] Danger zone reviewed

Affected contracts:
- ...

Affected danger zones:
- ...

Backlog IDs:
- ...
```

Si todas las casillas están en `No impact` pero la PR toca paths de la matriz, **la PR se rechaza** hasta que el autor justifique.

---

## Required PR Questions

Toda PR que toque la matriz DEBE responder por escrito:

1. ¿Esta PR añade o modifica **estado global** (store zustand, context, singleton)?
2. ¿Añade o modifica **listeners globales** (`window.addEventListener`, `map.on`, custom event bus)?
3. ¿Cambia **focus, selección, popup o subset-fit**?
4. ¿Cambia **filtros o ownership** (matcher, axes, bucket stats)?
5. ¿Cambia **visibilidad o apariencia de markers** (zoom gates, grammar, identity color)?
6. ¿Debe **actualizarse algún contrato**? ¿Cuál?
7. ¿Debe **añadirse ADR nuevo**? ¿Por qué?
8. ¿Hay **backlog item relacionado** (BL-xxx)? ¿Lo cierra, lo modifica, o crea uno nuevo?

Respuestas explícitas, no inferidas.

---

## Protocolo de bug-fix

Cuando llega un bug en zonas cubiertas por contratos (popup, focus, subset-fit, filtros, visibilidad, heavy-ops), el fix **NO es aceptable** sin responder:

```markdown
## Bug forensics

Qué contrato violaba:
> ...

Qué invariante rompió (numerada):
> ej. subset-fit-contract #2

Qué archivo / función era danger zone:
> ej. danger-zones §2 (LocationMap.tsx L.2357)

Qué regresión histórica relacionada (BL-xxx):
> ej. BL-003

Qué test / manual check lo cubre ahora:
> ej. manual: click "Enriquecidos" tras gesto manual <4s — fit correcto.
> automated: pendiente (BL-012).
```

Si el bug expone una invariante no declarada, **añadirla al contrato en la misma PR**.

---

## Reglas operativas

1. La matriz es **exhaustiva por construcción**: si un path sensible no está aquí, se añade en la misma PR que lo introduce.
2. Reviewer rechaza PRs que toquen la matriz sin sección `## Documentation impact`.
3. Los patrones (`window.addEventListener`, `map.on`, `createStore`) son triggers automáticos aunque el archivo concreto no esté listado.
4. Esta matriz se actualiza junto con `docs/ci/documentation-rules.md` y `docs/danger-zones.md` — los tres son co-dependientes.

## Referencias cruzadas

- [`documentation-rules.md`](documentation-rules.md) — qué tipo de cambio dispara qué actualización.
- [`pr-checklist.md`](pr-checklist.md) — checklist marcable.
- [`../danger-zones.md`](../danger-zones.md) — zonas peligrosas numeradas.
- [`../audits/backlog.md`](../audits/backlog.md) — IDs `BL-xxx`.
- [`../architecture-timeline.md`](../architecture-timeline.md) — historia cronológica.
