# Vandits Version History

Estado: reconstrucción inicial — 2026-05-19

Este documento reconstruye el árbol de versiones de Vandits a partir de
README, `package.json`, commits, documentación técnica y cambios funcionales
relevantes. No todas las versiones aquí listadas fueron releases formales
publicados; algunas son hitos **reconstructed** para fijar memoria histórica.

---

## Criterios de confianza

| Nivel           | Significado                                                              |
|-----------------|--------------------------------------------------------------------------|
| `high`          | La versión aparece explícitamente en README, `package.json` o changelog. |
| `medium-high`   | El hito se deduce de commits claros y agrupados.                         |
| `medium`        | El hito se deduce de commits o documentación, pero no fue release formal.|
| `low`           | Hito probable pendiente de validación.                                   |
| `planned`       | Versión futura propuesta.                                                |

---

## Árbol general

```text
0.x — Prototipo y fundación
  0.1.0-alpha  Mapa + locations + filtros básicos
  0.2.0-alpha  Enriquecimiento IA + popup enriquecido
  0.3.0-alpha  Tags/geografía/filtros interactivos
  0.4.0-beta   Mapa fullscreen + estabilización popup/mapa

1.x — Producto funcional
  1.0.0        Sistema completo inicial
  1.1.0        Layout unificado y consistencia UX
  1.1.1        Welcome card + fix conteo catálogo   (stable, previous pre-routes baseline)
  1.2.0        Rutas e itinerarios                  (stable / formalized from reconstructed history)
  1.2.1        Refinamiento rutas/intermodal/persistencia (stable / formalized from reconstructed history)
  1.2.2        Gobernanza de versiones              (stable)
  1.2.3        Tests gramática visual de puntos     (stable)
  1.2.4        Extracción inicial Index.tsx (useWelcomeCardEvents)  (stable)
  1.2.5        Segunda extracción Index.tsx (usePendingValidationEvents)  (stable)
  1.2.6        Tercera extracción Index.tsx (useIndexGlobalEvents + useRoutePanelBridge)  (stable)
  1.2.7        Helper tipado inicial eventos globales (global-events.ts)  (stable)
  1.2.8        Segunda tanda eventos globales tipados (duplicate/icon/personal-categories)  (stable)
  1.2.9        Tercera tanda eventos globales tipados (trash-updated)  (stable)
  1.2.10       Coord-coherence Fase 1: entry gates WGS84 duros  (stable)
  1.2.11       Coord-coherence Fase 2: resolve-coordinates pre-LLM  (stable)
  1.2.12       Coord-coherence Fase 3: name↔coord identity gate (R9) pre-LLM  (stable)
  1.2.13       Coord-coherence Fase 4: IA fuera de geografía estructurada (R4+R5)  (stable)
  1.2.14       Coord-coherence Fase 5: geo_health honesto (R2)  (stable)
  1.2.15       Coord-coherence Fase 6: assertGeoCoherence + quarantine (R6)  (stable)
  1.2.16       Coord-coherence Fase 7: places_trunk saneado + guard zone≠region (R7+R8)  (stable)
  1.2.17       Helper computePoiMaturity (POI-0…POI-10), sin tocar mapa ni datos  (stable)
  1.2.18       Overlay diagnóstico POI-Maturity admin-gated, OFF por defecto  (stable)
  1.2.19       Fix Opción A: geo_health lookup reconoce aliases (anti stale_name ES↔FR)  (stable)
  1.2.20       POI-N v2: techo por flag geo_resolution + tokens poi.maturity recalibrados  (stable)
  1.2.21       Pulido UX overlay POI-N (reposición + colapso + pista "Estado base")  (stable)
  1.2.22       Overlay POI-N: leyenda compacta en pill inferior derecha; izquierda solo toggle  (stable)
  1.3.0        Canon v3 marker fill — Fase 1: helper SoT `getPoiMaturityColor` (sin tocar renderer)  (stable)
  1.3.1        Canon v3 marker fill — Fase 2: renderer consume `poi.maturity[*]` (fill propio migrado)  (stable)
  1.3.2        Canon v3 marker fill — Fase 3: leyenda inferior unificada `Madurez · 0..10`  (stable)
  1.3.3        Canon v3 marker fill — Fase 3.1: mapping fix `raw_geocode` llega al frontend  (stable)
  1.3.4        POI-10 corregido: curación objetiva (geoHealth=ok + enriched), sin exigir observación  (stable)
  1.3.5        Tooltips canónicos AppTooltip en leyenda compacta Madurez (chips 0–10)  (stable)
  1.3.16       T2A-wire Fase 1 — excepciones regionales canon territorial (PT-20/PT-30 sin Distrito)  (stable)
  1.3.17       T2A-wire-regional-exceptions-edge — enforcement server-side `regionHasNoProvincia` en `resolve-admin-area` + cliente `resolveAllFks` consume `meta.region_iso_code`  (stable)
  1.3.18       P0 World Canon Coverage (ola 1) — TERRITORIAL_CANON 39→49  (stable)
  1.3.19       PR-EXPORT-2 — exportación canónica POI (CSV/KML/JSON v2/GeoJSON) basada en PoiExportRecord  (stable)
  1.4.0        Discovery: árbol unificado + Root Status A/B/C/D + footer contextual + triage Resolver deuda + counts unificados  (stable)
  1.4.1        Root Status B → Geo Maintenance scoped (bridge UX/operativo, sin escritura desde modal)  (stable)
  1.4.2        DebtResolutionPanel Fase 1 — subvista lateral "Resolver deuda" en Buscar y Filtrar; modal queda como fallback/confirmación  (stable)
  1.4.3        Mantener → Con deuda opera inline; "Resolver deuda" abre directamente modal de confirmación (DebtResolutionPanel fuera del flujo principal); footer respeta selección local debt
  1.4.4        PR-INLINE-3.1 — footer de "Con deuda" ya NO abre HealthRepairPreviewDialog cuando repairableCount=0; primary cambia a Geo Maintenance (B + capability) o Exportar; alternativas (Abrir en mapa vía requestSubsetFit, Geo Maintenance subgrupo B, Exportar no reparables) en "Más acciones"  (stable)
  1.4.5        Versioning hardening — SoT única (`src/lib/app-version.ts`), parity test en CI, script `scripts/release/bump-version.ts`, eliminación del campo `changelog` hardcodeado en `src/lib/version.ts`, archivado del doc legacy `VANDITS-v2.0-DOCUMENTATION.md`
  1.4.6        PR-IDENTITY-ROOT-DOC-1: contract A/B/C/D doc DRAFT→ACTIVE reflejando runtime ya materializado (Deno SoT + cliente espejo + fixtures + parity test + filtro UI + partición salud)  ← versión actual (stable / current)



2.x — Futuro
  2.0.0        Reservado para ruptura real de arquitectura/contratos
```

---

## Release / rollback anchors

Las versiones estables deben poder usarse como puntos de retorno.

