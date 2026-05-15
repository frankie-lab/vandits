# Mapa de dependencias entre contratos

Relaciones inmutables. Si un contrato cambia, los marcados con `→` deben revisarse.

```text
filter-axis ──────► subset-fit ──────► heavy-operations
     │                  │
     │                  └──► visibility ──► marker-grammar ──► popup
     │                              ▲              │
     └──────► focus-selection ──────┘              │
                    │                              │
                    └──────────────────────────────┘
```

## Detalle por contrato

### filter-axis
- Lee: `locations-store.filters`
- Escribe en: matcher (`matchesLocationFilters`) → `filteredLocations`
- Dispara opcionalmente: `subset-fit` (solo `health`, `user-filter`, `my-catalog-popover`)
- NO dispara: `popup`, `focus`

### subset-fit
- Lee: `filteredLocations` o `coords` pre-resueltas del caller
- Escribe en: cámara Leaflet (`map.flyTo` / `flyToBounds`)
- Respeta: cooldown manual SOLO en `mode: 'if-outside'`
- NO escribe: `focusedLocationId`, `openPopupLocationId`, `selectedLocations`

### focus-selection
- Lee: `locations-store.focusedLocationId`, `selectedLocations`
- Escribe en: marker grammar (re-render por dependencia de `useEffect`)
- Puede disparar: `subset-fit` con `reason='selection-start'`
- NO toca: `filters`, `popup` directo

### visibility
- Lee: `resolvePoiSource`, `filterByUserId`, zoom, layer toggles
- Escribe en: `markerLocations` (subset físicamente añadido al mapa)
- Pipeline obligatorio: `resolvePoiSource → resolveShareability → filterBySource → resolveMarkerGrammar → resolveLayerGroupKey → applyLayerVisibility → createCustomIcon`

### marker-grammar
- Lee: `getPointVisualState`, `getPointHealthRings`, `resolvePoiSource`, owner identity
- Escribe en: DOM via `createCustomIcon` (única factory)
- Renderer NO toma decisiones: solo lee `MarkerGrammar`

### popup
- Lee: `openPopupLocationId` (local de `LocationMap`)
- Escribe en: `setOpenPopupLocationId`, `keepIds`
- Único deselect canónico: handler `map.on('popupclose')`

### heavy-operations
- Lee: nada externo
- Escribe en: `useHeavyOpsStore`
- Auto-purga: done 1.5s, error 4s
- Watchdog: filter/subset-fit 10s, render 15s, otros sin watchdog
