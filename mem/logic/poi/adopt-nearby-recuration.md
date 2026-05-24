---
name: Adopt nearby re-curation (P-POI-CURATION-2.13)
description: Canon de adopción nearby + re-curación in-place. "Usar como este punto" promociona identidad y relanza pipeline completo sin cerrar popup.
type: feature
---

# Adopción nearby + re-curación canónica (P-POI-CURATION-2.13)

Cuando el usuario confirma la primaria "Usar como este punto" sobre un
candidato nearby con `source ∈ {osm, followed}`, el POI abierto debe
**convertirse en nueva verdad operativa** y re-curarse end-to-end sin que
el popup parpadee, se cierre ni se remonte.

## Flujo canónico (osm / followed)

```
1. UPDATE locations
     SET name, latitude, longitude, place_type,
         description = NULL,
         enriched_data = NULL,
         enrichment_status = 'pending'
     WHERE id = location.id
2. updateLocation(store) in-place — sin remount del popup
3. enrichmentFailureStore.invalidate(id)
4. setNearbyPopupContextId(null)   ← ya somos el POI, no la vista de vecino
5. advancePoiCurationUntilBlocked(id, 'validate-geo', popupId)
     · validate-geo (geocoding-job, await)
     · recompute → si broken → blocker='geo-conflict'
     · enrich (triggerEnrichLocation, await)
     · recompute → endLevel + bodyBlocker final
6. toast.success / toast.message según result.blocker
```

## Invariantes
- Popup **NUNCA** se cierra durante el pipeline. `onClose()` y
  `clearMapMarkers()` están prohibidos en el bloque osm/followed.
- Overlay P-POPUP-16 (`data-popup-operational-state="loading"`) cubre TODO
  el pipeline; el orquestador muta el `label` in-place.
- `enriched_data` y `enrichment_status` se resetean ANTES de relanzar — la
  regeneración editorial es coherente con la nueva identidad.
- `enrichmentFailureStore.invalidate(id)` se llama antes de `advancePoi…`
  para que el orquestador no aborte por estado fallido previo.
- `source='own'` queda FUERA del canon 2.13 — sigue siendo merge clásico
  con soft-delete + `onClose()` (el POI abierto deja de existir).

## Single source of truth
- Componente: `src/domains/content/components/PointContextActions.tsx`,
  función `handleReplaceWithPoint`.
- Orquestador: `advancePoiCurationUntilBlocked` (reuso 100%, sin pipeline
  paralelo).
- Test contrato: `src/test/popup-poi-2-13-adopt-nearby-recuration.test.ts`.

## Prohibido
- `triggerEnrichLocation(id).catch(() => {})` fire-and-forget en este path.
- Pipeline ad-hoc validate-geo o enrich fuera del orquestador.
- Cerrar el popup tras adoptar (osm/followed).
- Conservar `enriched_data` previo tras promoción de identidad.
- Mantener `nearbyPopupContextId` apuntando al POI ya adoptado.

## Ver también
- `mem://ui/popup/selected-row-action-canon` (P-POI-CURATION-2.12)
- `mem://logic/poi/curation-levels`
- `mem://style/popup/operational-loading-state`
- `docs/contracts/popup-contract.md` § Adopción nearby