- `v1.1.1`: último punto estable antes de formalizar rutas.
- `v1.2.0`: rutas e itinerarios base.
- `v1.2.1`: refinamiento de rutas/intermodal/persistencia.
- `v1.2.2`: gobernanza de versiones y árbol histórico.
- `v1.2.3`: tests de gramática visual de puntos.
- `v1.2.4`: primera extracción incremental desde `Index.tsx` (`useWelcomeCardEvents`).
- `v1.2.5`: segunda extracción incremental desde `Index.tsx` (`usePendingValidationEvents`).
- `v1.2.6`: tercera extracción incremental desde `Index.tsx` (`useIndexGlobalEvents` + `useRoutePanelBridge`); deuda técnica ítem 5 cerrada.
- `v1.2.7`: helper tipado inicial para eventos globales (`src/lib/global-events.ts`) + migración de los 3 hooks extraídos de `Index.tsx`; deuda técnica ítem 2 en progreso.
- `v1.2.8`: segunda tanda de eventos globales tipados de bajo riesgo (`duplicate-threshold-changed`, `icon-library-changed`, `personal-categories:reload`); deuda técnica ítem 2 continúa en progreso.
- `v1.2.9`: tercera tanda de eventos globales tipados (`trash-updated`, void, 8 emisores / 2 consumidores; sin tocar `LocationMap.tsx`); deuda técnica ítem 2 continúa en progreso.
- `v1.2.10`: Coord-coherence Fase 1 — entry gates WGS84 duros (`isValidWgs84Coord` + espejo Deno) aplicados en `enrich-location`, `batch-enrich`, `scrape-tick` y trigger cliente; rechazo de `null`/`NaN`/fuera de rango/`(0,0)` antes de IA con `{ validation_required: true, reason: 'invalid_coordinates' }`; contract test `src/test/coord-validity.test.ts` (7 casos); ítem 7 pasa a en progreso.
- `v1.2.11`: Coord-coherence Fase 2 — `resolve-coordinates` obligatorio antes del LLM en `enrich-location`; fallo de reverse-geocode devuelve `{ success:false, validation_required:true, reason:'reverse_geocode_failed' }` sin gastar IA; geografía estructurada (`country/region/zone/continent/country_code/postal_code/timezone/*_id/raw_geocode/geo_source/geo_confidence/geo_resolved_at`) persiste SOLO desde canónico; `batch-enrich` propaga `kind:'reverse_geocode_failed'` y persiste snapshot canónico completo; ítem 7 → Fase 2 aplicada.
- `v1.2.12`: Coord-coherence Fase 3 — `assertNameCoordinateIdentity` (R9) pre-LLM en `enrich-location`; cualquier status ≠ `ok` devuelve `{ success:false, validation_required:true, reason }` y NO llama LLM; **HARD BLOCK** en `identity_lookup_unavailable` (ambos lookups fallidos/timeout NUNCA continúa como `ok`); `batch-enrich` propaga 3 nuevos `kind` (`identity_lookup_unavailable`, `name_coordinate_mismatch`, `name_found_elsewhere`) sin reintento ni `no_credits`; helper canónico + espejo Deno; contract test `src/test/name-coord-identity.test.ts` (7 casos); ítem 7 sigue en progreso (Fase 3 aplicada).
- `v1.2.13`: Coord-coherence Fase 4 — IA fuera de geografía estructurada (R4 + R5). Nuevo helper isomórfico `sanitizeAiEnrichmentPayload` (`src/shared/enrichment/ai-payload-sanitizer.ts` + espejo `supabase/functions/_shared/ai-payload-sanitizer.ts`) descarta del payload IA `datos_geograficos.{coordenadas, pais, continente, admin_nivel_1/2/3, localidad, sublocalidad}` y elimina placeholders evasivos `(sin región)/(sin provincia)/(sin comarca)/(sin localidad)` antes de persistir. Prompt de `enrich-location` añade bloque "GEOGRAFÍA ESTRUCTURADA (PROHIBIDO)"; `card-schema.datos_geograficos.jsonShape` recortado a `lugar_interes + direccion_postal`. Merge server-side elimina todos los fallbacks `aiGeoData.<prohibido>`: cadena admin canónica viene SOLO de `geoData` (canonical Fase 2). `_geocoded` se mantiene canonical-only. Contract tests `src/test/ai-payload-sanitizer.test.ts` (8 casos); ítem 7 sigue en progreso (Fase 4 aplicada).
- `v1.2.14`: Coord-coherence Fase 5 — `geo_health` honesto (R2). Trigger SQL `_compute_location_geo_health` reescrito para emitir el nuevo bucket `'hardError'` cuando `latitude/longitude IS NULL`, `(lat=0 AND lng=0)`, `|lat|>90 OR |lng|>180`, o `enrichment_status='enriched' AND raw_geocode IS NULL`. `_compute_location_geo_health_lookup` y trigger `zzz_locations_set_geo_health` ampliados con `raw_geocode jsonb + enrichment_status text` (ambos observados por el trigger `UPDATE OF`). Sin backfill: filas existentes recomputan al siguiente UPDATE relevante. Nuevo helper cliente espejo `src/shared/geography/compute-geo-health.ts` (`computeHonestGeoHealth` / `isHardErrorGeo`) + espejo Deno; `isHealthyShareableGeo` lo aplica defensivamente. Type `geoHealth` en `src/types/location.ts` extendido con `'hardError'`. Contract tests `src/test/geo-health-hard-error.test.ts` (10 casos). Ítem 7 sigue en progreso (Fase 5 aplicada).
- `v1.2.15`: Coord-coherence Fase 6 — `assertGeoCoherence` + quarantine (R6). Nuevo helper isomórfico `assertGeoCoherence(canonical, aiNarrative)` en `src/shared/enrichment/geo-coherence.ts` + espejo Deno `supabase/functions/_shared/geo-coherence.ts` que extrae menciones de país/región de `descripcion`, `lugar_interes`, `datos_clave` y `tags` y las compara contra el canónico resuelto por reverse-geocode. Conservador por diseño: word-boundary diacritic-insensitive, catálogos cerrados (país probes + regiones de ES/FR/PT/IT), tolerancia cuando el mismo texto menciona también el país canónico (mención comparativa), sin falsos positivos por substring. `enrich-location` invoca el gate tras el sanitizer Fase 4 y antes del merge final; si falla, devuelve `{ success:false, validation_required:true, reason:'geo_narrative_mismatch', level, expected, got, source }` sin persistir `enriched_data`. `batch-enrich` añade nueva rama que actualiza la fila a `enrichment_status='quarantine'` con `custom_data.enrichment_block = { reason, level, expected, got, source, at }` y propaga `__structured.kind='geo_narrative_mismatch'`. Sin migraciones SQL (la columna `enrichment_status` es text libre), sin backfill, sin tocar `LocationMap.tsx` ni `places_trunk`. Contract tests `src/test/geo-coherence.test.ts` (12 casos). Ítem 7 sigue en progreso (Fase 6 aplicada).
- `v1.2.16`: Coord-coherence Fase 7 — `places_trunk` saneado + guard `zone≠region` (R7 + R8). R7: migración SQL reescribe `lookup_trunk_place` y `upsert_trunk_place` con guard de coords WGS84 al inicio (rechaza `NULL`/`NaN`/`(0,0)`/fuera de rango); `lookup` retorna sin filas, `upsert` retorna `NULL`. Sin cambios en RLS, índices ni schema de `places_trunk`. Defensa cliente espejo: `triggerEnrichLocation` y `batch-enrich` envuelven ambas RPC con `isValidWgs84Coord` antes de invocarlas. R8: nuevo helper canónico `shouldDropZone(zone, region)` + espejo Deno; `resolve-admin-area` lo aplica tras resolver toda la cadena admin. Contract tests: `places-trunk-coord-guard.test.ts` (5) + `zone-region-guard.test.ts` (6).
- `v1.2.17`: helper canónico `computePoiMaturity` (POI-0…POI-10), 19 contract tests; sin tocar mapa ni datos.
- `v1.2.18`: overlay diagnóstico POI-Maturity admin-gated (`view_audit_log`), OFF por defecto. Toggle + leyenda en esquina inferior-izquierda del mapa; `MaturityBadgeLayer` pinta badge numérico 18px sobre POIs propios (`paletteScope==='state'`) en `renderMode ∈ {standard, rich}` mediante `L.layerGroup` paralelo, `interactive:false`. Nuevos tokens `poi.maturity.{0..10}`. Tres líneas de defensa de gating. Contract tests `src/test/poi-maturity-overlay.test.ts` (9 casos). NO toca `createCustomIcon`, `resolvePoiVisualGrammar`, `getPoiCurationLevel`, `levelKey` PR-MAP-CANON-3, paleta enriched/imported/empty, health rings, collection tints, identidad cromática. NO toca datos, RLS, edge functions, migraciones, ni re-enrich.
- `v1.2.19`: Fix Opción A — `_compute_location_geo_health_lookup` ahora canonicaliza `_country_str/_region_str/_zone_str` contra `admin_areas.name ∪ aliases ∪ name_translations` antes de delegar al cálculo. Resuelve el `stale_name` falso por traducción ES↔FR/IT/etc cuando la FK ya apunta al admin_area correcto. Validado contra los 3 casos del piloto B5a (`Autoire`, `Belcastel`, `Sant'Antonino`): recompute pasa de `stale_name` → `ok`. Funciones internas `_compute_location_geo_health` (ambas overloads) intactas, firma preservada. Sin UPDATE sobre `locations` — stored `geo_health` se refresca en el próximo touch natural / batch geo-canonicalize. NO toca: datos, coords, `enriched_data`, re-enrich, UI, `LocationMap.tsx`, schema, RLS. Solo función SQL. Doc: `docs/audits/b5a-stale-name-dry-run.md`. B5a.2 (n=30) sigue pausado hasta validar comportamiento sobre los 3 stored.
- `v1.2.20`: POI-N v2 materializado. `computePoiMaturity` añade lectura de `customData/custom_data.geo_resolution.status` y aplica **techo** vía `Math.min(ladder, ceilingFromGeoResolutionStatus(status))`: `pending_review`→POI-4, `needs_name_fix`→POI-3, `needs_coord_fix`→POI-2, `geo_irrecoverable`→POI-1 fijo. Sin flag → ladder libre. Tokens `poi.maturity.0..10` recalibrados a la paleta producto-aprobada (gris neutro → gris cálido → amarillo apagado → amarillo → amarillo intenso → ámbar suave → ámbar → verde amarillento → verde suave → verde); sin rojo, sólo namespace `poi.maturity.*`. Helper exportado `ceilingFromGeoResolutionStatus`. Reinyección post-validación humana documentada. +10 contract tests en `poi-maturity.test.ts` (40/40 pass). Doc: `docs/contracts/poi-maturity-visual-contract.md` §2/§4/§5.
- `v1.2.21`: pulido UX del overlay diagnóstico POI-N (presentación). `MaturityDiagnosticsControl` reposicionado a `bottom-12 left-4` (libera la scalebar de Leaflet) y reordenado con `flex-col-reverse` para que el toggle quede anclado abajo y la leyenda crezca hacia arriba (POI-10 visible siempre). Leyenda **colapsada por defecto** + `max-h-[60vh] overflow-y-auto pr-1`. Iconos chevron corregidos. En la pill inferior derecha de `LocationMap`, cuando el overlay está ON se inserta un chip `Estado base` antes de los swatches Final/Importado/Vacío. NO toca: `createCustomIcon`, `resolvePoiVisualGrammar`, `computePoiMaturity`, `MaturityBadgeLayer`, tokens `poi.maturity.*`, marker base, colecciones, popup, datos, RLS, edge functions, migraciones.
- `v1.2.22`: segundo pulido UX del overlay POI-N. La leyenda larga POI-0..POI-10 se **retira** de la esquina inferior izquierda; `MaturityDiagnosticsControl` queda como botón único `Madurez POI ON/OFF` (sin lista desplegable, sin chevron). La paleta cromática migra a la pill inferior derecha de `LocationMap` en forma de **leyenda compacta**: cuando el overlay está OFF se renderiza la base canónica `Estado base · Final · Importado · Vacío`; cuando está ON se sustituye por `Madurez · [chip 0..10]` (11 chips circulares 10px con `hsl(var(--poi-maturity-N))` y `title`/`aria-label` por nivel: POI-0 Sin dato útil … POI-10 Curado completo). Modos mutuamente excluyentes. NO toca: `createCustomIcon`, `resolvePoiVisualGrammar`, `computePoiMaturity`, `MaturityBadgeLayer`, tokens `poi.maturity.*`, marker base, colecciones, popup, datos, RLS, edge functions, migraciones.
- `v1.3.0`: **Fase 1 canon v3 marker fill** (`docs/contracts/marker-fill-canon-v3.md`). Nuevo helper SoT cromático `src/domains/content/lib/poi-maturity-color.ts` con API `getPoiMaturityColor(loc) → { level, fill }`: `level` proviene de `computePoiMaturity(loc)` (incluye techo por flag `custom_data.geo_resolution.status` v2 ya aplicado); `fill` se lee directamente del token `poi.maturity.<level>` como `hsl(...)`. Función pura, sin lectura de DOM ni dependencia de `getPointVisualState`. 19 contract tests (`src/test/poi-maturity-color.test.ts`). Bump **minor** reservado para la migración. **Fase 1 NO toca renderer**: mapa idéntico. Fases 2..6 quedan diferidas.
- `v1.3.1`: **Fase 2 canon v3 marker fill**. Renderer cableado al helper SoT. `resolvePoiVisualGrammar` (`src/domains/content/lib/poi-visual-grammar.ts`) ahora compone `levelVisual = { levelKey, maturityLevel, fillHsl, showStateRing }` para `paletteScope === 'state'`: `fillHsl` se deriva de `getPoiMaturityColor(loc).fill` (unwrap del `hsl(...)`), `maturityLevel` expone el nivel POI-N (0..10), `levelKey` sigue viniendo de `getPoiCurationLevel` y rige `showStateRing` (regla DURA "rings sólo en `poi-5`"). `createCustomIcon` NO cambia estructuralmente. Nuevo contract test `src/test/marker-fill-source-of-truth.test.ts` (14 tests). Fases 3..6 diferidas.
- `v1.3.2`: **Fase 3 canon v3 marker fill**. Barra/leyenda inferior derecha (`LocationMap`) unificada: única norma vigente `Madurez · 0 1 2 3 4 5 6 7 8 9 10`, cada número pintado con `hsl(var(--poi-maturity-<n>))` y tooltip `POI-<n> · <significado>`. Retirada la leyenda legacy `Estado base · Final · Importado · Vacío` (paleta hardcoded). La leyenda POI-N ya NO depende del toggle `Madurez POI ON/OFF` (que sigue controlando el overlay admin de POIs). NO toca: marker fill, `computePoiMaturity`, `createCustomIcon`, `resolvePoiVisualGrammar`, colecciones, health rings, datos.
- `v1.3.3`: **Fase 3.1 canon v3 marker fill** — fix de mapping frontend. `dbLocationToGeoLocation` ahora copia `raw_geocode` (+ `geo_resolved_at`/`geo_confidence`/`geo_source`) desde `v_locations_resolved`. Sin este fix TODOS los POIs enriched caían en POI-3. Nuevo test `src/test/db-transformers-raw-geocode.test.ts` (5 tests). Deuda residual separada: ~340 enriched sin `raw_geocode` en DB → backfill server-side.
- `v1.3.4`: **Corrección definición POI-10** en `computePoiMaturity`. `isFullyCurated` deja de exigir `enriched_data.observacion`. POI-10 pasa a representar curación OBJETIVA completa (`geoHealth='ok'` + `enrichment_status='enriched'`, sobre POI-9 monotónico). Estado personal (observación, visita, rating, foto propia, comentario) reconfirmado como eje SEPARADO. Flags `geo_resolution` siguen como techo. Tests `src/test/poi-maturity.test.ts` actualizados (32/32). Doc `docs/contracts/poi-maturity-visual-contract.md` actualizado. `marker-fill-canon-v3.md` no menciona `observacion`. NO toca: renderer, tokens, datos, RLS, edge functions, migraciones.
- `v1.3.5`: versión actual; **Tooltips canónicos en leyenda Madurez**. Cada chip 0–10 de la pill inferior derecha (`LocationMap`) se envuelve con `AppTooltip` (Radix vía shadcn, tokens del sistema) además del `title`/`aria-label` ya existentes. Contenido por chip: `POI-<n> · <significado>` (0 Sin dato útil, 1 Solo coordenadas, 2 Solo nombre, 3 Nombre + coordenadas válidas, 4 Identidad confirmada, 5 País / continente resuelto, 6 Región / zona resuelta, 7 Descripción enriquecida, 8 Media validada, 9 Categoría / tags validados, 10 Curado completo). Sin cambios de color, layout, `computePoiMaturity`, marker fill, datos, colecciones ni popup. Bump **patch** `1.3.4 → 1.3.5`.
- `v1.3.18`: **P0 — World Canon Coverage Patch (ola 1)**. `TERRITORIAL_CANON` (TS + espejo Deno) crece 39→49 con IE, HR, RS, BG, HU, ML, SK, CZ, SI, IS. Derivación data-driven desde `Equivalencias_Divisiones_Territoriales_Todo_el_Mundo_Canonico.docx` (auditoría `docs/audits/t-global-canon-world-docx-coverage-audit.md` §3.1). `hasProvincia=false` en HR/BG/SI/IS (DOCX marca Provincia "—"); `hasProvincia=true` en IE/RS/HU/ML/SK/CZ. `regionEqZoneWhitelist=[]` en los 10. Resuelve ~196 POIs hoy cayendo a `UNKNOWN_CANON`. Contract test `territorial-canon-pdf-conformance` actualizado a `SIZE=49` + lista exacta de 13 países sin provincia + bloque P0 positivo/negativo. Doc `docs/contracts/territorial-equivalence-canon.md` §11c nuevo. Bump **patch** `1.3.17 → 1.3.18`. NO toca: datos (`locations`, `admin_areas`, `enriched_data`), POIs históricos, Nominatim, re-enrich, migraciones SQL, RLS, edge functions, renderer.
- `v1.3.19`: **PR-EXPORT-2 — Exportación canónica de POIs** (`docs/contracts/pr-export-2-poi-export-canon.md`, `docs/audits/pr-export-2-implementation-plan.md`, `docs/audits/pr-export-2-qa-e2e.md`). Pipeline único `runPoiExport`/`previewPoiExport` (`src/domains/content/lib/poi-export-pipeline.ts`) compone `partitionForExport` (eligibilidad PR-EXPORT-1) → `evaluatePoiExportSize` (límites) → `mapToPoiExportRecords` (DTO `PoiExportRecord` allowlisted) → serializer del registry `POI_EXPORTERS` → `Blob` → `recordExport`. Formatos: **CSV**, **KML**, **JSON v2** y **GeoJSON nuevo** (`poi-export-geojson-v1`, RFC 7946 `[lng, lat]`). `ExportPanel` y `SelectionActions` cableados al pipeline; `ExportPanel` expone selector de scope (`public` por defecto, `internal` solo si el usuario autenticado lo elige), contador exportables/excluidos con `EXPORT_EXCLUSION_LABEL`, warning >5.000 y bloqueo >10.000. **Breaking change JSON**: el export legacy ya no emite `GeoLocation` crudo; el envelope canónico es `{ export_format_version: "poi-export-json-v2", scope, generatedAt, count, items[] }` — consumidores externos deben migrar a `items[]`. `customData` queda restringido a `CUSTOM_DATA_EXPORT_ALLOWLIST = { source, external_id, user_label }`; `public` no expone `ownerUserId`, `raw_geocode`, `enriched_data` completo, signed URLs ni campos debug; `internal` es owner-only (validado por `evaluatePoiExport`). ShareSheet permanece desacoplado: sólo abre `ExportPanel`, no serializa. Tests: `poi-export-pr2-core` + `poi-export-pr2-ux` + `poi-export-pr2-qa-e2e` + `poi-export-contract` (actualizado al pipeline canónico) verdes. Backlog no bloqueante (pendiente futuro): botón export en popup single-POI, modal >5k en `SelectionActions`, GPX waypoint-only, async/backend export para >10k, capability `export_poi_internal` para admin export. Bump **patch** `1.3.18 → 1.3.19`. NO toca: datos, schema, backend, storage, async jobs, Share, permisos, marker fill, `computePoiMaturity`, ni amplía `customData` allowlist.
- `v1.4.0`: **Discovery — cierre post-v1.3.19** (refs: `docs/audits/post-v1-3-19-functional-closure.md`, `docs/audits/release-versioning-post-v1-3-19-audit.md`, `docs/contracts/release-versioning-policy.md`, `docs/templates/postflight-template.md`). Bump **minor** `1.3.19 → 1.4.0`, derivado por la regla §4 de la política de versionado (4 bloques minor + 2 patch user-visible en la ventana). **Added**: (1) árbol unificado de filtros en Buscar y Filtrar — Explorar, Mantener → Con deuda y Mantener → Sin enriquecer exponen los cuatro ejes Geo / Tipo / Tags / Legacy; (2) fila compacta **Root Status A/B/C/D** como filtro transversal en Mantener, con helper cliente `poi-identity-root-status` y espejo Deno (contract test `poi-identity-root-status-client-parity` 23/23); (3) **triage operativo** en Resolver deuda (`HealthRepairPreviewDialog`) con 5 grupos colapsables — Reparable, Sistema B, Revisión C, Incompleto A y No reparables por tipo — y acciones por grupo (exportar grupo / abrir grupo en mapa / abrir POI en mapa); (4) **footer contextual** en Buscar y Filtrar (`EffectiveActionFooter`) con una sola acción principal por modo + menú "Más acciones". **Changed**: counts visibles unificados bajo `catalogVisibleUniverse` (top bar ⇄ FilterBar); subtabs Mantener (Con deuda / Sin enriquecer) usan `universeBase` coherente en header, subtabs, árbol, CTA y footer; Resolver deuda sólo encola automáticamente D ∩ {partial, chain} en `enqueue_health_repair`; export desde subconjuntos usa `effectiveActionSet` y respeta filtros activos; "Seleccionar todo" respeta `universeBase`, `treeSelection` y `rootStatusFilter`. **Fixed**: gap top bar vs FilterBar (5.100 vs 5.095); gap subtabs Mantener vs árbol/CTA/footer; cruce de selección entre pestañas; botón "Resolver deuda" que podía no abrir modal cuando `HealthFilterActionCTA` no estaba montado (`FilterBar` pasa a ser owner de `debtModalOpen`); feedback de submit en reparación de deuda (spinner, `aria-busy`/`aria-live`, anti doble submit); A/B/C/no-reparables ya no pueden entrar nunca en el RPC de reparación. **Security / Safety**: acciones destructivas siguen limitadas a selección manual explícita; `enqueue_health_repair` recibe únicamente `repairableIds`; sin cambios en marker fill, POI-N ni health rings. **Docs**: POI counts canon, `docs/contracts/release-versioning-policy.md`, `docs/templates/postflight-template.md` con sección Release impact obligatoria. **Breaking**: ninguno. Tests: `health-repair-partition` (18/18), `health-repair-dialog` (8/8), `health-repair-resolve-button-wiring` (5/5), `health-repair-triage-dialog` (13/13), `effective-action-footer` (12/12), `poi-identity-root-status-client-parity` (23/23). NO toca: datos, schema, backend, PR-EXPORT-2 core, serializers, marker fill, POI-N, health rings.
- `v1.4.1`: **Root Status B → Geo Maintenance scoped** (refs: `docs/audits/root-status-b-geo-maintenance-scoped-plan.md`, `docs/audits/root-status-b-geo-maintenance-scoped-postflight.md`, `docs/contracts/root-status-resolution-contract.md`). Bump **patch** `1.4.0 → 1.4.1`. **Added**: (1) acción **"Abrir en Geo Maintenance"** en el grupo Root Status B (`systemDebt`) de `HealthRepairPreviewDialog`, gated por capabilities `view_geo_maintenance` + `run_geo_backfill`; (2) bridge scoped `lovable:open-geo-maintenance-scoped` (`src/shared/events/geo-maintenance-handoff.ts`) que transporta los IDs B exactos + `mode`/`source`/`reason` desde el triage al panel destino, con `pendingHandoff` para entrega fiable aunque el panel no esté montado al despachar; (3) banner ámbar informativo en `GeographyBackfillPanel` confirmando recepción del handoff y dejando explícito que **no se ha escrito nada todavía**. **Changed**: el grupo Root Status B deja de ser únicamente Exportar / Mapa cuando el usuario tiene la capability adecuada; `GeographyBackfillPanel` puede recibir handoff scoped desde `HealthRepairPreviewDialog` y preselecciona `selectedIds` automáticamente, requiriendo aún clic humano explícito sobre el CTA del panel para lanzar el job. **Safety**: el click en el modal **no ejecuta backfill**; la escritura sólo ocurre tras CTA explícito dentro de `GeographyBackfillPanel`; D repair intacto — `enqueue_health_repair` nunca recibe IDs B; payload del bridge contiene exclusivamente IDs B (regla dura de escritura del contrato A/B/C/D respetada); botón gated por `view_geo_maintenance` + `run_geo_backfill` (sin capabilities, el botón no se renderiza). **Tests**: 34/34 pass — 8 nuevos T1–T8 en `src/test/root-status-b-geo-maintenance-handoff.test.tsx` (gating-off/on, handoff-emit, no-write-on-click, payload-scope-B-only, destination-receives, destination-preview-required, destination-missing, mixed-with-D) + 26 de regresión (`health-repair-dialog`, `health-repair-resolve-button-wiring`, `health-repair-triage-dialog`). **Breaking**: ninguno. NO toca: datos, schema, backend, marker fill, POI-N, health rings, PR-EXPORT-2 core, Nominatim.
 - `v1.4.6`: PR-IDENTITY-ROOT-DOC-1: contract A/B/C/D doc DRAFT→ACTIVE reflejando runtime ya materializado (Deno SoT + cliente espejo + fixtures + parity test + filtro UI + partición salud)
 - `v1.4.2`: **DebtResolutionPanel — Fase 1** (refs: `docs/audits/search-filter-debt-resolution-sidepanel-ux-plan.md`, `docs/audits/debt-resolution-sidepanel-phase1-postflight.md`). Bump **patch** `1.4.1 → 1.4.2`. **Added**: nuevo componente `src/components/discovery/DebtResolutionPanel.tsx` — subvista lateral dentro de Buscar y Filtrar que reemplaza al modal `HealthRepairPreviewDialog` como **vista primaria** del flujo "Resolver deuda". Muestra resumen de scope (Total / Reparables / A / B / C / D / No reparables) y 5 grupos colapsables (Reparable, B Sistema, C Revisión, A Incompleto, No reparable por tipo). Cada grupo expone Exportar grupo + Mapa grupo; cada POI expone Centrar mapa + Abrir popup; el grupo Reparable expone "Reparar grupo" que abre el modal de confirmación existente; el grupo B expone "Geo Maintenance" sólo si el usuario tiene `view_geo_maintenance` + `run_geo_backfill`. **Changed**: `src/components/FilterBar.tsx` — el primary del footer en universo `debt` abre el subpanel (`debtPanelOpen`) en lugar del modal; el modal queda montado únicamente como **fallback/confirmación de escritura** (D repair) y se abre desde dentro del subpanel; el footer se oculta mientras el subpanel está activo para evitar doble CTA. **Safety**: abrir el subpanel NO llama `supabase.rpc` ni `supabase.functions.invoke`; NO mueve la cámara automáticamente (sin `requestSubsetFit` al montar); sólo acciones explícitas del usuario disparan `requestSubsetFit` (reasons canónicos `debt-sidepanel-group-fit` y `debt-sidepanel-row-focus`); el subpanel NO escribe en BD — la única ruta de escritura sigue siendo `enqueue_health_repair` vía confirmación humana en `HealthRepairPreviewDialog`; el bridge `dispatchGeoMaintenanceHandoff` se reutiliza sin cambios (source `health-repair-triage`) y sigue sin ejecutar backfill al despachar. **Tests**: 45/45 pass — 11 nuevos en `src/test/debt-resolution-sidepanel-phase1.test.tsx` + 34 de regresión. **Breaking**: ninguno.
 - `v1.4.3`: **PR-INLINE-3 — Mantener → Con deuda opera inline; DebtResolutionPanel sale del flujo principal** (refs: `docs/audits/search-filter-inline-poi-actions-plan.md`, `docs/audits/search-filter-inline-poi-actions-pr3-postflight.md`). Bump **patch** `1.4.2 → 1.4.3`. **Changed**: el primary "Resolver deuda" del `EffectiveActionFooter` en universo `debt` **ya NO abre `DebtResolutionPanel`** — abre directamente `HealthRepairPreviewDialog` como modal de confirmación de escritura.
 - `v1.4.4`: **PR-INLINE-3.1 — Footer "Con deuda" sin reparables ya NO abre HealthRepairPreviewDialog** (refs: `docs/audits/search-filter-inline-poi-actions-pr3-1-no-repairables-postflight.md`). Bump **patch** `1.4.3 → 1.4.4`. **Changed**: `EffectiveActionFooter` (mode='debt') computa `partitionRepairScopeByRootStatus(locations, 'debt')` y deriva el primary dinámicamente: (1) `repairableCount > 0` → **Reparar N** (Wrench) → abre `HealthRepairPreviewDialog` como confirmación de escritura; (2) `repairableCount === 0` + activeSet 100% B + capabilities `view_geo_maintenance` + `run_geo_backfill` → **Geo Maintenance** → `dispatchGeoMaintenanceHandoff` + `navigateToGeoMaintenance` (sin escritura); (3) resto → **Exportar**. **Added**: items "Más acciones" para debt sin reparables — **Abrir en mapa** (delegado al helper canónico `requestSubsetFit` con reason `health-filter`; sin evento nuevo no contractual), **Geo Maintenance subgrupo B** (si hay B + capability), **Exportar no reparables** (excluye D ∩ {partial, chain}); hint `footer-debt-no-repairables-hint` con texto "No hay POIs reparables automáticamente en este subconjunto." o "No hay reparación automática disponible." según haya o no alternativas. `DebtAwareFooter` (FilterBar) inyecta `canViewGeoMaintenance`/`canRunGeoBackfill` desde `useCapability`. **Safety**: `onResolveDebt` nunca se invoca con `repairableCount === 0`; cero RPC/escrituras al pulsar primary sin reparables; el modal `HealthRepairPreviewDialog` queda restringido a confirmación de escritura real; D repair intacto (partition + RPC scope sin cambios). **Tests**: 76/76 pass — 12 nuevos en `src/test/inline-footer-pr-inline-3-1.test.tsx` (primary Geo Maintenance vs Exportar vs Reparar; hint visible; menú con Abrir en mapa/Geo Maintenance B/Exportar no reparables; `requestSubsetFit` con reason canon; `onResolveDebt` nunca invocado sin reparables; `supabase.rpc` nunca invocado sin reparables; exclusión de D+partial/chain del export no-reparable) + 6 regresión PR-INLINE-3 + 12 contract `effective-action-footer` + resto. **Breaking**: ninguno. NO toca: backend, schema, datos, RLS, Nominatim, marker fill, POI-N, health rings, PR-EXPORT-2 core, serializers, `health-repair-partition`, `HealthRepairPreviewDialog`, `DebtResolutionPanel`.
 - `v1.4.5`: **Versioning hardening — Single Source of Truth para versión + parity test en CI**. Bump **patch** `1.4.4 → 1.4.5`. **Principio rector**: una sola fuente de verdad de versión = `src/lib/app-version.ts` (`APP_VERSION`). Todo lo demás (package.json, README title/badge/changelog top entry, version-history top entry) se deriva o se valida contra ella; divergencia ⇒ build rojo. **Added**: (1) contract test `src/test/version-parity.test.ts` que valida en cada run de Vitest: `APP_VERSION === package.json.version`; última entrada `### vX.Y.Z` del README coincide; última fila del árbol `1.x` en `docs/releases/version-history.md` coincide; semver válido; `src/lib/version.ts` no contiene literales `v\\d+\\.\\d+\\.\\d+` (anti-regresión del campo `changelog` hardcodeado que arrastraba `v1.1.1`). (2) `scripts/release/bump-version.ts` — script idempotente que aplica un bump `patch|minor|major` actualizando atómicamente `package.json` + `src/lib/app-version.ts` + `docs/releases/version-history.md` + README, e imprime el comando `git tag` para el operador. (3) `docs/versioning.md` actualizado con el SoT único y la mención al parity test. **Changed**: `src/lib/version.ts` queda como re-export delgado de `app-version.ts` + metadata estática; eliminado el campo `VERSION_INFO.changelog` (era la causa del despiste "Claude lee v1.1.1"). README rehecho: título + badge + changelog top entry sincronizados; sección changelog reducida a las últimas 5 versiones con puntero al histórico canónico. **Moved**: `VANDITS-v2.0-DOCUMENTATION.md` → `docs/_archive/VANDITS-v2.0-DOCUMENTATION.md` con nota de archivado (documento aspiracional v2.0 que confundía a agentes externos clonando el repo). **Breaking**: ninguno. NO toca: runtime, schema, RBAC, popups, mapa, edge functions, marker fill, POI-N, health rings, PR-EXPORT-2 core. **Acción operativa pendiente (humano)**: `git tag v1.4.5 -m "v1.4.5" && git push origin v1.4.5`.

