# Technical Debt

Estado inicial: 2026-05-19

## Objetivo

Mantener una lista pequeña, accionable y priorizada de deuda técnica de Vandits.

La prioridad debe combinar impacto en producto, riesgo operativo y facilidad de resolución.

## Estado auditado

Última revisión: 2026-05-19

| Ítem | Estado | Tipo | Comentario |
|---|---|---|---|
| 1. Versionado y documentación de estado | Resuelto formalizado | Gobernanza | `package.json`, README, UX y documentación quedan alineados en `1.2.9`. |
| 1.1. Materializar rollback anchors con tags Git | Pendiente operativo externo | Release management externo | Rollback anchors documentados; tags Git reales pendientes fuera de Lovable. No bloquea deuda técnica resoluble desde Lovable. |
| 2. Catálogo de eventos globales | En progreso | Arquitectura | Inventario inicial + helper tipado ampliado (13 eventos cubiertos); migrados eventos de bajo riesgo en v1.2.8 (`duplicate-threshold-changed`, `icon-library-changed`, `personal-categories:reload`) y v1.2.9 (`trash-updated`). Pendientes: eventos con consumidor en `LocationMap.tsx` (`layer-visibility-changed`, `measurement-units-changed`), catch-alls fan-out alto (`store-updated`, `reload-locations`) y cobertura completa del bus. |
| 3. Tests de gramática visual de puntos | Resuelto | Testing | Cubierto por `src/test/point-visual-state.test.ts` (11 casos para `enriched`, `imported`, `empty`). |
| 4. Foto de arquitectura actual | Resuelto | Documentación técnica | Cubierto por `docs/architecture/current-architecture.md`. |
| 5. Reducir responsabilidad de `Index.tsx` | Resuelto (2026-05-19) — tercera extracción incremental completada en v1.2.6 | Refactor | `v1.2.4` extrae `useWelcomeCardEvents`; `v1.2.5` extrae `usePendingValidationEvents`; `v1.2.6` extrae `useIndexGlobalEvents` + `useRoutePanelBridge`. Sin `window.addEventListener` inline en `Index.tsx`; puente routes panel encapsulado. |
| 6. Reducir responsabilidad de `LocationMap.tsx` | Abierto | Refactor alto riesgo | Extraer incrementalmente sin reescritura. |
| 7. Coherencia coordenadas-enriquecimiento | En progreso — Fase 7 aplicada | Backend / pipeline de datos | Doble desacople: (a) coords ↔ geografía estructurada y (b) **identidad nombre ↔ coords**. POIs con coords inválidas o con nombre incoherente con sus coords pueden quedar `enriched + geo_health='ok'`. Diagnóstico: [`docs/audits/enrichment-coord-coherence-audit.md`](./audits/enrichment-coord-coherence-audit.md). Contrato y fases: [`docs/contracts/enrichment-coord-coherence-contract.md`](./contracts/enrichment-coord-coherence-contract.md). Fase 7 (v1.2.16) sanea `places_trunk` (R7: `lookup_trunk_place`/`upsert_trunk_place` rechazan coords inválidas) + guard `zone≠region` (R8: `resolve-admin-area` deja `zone_id=NULL` cuando coincide con `region`). Defensa server (SQL + edge) y cliente espejo. Sin backfill ni re-enrich. |
| 8. Fix denormalización `zone` texto NULL con `zone_id` FK | T1-fix cliente aplicado (v1.3.11) — backend abierto | Backend / vista | Cliente ya no lee la cache legacy como primaria: `GeoLocation` expone `*Resolved` (SoT textual via `v_locations_resolved`) y `getLocationHierarchy` aplica orden canónico `*Resolved → legacy → enriched_data`. Los ~1.432 POIs con `zone_id + zone NULL` se pintan correctamente en `GeographyTree` / breadcrumb sin tocar BD. **Pendiente (8.bis)**: (a) migrar progresivamente los ~30 call sites `.from('locations')` directos a `v_locations_resolved` (riesgo: `*Resolved` undefined → fallback a legacy NULL); (b) ampliar la vista con `admin3_resolved` / `locality_resolved` para cerrar los dos niveles inferiores. Sin backfill de `locations.zone` (regla DURA). Ver `docs/contracts/territorial-equivalence-canon.md` §11a y `docs/audits/t1-zone-text-null-with-zone-id-dry-run.md`. |
| 9. Codificar `has_provincia` en `resolveAllFks` | **T2A-code + T2A-data aplicados (v1.3.13)** — T2A-wire abierto | Backend / resolver geo | **T2A-code (v1.3.13, DONE):** mirror técnico transversal del canon en `src/shared/geography/territorial-canon.ts` + espejo Deno `supabase/functions/_shared/territorial-canon.ts` con 39 entradas (38 PDF + RU operativo). Helpers data-driven por ISO2: `getCountryCanon`, `hasProvincia`, `getMunicipioField`, `getLocalityField`, `allowsRegionEqualsZone`. Contract tests: `territorial-canon-pdf-conformance` (§1/§2/§4), `territorial-canon-parity` (TS↔Deno), `territorial-canon-helpers` (defaults/case/diacríticos), `territorial-canon-no-hardcode` (lint anti `country === 'PT'`/`'Portugal'` en resolver/hierarchy/imports, opt-out por línea con `// canon-allow:`). **T2A-data Portugal piloto (DONE, 2026-05-21):** 18 `admin_areas` distritos depth=3 re-parenteados de placeholder `(sin región)` → CCDR canónica (Norte/Centro/Lisboa/Alentejo/Algarve) con `path[]` regenerado; 223 `locations.region_id` PT remapeados de placeholder → CCDR derivada del `zone_id` distrito; snapshot completo en `location_geo_provenance` con `source='t2-canon-lote-1-pt-pilot'` (223 filas, `field_type='region'`, confidence=100). 27 POIs residuales sin distrito real siguen apuntando a placeholder (irreducibles en T2A). 3 concelhos Açores (Angra do Heroísmo, Vila do Porto, Santa Cruz da Graciosa) intactos bajo placeholder — fuera de scope, T2A-bis. **Rollback:** `UPDATE locations l SET region_id = p.original_value::uuid FROM location_geo_provenance p WHERE p.location_id = l.id AND p.source='t2-canon-lote-1-pt-pilot'` + revertir `admin_areas.parent_id` de los 18 distritos a `cbeeecd6-a4b8-4b06-ac15-c40532da63d7`. **Pendiente T2A-wire:** cablear el mirror en `resolveAllFks` (descartar `zone_id` cuando `!hasProvincia`, enrutar municipio a `admin3_id` vs `locality_id`, permitir `region_id=zone_id` sólo si whitelist), en `getLocationHierarchy` / `GeographyTree` (colapsar nivel provincia + nodos uniprovinciales), y en parsers de import. Países sin provincia (NL/SE/NO/FI/MX/BR/AU/JP/CO) entran en segundo lote tras Portugal. |
| 10. Backfill `admin3_id` / `locality_id` bajo umbral | Abierto | Backfill geo dirigido | Países por debajo del 80% por nivel: US admin3 76%, PT 76–79%, CH admin3/locality 72%, MA 73–83%, GR 73–80%, NO locality 58%. ~260 POIs. Backfill vía `resolve-admin-area` sin re-enrich, sin tocar nombre/coords/descripción/tags. Origen del cálculo: audit §1 + §5 deudas #3 y #4. |
| 11. Colapso UI `region==zone` legítimo (uniprovinciales) | Abierto | UI / GeographyTree | Implementar §4 y §7 de [`docs/contracts/territorial-equivalence-canon.md`](./contracts/territorial-equivalence-canon.md): colapsar nodos región-provincia en CCAA/Estados/Ciudades-Estado uniprovinciales (ES Cantabria/Asturias/Madrid/Murcia/Navarra/Rioja/Baleares, DE Berlin/Hamburg/Bremen, AT Wien, BE Brussels, CH cantones sin distritos, AR CABA, US DC, …). Deduplicar en `getLocationHierarchy` y `GeographyTree` con label `"<Nombre> · Región + Provincia"`. |

