
# PR-BACKOFFICE-UX-CANON-1 · Auditoría operativa del BackOffice

Auditoría **read-only**. No tocaré código. Resultado: trazabilidad UI → settings → runtime → efecto observable, panel por panel, con recomendación canónica.

## Alcance

Surface inventariada: `AdminPanel` (modal único con 11 tabs declarados en `src/components/admin/admin-tabs.tsx`).

```
users · permissions · markers · routes · icons · enrichment ·
audit · geography · sources · image-recovery · design-system
```

Todo cuelga del mismo `<dialog max-w-4xl|6xl>`; no hay rutas dedicadas, ni layout shell, ni breadcrumbs.

---

## 1 · Inventario funcional real

| panel | capability | purpose | writes_to | runtime_effect | recompute | edge fns | destructive | preview | history | rollback | status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **users** | manage_users (+assign_master / purge_user) | CRUD roles + purga total | `user_roles`, RPC vía edge | inmediato (RLS) | no | `purge-user` | sí (purge) | sí (purge preview) | no | no | active |
| **permissions** | manage_permissions (master-only) | matrix role × capability | `role_permissions` | inmediato (siguiente `has_permission`) | no | — | sí (cambia gates) | no | no | no | active |
| **markers** (tamaños) | manage_marker_config | tamaños/colores por tipo + reglas estado | `marker_size_config`, `marker_state_rules` | inmediato vía `updateMarkerSizeConfig` / `updateMarkerStateRules` (broadcast a `LocationMap`, `map-icons`, `map-popups`, `MiniMarker`) | no | — | no | parcial (mini swatch) | no | no | active |
| **routes** (motor) | manage_route_engine | engine config + health check | `app_settings.route_engine_config` (per-user fallback) | aplica al próximo cálculo de ruta | no | `check-route-services`, `calculate-route` | no | no (status check sí) | no | no | active |
| **icons** | manage_icon_library | librería global Lucide vs alterna | `app_settings.icon_library` | inmediato vía `IconLibraryContext` | no | — | no | no | no | no | active |
| **enrichment** (fichas) | manage_enrichment_config | tono IA, sources imagen, orden campos, `field_order`, secciones colapsables | `app_settings.enrichment_card_config` | mixto: orden/visibilidad **inmediato** vía `invalidateCardConfig` (popups), tono/min_length/image_sources **solo nuevos enriquecimientos** | sí (re-enrich para que afecte POIs ya enriquecidos) | `enrich-location`, `batch-enrich` (consumen config en server-side al enriquecer) | no directamente | no | no | no | **partial** (UI no avisa que parte solo afecta futuros) |
| **audit** | view_audit_log | inspecciona resolved prefs + traza bus + sync runtime/DB + escenarios | — (read-only) | ninguno | no | — | no | n/a | sí (in-memory 20) | n/a | active (debug) |
| **geography** | view_geo_maintenance / run_geo_backfill / run_geo_canonicalize | scope tree por salud + lanzar job universal (fill/reconcile/overwrite/repair) cross-user, ver canonicalize | `geocoding_jobs`, `admin_areas`, `locations.*_id/geo_health` | deferred (job cron tick) | sí (cron `geocoding-job-tick` + triggers `_compute_location_geo_health_lookup`) | `geocoding-job-tick`, `backfill-admin-fks`, `resolve-admin-area`, `canonicalize-admin-areas` | sí (overwrite, canonicalize) | sí (contadores por salud, scope tree) | sí (`geocoding_jobs.history`) | no (irreversible) | active |
| **sources** | manage_data_sources | toggle/priority de búsqueda·enrichment·scrapers + estado credencial | `data_sources` | aplica en ≤60s vía cache `_shared/data-sources.ts` en edge fns | no (afecta próximas llamadas) | indirecto: `enrich-location`, `recover-missing-images`, `search-candidates`, `scrape-*` | no | no | no | no | active |
| **image-recovery** | run_image_recovery | recuperación masiva imágenes faltantes por scope geo | `image_recovery_jobs`, `locations.enriched_data.media` | deferred (cron tick) | no (idempotente) | `image-recovery-job-tick`, `recover-missing-images` | parcial (sobreescribe `media` con `_force`) | sí (recuento candidatos) | sí (jobs en DB) | no | active |
| **design-system** | manage_design_system (master) | Inspector tokens (read-only) + History tab | — (lee `src/design-system/tokens/source/*.json` estáticos) | ninguno (no escribe) | n/a | — | no | n/a | sí (HistoryTab) | n/a | **placebo de "configurar"** (es Inspector, no Editor; el nombre Design System genera expectativa de edición que no existe) |

