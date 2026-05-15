# Architecture Audit

Auditoría arquitectónica de alto nivel. Para hallazgos puntuales, ver [`audits/`](../audits/).

## Capas del sistema

```text
UI (React components)
   ↓ lee/escribe
Domain stores (zustand): locations-store, ui-store, …
   ↓ lee
Helpers únicos: matchesLocationFilters, resolvePoiSource,
                resolveMarkerGrammar, applyLayerVisibility,
                getPointVisualState, getPointHealthRings,
                getLocationOwnerUserId, isShareablePoi, …
   ↓
Renderer único: createCustomIcon (puro)
   ↓
Leaflet (vía LocationMap, único contenedor)
```

## Principios arquitectónicos vigentes
1. **App multiusuario — cambios transversales**: TODO cambio en helpers/funciones centralizados. NUNCA parches puntuales. Si no existe helper, crearlo primero.
2. **Domain-Driven Design**: Identity, Content, Privacy, Social Graph, Routes, Discovery. Sin cross-domain mutations.
3. **Deterministic routing only**: AI route advisors eliminados. ORS / DB ferries / Duffel.
4. **No Emojis** en UI ni código (SVG icons vía `icon-utils.tsx`).
5. **Filtrar ≠ mover cámara**: solo 4 callers explícitos pueden mover cámara (ver ADR-0007).

## Sources of truth (mapa)
| Sistema | Source of truth | Ubicación |
|---|---|---|
| filtros | `useLocationsStore.filters` | `src/domains/content/store/locations-store.ts` |
| focus / selección | `useLocationsStore` (focusedLocationId, selectedLocations) | idem |
| popup abierto | `LocationMap.openPopupLocationId` (local) | `src/components/LocationMap.tsx` |
| capas / visibilidad | `useLayerVisibility` (singleton) | `src/hooks/use-layer-visibility.ts` |
| operaciones pesadas | `useHeavyOpsStore` | `src/shared/operations/heavy-operations-store.ts` |
| identidad cromática | `user_owner_color_assignments` (DB) + `getOwnerIdentityColor` | `src/lib/color/identity-allocator.ts` |
| geo resuelta | vista `v_locations_resolved` (DB) | mem://logic/content/locations-resolved-view |
| sandbox mirror | uid `f04b3b95-7308-4b74-b3c7-7e819767c5fb` | mem://preferences/sandbox-user-mirror |

## Eventos globales activos
Ver glosario. Listeners únicos donde aplica:
- `subset-fit-bounds-request` → único en `LocationMap`
- `popupclose` → único `map.on('popupclose')`
- `lovable:my-catalog-popover-applied` → único en `use-my-catalog-popover-fit`
- `lovable:owner-identity-updated` → un listener en `LocationMap`, otro en `UsersSidebar`

## Cross-references
- Todos los contratos en `docs/contracts/`
- Todos los ADRs en `docs/adr/`

## Known caveats
- `LocationMap.tsx` ~3120 líneas: candidato a partición pero contiene la disciplina de "renderer único". Cualquier extracción debe preservar el listener único de `popupclose` y de `subset-fit`.
- Phase 1 de `HeavyOperationStore`: solo cableado en popover Mis POI. `enrichment/import/geocoding` siguen con lanes legacy.
- Counts del popover Mis POI quedaron a 0 en una sesión (pendiente de investigar). Documentado en auditorías source-of-truth.

## Legacy behavior
- `locations` legacy + V2 tables coexisten.
- Curators & Druids removidos pero pueden quedar referencias muertas.
- Palette versions OKLCH previas purgadas del DB.
