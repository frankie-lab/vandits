# Contract — Visibility

## Propósito
Decidir qué POIs se montan físicamente en el mapa, separado de la decisión de cómo se ven.

## Variables canónicas
| Variable | Significado |
|---|---|
| `filteredLocations` | Subset que pasa `matchesLocationFilters` (lógica) |
| `markerLocations` | Subset físicamente añadido al mapa (lógica + culling + visibility) |
| `LayerGroupKey` | `'own' \| 'followed' \| 'app' \| 'source'` |
| `entityHidden` | `id[]` por capa (oculta entidades concretas) |
| `minVisibilityZooms` | `Map<entityId, number>` |

## Regla maestra
Un POI es **visible globalmente** si:
1. `is_approved === true`
2. Pasa los filtros activos (`matchesLocationFilters`)
3. Pasa el zoom gate de su `LayerGroupKey`
4. Pasa el viewport culling (z ≥ 7 → solo bounds ampliados)
5. Su entidad no está en `entityHidden`

Helper único: `isLocationVisibleInGlobalMap(loc)`.

## Zoom gates por capa
| Capa | minZoom |
|---|---|
| own | sin gate |
| followed | ≥ 7 |
| app | ≥ 6 |
| source | ≥ 8 |

Aplicados en `applyLayerVisibility` ANTES de `entityHidden` y `minVisibilityZooms`.

## Bypass de zoom gates
`applyLayerVisibility({ bypassZoomGates: true })` activo cuando `filterByUserId` está set → garantiza que `followed/app/source` permanezcan visibles a cualquier zoom para que el filtro por usuario nunca quede ciego.

## Ownership
- Matcher: `matchesLocationFilters`.
- Pipeline visibilidad: `applyLayerVisibility` + `resolveLayerGroupKey`.
- Culling: `applyViewportCulling` + `getLocationSubsetSignature`.
- Owner resolver único: `getLocationOwnerUserId(loc) = ownerUserId ?? _docUserId`.

## Source of truth
- Datos: `useLocationsStore`.
- Capas/toggles: `useLayerVisibility` (singleton compartido).
- Vista geo resuelta: `v_locations_resolved` (cliente NO joinea).

## Forbidden writes
- Hidratar `markerLocations` desde fuera del pipeline.
- Crear capa por entidad para `app`/`source`.
- Saltarse `is_approved`.
- Usar `_docUserId` como fuente preferente de owner (es FALLBACK legacy).

## Invariantes
1. `filteredLocations ⊇ markerLocations`.
2. Capas catálogo respetan visibilidad propia + `is_approved`.
3. Routes nunca se muestran por defecto en mapa global (solo toggle explícito o doc-view).
4. `filterByUserId` activo → bypass de zoom gates.
5. Sandbox mirror (uid `f04b3b95-7308-4b74-b3c7-7e819767c5fb`) es un usuario más; NO recibe trato especial de visibilidad.

## Anti-patrones detectados
- Joinear admin areas en cliente (debe ir por `v_locations_resolved`).
- Decisiones de visibilidad mezcladas con grammar (resuelto en ADR-0002).
- Asumir que culling z≥7 ya aplica los markers al pedir un fit (resolver con `coords` pre-resueltas).

## Referencias
- ADR-0002
- mem://logic/map/visibility-rule-approval-gated
- mem://logic/map/viewport-culling-v1
- mem://logic/poi/source-pipeline-canonical
- mem://logic/content/locations-resolved-view