Notas de hallazgo durante el inventario:

- `EnrichmentCardConfig` mezcla **3 dominios** en un mismo formulario: (a) renderizado de la ficha (orden de campos, secciones colapsables → inmediato vía `invalidateCardConfig` en `map-popups`), (b) política editorial IA (tono, min_length, include_*  → solo afecta nuevos enriquecimientos), (c) selección de proveedores de imagen (overlap directo con `DataSourcesPanel kind=enrichment`).
- `MarkerSizeManager` empotra `MarkerStateRulesPanel` como segunda tab "Norma de estados". Son dos modelos distintos (tamaños/colores por tipo vs reglas globales de mezcla por estado). El usuario lo percibe como un único panel "marcadores".
- `RouteSettingsPanel` lee `app_settings.route_engine_config` pero `RouteEngineSettings` también persiste preferencias **per-user**. La capa de override no está documentada en UI.
- `IconLibraryManager` escribe `app_settings.icon_library` con un `update` simple (sin `upsert`); si la row no existe el save falla silenciosamente — riesgo de placebo bajo entornos limpios.
- `users` panel: la columna `email` se inicializa a `''` (no se pinta) — vestigio del antiguo listado con email.

---

## 2 · Auditoría de realidad (placebo / dead / partial)

| ítem | clasificación | razón |
|---|---|---|
| `DesignSystemPanel` botón "edit mode" / `EditModeBar` / `EditableTokenSurface` | **partial / placebo** | infraestructura de edición en `src/design-system/runtime/edit-mode-store.ts` existe pero el panel se anuncia explícitamente "Nivel 1 DS Inspector (read-only)" en el JSDoc. No persiste cambios. |
| `EnrichmentCardConfig` campos `tone`, `min_length`, `include_*`, `image_sources` | **partial** | solo aplica a **futuros enriquecimientos**. No hay re-enrich masivo expuesto. UI no lo indica → percepción placebo. |
| `EnrichmentCardConfig.image_sources` vs `DataSourcesPanel kind=enrichment` | **overlap** | dos UIs distintas escribiendo en dos sitios distintos (`app_settings.enrichment_card_config.image_sources` vs `data_sources.enabled`). Ambos consumidos por `enrich-location` con precedencia no documentada. |
| `RouteEngineSettings` per-user overrides vs `app_settings.route_engine_config` global | **partial** | precedencia oculta; el admin no sabe si su edición global será pisada por settings de usuario. |
| `IconLibraryManager` update sin upsert | **fragile** | si falta seed inicial, no persiste. |
| `users` panel `email: ''` | **dead code** | siempre vacío. |
| `MarkerStateRulesPanel.SAMPLE_COLORS` y previews | **active** pero acoplado | sirve solo para preview; ok. |
| `AuditPanel` escenarios | **active (debug-only)** | útil para Master, sin uso operativo de día a día. |
| Edge functions ya no expuestas (auditoría F5 anterior): `migrate-v2`, `backfill-catalog-geo-once` | **dead** (ya eliminadas) | — |
| `create-test-users`, `seed-iso-geography` | **internal_tooling** sin panel | accesibles vía `run_internal_tooling` pero sin entrada de UI clara. |
| `scan-onedrive-geo`, `browse-onedrive` | **partial / disconnected** desde BackOffice | viven en flujo importer, no en admin; mencionar para mapa de ownership. |

---

## 3 · Auditoría de overlap (mapa de ownership real)