Regla:

Si una versión nueva falla, no se borra del histórico. Se vuelve operativamente al tag estable anterior o se crea una nueva patch version con el fix.

Ejemplo:

Si `v1.2.15` falla, volver a `v1.2.14` o publicar `v1.2.16` con corrección.

Nota operativa:

Los anchors documentados requieren tags Git reales para funcionar como rollback operativo. Hasta que existan los tags `v1.1.1` … `v1.2.12` en GitHub, el rollback está definido documentalmente pero no materializado como mecanismo técnico.

### Tags Git pendientes de crear

- [ ] `v1.1.1`
- [ ] `v1.2.0`
- [ ] `v1.2.1`
- [ ] `v1.2.2`
- [ ] `v1.2.3`
- [ ] `v1.2.4`
- [ ] `v1.2.5`
- [ ] `v1.2.6`
- [ ] `v1.2.7`
- [ ] `v1.2.8`
- [ ] `v1.2.9`
- [ ] `v1.2.10`
- [ ] `v1.2.11`
- [ ] `v1.2.12`
- [ ] `v1.2.13`
- [ ] `v1.2.14`
- [ ] `v1.2.15`

Esta lista no debe marcarse como completada hasta verificar que los tags existen realmente en GitHub. Lovable no crea tags Git; deben crearse desde GitHub o git local. La versión actual `v1.2.15` también requiere un tag Git real para que el rollback sea operativo.