Criterio de auditoría:

- `Resuelto formalizado`: completado y alineado con documentación/versionado actual.
- `Pendiente operativo`: documentado, pero falta una acción externa o de release.
- `Abierto`: deuda conocida, priorizada y aún no ejecutada.

## Deuda priorizada

### 1. Versionado y documentación de estado

- Severidad: baja
- Facilidad: alta
- Riesgo de cambio: bajo
- Estado: resuelto formalizado (2026-05-19) — `package.json` y README quedan alineados en **1.2.9**. `1.2.0` y `1.2.1` se formalizan desde el histórico reconstruido como anchors estables; `1.2.9` pasa a ser la versión actual. A partir de ahora cada PR debe declarar `Version impact` (none/patch/minor/major) según [`docs/versioning.md`](./versioning.md). Las versiones estables deben poder usarse como rollback anchors mediante tags Git `vX.Y.Z` (ver "Release / rollback anchors" en [`docs/releases/version-history.md`](./releases/version-history.md)).

`package.json`, README y documentación técnica deben contar la misma historia sobre la versión y el estado actual del proyecto.

### 1.1. Materializar rollback anchors con tags Git

- Severidad: media
- Facilidad: alta
- Riesgo de cambio: bajo
- Estado: pendiente operativo externo no bloqueante (2026-05-19)