```
                 ┌─ orden/visibilidad campos ficha ──► EnrichmentCardConfig (popups)
ENRICHMENT ──────┤
                 ├─ tono / min_length / include_* ───► EnrichmentCardConfig (server, futuros)
                 ├─ proveedores imagen ──────────────► EnrichmentCardConfig  ╲ overlap
                 │                                                            ►── 2 UIs
                 └─ kind=enrichment toggles ─────────► DataSourcesPanel       ╱

GEO MAINT  ──────┬─ scope tree + jobs (fill/reconcile/overwrite/repair) ────► GeographyBackfillPanel
                 └─ canonicalize-admin-areas (master) ───────────────────────► GeographyBackfillPanel (mismo botón)

IMAGE      ──────┬─ recovery masiva por scope ───────────────────────────────► RecoverImagesPanel
                 └─ providers de imagen ────────────────────────────────────► DataSourcesPanel (kind=enrichment) + EnrichmentCardConfig.image_sources

MARKERS    ──────┬─ tamaño/color por tipo ──────────────────────────────────► MarkerSizeManager tab "sizes"
                 └─ reglas mezcla por estado ───────────────────────────────► MarkerSizeManager tab "states" (= MarkerStateRulesPanel)

ROUTES     ──────┬─ engine config global ───────────────────────────────────► RouteSettingsPanel (app_settings)
                 └─ engine config per-user ────────────────────────────────► RouteEngineSettings (preferences) ← precedencia opaca
```

Overlaps detectados (3):
1. **Proveedores de imagen** = `EnrichmentCardConfig.image_sources` × `DataSourcesPanel kind=enrichment`.
2. **Canonicalize geo** dentro de `GeographyBackfillPanel` mezcla operación masiva multi-usuario con acción master-only one-shot.
3. **Engine de rutas** global vs per-user sin UI que muestre la pila.

---

## 4 · Taxonomía operativa

| categoría | panels | mezcla incorrecta |
|---|---|---|
| governance | users, permissions | — |
| runtime_config | markers, routes (motor), icons | — |
| editorial_policy | enrichment (orden/visibilidad) | mezclado con runtime_config (orden=runtime) y con provider_orchestration (image_sources) |
| batch_operation | geography, image-recovery | — |
| geo_maintenance | geography | canonicalize-admin-areas escondida dentro |
| provider_orchestration | sources | image_sources duplicado en enrichment |
| design_system | design-system | etiquetado como "config" pero es **audit/inspector** |
| audit/debug | audit, (design-system real) | — |
| recovery_tooling | image-recovery | — |
| internal_tooling | (sin UI) `create-test-users`, `seed-iso-geography` | — |

---

## 5 · Escalado UX (modal → ruta dedicada)

Candidatos a salir del modal `max-w-4xl/6xl`:

| panel | razón | recomendación |
|---|---|---|
| **design-system** | Inspector con 5 secciones (tokens/primitives/patterns/memories/history), browseable, no hay flujo "OK/Cancel" | `MOVE_TO_ROUTE` → `/admin/design-system` |
| **geography** | 805 LoC, scope tree + lista usuarios + job runner + ETA + canonicalize; modal incómodo y oculta el mapa | `MOVE_TO_ROUTE` → `/admin/geo` con sub-tabs (Mantenimiento / Canonicalize / Coverage) |
| **sources** | tabla con 3 grupos + estado credenciales + priorización; encaja como settings page | `MOVE_TO_ROUTE` → `/admin/sources` |
| **enrichment** (fichas) | 1040 LoC, formularios largos, requiere previews; ya rompe el modal | `MOVE_TO_ROUTE` → `/admin/fichas` y **SPLIT** (ver §6) |
| **image-recovery** | 955 LoC, scope geo + jobs deferred, vive bien junto a geography | `MOVE_TO_ROUTE` → `/admin/operaciones/imagenes` |
| **audit** | console técnica con 4 secciones | `MOVE_TO_ROUTE` → `/admin/audit` |
| users / permissions | flujos cortos, mantienen sentido en modal | `KEEP` (modal) — o `MOVE_TO_ROUTE` si se hace shell |
| markers / routes / icons | settings cortos y comunes | `KEEP` (modal) |

---

## 6 · Tabla final · recomendaciones