Estado de cierre: la gobernanza de rollback queda documentada y auditada. La materialización técnica de tags Git queda pendiente de acción externa fuera de Lovable.

Nota de ejecución: los tags Git reales son una acción operativa externa. Lovable no puede crearlos desde este entorno. Por tanto, esta lista queda auditada como pendiente externo y no bloquea el avance de deuda técnica resoluble en Lovable.

---

## Patch History

Las versiones patch reconstruidas agrupan bloques coherentes de fixes/estabilización. No representan un commit por versión. Las entradas `reconstructed` no fueron necesariamente releases formales publicadas en su momento.

### 0.x — Pre-release / fundación

| Versión | Fecha | Tipo | Hito | Confianza | Evidencia |
|---|---:|---|---|---|---|
| 0.1.0-alpha | 2026-01-16 | inferred | Mapa base, locations, filtros, Leaflet y primeros popups | medium | Commits iniciales de mapa, filtros y popups. |
| 0.1.1-alpha | 2026-01-16 | inferred patch | Correcciones iniciales de mapa/filtros/runtime | medium | Fix map rendering with Leaflet, FilterBar, múltiples instancias React, overlays/modales. |
| 0.2.0-alpha | 2026-01-16 | inferred | Enriquecimiento IA + popup enriquecido | medium | Show enriched popup. |
| 0.2.1-alpha | 2026-01-16 | inferred patch | Estabilización de enriquecimiento/import | medium | AI edge handling, KML UUID, guardado al pausar enriquecimiento, batch resume. |
| 0.3.0-alpha | 2026-01-16 | inferred | Geografía, tags y filtros interactivos | medium | Filtros clicables, tags geográficos, árbol de tags, hashtags. |
| 0.3.1-alpha | 2026-01-16 | inferred patch | Correcciones de geografía/tags/popup | medium | Continente desconocido, hashtags geográficos, filtros desde popup, null safety. |
| 0.4.0-beta | 2026-01-16 | inferred | Mapa fullscreen + experiencia app | medium | Make map fullscreen with popups. |
| 0.4.1-beta | 2026-01-16 | inferred patch | Estabilización de realtime, popups y foco | medium | Realtime hook crash, popup update safety, popup null safety, foco al enriquecer. |