Esta deuda no se considera bloqueante para continuar con deuda técnica resoluble desde Lovable, porque Lovable no tiene capacidad de crear tags Git reales. El cierre documental está completo; el cierre operativo requiere GitHub o git local.

La documentación de versionado ya define rollback anchors, pero faltan los tags Git reales:

- `v1.1.1`
- `v1.2.0`
- `v1.2.1`
- `v1.2.2`
- `v1.2.3`
- `v1.2.4`
- `v1.2.5`
- `v1.2.6`
- `v1.2.7`
- `v1.2.8`
- `v1.2.9`

Hasta crear esos tags, el rollback está definido documentalmente pero no materializado como mecanismo técnico.

No crear los tags desde Lovable si no existe soporte explícito para operaciones Git.

Los documentos pueden definir los anchors, pero el cierre de esta deuda requiere crear los tags reales en GitHub o por git local. No basta con actualizar documentación.

Cierre documental: completo. Cierre operativo: pendiente. La creación de tags Git reales queda fuera de Lovable y debe hacerse desde GitHub o git local.

### 2. Catálogo de eventos globales

- Severidad: media
- Facilidad: media
- Riesgo de cambio: bajo si se empieza documentando
- Estado: en progreso — helper tipado ampliado (2026-05-19, v1.2.9). Ver [`docs/architecture/global-events.md`](./architecture/global-events.md) sección "Typed helper baseline" y `src/lib/global-events.ts`. Cubre 13 eventos del bus global (9 iniciales en v1.2.7 + 3 en v1.2.8 + 1 en v1.2.9: `trash-updated`, void, 8 emisores / 2 consumidores, sin consumidor en `LocationMap.tsx`). Pendientes: eventos cuyo consumidor principal es `LocationMap.tsx` (intocable en esta fase): `layer-visibility-changed`, `measurement-units-changed`; catch-alls fan-out alto: `store-updated`, `reload-locations`; tipado completo (`WindowEventMap` u homólogo); unificación de prefijos; cobertura del resto del bus.

Vandits usa varios eventos globales vía `window.dispatchEvent` / `window.addEventListener`.

Antes de refactorizarlos, documentar nombre, payload, emisor y consumidor.


### 3. Tests de gramática visual de puntos

- Severidad: media
- Facilidad: alta
- Riesgo de cambio: bajo
- Estado: resuelto (2026-05-19) — cubierto por `src/test/point-visual-state.test.ts`.

Blindar `src/domains/content/lib/point-visual-state.ts` con tests unitarios para los estados `enriched`, `imported` y `empty`.

### 4. Foto de arquitectura actual

- Severidad: media
- Facilidad: media
- Riesgo de cambio: bajo
- Estado: resuelto (2026-05-19) — cubierto por `docs/architecture/current-architecture.md`.

Crear documentación breve de dominios, stores, mapa, popups, Supabase, rutas, colecciones, back office y eventos globales.

### 5. Reducir responsabilidad de `src/pages/Index.tsx`

- Severidad: media
- Facilidad: media
- Riesgo de cambio: medio
- Estado: resuelto (2026-05-19, `v1.2.6`) — tercera extracción incremental completada.

`Index.tsx` actúa ahora como composición/wiring de alto nivel: ya no contiene `window.addEventListener` inline ni puentes manuales triviales hacia `routeOrch`.

Extracciones realizadas:

- `v1.2.4`: `useWelcomeCardEvents` (`src/hooks/use-welcome-card-events.ts`) — listeners de `vandits:open-upload`, `vandits:open-profile`, `admin:open-geography`, `admin:open-data-sources`.
- `v1.2.5`: `usePendingValidationEvents` (`src/hooks/use-pending-validation-events.ts`) — listener `pending-validations-updated` + estado local `pendingValidationsCount` / `pendingValidationNames`.
- `v1.2.6`: `useIndexGlobalEvents` (`src/hooks/use-index-global-events.ts`) — listeners `enrichment-criteria-changed`, `import:open-categories`, `lovable:follow-changed`, `popup-action`. `useRoutePanelBridge` (`src/hooks/use-route-panel-bridge.ts`) — puente `routesPanelOpen` / `routeBuilderOpen` ↔ `routeOrch`.

