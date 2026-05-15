# Visibility Spec

Spec consolidada del subsistema de visibilidad. Complementa [`contracts/visibility-contract.md`](../contracts/visibility-contract.md).

## Pipeline canónico
Ver [marker-grammar-contract](../contracts/marker-grammar-contract.md). Orden inmutable:

```text
resolvePoiSource → resolveShareability → filterBySource →
resolveMarkerGrammar → resolveLayerGroupKey →
applyLayerVisibility → createCustomIcon
```

## Reglas duras
1. `is_approved=true` es prerequisito para visibilidad global.
2. Routes nunca se muestran por defecto (toggle explícito o doc-view).
3. Capas `app`/`source` son padres globales con `entityHidden: id[]`. **Nunca** crear capa por entidad.
4. `filterByUserId` activo → bypass de zoom gates en `followed/app/source`.

## Zoom gates
| Capa | minZoom |
|---|---|
| own | sin gate |
| followed | ≥ 7 |
| app | ≥ 6 |
| source | ≥ 8 |

## Viewport culling v1
- Solo activo en z ≥ 7.
- Helper único: `applyViewportCulling`.
- Firma de subset: `getLocationSubsetSignature`.
- `filteredLocations` ⊇ `markerLocations`.

## Curated-only sharing boundary (PR-1)
- POIs ajenos solo entran si pasan `isShareablePoi(loc)`.
- Health rings y collection tints son **dominio privado del owner**.
- Bucket `followedShared` definido en location-bucket-matrix.

## Cross-references
- ADR-0002 (separación visibilidad vs gramática)
- ADR-0007 (separación FilterBar vs popover)
- mem://logic/sharing/curated-only-rule
- mem://logic/map/visibility-rule-approval-gated
- mem://logic/map/viewport-culling-v1

## Known caveats
- **Culling vs subset-fit**: bajo culling, los markers fuera de viewport no están en `markersRef`. Calleres de `requestSubsetFit` deben pasar `coords` pre-resueltas si quieren encuadrar TODO el subset (ver ADR-0005).
- **`_docUserId` legacy**: usado como FALLBACK en `getLocationOwnerUserId`. No es fuente preferente.
- **Sandbox mirror**: uid `f04b3b95-7308-4b74-b3c7-7e819767c5fb` es un usuario más; sin trato especial.

## Legacy behavior
- `locations` legacy table coexiste con `places/waypoints/user_places/collections/document_tracks` (V2).
- Algunas RLS policies viejas siguen vivas — revisar `mem://database/row-level-security-v2`.