### 1.x — Producto funcional

| Versión | Fecha | Tipo | Hito | Confianza | Evidencia |
|---|---:|---|---|---|---|
| 1.0.0 | 2026-01-17 | stable | Sistema completo inicial | high | README changelog. |
| 1.0.1 | 2026-01-17 | reconstructed patch | Estabilización post-1.0 | medium | useDatabaseSync race, popup lookup, geo hashtags, map center, search icon, semantic toggle, TagsTree, impacto enriquecimiento, animación, auth redirect, profile sync, admin scroll/loading. |
| 1.1.0 | 2026-01-18 | stable | Layout unificado y consistencia UX | high | README changelog. |
| 1.1.1 | 2026-04-19 | stable, previous pre-routes baseline | Welcome card + fix conteo catálogo | high | README changelog + `package.json` histórico. |
| 1.1.2 | TBD | candidate patch | Estabilización social/fotos/delete/markers posterior a 1.1.1 | medium | Users sidebar, photo update flow, duplicate threshold, delete workflow, soft-deleted locations, curator marker fallback, map scale guard, marker interaction, dialog close guard. |
| 1.2.0 | 2026-04-04 | stable / formalized from reconstructed history | Rutas e itinerarios base | medium-high | routes schema, route_waypoints, calculate-route, RouteBuilder, RoutesListPanel, renderizado en mapa y eventos de rutas. |
| 1.2.1 | 2026-04-06 | stable / formalized from reconstructed history | Refinamiento rutas/intermodal/persistencia | medium | stages, ida/vuelta, colores, persistencia, ferry_routes, alternativas driving/ferry/flight, selección en mapa, agrupación padre/hijo, skeleton, paradas/jornadas. |
| 1.2.2 | 2026-05-19 | stable | Gobernanza de versiones y árbol histórico | high | README changelog + `package.json` (1.2.2), `docs/versioning.md`, `docs/releases/version-history.md`. |
| 1.2.3 | 2026-05-19 | stable | Tests de gramática visual de puntos (`point-visual-state`) | high | `src/test/point-visual-state.test.ts` (11 casos), `docs/tech-debt.md` ítem 3 resuelto. |
| 1.2.4 | 2026-05-19 | stable | Primera extracción incremental de orquestación desde `Index.tsx` (`useWelcomeCardEvents`) | high | `src/hooks/use-welcome-card-events.ts`, `src/pages/Index.tsx`. |
| 1.2.5 | 2026-05-19 | stable | Segunda extracción incremental de orquestación desde `Index.tsx` (`usePendingValidationEvents`) | high | `src/hooks/use-pending-validation-events.ts`, `src/pages/Index.tsx`. |
| 1.2.6 | 2026-05-19 | stable | Tercera extracción incremental de orquestación desde `Index.tsx` (`useIndexGlobalEvents` + `useRoutePanelBridge`); ítem 5 cerrado | high | `src/hooks/use-index-global-events.ts`, `src/hooks/use-route-panel-bridge.ts`, `src/pages/Index.tsx`. |
| 1.2.7 | 2026-05-19 | stable | Helper tipado inicial para eventos globales (`src/lib/global-events.ts`); migración de los 3 hooks extraídos de `Index.tsx`; deuda técnica ítem 2 en progreso | high | `src/lib/global-events.ts`, `src/test/global-events.test.ts` (6 casos), hooks migrados. |
| 1.2.8 | 2026-05-19 | stable | Segunda tanda de eventos globales tipados (`duplicate-threshold-changed`, `icon-library-changed`, `personal-categories:reload`); cobertura 9 → 12 eventos; ítem 2 continúa en progreso | high | `src/lib/global-events.ts` (12 eventos), `src/test/global-events.test.ts` (9 casos), `DuplicatesList.tsx`, `use-duplicate-count.ts`, `IconLibraryContext.tsx`, `PersonalCategoriesPanel.tsx` migrados. |
| 1.2.9 | 2026-05-19 | stable | Tercera tanda de eventos globales tipados (`trash-updated`, void, 8 emisores / 2 consumidores; sin tocar `LocationMap.tsx`); cobertura 12 → 13 eventos; ítem 2 continúa en progreso | high | `src/lib/global-events.ts` (13 eventos), `src/test/global-events.test.ts` (10 casos), `FloatingToolbar.tsx`, `FilterBar.tsx`, `LocationList.tsx`, `TrashPanel.tsx`, `use-realtime-locations.ts`, `SelectionActions.tsx`, `use-popup-actions.ts`, `UserMenu.tsx`, `DocumentFocusView.tsx` migrados. |
| 1.2.10 | 2026-05-20 | stable | Coord-coherence Fase 1: entry gates WGS84 duros (`isValidWgs84Coord` + espejo Deno) rechazando `null`/`NaN`/out-of-range/`(0,0)` antes de IA con `{ validation_required:true, reason:'invalid_coordinates' }`; ítem 7 pasa a en progreso | high | `src/shared/geography/coord-validity.ts`, `supabase/functions/_shared/coord-validity.ts`, `src/test/coord-validity.test.ts` (7 casos), `supabase/functions/enrich-location/index.ts`, `supabase/functions/batch-enrich/index.ts`, `supabase/functions/scrape-tick/index.ts`, `src/domains/content/lib/enrich-location.ts`. |
| 1.2.11 | 2026-05-20 | stable | Coord-coherence Fase 2: `resolve-coordinates` obligatorio antes del LLM en `enrich-location`; fallo de reverse-geocode → `{ success:false, validation_required:true, reason:'reverse_geocode_failed' }` sin gastar IA; geografía estructurada persiste SOLO desde canónico; `batch-enrich` propaga `kind:'reverse_geocode_failed'`; ítem 7 → Fase 2 aplicada | high | `supabase/functions/enrich-location/index.ts`, `supabase/functions/enrich-location/index.test.ts`, `supabase/functions/batch-enrich/index.ts`, `package.json`, `src/lib/app-version.ts`. |
| 1.2.12 | 2026-05-20 | stable / current | Coord-coherence Fase 3 (R9): name↔coord identity gate pre-LLM en `enrich-location`; cualquier status ≠ `ok` bloquea LLM; **HARD BLOCK** en `identity_lookup_unavailable` (ambos lookups fallidos nunca continúa como `ok`); `batch-enrich` propaga 3 `kind` nuevos sin reintento ni `no_credits`; helper canónico + espejo Deno; ítem 7 → Fase 3 aplicada | high | `src/shared/geography/name-coord-identity.ts`, `supabase/functions/_shared/name-coord-identity.ts`, `src/test/name-coord-identity.test.ts` (7 casos), `supabase/functions/enrich-location/index.ts`, `supabase/functions/batch-enrich/index.ts`, `package.json`, `src/lib/app-version.ts`. |
| 1.3.0 | TBD | planned minor | Architecture baseline | planned | Requiere tests visuales, foto arquitectura, tipado inicial eventos y reducción de deuda. |