Cierre: ningún listener global queda inline en `Index.tsx`; cualquier reducción adicional cae ya en refactor estructural (composición de paneles), no en deuda activa de este ítem. Reducciones futuras se trackean como ítems nuevos si aplica.

### 6. Reducir responsabilidad de `src/components/LocationMap.tsx`

- Severidad: alta
- Facilidad: baja
- Riesgo de cambio: alto

`LocationMap.tsx` concentra lifecycle de mapa, markers, clusters, popups, capas, rutas, realtime, geolocalización, cámara y eventos.

No abordar como reescritura. Extraer incrementalmente manteniendo contratos.

### 7. Coherencia coordenadas-enriquecimiento

- Severidad: crítica
- Facilidad: media (7 fases incrementales independientes)
- Riesgo de cambio: medio (toca pipeline de enriquecimiento + RPCs trunk + `geo_health` + identity gate pre-LLM)
- Estado: en progreso — Fase 5 aplicada (2026-05-20)

Motivo: existen **dos desacoples** críticos en el pipeline:

1. **Coords ↔ geografía estructurada**: POIs con coordenadas inválidas (`(0,0)`, `NULL`, fuera de rango WGS84) pueden terminar persistidos como `enrichment_status='enriched'` con `geo_health='ok'` y cadena admin textual inventada por el LLM. Caso de referencia: "Glorieta de la Antártida" / "Antarctica Roundabout" persistido en Null Island con `country='España'` y FKs admin resueltas pero `raw_geocode IS NULL`.
2. **Identidad nombre ↔ coords** (nuevo): un nombre puede apuntar a un lugar real y las coords a otro distinto, y nada lo detecta antes del LLM. Coords válidas no garantizan que el nombre corresponda a esas coords; un nombre válido no garantiza que las coords correspondan a ese nombre. La identidad del POI no se verifica como condición previa al enriquecimiento.

Causa raíz: enriquecimiento literario (IA), verdad geográfica (reverse-geocode) e **identidad del POI** son tres flujos desacoplados. La IA puede escribir `datos_geograficos.*` libremente, `batch-enrich` no llama a `resolve-coordinates` antes de persistir, no hay gate de identidad nombre↔coords pre-LLM, no hay gate de coherencia narrativa post-LLM, `geo_health` no detecta `(0,0)`, y `places_trunk` cachea las coords inválidas propagando la basura.

Cierre por fases (ver [`docs/contracts/enrichment-coord-coherence-contract.md`](./contracts/enrichment-coord-coherence-contract.md)):

1. Entry gates `isValidWgs84Coord`. ✅ Aplicada en v1.2.10 (`enrich-location`, `batch-enrich`, `scrape-tick`, trigger cliente; contract test `src/test/coord-validity.test.ts`).
2. `resolve-coordinates` obligatorio antes del LLM. ✅ Aplicada en v1.2.11 (`enrich-location` invoca `resolve-coordinates` post-R1; fallo → `{ success:false, validation_required:true, reason:'reverse_geocode_failed' }` sin gastar IA; `batch-enrich` propaga `kind:'reverse_geocode_failed'`; geografía estructurada persiste SOLO desde canónico).
3. Name-coordinate identity gate (R9) — `assertNameCoordinateIdentity` pre-LLM. ✅ Aplicada en v1.2.12 (helper canónico `src/shared/geography/name-coord-identity.ts` + espejo Deno; integrado en `enrich-location` tras R3; `identity_lookup_unavailable` es **HARD BLOCK** por contrato — ambos lookups fallidos NUNCA continúa como `ok`; `batch-enrich` propaga 3 `kind` nuevos sin reintento ni `no_credits`).
4. Prompt + validator: IA fuera de geografía estructurada. ✅ Aplicada en v1.2.13 (helper isomórfico `sanitizeAiEnrichmentPayload` + espejo Deno descarta del payload IA `datos_geograficos.{coordenadas, pais, continente, admin_nivel_1/2/3, localidad, sublocalidad}` y placeholders `(sin …)`; prompt de `enrich-location` añade bloque "GEOGRAFÍA ESTRUCTURADA (PROHIBIDO)"; `card-schema.datos_geograficos.jsonShape` recortado a `lugar_interes + direccion_postal`; merge server-side elimina todos los fallbacks `aiGeoData.<prohibido>`; `_geocoded` canonical-only; contract test `src/test/ai-payload-sanitizer.test.ts`).
5. `geo_health` honesto (`(0,0)` → `hardError`). ✅ Aplicada en v1.2.14 (trigger SQL `_compute_location_geo_health` reescrito para emitir `'hardError'` en `lat/lng IS NULL`, `(0,0)`, fuera de WGS84, o `enriched + raw_geocode IS NULL`; `_compute_location_geo_health_lookup` y trigger `zzz_locations_set_geo_health` ampliados con `raw_geocode + enrichment_status`; helper cliente espejo `src/shared/geography/compute-geo-health.ts` + espejo Deno; `isHealthyShareableGeo` lo aplica defensivamente; sin backfill — filas recomputan al siguiente UPDATE; contract test `src/test/geo-health-hard-error.test.ts`).
6. `assertGeoCoherence` + `quarantine` (post-LLM).
7. `places_trunk` saneado + guard `zone≠region`.