| panel | estado_real | riesgo | ownership | runtime_real | deuda | recomendación |
|---|---|---|---|---|---|---|
| users | active | high | governance | inmediato | columna `email` muerta | KEEP |
| permissions | active | high | governance | inmediato | — | KEEP |
| markers (sizes) | active | low | runtime_config | inmediato (broadcast) | tabs implícitas con states | SPLIT (sizes ↔ states) |
| markers (states) | active | low | runtime_config | inmediato | empotrado dentro de sizes | SPLIT (sacar a entrada propia) |
| routes (motor) | active | medium | runtime_config | próximo cálculo | precedencia global↔user opaca | SIMPLIFY (mostrar pila resuelta) |
| icons | active | low | runtime_config | inmediato | update sin upsert | KEEP + fix upsert (fuera de scope canon) |
| enrichment (fichas) | partial | medium | editorial_policy + runtime_config + provider_orchestration | mixto (parte inmediata, parte solo nuevos) | mezcla 3 dominios, sin re-enrich masivo | SPLIT en 3: (a) **render-ficha** runtime_config, (b) **política editorial IA** + re-enrich, (c) **proveedores imagen** → MERGE en DataSources |
| audit | active (debug) | low | audit/debug | none | — | MOVE_TO_ROUTE |
| geography | active | high | geo_maintenance + batch_operation | deferred | canonicalize empotrada, sin rollback | SPLIT (Mantenimiento masivo ≠ Canonicalize one-shot) + MOVE_TO_ROUTE |
| sources | active | medium | provider_orchestration | ≤60s cache | overlap con enrichment.image_sources | MERGE image_sources aquí + MOVE_TO_ROUTE |
| image-recovery | active | medium | recovery_tooling | deferred | — | MOVE_TO_ROUTE (junto a geography) |
| design-system | placebo de "configurar" | low | audit/debug | none | nombre engaña; capability `manage_design_system` sugiere edición | RENAME → "Design System Inspector" + recategorize a audit/debug + MOVE_TO_ROUTE; capability real debería ser `view_design_system` (deferir si requiere migración) |

Leyenda: KEEP · SIMPLIFY · SPLIT · MERGE · REMOVE · MOVE_TO_ROUTE · DEPRECATE.

---

## 7 · Inconsistencias explícitas (placebo / dead / solo-futuros / requiere-recompute)

- `EnrichmentCardConfig.{tone, min_length, include_*, image_sources}` → **solo afecta futuros POIs**. Hoy no hay UI de re-enrich masivo asociada. Inconsistencia: el usuario edita y no ve cambios.
- `EnrichmentCardConfig.image_sources` × `data_sources.kind=enrichment` → **overlap funcional**. Precedencia no canónica.
- `DesignSystemPanel` capability `manage_design_system` → **placebo de mutación**. Panel es read-only.
- `RouteSettingsPanel` global vs per-user → **precedencia oculta**. No es placebo, pero el admin no puede razonar sobre el efecto real sin abrir el código.
- `IconLibraryManager` `update` sin `upsert` → **fragile**, posible placebo silencioso en entornos sin seed.
- `users.email: ''` → **dead field**.
- Capabilities `run_internal_tooling` activa pero **sin panel** (`create-test-users`, `seed-iso-geography`) → operaciones no descubribles desde la UI.

---

## 8 · PR-BACKOFFICE-UX-CANON-2 · DONE

**SPLIT** `EnrichmentCardConfig` y **MERGE** proveedores de imagen en `DataSourcesPanel`.

Cambios aplicados:

- `EnrichmentCardConfig.tsx` reorganizado en 3 secciones con etiqueta de efecto:
  1. **Render de ficha** — badge "Efecto inmediato" (toggles include_*, orden de campos).
  2. **Política editorial IA** — badge "Solo nuevos enriquecimientos" + banner ámbar (tono, min_length, include_image, correct_coordinates, custom_prompt).
  3. **Proveedores de imagen** — pointer block hacia "Fuentes de datos" (sin picker inline).
- `DataSourcesPanel.tsx` añade 4º grupo **Imágenes**: lista canónica de 7 proveedores leyendo/escribiendo `enrichment_card_config.image_sources` + toggle global `include_image`. Cada fila muestra el código `kill-switch` (`enrich.commons`, `enrich.wikipedia`…) y un badge ámbar cuando esa fuente de `kind=enrichment` está deshabilitada (anulación visible).
- Precedencia documentada en UI: `data_sources.enabled` = kill-switch global; `enrichment_card_config.image_sources` = filtro/selección. Sin cambios en `enrich-location` (ya respetaba esa precedencia vía `isImageSourceAllowed`).

Próximo PR sugerido (pendiente aprobación):

1. **PR-BACKOFFICE-UX-CANON-3 · MOVE_TO_ROUTE** de design-system, geography, sources, image-recovery, audit, enrichment dentro de un shell `/admin/*`.
2. **PR-BACKOFFICE-UX-CANON-4 · SIMPLIFY routes** (mostrar pila global↔user resuelta) y **SPLIT markers** (sizes vs states).
3. **PR-BACKOFFICE-UX-CANON-5 · RENAME design-system** → Inspector + recategorize.
4. Deuda fuera de scope: `users.email` cleanup, `IconLibraryManager` upsert, surface para `run_internal_tooling`.