Decisión de gobernanza: no se crea una patch version por commit. Solo se documentan patches cuando agrupan un bloque coherente de correcciones o estabilización con valor histórico.

La versión oficial actual es **1.2.12**. Entradas marcadas como `TBD`, `candidate patch` o `planned minor` son hitos propuestos, no versiones publicadas.

---

## 0.x — Prototipo y fundación

| Versión        | Fecha       | Tipo       | Hito                                              | Confianza | Evidencia |
|----------------|-------------|------------|---------------------------------------------------|-----------|-----------|
| 0.1.0-alpha    | 2026-01-16  | inferred   | Mapa + locations + filtros básicos                | medium    | Commits iniciales de mapa, popups, filtros, reset y geocoding. |
| 0.2.0-alpha    | 2026-01-16  | inferred   | Enriquecimiento IA + popup enriquecido            | medium    | Commit `Show enriched popup`; integración de ficha enriquecida en popup. |
| 0.3.0-alpha    | 2026-01-16  | inferred   | Tags/geografía/filtros interactivos               | medium    | Commits de filtros clicables, tags geográficos, árbol de tags y hashtags. |
| 0.4.0-beta     | 2026-01-16  | inferred   | Mapa fullscreen + estabilización popup/mapa       | medium    | Commit `Make map fullscreen with popups`; fixes posteriores de foco, apertura y null safety. |