Backfill de POIs corruptos históricos: fuera de scope, se aborda tras validar Fases 1–7.

**Pendiente:** aplicar flags de resolución geográfica a B5b/B5c según contrato [`docs/contracts/geo-resolution-flags-contract.md`](./contracts/geo-resolution-flags-contract.md) (mapeo inicial: 51 `human_review` → `pending_review`/`needs_name_fix`, 19 `reject_geo_irrecoverable` → `geo_irrecoverable`, 4 `Parque Municipal` cosméticos → `pending_review` sin tocar `raw_geocode`).

**Pendiente (POI-N v2):** materializar techo por flag `geo_resolution` en `computePoiMaturity` (`Math.min(level, ceilingFromFlag(status))` con tabla `pending_review→POI-4`, `needs_name_fix→POI-3`, `needs_coord_fix→POI-2`, `geo_irrecoverable→POI-1`) + tests aditivos. Doc canónica: [`docs/contracts/poi-maturity-visual-contract.md`](./contracts/poi-maturity-visual-contract.md) §4 y §5.

**Pendiente (POI-N v2):** recalibrar tokens `poi.maturity.0..10` a la paleta producto-aprobada (gris neutro → gris cálido → amarillo apagado → amarillo → amarillo intenso → ámbar suave → ámbar → verde amarillento → verde suave → verde). Sólo namespace `poi.maturity.*`; no tocar `poi.state.*`, `poi.level.*`, `poi.ring.*`, `poi.collectionTintSample.*`.

No iniciar Fase 5 antes de Fase 1, ni Fase 6 antes de Fase 2, ni Fase 3 antes de Fase 2 (orden de dependencia documentado en el contrato).

---

## Roadmap — Migrar canon cromático del marker a POI-N (v1.3.0)

**Status:** plan estratégico aprobado, ejecución diferida. Doc-only ejecutado: ver [`docs/contracts/marker-fill-canon-v3.md`](./contracts/marker-fill-canon-v3.md) + §6/§7 de [`docs/contracts/poi-maturity-visual-contract.md`](./contracts/poi-maturity-visual-contract.md).

**Decisión canon v3:**

- Fill principal del marker propio pasa a `poi.maturity[ computePoiMaturity(loc) ]` (11 tonos, gris → amarillo → ámbar → verde).
- Colección (tinte 2px), owner identity (OKLCH para seguidos), selección (halo) y health rings (5px) se **conservan** como capas secundarias geométricamente separadas — no compiten por el fill.
- Badge numérico POI-N **deja de ser UI principal**; sobrevive como debug interno admin (`view_audit_log` + toggle `Madurez POI ON/OFF`) durante al menos dos releases tras el bump.
- Triada `Final / Importado / Vacío` deja de ser fill principal; pasa a **semántica legacy** (filtros, telemetría, leyendas heredadas) vía `getPointVisualState`, que se conserva.
- `getPoiCurationLevel` (6 niveles producto) **no cambia**: sigue dictando acciones de footer/popup, independiente del fill.

**Fases (PRs separados):**