---

## 9 · PR-BACKOFFICE-UX-CANON-3 · DONE

MOVE_TO_ROUTE de 6 panels a `/admin/*` bajo shell común.

- `AdminTabSpec.routeMode: 'modal' | 'route'`. Tabs route: `enrichment`, `audit`, `geography`, `sources`, `image-recovery`, `design-system`. Tabs modal: `users`, `permissions`, `markers`, `routes`, `icons`.
- Nuevos: `src/pages/admin/AdminShell.tsx` (header + breadcrumb + sidebar nav + Outlet, capability gate `open_back_office || manage_users`), `AdminShellIndex` (cards), `src/pages/admin/AdminRoutePage.tsx` (resuelve `:tab` → spec → `AdminGate(capability)` → lazy Component).
- Rutas en `App.tsx`: `/admin` (index) + `/admin/:tab`. Deep-link directo válido.
- `UserMenu`: tabs route navegan vía `navigate(getAdminTabPath)`; tabs modal mantienen `onOpenAdmin`.
- `AdminPanel`: si `defaultTab` es route-mode, `useEffect` navega + `onClose` y render devuelve `null` (evita flash).
- `Index.tsx`: eventos `admin:open-geography` / `admin:open-data-sources` ahora navegan a `/admin/geography` y `/admin/image-recovery`.
- Tests: `src/test/admin-route-tabs-contract.test.ts` (los 6 keys exactos, capability en CAPABILITIES, Component lazy presente, path canónico).
- Capability gates conservados. Sin cambios funcionales en panels, schema o edges.

---

## 10 · PR-BACKOFFICE-UX-CANON-4 · DONE

SIMPLIFY routes + SPLIT markers — clarificar ownership real sin tocar schema ni runtime.

### Routes (`/admin` modal · "Motor de rutas")
- **Hallazgo**: el panel se vendía como "Configuración global" pero escribía a `profiles.route_engine_defaults` del propio admin. No existe storage global writable.
- Renombrado header + título a **"Motor de rutas — mis defaults"**; subtítulo "No existe configuración global escribible. Editas tu override personal."
- Nuevo bloque **"Stack de resolución por usuario"** explícito: `default del sistema → override personal de ese usuario → ajustes por-ruta en el RouteBuilder`. Tarjetas Default / Tu override / Efectivo + `<details>` con diff de campos sobrescritos.
- Acción **"Quitar mi override"** (set `route_engine_defaults = null`) para volver al default puro.
- Mensaje de efecto: **inmediato en próximos cálculos del usuario actual**; itinerarios guardados conservan sus ajustes por-ruta.
- Sin cambios a `calculate-route` ni al schema. Solo se hace visible el modelo real.

### Markers (`/admin` modal · "Marcadores")
- Renombrado label admin tab: `Tamaños de marcadores` → **`Marcadores (tamaños + estados)`**.
- Tabs internas relabeladas con scope explícito: `Tamaños y colores por tipo` + `Reglas de estado visual`.
- Header con subtítulo que separa los dos modelos (qué dibujamos vs paleta canónica enriched/imported/empty) y aclara que ambos tienen **efecto inmediato y aplican a TODOS los usuarios**.

### Tests
- `src/test/route-engine-stack-contract.test.ts`: documenta el stack real, valida que el panel escribe sólo a `profiles` filtrado por `user.id`, prohíbe storage global (`app_settings.route` / `route_engine_global`), exige presencia del bloque "Stack de resolución" y de la acción para quitar override.

### Out of scope (deuda aceptada)
- Si se quisiera un override realmente global (no por-usuario), requeriría schema nuevo (`app_settings.route_engine_global` o tabla dedicada) + cambios en `calculate-route` y `use-route-calculation`. NO se hace en este PR.

---

## 11 · PR-BACKOFFICE-UX-CANON-5 · DONE

Cierre semántico del BackOffice — sin schema, sin lógica core.

### Cambios
- **Rename**: `Design System` → **`Design System Inspector`** (admin tab label). Refleja que hoy es audit/read-only, no editor.
- **Audit panel**: las 4 tabs ahora viven en **dos clusters visuales** separados con label + subtítulo:
  - `Runtime audit` (Estado resuelto + Runtime vs DB) → "Lo que la app está usando AHORA".
  - `Debug técnico` (Trazas + Escenarios) → "Event tracing y verificación".
