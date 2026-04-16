

# Plan: Backlog de 10 tickets — Sistema de Preferencias y Refactorización Discovery

## Estado actual del codigo

- **Index.tsx**: 667 lineas, ~25 estados useState, orquesta TODO (mapa, filtros, rutas, documentos, paneles).
- **use-layer-visibility.ts**: 377 lineas, singleton compartido con localStorage directo. Aun contiene referencias a `curator` y `druid` en tipos y persistencia.
- **useMarkerSizeConfig.ts**: 146 lineas, cache global + fetch a `app_settings`.
- **useMarkerStateRules.ts**: 194 lineas, patron identico al anterior.
- **domains/discovery/index.ts**: Solo re-exports, sin estructura propia.
- **locations-store.ts**: Store Zustand monolitico con filtros, anotaciones y datos mezclados.

## Plan de implementacion (10 tickets en orden)

### Ticket 1 — Contrato "Unidad Gestionable" (P0)

**Archivos nuevos:**
- `src/shared/preferences/types.ts` — tipos `ManageableUnit`, `PreferenceScope` (`system | domain | user | entity | session`), `PreferenceField`, `ResolvedPreferences`
- `docs/adr/001-manageable-unit.md` — ADR corto explicando la abstraccion

**Regla clave:** Validacion, apariencia y visibilidad son concerns separados dentro de cada unidad. Un `ManageableUnit` declara su `id`, `domain`, `fields[]` con tipo y defaults, y `supportedScopes`.

### Ticket 2 — Infraestructura base de preferencias (P0)

**Archivos nuevos:**
- `src/shared/preferences/registry.ts` — registro global de unidades (`registerUnit`, `getUnit`, `listUnits`)
- `src/shared/preferences/resolver.ts` — resolucion por jerarquia de scopes (system < domain < user < entity < session), merge profundo
- `src/shared/preferences/storage.ts` — adaptadores para localStorage y Supabase (`app_settings` / `profiles`), abstrayendo la fuente
- `src/shared/preferences/usePreferences.ts` — hook React que conecta resolver + storage con estado reactivo
- `src/shared/preferences/index.ts` — barrel

**Criterio:** Ningun dominio lee localStorage ni hace fetch a `app_settings` directamente para preferencias gestionadas.

### Ticket 3 — Panel generico de preferencias (P0)

**Archivos nuevos:**
- `src/shared/preferences/components/PreferencePanelRenderer.tsx` — renderiza campos (`boolean` -> Switch, `number` -> Slider/Input, `enum` -> Select, `color` -> ColorPicker, `json` -> textarea)
- `src/shared/preferences/components/PreferenceScopeSelector.tsx` — selector de scope cuando aplica

**Conecta con:** Registry para obtener la definicion de campos, Resolver para cargar valores actuales, Storage para guardar.

### Ticket 4 — Esqueleto dominio Discovery (P0)

**Estructura:**
```text
src/domains/discovery/
  components/     -- re-exports iniciales desde src/components/
  hooks/          -- vacio, preparado
  preferences/    -- registros de unidades Discovery
  types.ts        -- tipos propios (filtros, viewport, layer)
  index.ts        -- barrel actualizado
```

**Accion:** Mover tipos de filtro/visibilidad/mapa desde `types/location.ts` a `domains/discovery/types.ts` con re-exports de compatibilidad.

### Ticket 5 — Migrar use-layer-visibility a unidad gestionable (P0)

- Registrar unidad `discovery.map.layer_visibility` con campos: toggles por capa (`own`, `catalog`, `workspace`, `followed`, `routes`, `points`), `entityHidden` por capa
- Eliminar referencias muertas a `curator`/`druid` en tipos y persistencia
- `useLayerVisibility` pasa a leer del resolver; el singleton se alimenta del sistema nuevo
- Mover archivo a `src/domains/discovery/hooks/use-layer-visibility.ts`, mantener re-export en `src/hooks/`

### Ticket 6 — Migrar marker_size_config (P0)

- Registrar `discovery.map.marker_sizes` con defaults actuales del `DEFAULTS` object
- `useMarkerSizeConfig` lee del resolver con fallback al fetch actual
- Eliminar entradas `druid_*` y `curator_*` de DEFAULTS
- Cache e invalidacion se mantienen identicos en runtime

### Ticket 7 — Migrar marker_state_rules (P1)

- Registrar `discovery.map.marker_state_rules`
- `useMarkerStateRules` lee del resolver
- `MarkerStateRulesPanel` se reemplaza/envuelve con `PreferencePanelRenderer` usando UI custom para el preview SplitCircle

### Ticket 8 — Extraer DiscoveryOrchestrator y adelgazar Index.tsx (P1)

**Archivos nuevos:**
- `src/domains/discovery/components/DiscoveryOrchestrator.tsx`

**Responsabilidades extraidas de Index.tsx:**
- LocationMap + FilterBar + FloatingToolbar + FloatingPanel(Filtros, Ubicaciones, Capas)
- GalleryView, SemanticSearch, DuplicatesList, IncompleteLocationsPanel
- GeocodeButton, BottomProgressBar
- Estados: `showFiltersPanel`, `showLocationsPanel`, `showGallery`, `showSemanticSearch`, `showDuplicates`, `showIncomplete`, `showUnresolved`, `showLayers`, `activeFilterCount`, `criteriaVersion`

**Index.tsx queda con:** Auth guard, rutas, documentos, perfil, admin, itinerarios, fotos — que migran en fases posteriores.

### Ticket 9 — Separar types/location.ts en tipos por dominio (P1)

- `domains/discovery/types.ts` — `FilterCriteria`, `LayerType`, `ViewMode`, `EnrichmentStatusFilter`, `OwnershipFilter`, `VisitedFilter`
- `domains/content/types.ts` — `GeoLocation`, `KMLDocument`, `EnrichedLocationData`, `PlaceType`, `ExportFormat` (ya parcialmente hecho, completar)
- `domains/privacy/types.ts` — `LocationVisibility`
- `types/location.ts` se convierte en barrel puro de re-exports

### Ticket 10 — Store y sync minimos para Discovery (P1)

**Archivos nuevos:**
- `src/domains/discovery/store/discovery-store.ts` — Zustand store con: filtros activos, focusedLocation, selectedLocation, viewport state
- `src/domains/discovery/hooks/use-map-data.ts` — hook de lectura que consume `locations-store` (Content) y proyecta datos para el mapa

**Resultado:** `locations-store.ts` pierde la gestion de filtros y seleccion; Discovery los gestiona en su propio store. Content solo expone datos crudos.

---

## Nota sobre limpieza residual

Los tickets 5 y 6 incluyen la eliminacion final de las referencias `curator`/`druid` que aun persisten en `use-layer-visibility.ts` y `useMarkerSizeConfig.ts`.

## Dependencias entre tickets

```text
T1 ──> T2 ──> T3
              |
T4 ──────────>T5 ──> T6 ──> T7
              |
              T8 ──> T9 ──> T10
```

T1-T2-T3 son la infraestructura base. T4 abre el dominio. T5-T7 migran las preferencias del mapa. T8-T10 adelgazan el monolito.