1. ✅ **Aplicada en v1.3.0** — Helper SoT `getPoiMaturityColor(loc)` en `src/domains/content/lib/poi-maturity-color.ts` envolviendo `computePoiMaturity` + lookup directo del token `poi.maturity.<level>`. 19 contract tests en `src/test/poi-maturity-color.test.ts`. NO toca renderer (mapa idéntico). `getPointVisualState` se conserva como semántica legacy; `poi.state.*` no se elimina.
2. ✅ **Aplicada en v1.3.1** — Renderer cableado. `resolvePoiVisualGrammar` consume `getPoiMaturityColor` para `paletteScope === 'state'`; `PoiLevelVisual` extendido con `maturityLevel: PoiMaturityLevel`. `createCustomIcon` SIN cambio estructural (sigue leyendo `levelVisual.fillHsl`). `levelKey` y `showStateRing` siguen ligados a `getPoiCurationLevel` (regla DURA rings sólo en `poi-5`). Nuevo contract test `src/test/marker-fill-source-of-truth.test.ts` (14 tests) bloquea regresiones a `poi.state.*`/`poi.level.*`. `poi-visual-grammar.test.ts` reformulado. NO toca: leyendas, popup, miniaturas, datos, RLS, edge functions, migraciones.
3. ✅ **Aplicada en v1.3.2** — Leyenda inferior derecha en `LocationMap` unificada a la norma vigente `Madurez · 0 1 2 3 4 5 6 7 8 9 10`. Cada número se pinta con `hsl(var(--poi-maturity-<n>))` y expone `title`/`aria-label` con el significado POI-0..POI-10. Retirada la leyenda legacy `Estado base · Final · Importado · Vacío` (paleta hardcoded `#22c55e`/`#9ca3af`/`#f97316`). La leyenda POI-N se muestra siempre (ya no depende del toggle admin `Madurez POI ON/OFF`, que sigue controlando sólo el overlay de badges sobre POIs). NO toca: marker fill, `computePoiMaturity`, `createCustomIcon`, `resolvePoiVisualGrammar`, colecciones, health rings, datos.
3.1. ✅ **Aplicada en v1.3.3** — Mapping fix frontend: `dbLocationToGeoLocation` (`src/domains/content/lib/db-transformers.ts`) ahora copia `raw_geocode → rawGeocode`, `geo_resolved_at → geoResolvedAt`, `geo_confidence → geoConfidence`, `geo_source → geoSource` desde `v_locations_resolved`. Antes se perdían silenciosamente y TODOS los POIs enriched caían en POI-3 al evaluar `computePoiMaturity` (que requiere `hasRawGeocode` para pasar de POI-3 a POI-4). `GeoLocation` extendido con los 4 campos opcionales. Nuevo test `src/test/db-transformers-raw-geocode.test.ts` (5 tests) blinda preservación + regresión (sin `raw_geocode` sigue capado). Cambio aditivo. NO toca: `computePoiMaturity`, renderer (`createCustomIcon`, `resolvePoiVisualGrammar`), tokens, colecciones, health rings, datos, RLS, edge functions, migraciones. **Deuda residual separada (3.1.bis)**: ~340 POIs enriched sin `raw_geocode` en DB requieren **backfill server-side del geocoder** (re-resolver Nominatim/MapBox y poblar `locations.raw_geocode`); queda fuera del alcance de Fase 3.1 (mapping fix), debe planificarse como migración de datos independiente.
4. Popup/miniaturas: hero y previews leen el mismo helper para paridad con el mapa.
5. Tests: actualizar `point-visual-state`, `poi-maturity`, `map-icon-rings-gate`; consolidar fixtures de niveles altos POI-9/POI-10 con geocode completo para test integration (hoy bloqueado por fixtures simples que cap-ean en POI-2).
6. Cleanup: retirar `poi.level.*` del renderer (Fase 2 ya no lo consume); decidir retirada definitiva del overlay debug y del token `poi.state.*` como fill (queda sólo para semántica legacy de leyendas/buckets).

**Version impact:** Fase 1 ejecutada con bump **minor** `v1.2.22 → v1.3.0` (sin cambio visual). Fase 2 ejecutada con bump **patch** `v1.3.0 → v1.3.1` (cambio visual real del fill propio: pasa de paleta `poi.level.*` 6-niveles a `poi.maturity.*` 11-niveles). Fase 3 ejecutada con bump **patch** `v1.3.1 → v1.3.2` (leyenda inferior unificada a POI-N). Fase 3.1 ejecutada con bump **patch** `v1.3.2 → v1.3.3` (fix mapping `raw_geocode`: enriched ya no quedan artificialmente capados en POI-3). Fases 4..6 se ejecutarán como patches dentro de `v1.3.x`.

**Bloqueos previos a ejecutar Fase 4:** decidir si miniaturas/popup hero deben adoptar la paleta POI-N o conservar `getPointVisualState` por paridad con previews legacy.