- **Geography panel**: header re-taxonomizado en 3 categorías explícitas (rutinario / masivas / canonicalize one-shot). Nueva sección prominente **`CanonicalizeOneShotCard`** con border destructivo, toggle dry-run, `DestructiveConfirmDialog` token `CANONICALIZE`, gated por `useCapability('run_geo_canonicalize')`. Cierra la capability huérfana sin enterrarla como acción secundaria.
- **Internal tooling surface explícita**: nuevo tab admin `/admin/internal-tools` (capability `run_internal_tooling`, icon `Terminal`). Panel `InternalToolsPanel` lista inventario de edge tools internas (create-test-users, canonicalize-admin-areas, purge-user, geocoding-job-tick, image-recovery-job-tick) con ownership UX explícito (panel / inline / cron / aquí) y `EffectBadge` por tool. Cierra capability huérfana.
- **Runtime semantics canónico**: nuevo primitivo `src/shared/components/ui/effect-badge.tsx` con 5 variantes (`immediate` / `future-only` / `recompute` / `deferred` / `cache-delay`). Aplicado en:
  - `RouteSettingsPanel` → `immediate` (próximos cálculos del usuario actual).
  - `MarkerSizeManager` → `cache-delay` (~5s, todos los usuarios).
  - `EnrichmentCardConfig` → `immediate` (render) + `future-only` (política IA).
  - `InternalToolsPanel` → uno por tool.
  - `CanonicalizeOneShotCard` → `deferred`.

### Tests
- `src/test/backoffice-ux-canon-5-contract.test.ts`: valida rename Inspector, surface internal-tools, presencia del bloque Canonicalize one-shot y de las 3 categorías taxonómicas, prohíbe tabs sin capability.
- `src/test/admin-route-tabs-contract.test.ts` extendido para incluir `internal-tools` en el set canónico de routes.

### Out of scope (deuda aceptada)
- Cron tools (`geocoding-job-tick`, `image-recovery-job-tick`) no son ejecutables manualmente desde el panel — solo declaradas; trigger manual sería un PR separado.
- `EffectBadge` no cubre aún `DataSourcesPanel` (4 grupos heterogéneos) — pendiente PR-6 si se requiere.

---

## 12 · PR-RBAC-MATRIX-1 · DONE

Sustituye el accordion-por-rol por la representación canónica del RBAC: **matriz capability × role** agrupada por dominio operativo. Sin schema, sin cambios en capabilities, sin RLS.

### Cambios
- **Metadata canónica**: `src/components/admin/permissions/capability-metadata.ts` declara para cada capability del SoT:
  - `domain` (governance, content, geo, runtime-config, data-providers, design-system, recovery, audit, internal, destructive)
  - `description` corta (gobernanza), `risk`, `runtime`, `masterOnly`, `destructive`, `internal`.
- **Nuevo panel**: `src/components/admin/PermissionsMatrixPanel.tsx`
  - Matriz vertical (capabilities agrupadas por dominio) × horizontal (master/admin/moderator/editor/supervisor).
  - Celda ✓ / —; toggle exige `DestructiveConfirmDialog` token `MODIFICAR` (mantiene canon F3).
  - Filtros: búsqueda libre, `master-only`, `destructive`, `internal`, `unused`.
  - Collapse por dominio. Tooltip por capability con descripción + riesgo + runtime.
  - Conteo por rol en header; **Supervisor con ≤1 capability marca aviso `legacy?` visible** (no se oculta).
  - Inconsistencia visible: si una capability `masterOnly` está asignada a otro rol, su celda muestra ring ámbar y tooltip explícito.
- **AdminPanel integración**: la tab `permissions` ahora monta `<PermissionsMatrixPanel/>` vía `Suspense` lazy. El accordion legacy fue eliminado del cuerpo principal.

### Out of scope (deuda aceptada)
- Diff visual entre roles (preview "qué pasa si X tuviera permisos de Y") — diferido.
- No se mueve el panel a ruta dedicada todavía; sigue como modal. Migración a `/admin/permissions` quedaría para PR-3 extendido.
- No se valida masterOnly server-side desde este PR (sigue gobernado por RLS + has_permission). La marca masterOnly es UX/governance, no enforcement.
