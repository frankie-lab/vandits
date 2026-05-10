## Diagnóstico confirmado

He inspeccionado este POI (`Río Tinto` / `Parque Nacional de Doñana`) en BD:

- `enriched_data` existe pero **solo contiene `etiquetas_personales`** (el tag `#fulltrips`). NO tiene `descripcion`, ni `imagenes`, ni `clasificacion`. Es decir, el POI **no está enriquecido** por la regla canónica.
- En `enrichment_jobs` el último job lo deja en `error_ids` con error de coherencia ("El nombre corresponde a un lugar a 2.6 km de las coordenadas").

Pese a ello la UI lo trata como enriquecido (badge verde "Enriquecido 09/05/2026", botón "Re-enriquecer", sin anillo rojo, sin bloque de recuperación). Causa raíz transversal: **dos sitios siguen usando `loc.enrichedData` truthy como sinónimo de "enriquecido"**, en vez del criterio único `enriched_data.descripcion` que ya está cristalizado en `getPointVisualState`:

1. `src/components/map/map-popups.ts:157` y `:361` — `const enriched = location.enrichedData;` ⇒ entra por la rama enriched y nunca monta el bloque de recuperación ni borra el badge.
2. `src/domains/content/lib/enrichment-failure-state.ts:26` — `if (location.enrichedData) return false;` ⇒ corta el anillo rojo aunque el POI no esté realmente enriquecido y figure en `error_ids`.

Y por la misma razón, "una vez enriquecido de verdad" estos POIs ya volverían al contorno por defecto / colección, porque `hasEnrichmentFailure` se basa en el mismo helper.

## Plan (transversal — helper único)

1. **Crear helper único `isPointEnriched(loc)`** en `src/domains/content/lib/point-visual-state.ts`:
   ```ts
   export function isPointEnriched(loc): boolean {
     return getPointVisualState(loc) === 'enriched';
   }
   ```
   Una sola fuente de verdad para "¿está enriquecido?". Apoyada en `getEnrichmentBucket` (que ya exige `enriched_data.descripcion`).

2. **`enrichment-failure-state.ts`** — sustituir `if (location.enrichedData) return false` por `if (isPointEnriched(location)) return false`. Mantiene la regla "verde nunca marca error" pero usando el criterio canónico. El POI de la captura pasará a mostrar anillo rojo 5px (no está enriquecido + está en `error_ids` del job reciente).

3. **`map-popups.ts`** (líneas 157 y 361) — sustituir `const enriched = location.enrichedData;` por `const enriched = isPointEnriched(location);`. Efectos automáticos:
   - El POI de la captura deja de pintar el badge verde "Enriquecido" y el botón "Re-enriquecer"; aparece el botón "Enriquecer".
   - El template no-enriched ya inyecta el placeholder `data-recovery-root="${location.id}"`, así que `bindRecoveryMount` montará `<UnenrichedRecoveryBlock>` con el mensaje de coherencia y CTAs (Reintentar / Contexto cercano / Renombrar).

4. **Auditoría transversal** del resto de archivos que usan `enrichedData` truthy como proxy de "enriquecido" (badges, contadores, ramas UI, gating de acciones). Solo se migran los usos que **deciden estado/clasificación**, no los que leen subcampos (`enrichedData.descripcion`, `.imagenes`, etc.). Archivos candidatos a revisar y, si aplica, sustituir por `isPointEnriched`:
   - `src/components/map/useEnrichmentTracker.ts`, `map-utils.ts`, `map-popup-handlers.ts`
   - `src/components/LocationMap.tsx` (firmas / branches "enriched")
   - `src/components/GalleryView.tsx`, `LocationList.tsx`, `CollectionFocusView.tsx`, `OrphanFocusView.tsx`, `DuplicatesList.tsx`, `DocumentWaypointsTabs.tsx`, `SelectionActions.tsx`
   - Hooks/domain: `use-popup-actions.ts`, `enrich-location.ts` (solo si decide "skip ya enriquecido" — alinear con la regla `descripcion`)

5. **Memoria**:
   - Actualizar `mem://style/map/error-outline-rule` para citar el helper único.
   - Añadir bullet en Core del index: *"Helper único `isPointEnriched(loc)` para cualquier check de enriquecido. Nunca usar `loc.enrichedData` truthy."*

## Validación

**POI de la captura (Río Tinto / Doñana)** tras los cambios:
- Marcador: paleta canónica (gris/naranja) + anillo rojo 5px (job lo dejó en error_ids).
- Popup: sin badge "Enriquecido", botón "Enriquecer", bloque de recuperación visible con el mensaje de coherencia y los 3 CTAs.

**Tras enriquecimiento real exitoso** (se guarda `descripcion`):
- `isPointEnriched` → true ⇒ `hasEnrichmentFailure` devuelve false ⇒ el anillo rojo desaparece y se restaura el contorno por defecto o el de la colección (vía `getTintForLocation`).
- Popup pasa a la rama enriched: badge "Enriquecido <fecha>" + "Re-enriquecer".
- Persistente: no hay parches puntuales, todo deriva del estado real de `enriched_data.descripcion`.

## Riesgos

- POIs antiguos con `enriched_data` parcial (solo tags o solo imagen sin descripción) dejarán de mostrarse como enriquecidos. Es el comportamiento correcto por norma canónica, pero puede sorprender en datos viejos. Aceptamos.
- Cambio puramente de presentación/derivación; no toca pipelines de IA, BD ni datos.