---

## 1.x — Producto funcional

| Versión | Fecha       | Tipo                                            | Hito                                              | Confianza      | Evidencia |
|---------|-------------|-------------------------------------------------|---------------------------------------------------|----------------|-----------|
| 1.0.0   | 2026-01-17  | stable                                          | Sistema completo inicial                          | high           | README changelog. |
| 1.1.0   | 2026-01-18  | stable                                          | Layout unificado y consistencia UX                | high           | README changelog. |
| 1.1.1   | 2026-04-19  | stable, previous pre-routes baseline            | Welcome card + fix conteo catálogo                | high           | README changelog + `package.json` histórico. |
| 1.2.0   | 2026-04-04  | stable / formalized from reconstructed history  | Rutas e itinerarios                               | medium-high    | Commits `Routed: added itineraries system`, `Rewrite RouteBuilder with stages`, alternativas intermodales y persistencia. |
| 1.2.1   | 2026-04-06  | stable / formalized from reconstructed history  | Refinamiento rutas/intermodal/persistencia        | medium         | Commits de fixes y mejoras sobre rutas: selección en mapa, agrupación padre/hijo, skeleton, persistencia de paradas/jornadas. |
| 1.2.2   | 2026-05-19  | stable                                          | Gobernanza de versiones y árbol histórico         | high           | README changelog + `package.json` (1.2.2), `docs/versioning.md`, `docs/releases/version-history.md`. |
| 1.2.3   | 2026-05-19  | stable                                          | Tests de gramática visual de puntos               | high           | `src/test/point-visual-state.test.ts` (11 casos), `docs/tech-debt.md` ítem 3 resuelto. |
| 1.2.4   | 2026-05-19  | stable                                          | Primera extracción incremental de orquestación desde `Index.tsx` (`useWelcomeCardEvents`) | high | `src/hooks/use-welcome-card-events.ts`, `src/pages/Index.tsx` (welcome-card CTAs delegados al hook). |
| 1.2.5   | 2026-05-19  | stable                                          | Segunda extracción incremental de orquestación desde `Index.tsx` (`usePendingValidationEvents`) | high | `src/hooks/use-pending-validation-events.ts`, `src/pages/Index.tsx` (listener pending-validations-updated + estado local delegados al hook). |
| 1.2.6   | 2026-05-19  | stable                                          | Tercera extracción incremental de orquestación desde `Index.tsx` (`useIndexGlobalEvents` + `useRoutePanelBridge`); deuda técnica ítem 5 cerrada | high | `src/hooks/use-index-global-events.ts`, `src/hooks/use-route-panel-bridge.ts`, `src/pages/Index.tsx` (sin `window.addEventListener` inline; puente routes panel encapsulado). |
| 1.2.7   | 2026-05-19  | stable                                          | Helper tipado inicial para eventos globales (`global-events.ts`); migración de los 3 hooks extraídos de `Index.tsx`; ítem 2 en progreso | high | `src/lib/global-events.ts`, `src/test/global-events.test.ts` (6 casos), hooks `useWelcomeCardEvents` / `usePendingValidationEvents` / `useIndexGlobalEvents` migrados al helper tipado. |
| 1.2.8   | 2026-05-19  | stable / current                                | Segunda tanda de eventos globales tipados (`duplicate-threshold-changed`, `icon-library-changed`, `personal-categories:reload`); cobertura 9 → 12 eventos; ítem 2 continúa en progreso | high | `src/lib/global-events.ts` (12 eventos), `src/test/global-events.test.ts` (9 casos), `DuplicatesList.tsx`, `use-duplicate-count.ts`, `IconLibraryContext.tsx`, `PersonalCategoriesPanel.tsx` migrados. |
| 1.3.0   | TBD         | planned                                         | Architecture baseline                             | planned        | Requiere versioning policy, version history, tech debt, global events, tests visuales y foto de arquitectura. |

---

## 2.x — Futuro

| Versión | Fecha | Tipo               | Hito                                            | Confianza | Evidencia |
|---------|-------|--------------------|-------------------------------------------------|-----------|-----------|
| 2.0.0   | TBD   | reserved / planned | Ruptura real de arquitectura/contratos          | planned   | Reservado para cambios incompatibles: bus de eventos, modelo de datos, mapa, popup canónico o catálogo. |

---

## Nota sobre 1.2.0 y 1.2.1

El sistema de rutas e itinerarios fue reconstruido desde commits y
documentación. En la formalización de versiones de 2026-05-19 se promueven a
**stable / formalized from reconstructed history**: existen como anchors
estables del árbol aunque no se hubieran publicado como release formal en su
momento. La versión vigente y publicada es **1.2.3**.

## Nota sobre 1.3.0

`1.3.0` queda reservada para una **baseline arquitectónica** real. No debe
publicarse solo por crear documentación. Debe incluir como mínimo:

- política de versionado,
- árbol histórico,
- deuda técnica priorizada,
- catálogo de eventos globales,
- tests de gramática visual de puntos,
- foto de arquitectura actual,
- posible tipado inicial de eventos globales.
