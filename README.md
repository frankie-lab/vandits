# VANDITS v1.3.7

<div align="center">

![VANDITS Logo](https://img.shields.io/badge/VANDITS-v1.3.7-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E?style=flat-square&logo=supabase)

**Gestor de ubicaciones geográficas con enriquecimiento IA**

[Demo](#) · [Documentación](./VANDITS-v2.0-DOCUMENTATION.md) · [Changelog](#changelog)

</div>

---

## ✨ Características

- 🗺️ **Mapa interactivo** con Leaflet, clustering y heatmap
- 🤖 **Enriquecimiento IA** con Google Gemini (fichas técnicas, imágenes, índice de interés)
- 📍 **Verificación de visitas** por GPS o fotos geoetiquetadas
- 🏆 **Grados de relevancia** basados en antigüedad de verificación
- 📁 **Multi-formato** (KML, GPX, GeoJSON, CSV)
- 👥 **Sistema social** con seguimiento de usuarios
- 🔒 **Control de visibilidad** (público/seguidores/privado)
- 🛡️ **Panel de administración** con roles y permisos

## 🚀 Inicio Rápido

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/vandits.git
cd vandits

# Instalar dependencias
npm install

# Iniciar desarrollo
npm run dev
```

## 🏗️ Stack Tecnológico

| Categoría | Tecnología |
|-----------|------------|
| Frontend | React 18, TypeScript, Vite |
| Estilos | Tailwind CSS, shadcn/ui |
| Estado | Zustand |
| Mapas | Leaflet, leaflet.markercluster |
| Backend | Supabase (Lovable Cloud) |
| IA | Google Gemini via Lovable AI |
| Animaciones | Framer Motion |

## 📊 Estado actual

Proyecto en evolución activa. En lugar de contar tablas, componentes o edge functions —cifras frágiles que envejecen mal entre PRs—, mantenemos una foto cualitativa:

- Arquitectura por dominios (Identity, Content, Privacy, Social Graph, Routes, Discovery).
- Backend gestionado vía Lovable Cloud (Supabase) con RLS y edge functions desplegadas automáticamente.
- BackOffice con sidebar agrupado por dominio y matriz RBAC canónica por capability × rol.
- Mapa con pipeline POI canónico (`resolvePoiSource → … → createCustomIcon`) y popup canónico único.
- Importación multi-formato (KML/GPX/GeoJSON/CSV + scrapers) con lifecycle por canal.

Para detalle vivo ver `docs/audits/` y las memorias del proyecto. Para deuda técnica priorizada ver [`docs/tech-debt.md`](./docs/tech-debt.md).

## 🔐 Sistema de Visitas Verificadas

| Método | Descripción |
|--------|-------------|
| 📍 GPS | Check-in estando a menos de 500m |
| 📷 EXIF | Subir foto con geolocalización |

### Grados de Relevancia
- 🥇 **Veterano**: > 3 años
- 🥈 **Consolidado**: 1-3 años
- 🥉 **Confirmado**: 3 meses - 1 año
- 🆕 **Reciente**: < 3 meses

## 📄 Documentación

Ver [VANDITS-v2.0-DOCUMENTATION.md](./VANDITS-v2.0-DOCUMENTATION.md) para documentación técnica completa.

### Documentación de gobernanza

- [Política de versionado](./docs/versioning.md)
- [Histórico reconstruido de versiones](./docs/releases/version-history.md)
- [Deuda técnica priorizada](./docs/tech-debt.md)

## 📝 Changelog

### v1.3.6 (2026-05-21)
- ✅ **Image quality guardrail (POI-7 → POI-8)**. Nuevo clasificador determinista `classifyImageCandidate` (`supabase/functions/_shared/image-quality.ts` + mirror `src/domains/content/lib/image-quality.ts`). Rechaza banderas/escudos/logos/seals y `.svg` puros antes de persistir. `image_status ∈ {accepted, rejected, pending_review}`, `image_kind ∈ {representative, symbolic, unknown}`. Rechazados → `enriched_data.media_rejected[]`, sin escribir `imagen`.
- ✅ `recover-missing-images` integra el clasificador. `computePoiMaturity.hasValidatedMedia` ignora `imagen` con `image_status ∈ {rejected, pending_review}`. Backward-compat: legacy sin `image_status` sigue contando.
- ✅ Corrección 20 falsos positivos L1 (banderas/escudos): movidos a `media_rejected[]`, marcados `rejected/symbolic`. Snapshot en `docs/audits/snapshots/poi7-l1-non-representative-full.csv`. Reversible 1:1.
- ✅ Tests nuevos: `image-quality-classifier.test.ts` + extensión `poi-maturity.test.ts` (rejected/pending_review/accepted/legacy/user-photo override).
- ✅ Bump **patch** `1.3.5 → 1.3.6`. NO toca: nombres, coords, geografía, descripción, tags, colecciones, renderer, tokens, RLS, migraciones. No L2.

### v1.3.5 (2026-05-21)
- ✅ **Tooltips canónicos en leyenda Madurez** (pill inferior derecha de `LocationMap`). Cada chip 0–10 se envuelve con `AppTooltip` (Radix + tokens del sistema) además del `title`/`aria-label` ya existentes.
- ✅ Bump **patch** `1.3.4 → 1.3.5`. NO toca: colores, layout, `computePoiMaturity`, marker fill, datos, colecciones, popup.

### v1.3.4 (2026-05-20)
- ✅ **Corrección definición POI-10** en `computePoiMaturity`. POI-10 deja de exigir `enriched_data.observacion` (estado personal/editorial del usuario). Pasa a representar **curación OBJETIVA completa**: `geoHealth='ok'` + `enrichment_status='enriched'` (sobre POI-9 ya garantiza por monotonía `raw_geocode`, país/continente, región/zona, descripción IA verificable, media validada, categoría/tags).
- ✅ Estado personal (observación, visita, rating, foto propia, comentario) confirmado como **eje SEPARADO**: nunca eleva ni degrada el nivel objetivo POI-N. Flags `geo_resolution` siguen como techo.
- ✅ `src/domains/content/lib/poi-maturity.ts`: `isFullyCurated` deja de leer `observacion`. JSDoc del módulo actualizado.
- ✅ Tests `src/test/poi-maturity.test.ts`: el caso POI-10 ahora se construye **sin** `observacion` (regresión explícita). Nuevo test confirma que la presencia de `observacion` no degrada ni eleva (eje personal separado). 32/32 pasan.
- ✅ `docs/contracts/poi-maturity-visual-contract.md`: tabla canónica y reglas DURAS actualizadas.
- ✅ Bump **patch** `1.3.3 → 1.3.4`. NO toca: renderer, tokens, datos, RLS, edge functions, migraciones, `getPointVisualState`, `getPoiCurationLevel`.

### v1.3.3 (2026-05-20)
- ✅ **Fase 3.1 canon v3 marker fill (`docs/contracts/marker-fill-canon-v3.md`)** — fix de mapping frontend: `dbLocationToGeoLocation` ahora copia `raw_geocode`, `geo_resolved_at`, `geo_confidence` y `geo_source` desde `v_locations_resolved` al objeto `GeoLocation`. Antes se perdían silenciosamente y `computePoiMaturity` capaba TODOS los enriched en POI-3 por ausencia de `rawGeocode`.
- ✅ `GeoLocation` extendido con campos opcionales `rawGeocode?: unknown`, `geoResolvedAt?: string | null`, `geoConfidence?: number | null`, `geoSource?: string | null`. Cambio aditivo, ningún consumidor existente afectado.
- ✅ Nuevo test `src/test/db-transformers-raw-geocode.test.ts` (5 tests): preserva `raw_geocode`/`geo_resolved_at`/`geo_confidence`/`geo_source`; row sin `raw_geocode` → `rawGeocode === null`; integración con `computePoiMaturity` (enriched + raw_geocode + geo_health=ok + descripcion supera POI-3; regresión: sin raw_geocode sigue capado).
- ✅ Bump **patch** `1.3.2 → 1.3.3`. NO toca: `computePoiMaturity`, renderer (`createCustomIcon`, `resolvePoiVisualGrammar`), tokens, colecciones, health rings, datos, RLS, edge functions, migraciones.
- ⚠️ Deuda residual separada: ~340 POIs enriched sin `raw_geocode` en DB (backfill server-side pendiente, fuera del alcance de Fase 3.1). Ver `docs/tech-debt.md`.

### v1.3.2 (2026-05-20)
- ✅ **Fase 3 canon v3 marker fill (`docs/contracts/marker-fill-canon-v3.md`)** — barra/leyenda inferior derecha (`LocationMap`) muestra ahora **única norma vigente**: `Madurez · 0 1 2 3 4 5 6 7 8 9 10`. Cada número se pinta con `hsl(var(--poi-maturity-<n>))` (token `poi.maturity.<n>`) y expone `title`/`aria-label` con el significado canónico POI-0..POI-10 (`Sin dato útil` → `Curado completo`).
- ✅ Retirada la leyenda legacy `Estado base · Final · Importado · Vacío` (paleta `#22c55e`/`#9ca3af`/`#f97316` hardcoded). Final/Importado/Vacío deja de ser leyenda principal; permanece como semántica interna de `getPointVisualState` para filtros/buckets/telemetría.
- ✅ Toggle `Madurez POI ON/OFF` (`MaturityDiagnosticsControl`) sin cambios — sigue activando el overlay admin de POIs. La barra inferior ya no depende de `maturityDiag.enabled`: la leyenda POI-N se muestra siempre.
- ✅ Bump **patch** `1.3.1 → 1.3.2`. NO toca: marker fill, `computePoiMaturity`, `createCustomIcon`, `resolvePoiVisualGrammar`, colecciones, health rings, datos.

### v1.3.1 (2026-05-20)
- ✅ **Fase 2 canon v3 marker fill (`docs/contracts/marker-fill-canon-v3.md`)** — el fill del marker propio (`paletteScope === 'state'`) pasa a derivarse de `getPoiMaturityColor(loc).fill` (`poi.maturity[0..10]`, 11 niveles) en vez del legacy `poi.level.*` (6 niveles). `resolvePoiVisualGrammar` ahora compone `levelVisual = { levelKey, maturityLevel, fillHsl, showStateRing }`: `fillHsl` viene de `poi.maturity[level]`, `maturityLevel` expone el nivel POI-N (0..10) para QA/telemetría, `levelKey` y `showStateRing` siguen ligados a `getPoiCurationLevel` (regla DURA "rings sólo en `poi-5`").
- ✅ `createCustomIcon` SIN cambios estructurales: sigue leyendo `visualGrammar.levelVisual.fillHsl` como `baseColor`. Forma (círculo propio / triángulo seguido), borde, halo de selección, collection tint, health rings, owner identity OKLCH, hero polaroid `rich`, micro dots followed/app/source — todo conservado.
- ✅ `getPointVisualState` se conserva como semántica legacy (filtros, leyendas pill, buckets `getBucketStats`, telemetría). `poi.state.*` no se elimina.
- ✅ `getPoiCurationLevel` (6 niveles producto) sin cambios — sigue dictando acciones de footer/popup vía `data-curation-action`/`data-curation-level`.
- ✅ Nuevo contract test `src/test/marker-fill-source-of-truth.test.ts` (14 tests) blinda la regla: `paletteScope === 'state'` ⇒ `fillHsl === getPoiMaturityColor(loc).fill` (unwrap). Cobertura POI-0..POI-10 incluyendo los 4 techos `geo_resolution`. Regression guard contra reintroducción de `poi.state.enriched` como fill.
- ✅ Tests actualizados: `poi-visual-grammar.test.ts` reformula el caso poi-9/poi-10 (ahora valida distintness a nivel TOKEN — el ladder de madurez puede converger en mismo nivel para fixtures sin geocode completo); añade verificación `maturityLevel ∈ [0..10]` cuando `paletteScope === 'state'`. `map-icon-rings-gate.test.ts` y `poi-maturity-color.test.ts` pasan sin cambios.
- ✅ Bump **patch** `1.3.0 → 1.3.1`. Fases 3 (leyendas), 4 (popup/miniaturas), 5 (cleanup tests), 6 (retirar `poi.level.*`) diferidas a PRs futuros.
- ✅ NO toca: datos, RLS, edge functions, migraciones, re-enrich, leyendas, popup, miniaturas, tokens `poi.state.*`/`poi.level.*` (siguen existiendo).

### v1.3.0 (2026-05-20)

- ✅ **Fase 1 canon v3 marker fill (`docs/contracts/marker-fill-canon-v3.md`)** — helper SoT cromático: `src/domains/content/lib/poi-maturity-color.ts` exporta `getPoiMaturityColor(loc) → { level, fill }`. `level` viene de `computePoiMaturity` (incluye techo por flag `custom_data.geo_resolution.status` v2). `fill` se lee directamente del token `poi.maturity.<level>` como `hsl(...)`. Función pura, sin dependencia de `getPointVisualState`.
- ✅ 19 contract tests (`src/test/poi-maturity-color.test.ts`): POI-0..POI-10 mapean al token correcto, los 4 techos `geo_resolution` se respetan (`geo_irrecoverable`→POI-1, `needs_coord_fix`→POI-2, `needs_name_fix`→POI-3, `pending_review`→POI-4), sin flag → ladder libre, status desconocido → sin techo, `null`/`undefined` → POI-0.
- ✅ Bump **minor** `1.2.22 → 1.3.0` reservado para la migración del canon cromático. Fase 1 NO toca renderer: `createCustomIcon`, `resolvePoiVisualGrammar`, marker base, colecciones, health rings, owner identity, overlay y popup permanecen idénticos. `getPointVisualState` se conserva como semántica legacy (filtros/telemetría/leyendas); `poi.state.*` no se elimina.
- ✅ NO toca: datos, RLS, edge functions, migraciones, re-enrich, mapa visualmente.

### v1.2.22 (2026-05-20)
- ✅ Pulido UX overlay POI-N: `MaturityDiagnosticsControl` reposicionado a `bottom-12 left-4` (libera la barra de escala de Leaflet) y reordenado con `flex-col-reverse` (toggle anclado abajo, leyenda crece hacia arriba). Leyenda **colapsada por defecto** + `max-h-[60vh] overflow-y-auto` → POI-10 siempre alcanzable. Iconos chevron corregidos (Down=cerrado, Up=abierto).
- ✅ Pista contextual en la pill inferior derecha (`LocationMap`): cuando el overlay POI-N está ON se prefija un chip `Estado base` (uppercase, separador derecho) para dejar explícito que "Final / Importado / Vacío" sigue describiendo la paleta del marker, no la madurez. La pill no se sustituye.
- ✅ NO toca: `createCustomIcon`, `resolvePoiVisualGrammar`, `computePoiMaturity`, `MaturityBadgeLayer`, tokens `poi.maturity.*`, marker base, colecciones, popup, datos, RLS, edge functions, migraciones. Sólo presentación.

### v1.2.20 (2026-05-20)

- ✅ POI-N v2 materializado: `computePoiMaturity` aplica **techo** por flag `custom_data.geo_resolution.status` (`pending_review`→POI-4, `needs_name_fix`→POI-3, `needs_coord_fix`→POI-2, `geo_irrecoverable`→POI-1 fijo). Helper exportado `ceilingFromGeoResolutionStatus`. Lectura permisiva camelCase + snake_case. Sin flag → ladder libre.
- ✅ Reinyección documentada: borrar `custom_data.geo_resolution` libera el techo y devuelve el POI al cálculo libre del ladder, sin re-enrich.
- ✅ Tokens `poi.maturity.0..10` recalibrados a la paleta producto-aprobada (gris neutro → gris cálido → amarillo apagado → amarillo → amarillo intenso → ámbar suave → ámbar → verde amarillento → verde suave → verde). Sin rojo. Sólo namespace `poi.maturity.*`.
- ✅ Tests aditivos: 10 nuevos casos en `poi-maturity.test.ts` cubren los 4 techos, ladder libre, snake_case, status desconocido, flag mal formado y reinyección. 40/40 tests pass.
- ✅ NO toca: `createCustomIcon`, `resolvePoiVisualGrammar`, `getPoiCurationLevel`, marker base, colecciones, health rings, collection tints, popup, hero, ratings, export, sharing, datos, RLS, edge functions, migraciones. Overlay diagnóstico `MaturityBadgeLayer` consume tokens nuevos automáticamente.
- ✅ Cross-ref: `docs/contracts/poi-maturity-visual-contract.md` §2/§4/§5 + `docs/contracts/geo-resolution-flags-contract.md`.

### v1.2.19 (2026-05-20)
- ✅ Fix Opción A — `_compute_location_geo_health_lookup` ahora canonicaliza el string territorial comparando contra `admin_areas.name ∪ aliases ∪ name_translations` antes de delegar al cálculo de health. Elimina los `stale_name` falsos por traducción ES↔FR/IT/etc cuando la FK ya resuelve correctamente.
- ✅ Validado contra los 3 casos del piloto B5a (`Autoire`, `Belcastel`, `Sant'Antonino`): recompute pasa de `stale_name` → `ok`. Stored `geo_health` se refresca en el próximo touch natural / batch de geo-canonicalize (sin UPDATE forzado sobre `locations`).
- ✅ NO toca: `locations` (datos), coords, `enriched_data`, re-enrich, UI, `LocationMap.tsx`, schema. Solo función SQL.
- ✅ Funciones internas `_compute_location_geo_health` (ambas overloads) intactas — compatibilidad de firma preservada.
- ✅ Doc: `docs/audits/b5a-stale-name-dry-run.md` (cierre Opción A aplicada).
- ⏸ B5a.2 (n=30) sigue pausado hasta confirmar comportamiento post-fix sobre los 3 stored.

### v1.2.18 (2026-05-20)
- ✅ Overlay diagnóstico POI-Maturity (POI-0…POI-10) admin-gated (`view_audit_log`), OFF por defecto. Toggle + leyenda en esquina inferior-izquierda del mapa; badge numérico 18px sobre POIs propios en `renderMode ∈ {standard, rich}`.
- ✅ Nuevos tokens `poi.maturity.{0..10}` (`src/design-system/tokens/source/poi.json`). NO toca `poi.level.*`, NO toca `createCustomIcon`, `resolvePoiVisualGrammar`, `getPoiCurationLevel`, `levelKey` PR-MAP-CANON-3, paleta enriched/imported/empty, health rings, collection tints, identidad cromática de seguidos.
- ✅ Tres líneas de defensa de gating (capability en `useCapability`, gate en hook `usePoiMaturityDiagnostics`, gate en `MaturityDiagnosticsControl`). Badge `interactive:false` + `pointer-events:none` → no captura clics ni interfiere con popups/selección.
- ✅ Contract tests `src/test/poi-maturity-overlay.test.ts` (9 casos verdes). `poi-maturity.test.ts` sigue verde (19/19).
- ✅ NO toca datos, RLS, edge functions, migraciones. NO re-enrich.

### v1.2.17 (2026-05-20)
- ✅ Nuevo helper canónico `computePoiMaturity(loc)` (`src/domains/content/lib/poi-maturity.ts`) que devuelve nivel POI-0…POI-10 según contrato `docs/contracts/poi-maturity-visual-contract.md`. Función pura, sin efectos, ladder monotónico.
- ✅ Reglas DURAS: coords inválidas no pasan de POI-2; sin `raw_geocode` no se llega a POI-4; sin geografía resuelta no se salta a POI-7; POI-10 exige `geoHealth='ok'` + `enrichment_status='enriched'` + observación personal.
- ✅ Contract tests `src/test/poi-maturity.test.ts` (19 casos verdes). Acepta forma camelCase y snake_case.
- ✅ NO se ha tocado el renderer del mapa (`LocationMap.tsx`, `createCustomIcon`, `resolvePoiVisualGrammar`, `levelKey` PR-MAP-CANON-3 intactos). NO se ha tocado base de datos, ni RLS, ni edge functions. NO re-enrich. NO migraciones.

### v1.2.16 (2026-05-20)
- ✅ Coord-coherence Fase 7 (R7 + R8): `places_trunk` saneado + guard `zone ≠ region`.
- ✅ R7: `lookup_trunk_place` y `upsert_trunk_place` (PL/pgSQL) rechazan coords inválidas al inicio: `NULL`, `NaN`, `(0,0)` Null Island, `|lat|>90`, `|lng|>180`. `lookup` retorna sin filas; `upsert` retorna `NULL`. Sin cambios en RLS, índices, ni schema de `places_trunk`.
- ✅ Defensa cliente espejo: `triggerEnrichLocation` (`src/domains/content/lib/enrich-location.ts`) y `batch-enrich` envuelven `lookup_trunk_place`/`upsert_trunk_place` con `isValidWgs84Coord` antes de invocar RPC.
- ✅ R8: nuevo helper canónico `shouldDropZone(zone, region)` (`src/shared/geography/zone-region-guard.ts` + espejo Deno `supabase/functions/_shared/zone-region-guard.ts`), comparación case- y diacritic-insensitive. `resolve-admin-area` lo aplica tras resolver toda la cadena: si `zone == region`, `zone_id` queda `NULL`; `region_id` permanece intacto.
- ✅ Contract tests: `src/test/places-trunk-coord-guard.test.ts` (5 casos) + `src/test/zone-region-guard.test.ts` (6 casos).
- ✅ Sin datos históricos tocados, sin backfill, sin re-enrich, sin tocar `LocationMap.tsx`, sin tocar RLS/RBAC ni paneles UI.

### v1.2.15 (2026-05-20)
- ✅ Coord-coherence Fase 6 (R6): `assertGeoCoherence` + quarantine post-LLM. Nuevo helper isomórfico `assertGeoCoherence(canonical, aiNarrative)` (`src/shared/enrichment/geo-coherence.ts` + espejo `supabase/functions/_shared/geo-coherence.ts`) detecta menciones de país/región incompatibles con la geografía canónica resuelta por `resolve-coordinates`.
- ✅ `enrich-location` aplica el gate después del sanitizer R4 y antes del merge final: si la narrativa IA contradice país/región, devuelve `{ success:false, validation_required:true, reason:'geo_narrative_mismatch', level, expected, got, source }` sin persistir `enriched_data`.
- ✅ `batch-enrich` propaga el caso: actualiza la fila a `enrichment_status='quarantine'` con `custom_data.enrichment_block = { reason, level, expected, got, source, at }` y emite `__structured.kind='geo_narrative_mismatch'`.
- ✅ Conservador por diseño: word-boundary diacritic-insensitive, catálogos cerrados (país y regiones de ES/FR/PT/IT), tolerancia cuando el texto menciona también el país canónico (mención comparativa). Sin falsos positivos por substring (p.ej. "India" en "Indianapolis").
- ✅ Contract tests `src/test/geo-coherence.test.ts` (12 casos). Sin migraciones SQL (`enrichment_status` es columna text libre). Sin backfill ni re-enrich.
- ✅ Ítem 7 sigue en progreso (Fase 6 aplicada).

### v1.2.14 (2026-05-20)
- ✅ Coord-coherence Fase 5 (R2): `geo_health` honesto. Nuevo bucket `hardError` emitido por trigger SQL cuando lat/lng son `null`, `(0,0)` Null Island, fuera de WGS84, o `enrichment_status='enriched'` + `raw_geocode IS NULL`.
- ✅ `_compute_location_geo_health` y `_compute_location_geo_health_lookup` ampliados con `raw_geocode jsonb` + `enrichment_status text`; trigger `zzz_locations_set_geo_health` observa también esos dos campos.
- ✅ Nuevo helper cliente espejo `src/shared/geography/compute-geo-health.ts` (`computeHonestGeoHealth` / `isHardErrorGeo`) + espejo Deno `supabase/functions/_shared/compute-geo-health.ts`. `isHealthyShareableGeo` lo aplica defensivamente para rechazar `geo_health='ok'` stale.
- ✅ Type union de `geoHealth` en `src/types/location.ts` extendido con `'hardError'`.
- ✅ Contract tests `src/test/geo-health-hard-error.test.ts` (10 casos). Sin backfill de filas históricas (recomputan al siguiente UPDATE).
- ✅ Ítem 7 sigue en progreso (Fase 5 aplicada).

### v1.2.13 (2026-05-20)
- ✅ Coord-coherence Fase 4 (R4 + R5): IA fuera de geografía estructurada.
- ✅ Nuevo helper isomórfico `sanitizeAiEnrichmentPayload` (`src/shared/enrichment/ai-payload-sanitizer.ts` + espejo Deno) — descarta `datos_geograficos.{coordenadas, pais, continente, admin_nivel_1/2/3, localidad, sublocalidad}` emitidos por el LLM.
- ✅ Placeholders evasivos `(sin región)`, `(sin provincia)`, `(sin comarca)`, `(sin localidad)` se eliminan recursivamente del payload IA antes de persistir (R5).
- ✅ Prompt de `enrich-location` añade bloque "GEOGRAFÍA ESTRUCTURADA (PROHIBIDO)"; `card-schema.datos_geograficos` recorta `jsonShape` a `lugar_interes` + `direccion_postal`.
- ✅ Merge geográfico server-side elimina TODOS los fallbacks `aiGeoData.<prohibido>`: país/continente/admin_*/localidad/sublocalidad vienen SOLO de `geoData` (canonical Fase 2). `_geocoded` se mantiene canonical-only.
- ✅ Contract tests `src/test/ai-payload-sanitizer.test.ts` (8 casos); Fase 1/3 siguen verdes (22 tests total).

### v1.2.12 (2026-05-20)
- ✅ Coord-coherence Fase 3 (R9): Name ↔ coordinate identity gate pre-LLM en `enrich-location`.
- ✅ Helper canónico `assertNameCoordinateIdentity` en `src/shared/geography/name-coord-identity.ts` + espejo Deno.
- ✅ Cualquier status ≠ `ok` bloquea el LLM y devuelve `{ success:false, validation_required:true, reason }`.
- ✅ HARD BLOCK: si fallan/timeout ambos lookups → `identity_lookup_unavailable` (NUNCA continúa como `ok`).
- ✅ `batch-enrich` propaga 3 `kind` nuevos (`identity_lookup_unavailable`, `name_coordinate_mismatch`, `name_found_elsewhere`); sin reintento, sin `no_credits`.
- ✅ Tests contrato `src/test/name-coord-identity.test.ts` (7 casos); Fase 1/2 siguen verdes.

### v1.2.11 (2026-05-20)
- ✅ Coord-coherence Fase 2: `resolve-coordinates` obligatorio antes del LLM en `enrich-location`.
- ✅ Si reverse-geocode falla → respuesta canónica `{ success:false, validation_required:true, reason:'reverse_geocode_failed' }` sin gastar IA.
- ✅ Geografía estructurada (`country/region/zone/continent/*_id/country_code/postal_code/timezone/raw_geocode/geo_source/geo_confidence/geo_resolved_at`) persiste SOLO desde el canónico; IA queda fuera.
- ✅ `batch-enrich` propaga `reverse_geocode_failed` como `kind` específico (no se mapea a `no_credits` ni a `no_match`) y persiste el snapshot canónico completo.
- ✅ Tests Fase 1 siguen verdes; añadido test de contrato de shape `reverse_geocode_failed` en `supabase/functions/enrich-location/index.test.ts`.

### v1.2.10 (2026-05-20)
- ✅ Coord-coherence Fase 1: entry gates WGS84 duros (`isValidWgs84Coord`).
- ✅ Rechazo de `null`, `NaN`, fuera de rango y `(0,0)` antes de cualquier IA.
- ✅ Aplicado en `enrich-location`, `batch-enrich`, `scrape-tick` y trigger cliente; respuesta `{ validation_required: true, reason: 'invalid_coordinates' }`.
- ✅ Contract test `src/test/coord-validity.test.ts` (7 casos) en verde.

### v1.2.9 (2026-05-19)
- ✅ Tercera tanda de eventos globales tipados (`trash-updated`, void).
- ✅ Migrados 8 emisores y 2 consumidores; `LocationMap.tsx` intacto.
- ✅ Cobertura del helper tipado: 12 → 13 eventos.

### v1.2.8 (2026-05-19)
- ✅ Segunda tanda de eventos globales tipados de bajo riesgo.
- ✅ Migración de `duplicate-threshold-changed`, `icon-library-changed` y `personal-categories:reload`.
- ✅ Deuda de eventos globales continúa en progreso con cobertura ampliada.

### v1.2.7 (2026-05-19)
- ✅ Helper tipado inicial para eventos globales (`src/lib/global-events.ts`).
- ✅ Migración de hooks extraídos de `Index.tsx` al helper tipado.
- ✅ Deuda de eventos globales pasa a estado en progreso.

### v1.2.6 (2026-05-19)
- ✅ Tercera extracción incremental de orquestación desde `Index.tsx` (`useIndexGlobalEvents` + `useRoutePanelBridge`).
- ✅ Deuda técnica de responsabilidad de `Index.tsx` marcada como resuelta.

### v1.2.5 (2026-05-19)
- ✅ Segunda extracción incremental de orquestación desde Index.tsx (`usePendingValidationEvents`).

### v1.2.4 (2026-05-19)
- ✅ Primera extracción incremental de orquestación desde Index.tsx (`useWelcomeCardEvents`).

### v1.2.3 (2026-05-19)
- ✅ Tests unitarios para gramática visual de puntos (enriched/imported/empty).
- ✅ Deuda técnica de point visual state marcada como resuelta.

### v1.2.2 (2026-05-19)
- ✅ Gobernanza de versiones formalizada.
- ✅ Política SemVer propia de Vandits añadida en `docs/versioning.md`.
- ✅ Árbol histórico reconstruido añadido en `docs/releases/version-history.md`.
- ✅ Deuda técnica de versionado actualizada.
- ✅ Se establece que cada PR debe declarar impacto de versión: none, patch, minor o major.

### v1.2.1 (2026-04-06)
- ✅ Refinamiento de rutas e itinerarios.
- ✅ Mejoras de alternativas intermodales.
- ✅ Persistencia de configuración de itinerarios, paradas y jornadas.
- ✅ Mejoras de selección de rutas en mapa.
- ✅ Agrupación padre/hijo de rutas.
- ✅ Skeleton de carga para itinerarios guardados.

### v1.2.0 (2026-04-04)
- ✅ Sistema de rutas e itinerarios.
- ✅ `RouteBuilder` y `RoutesListPanel`.
- ✅ Schema de rutas y waypoints.
- ✅ Edge function `calculate-route`.
- ✅ Renderizado de rutas en mapa mediante eventos.
- ✅ Alternativas intermodales iniciales.

### v1.1.1 (2026-04-19)
- ✅ Welcome card adaptativa: onboarding para usuarios nuevos · resumen para usuarios con catálogo
- ✅ Resumen con 4 cifras: Mi catálogo · Total accesible · Seguidos · Seguidores
- ✅ Saludo personalizado con fecha y hora del último acceso
- ✅ Cierre por click fuera de la tarjeta
- ✅ Fix: el conteo de catálogo ya no se ve afectado por filtros del mapa

### v1.1.0 (2026-01-18)
- ✅ Layout unificado de paneles laterales y buscador IA
- ✅ Posicionamiento dinámico de paneles
- ✅ Mejoras de consistencia visual

### v1.0.0 (2026-01-17)
- ✅ Sistema completo de gestión de ubicaciones
- ✅ Enriquecimiento automático con IA
- ✅ Verificación de visitas (GPS + EXIF)
- ✅ Grados de relevancia por antigüedad
- ✅ Sistema social (seguimiento)
- ✅ Panel de administración RBAC
- ✅ Exportación multi-formato
- ✅ Mapa interactivo con popups enriquecidos

## 🛠️ Desarrollo Local

### Requisitos
- Node.js 18+
- npm o bun

### Comandos

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm run test     # Ejecutar tests
npm run lint     # Linter
```

## 📜 Licencia

Proyecto privado. Todos los derechos reservados.

---

<div align="center">
  <sub>Construido con ❤️ usando <a href="https://lovable.dev">Lovable</a></sub>
</div>
