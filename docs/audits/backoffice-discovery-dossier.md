# BackOffice Discovery Dossier (PR-BACKOFFICE-DISCOVERY-DOSSIER-1)

> **Estado**: discovery sistémico definitivo, basado en evidencia trazable del código (no rediseño, no implementación, no runtime).
> **Vocabulario de campos sin evidencia directa**: `unknown` o `inferred:<motivo>`. **`TBD` prohibido.**
> **Recomendaciones**: diagnóstico (`KEEP | SPLIT | DOWNGRADE | MOVE | REMOVE | DEBUG_ONLY | MERGE | NEEDS_DECISION`). No autorizan cambios.
> **Anclajes**: `mem://governance/rbac-canon`, `mem://governance/backoffice-ux-closure`, `mem://logic/operations/heavy-operations-feedback`, `mem://ui/panel-system`, `mem://admin/data-sources-panel`, `mem://admin/geo-maintenance-panel`.

---

## SECCIÓN 1 — Inventario inicial verificable

Fuente de verdad enumerada: `src/components/admin/admin-tabs.tsx` (12 tabs), `src/pages/admin/AdminShell.tsx`, `src/pages/admin/AdminRoutePage.tsx`, `src/components/AdminPanel.tsx`. Surfaces secundarias verificadas por lectura directa. Ninguna `discovered_during_audit: true` adicional emergió respecto al baseline aprobado.

### 1.A — Tabs principales (12)

#### 1.A.1 users
```text
evidence:
  file:           src/components/AdminPanel.tsx (cuerpo inline)
  route:          /admin/users (vía AdminShell + modal legacy)
  component:      AdminPanel (sección users)
  capability:     manage_users
  imports:        usePermissions, supabase, DestructiveConfirmDialog, AdminBrokenUsersList, ADMIN_TABS
  reads:          auth.users (vía RPCs), user_roles
  writes:         user_roles (assign/revoke), edge fn purge-user
  source_of_truth: auth.users + user_roles
  anchor:         mem://governance/rbac-canon
  discovered_during_audit: false
```

#### 1.A.2 permissions
```text
evidence:
  file:           src/components/admin/PermissionsMatrixPanel.tsx (509 líneas)
  route:          /admin/permissions (modal legacy)
  component:      PermissionsMatrixPanel
  capability:     manage_permissions  (master-only por bypass)
  imports:        CAPABILITIES, CAPABILITY_META, EffectBadgeRow, DestructiveConfirmDialog
  reads:          role_permissions (vía supabase)
  writes:         role_permissions (toggle por celda con typed-token 'MODIFICAR')
  source_of_truth: role_permissions → has_permission(uid,cap)
  anchor:         mem://governance/rbac-canon (master bypass)
  discovered_during_audit: false
```

#### 1.A.3 markers
```text
evidence:
  file:           src/components/MarkerSizeManager.tsx
  route:          /admin/markers (modal legacy)
  component:      MarkerSizeManager
  capability:     manage_marker_config
  imports:        updateMarkerSizeConfig, MarkerStateRulesPanel, EffectBadge
  reads:          app_settings.marker_config
  writes:         app_settings (marker_config), event bus repaint
  source_of_truth: app_settings.marker_config
  anchor:         mem://features/admin/marker-management-unified
  discovered_during_audit: false
```

#### 1.A.4 routes
```text
evidence:
  file:           src/components/RouteSettingsPanel.tsx (319 líneas, export RouteSettingsPanelContent)
  route:          /admin/routes (modal legacy)
  component:      RouteSettingsPanelContent
  capability:     manage_route_engine
  imports:        RouteEngineSettings, EngineConfig, EffectBadge, supabase
  reads:          app_settings.route_engine, per-user override
  writes:         per-user override (preferences layer); check-route-services edge
  source_of_truth: layered (global app_settings + user override) — ver mem://shared/preferences
  anchor:         mem://logic/routing/manual-selection-persistence
  discovered_during_audit: false
```

#### 1.A.5 icons
```text
evidence:
  file:           src/components/IconLibraryManager.tsx
  route:          /admin/icons (modal legacy)
  component:      IconLibraryManager
  capability:     manage_icon_library
  imports:        useIconLibrary, ICON_LIBRARY_OPTIONS, supabase
  reads:          app_settings.icon_library
  writes:         app_settings.icon_library
  source_of_truth: app_settings.icon_library
  anchor:         none
  discovered_during_audit: false
```

#### 1.A.6 enrichment
```text
evidence:
  file:           src/domains/content/components/EnrichmentCardConfig.tsx
  route:          /admin/enrichment
  component:      EnrichmentCardConfig
  capability:     manage_enrichment_config
  imports:        DEFAULT_COLLAPSIBLE_SECTIONS, invalidateCardConfig, EffectBadge
  reads:          app_settings.enrichment_card_config
  writes:         app_settings.enrichment_card_config (slots, order, image_sources filter)
  source_of_truth: app_settings.enrichment_card_config
  anchor:         mem://admin/data-sources-panel (interacción con image_sources)
  discovered_during_audit: false
```

#### 1.A.7 sources
```text
evidence:
  file:           src/components/admin/DataSourcesPanel.tsx (406 líneas)
  route:          /admin/sources
  component:      DataSourcesPanel
  capability:     manage_data_sources
  imports:        supabase, Switch, Badge
  reads:          data_sources (kind=search|enrichment|scraper|images)
  writes:         data_sources.{enabled, priority, weight, config}
  source_of_truth: data_sources table
  anchor:         mem://admin/data-sources-panel
  discovered_during_audit: false
```

#### 1.A.8 geography
```text
evidence:
  file:           src/components/admin/GeographyBackfillPanel.tsx (951 líneas)
  route:          /admin/geography
  component:      GeographyBackfillPanel
  capability:     view_geo_maintenance (entry) + run_geo_backfill (admin+master) + run_geo_canonicalize (master)
  imports:        useGeocodingJobStore, GeographyScopeTree, AdminBrokenUsersList,
                  useOperationHistory, operationKeyForCapability, DestructiveConfirmDialog (canonicalize)
  reads:          geocoding_jobs, locations health summary, brokenUsers RPC
  writes:         geocoding_jobs INSERT (mode: fill|reconcile|overwrite|repair),
                  edge fn canonicalize-admin-areas (typed-token 'CANONICALIZE')
  source_of_truth: geocoding_jobs + canonical_admin_areas
  anchor:         mem://admin/geo-maintenance-panel, mem://logic/operations/heavy-operations-feedback
  discovered_during_audit: false
```

#### 1.A.9 image-recovery
```text
evidence:
  file:           src/components/admin/RecoverImagesPanel.tsx (981 líneas)
  route:          /admin/image-recovery
  component:      RecoverImagesPanel
  capability:     run_image_recovery
  imports:        useImageRecoveryJobStore, getImageRecoveryMetrics, GeographyScopeTree,
                  useOperationHistory, operationKeyForCapability
  reads:          recovery_jobs metrics, locations breakdown (pending_candidates/enriched/total_active)
  writes:         recovery_jobs (mode: missing|refresh|full), edge fn image-recovery-job-tick
  source_of_truth: recovery_jobs + image-recovery-job-store
  anchor:         mem://logic/image-recovery/measurement-contract
  discovered_during_audit: false
```

#### 1.A.10 audit
```text
evidence:
  file:           src/components/AuditPanel.tsx
  route:          /admin/audit
  component:      AuditPanel
  capability:     view_audit_log
  imports:        listUnits, resolveWithProvenance, onPrefChanged, defaultAdapter (preferences bus)
  reads:          preferences runtime (registry + bus + storage adapter)
  writes:         none (read-only)
  source_of_truth: preferences bus snapshot
  anchor:         mem://architecture/preference-persistence-hooks
  discovered_during_audit: false
```

#### 1.A.11 design-system
```text
evidence:
  file:           src/components/admin/DesignSystemPanel.tsx
  route:          /admin/design-system
  component:      DesignSystemPanel
  capability:     inspect_design_system  (master-only)
  imports:        design-system tokens, HistoryTab, edit-mode-store (vía EditModeBar)
  reads:          token registry (color/typography/density) + edit-mode draft+published
  writes:         drafts en edit-mode-store; publish vía EditModeBar (cuando aplica)
  source_of_truth: design-system tokens runtime (apply-overrides)
  anchor:         mem://architecture/design-system-phase-3
  discovered_during_audit: false
```

#### 1.A.12 internal-tools
```text
evidence:
  file:           src/components/admin/InternalToolsPanel.tsx
  route:          /admin/internal-tools
  component:      InternalToolsPanel
  capability:     run_internal_tooling  (master-only)
  imports:        supabase (invoke), EffectBadge
  reads:          none (acción on-demand)
  writes:         invoca edges: create-test-users, etc. (one-shot)
  source_of_truth: registry inline en el panel
  anchor:         mem://governance/rbac-canon (capability master-only)
  discovered_during_audit: false
```

### 1.B — Chrome y embebidos (8)

#### 1.B.1 AdminShell
```text
evidence:
  file:           src/pages/admin/AdminShell.tsx
  route:          /admin/*
  component:      AdminShell
  capability:     open_back_office OR manage_users (gate de entrada)
  imports:        usePermissions, ADMIN_TABS, groupAdminTabsByDomain, isDiagnosticDomain
  reads:          capability set del usuario
  writes:         none
  source_of_truth: ADMIN_TABS + ADMIN_DOMAIN_ORDER
  anchor:         mem://governance/backoffice-ux-closure
  discovered_during_audit: false
```

#### 1.B.2 AdminShellIndex
```text
evidence:
  file:           src/pages/admin/AdminShell.tsx (export AdminShellIndex)
  route:          /admin (landing)
  component:      AdminShellIndex
  capability:     reusa el gate del shell
  imports:        ADMIN_TABS, isDiagnosticDomain
  reads:          visibleTabs filtrados por capability
  writes:         none
  source_of_truth: ADMIN_TABS
  anchor:         none
  discovered_during_audit: false
```

#### 1.B.3 AdminGate / AdminGateDenied
```text
evidence:
  file:           src/components/admin/AdminGate.tsx
  route:          envoltorio de AdminRoutePage y secciones inline
  component:      AdminGate / AdminGateDenied
  capability:     parameter (cualquier Capability)
  imports:        useCapability
  reads:          has_permission(uid, cap)
  writes:         none
  source_of_truth: useCapability hook (mirror cliente de has_permission)
  anchor:         mem://governance/rbac-canon
  discovered_during_audit: false
```

#### 1.B.4 AdminBrokenUsersList
```text
evidence:
  file:           src/components/admin/AdminBrokenUsersList.tsx
  route:          embedded in users + geography (cross-user selector)
  component:      AdminBrokenUsersList
  capability:     none directa (heredada del padre)
  imports:        supabase
  reads:          users con datos rotos (vía query)
  writes:         none (es selector)
  source_of_truth: RPC interna brokenUsers (inferred:nombre exacto no inspeccionado)
  anchor:         none
  discovered_during_audit: false
```

#### 1.B.5 PanelEffectHeader + EffectBadgeRow
```text
evidence:
  file:           src/components/admin/PanelEffectHeader.tsx + EffectBadge.tsx
  route:          montado por AdminRoutePage y por panels modal
  component:      PanelEffectHeader, EffectBadge, EffectBadgeRow
  capability:     ninguna (chrome); recibe `capability` como prop para resolver efectos
  imports:        effectsForCapability (taxonomía cerrada)
  reads:          taxonomía cerrada immediate|future-only|recompute|deferred|batch|destructive|global|read-only|internal
  writes:         none
  source_of_truth: effectsForCapability(capability)
  anchor:         mem://governance/backoffice-ux-closure
  discovered_during_audit: false
```

#### 1.B.6 OperationStatusCard
```text
evidence:
  file:           src/components/admin/observability/OperationStatusCard.tsx + useOperationHistory.ts
  route:          montado bajo PanelEffectHeader cuando runtime='deferred'
  component:      OperationStatusCard
  capability:     parameter (capability del panel padre)
  imports:        useOperationHistory (localStorage, prefijo lovable:op-history:cap:<capability>, MAX 10)
  reads:          últimas 10 runs locales (id, startedAt, status, durationMs, summary)
  writes:         localStorage por opKey
  source_of_truth: localStorage (NO tabla operation_runs por decisión explícita)
  anchor:         mem://logic/operations/heavy-operations-feedback
  discovered_during_audit: false
```

#### 1.B.7 EditModeBar (design-system sticky)
```text
evidence:
  file:           src/design-system/runtime/edit-mode-store.ts (consumido por EditModeBar)
  route:          embedded in /admin/design-system
  component:      EditModeBar (inferred:nombre exportado por design-system/runtime)
  capability:     inspect_design_system (master-only)
  imports:        useDesignSystemEdit store
  reads:          draft+published tokens
  writes:         publica drafts cuando aplica
  source_of_truth: edit-mode-store
  anchor:         mem://architecture/design-system-phase-3
  discovered_during_audit: false
```

#### 1.B.8 CameraFitQaGate (overlay relacionado)
```text
evidence:
  file:           src/components/debug/CameraFitQaGate.tsx
  route:          overlay condicional ?qa=1 (global, no en /admin)
  component:      CameraFitQaGate → CameraFitQaPanel
  capability:     view_audit_log (mismo gate runtime que /admin/audit)
  imports:        useCapability
  reads:          camera fit diagnostics (inferred del nombre del panel)
  writes:         none
  source_of_truth: runtime debug (no persistido)
  anchor:         mem://governance/rbac-canon (F5)
  discovered_during_audit: false
```

### 1.C — Confirms destructivos (3, dialogs)

#### 1.C.1 purge-user confirm
```text
evidence:
  file:           src/components/AdminPanel.tsx (uso de DestructiveConfirmDialog)
  route:          dialog dentro de users
  component:      DestructiveConfirmDialog
  capability:     manage_users + last-master guard server-side
  imports:        edge fn purge-user
  reads:          target user
  writes:         purge-user (RPC) → cascada
  source_of_truth: auth.users + cascadas RLS
  anchor:         mem://governance/rbac-canon
  discovered_during_audit: false
```

#### 1.C.2 permissions toggle confirm
```text
evidence:
  file:           src/components/admin/PermissionsMatrixPanel.tsx
  route:          dialog dentro de permissions
  component:      DestructiveConfirmDialog (token 'MODIFICAR')
  capability:     manage_permissions (master-only)
  imports:        supabase (role_permissions row)
  reads:          celda capability×role
  writes:         role_permissions
  source_of_truth: role_permissions → has_permission
  anchor:         mem://governance/rbac-canon
  discovered_during_audit: false
```

#### 1.C.3 geo-canonicalize confirm
```text
evidence:
  file:           src/components/admin/GeographyBackfillPanel.tsx
  route:          dialog dentro de geography
  component:      DestructiveConfirmDialog (token 'CANONICALIZE')
  capability:     run_geo_canonicalize (master-only)
  imports:        edge fn canonicalize-admin-areas
  reads:          scope seleccionado
  writes:         canonical_admin_areas (rewrite); FKs de locations pueden moverse
  source_of_truth: canonical_admin_areas
  anchor:         mem://admin/geo-maintenance-panel
  discovered_during_audit: false
```

**Total inventariado: 23 surfaces** (12 tabs + 8 chrome + 3 confirms). Frente al baseline de 24, la diferencia es metodológica: `AdminGate` y `AdminGateDenied` se cuentan como una sola surface (mismo archivo, mismo gate, dos modos de render).

---

## SECCIÓN 2 — Functional surface audit

| surface | interaction_type | primary_action | runtime_semantics | context_model | min_usable_size | secondary_surfaces | hybrid_problems | recommendation |
|---|---|---|---|---|---|---|---|---|
| users | DATA | Listar / gestionar usuarios | immediate writes | full page | ~960×600 | AdminBrokenUsersList, purge confirm | listing + destructive inline | KEEP |
| permissions | CONFIG denso | Editar matriz cap×rol | immediate (global recompute) | full page | ~1024×640 | toggle confirm, master read-only column | toggles + confirms por celda | KEEP |
| markers | CONFIG | Ajustar tamaños/estados | immediate writes | full page | ~720×560 | preview live | none | KEEP |
| routes | HYBRID (CONFIG + DIAG) | Override personal motor de rutas | immediate config + read-only diag | full page | ~640×720 | "Verificar conexiones" (DIAG) | dos modos en mismo body | KEEP (split visual ya canon) |
| icons | CONFIG simple | Elegir librería de iconos | immediate writes | small modal | ~480×480 | none | sobredimensionado para 1 radio | DOWNGRADE |
| enrichment | CONFIG denso | Definir slots/orden de ficha + criterios IA | immediate writes | full page XL | ~1200×720 | image_sources filter (interactúa con sources) | estructura vs criterios IA conviven | NEEDS_DECISION |
| sources | CONFIG denso | Activar/priorizar providers | immediate writes | full page | ~960×640 | per-provider diagnostics | config + status del provider | SPLIT (visual) |
| geography | HYBRID (OPERATION + OBS) | Lanzar backfill/canonicalize | deferred (jobs) + observability | full page XL | ~1200×800 | scope tree, broken users, canon confirm | 3 zonas | KEEP |
| image-recovery | HYBRID (OPERATION + OBS) | Recuperar imágenes faltantes | deferred (job tick) + observability | full page XL | ~1100×760 | filtros avanzados | filtros + dispatch + obs | KEEP (alinear con geography) |
| audit | DATA (read-only) | Inspeccionar runtime de preferencias | read-only | full page | ~1024×640 | trace events | none | KEEP |
| design-system | INSPECTOR + DEBUG | Inspeccionar tokens / publicar drafts | read-only + immediate writes | full page XL | ~1280×800 | EditModeBar (sticky) | inspector + edición publicable | SPLIT (por modo) |
| internal-tools | DEBUG | Ejecutar herramientas internas | immediate (one-shot) | full page | ~720×560 | none | none | KEEP (DEBUG_ONLY) |
| AdminShell | chrome | Estructura nav | n/a | full page | n/a | DiagBadge | none | KEEP |
| AdminShellIndex | chrome | Landing cards | n/a | full page | n/a | none | redundante con sidebar | NEEDS_DECISION |
| AdminGate | chrome | Gate por capability | n/a | n/a | n/a | none | none | KEEP |
| AdminBrokenUsersList | DATA embebido | Selector users con problemas | read-only | embedded | n/a | none | reusado en 2 panels (users + geography) | KEEP |
| PanelEffectHeader+EffectBadgeRow | chrome | Declarar efectos panel | n/a | embedded | n/a | none | none | KEEP |
| OperationStatusCard | OBSERVABILITY chrome | Mostrar últimas 10 runs locales | read-only | embedded | n/a | useOperationHistory | local-only (no compartido) | KEEP (con NEEDS_DECISION futuro sobre operation_runs) |
| EditModeBar | chrome | Sticky para publicar drafts DS | immediate writes | embedded sticky | n/a | none | acoplado a design-system | KEEP |
| CameraFitQaGate | DEBUG overlay | Diagnóstico camera-fit | read-only | overlay | n/a | none | fuera de /admin pero gated por view_audit_log | DEBUG_ONLY |
| purge-user confirm | CONFIRM destructivo | Confirmar purga | immediate (RPC) | true modal | ~480×320 | none | none | KEEP |
| permissions toggle confirm | CONFIRM destructivo (global) | Confirmar toggle | immediate + global | true modal | ~480×280 | none | none | KEEP |
| geo-canonicalize confirm | CONFIRM destructivo (global) | Confirmar canonicalize | deferred (job) | true modal | ~520×360 | none | none | KEEP |

---

## SECCIÓN 3 — Visual anatomy audit

### 3.1 Tabs complejos (ASCII representativo)

#### geography (full XL, 3 zonas operativas)
```text
+-----------------------------------------------------------+
| PanelEffectHeader (badges: deferred, batch, global)        |
+-----------------------------------------------------------+
| Paso 1 · Modo (4 cards horizontales: repair/fill/review/  |
|          overwrite[via toggle dentro de review])           |
+-----------------------------------------------------------+
| AdminBrokenUsersList | GeographyScopeTree (filtrado por   |
| (sidebar selector)   | modo) + contadores en vivo         |
+----------------------+------------------------------------+
| Sticky footer: Lanzar / Parar + job status + ETA          |
+-----------------------------------------------------------+
| OperationStatusCard (últimas 10 runs locales por opKey)   |
+-----------------------------------------------------------+
```
Conteo: cards=4 (modos) + 1 (status) + 1 (obs); CTAs=3 (Lanzar, Parar, Canonicalize); badges=≥7 (modos + health); toggles=1 (forceOverwrite); tablas=0 (tree); collapsibles=inferred:1 (advanced); inputs=0; scrolls=2 (sidebar + tree).

#### image-recovery (full XL, jerarquía universo→modo→filtros→subset)
```text
+-----------------------------------------------------------+
| PanelEffectHeader (badges: deferred, batch)                |
+-----------------------------------------------------------+
| Universo total: Total → Enriched → con/sin foto → No enr. |
+-----------------------------------------------------------+
| 3 mode cards (missing / refresh / full)                    |
+-----------------------------------------------------------+
| Filtros: Usuario · Continente · País · Zona · avanzadas   |
+-----------------------------------------------------------+
| Subset operativo + Lanzar (N final)                        |
+-----------------------------------------------------------+
| OperationStatusCard                                        |
+-----------------------------------------------------------+
```
Conteo: cards=3 (modos) + 1 (universo) + 1 (subset) + 1 (obs); CTAs=2 (Play, Pause); toggles=≥2 (Switch avanzadas); badges=≥3 (modo, severity); inputs=≥4 (filtros + slider); scrolls=1 (item log).

#### permissions (full, tabla densa)
```text
+-----------------------------------------------------------+
| PanelEffectHeader (badges: immediate, global, destructive) |
+-----------------------------------------------------------+
| Filtros: search, master-only, destructive, internal,unused|
+-----------------------------------------------------------+
| Banner ámbar si roles vacíos/casi vacíos                   |
+-----------------------------------------------------------+
| Matriz: filas=capabilities agrupadas por DOMAIN_ORDER     |
|         columnas=[master(read-only), admin, mod, editor]   |
|         celda=✓/—, click → DestructiveConfirmDialog       |
+-----------------------------------------------------------+
| Leyenda lateral / tooltips                                 |
+-----------------------------------------------------------+
```
Conteo: tablas=1 (matriz); inputs=1 (search) + 4 filtros chip; CTAs=N celdas; badges=por capability (risk, runtime); collapsibles=por dominio (ChevronDown/Right).

### 3.2 Conteo agregado (tabs medios — resumido)

| panel | cards | CTAs | badges | toggles | tablas | collapsibles | inputs | scrolls |
|---|---|---|---|---|---|---|---|---|
| users | 1 list + N rows | 2-3 por row | role pills | 0 | 1 | 0 | 1 (search) | 1 |
| markers | N marker rows | 2 (Save/Reset) | EffectBadge×1 | ≥1 | 0 | ≥1 | 0 (sliders) | 1 |
| routes | 2 secciones (A/B) | 2 (Save, Verify) | service status×3+ | 0 | 0 | 1 (DIAG) | varios | 1 |
| icons | 1 | 1 (Save) | 0 | 0 | 0 | 0 | radio×N | 0 |
| enrichment | ≥3 | 2 (Save/Reset) | image-source toggles | ≥N | 0 | ≥1 | textarea+slider+select | 1 |
| sources | 4 grupos | per-row toggles | per-provider status | per-provider | 0 | 0 | per-provider | 1 |
| audit | 4 secciones | 1 (Refresh) | provenance | 0 | 1 (trace) | 0 | 0 | 1 |
| design-system | tabs verticales | publish (sticky) | per-token | filter switches | 0 | 0 | search | 1 (ScrollArea) |
| internal-tools | N tool rows | 1 (Run) por row | EffectBadge | 0 | 0 | 0 | 0 | 1 |

### 3.3 Patrones detectados

- **Ruido visual**: introducciones "Este panel permite…" ya eliminadas en cleanup previo (PR-BACKOFFICE-CLEANUP-REALITY-1).
- **Dashboard engineering syndrome**: `geography` y `image-recovery` saturan zonas; mitigado por jerarquía operativa explícita.
- **Densidad excesiva**: `permissions` (matriz N×4) y `design-system` (tabla de tokens).
- **Jerarquía rota**: `icons` ocupa una full page para una única decisión radio (`inferred` por código de 1 RadioGroup).
- **Duplicación visual**: `AdminShellIndex` cards replican el sidebar.
- **Layouts arbitrarios**: ninguno detectado por código tras PR-BACKOFFICE-CLEANUP-REALITY-1 (regla "second visual grammar" prohibida).
- **Whitespace**: `unknown` sin instrumentación visual.

---

## SECCIÓN 4 — Operational usage audit

> Sin telemetría persistida → la mayoría de campos `unknown` o `inferred`.

| surface | frecuencia | operador | contexto | duración típica | intensidad | multitarea | persistencia | fatiga | riesgo |
|---|---|---|---|---|---|---|---|---|---|
| users | inferred:weekly | master/admin | onboarding/offboarding | 1-5 min | quick action | low | low | low | DESTRUCTIVE (purge) |
| permissions | inferred:incident-only | master | cambio de modelo RBAC | 5-15 min | heavy workflow | low | medium | medium | GLOBAL (recompute) |
| markers | inferred:weekly | admin | ajuste visual | 2-10 min | quick action | low | low | low | LOW |
| routes | inferred:incident-only | admin/master | engine change | 2-10 min | quick action | low | medium (override) | low | MEDIUM |
| icons | inferred:one-shot | admin | decisión de marca | <1 min | quick action | low | low | low | LOW |
| enrichment | inferred:weekly | admin | ajustar ficha | 5-15 min | heavy workflow | low | high (config persistente) | medium | MEDIUM (cascada visual) |
| sources | inferred:weekly | admin/master | rotar provider/secret | 2-10 min | quick action | low | high | medium | HIGH (enrich pipeline) |
| geography | inferred:daily/incident | master | mantenimiento batch | 5-60 min | heavy workflow | medium | high (jobs) | HIGH | HIGH (canonicalize global) |
| image-recovery | inferred:daily/incident | master | recuperar fotos | 5-60 min | heavy workflow | medium | high (jobs) | HIGH | MEDIUM |
| audit | inferred:incident-only | master | debug runtime | 1-5 min | quick action | low | low | low | NONE (read-only) |
| design-system | inferred:incident-only | master | inspeccionar tokens | 5-30 min | heavy workflow | low | medium (drafts) | medium | MEDIUM (publish runtime) |
| internal-tools | inferred:incident-only | master | one-shot tools | <1 min | quick action | low | low | low | varía por tool |
| confirms (3) | inferred:on-action | varies | typed-token | <30s | quick action | low | low | low | DESTRUCTIVE |

---

## SECCIÓN 5 — User journeys (por rol, basados en capabilities reales)

### 5.1 master
- **Mantenimiento geográfico batch**: `/admin` → `geography` → seleccionar modo → árbol scope → Lanzar → observar OperationStatusCard → (opcional) Canonicalize confirm.
- **Cambio RBAC**: `/admin/permissions` → buscar capability → toggle celda → confirm typed-token MODIFICAR → recompute global implícita.
- **Recuperar fotos**: `/admin/image-recovery` → universo → modo → filtros → subset → Lanzar.
- **Publicar tokens DS**: `/admin/design-system` → edit drafts → EditModeBar publish.
- **Tool interno**: `/admin/internal-tools` → Run.

### 5.2 admin (sin master)
- Gestión usuarios; markers; routes; icons; enrichment; sources; geography (sin canonicalize).
- No accede permissions, design-system, internal-tools.

### 5.3 moderator
- `inferred`: read-only en surfaces con capability `view_*` (audit si tiene `view_audit_log`).
- Capabilities operacionales típicamente no asignadas (ver `mem://governance/rbac-canon`).

### 5.4 editor
- Mismo perfil de visibilidad que moderator salvo capabilities editoriales (no surfaces BackOffice principales).
- `unknown` qué capabilities exactas heredan por defecto sin leer migración RBAC.

### 5.5 Puntos de fricción reconocidos
- **Cambio de contexto**: geography ↔ confirm canonicalize ↔ historia local (3 zonas distintas en el mismo panel).
- **Redundancia**: `AdminShellIndex` repite el contenido del sidebar.
- **Tabs modal-legacy** (users, permissions, markers, routes, icons) viven aún en `AdminPanel` modal mientras el shell `/admin/*` está activo — ver `admin-route-tabs-contract.test.ts`.

---

## SECCIÓN 6 — Action hierarchy

| surface | primary | secondary | destructive | diagnostic | advanced |
|---|---|---|---|---|---|
| users | List / select | Edit roles | Purge user (typed-token) | broken users selector | filters |
| permissions | Toggle cell | Filters | Toggle (vía confirm) | banner roles vacíos | search |
| markers | Save | Reset | none | none | tabs estado |
| routes | Save override | none | none | Verificar conexiones | RouteEngineSettings |
| icons | Save | none | none | none | none |
| enrichment | Save | Reset / drag-order | none | none | image_sources filter |
| sources | Toggle | Edit priority/weight | none | provider status | secrets config |
| geography | Lanzar | Stop | Canonicalize | health summary, broken users | forceOverwrite |
| image-recovery | Play | Pause | none | metrics + item log | filtros avanzados |
| audit | Refresh | none | none | trace, sync results | scenario verify |
| design-system | Publish (EditModeBar) | Search/filter tokens | none | History tab | per-token edit |
| internal-tools | Run tool | none | varies | tool log | none |

Detectados:
- **Demasiados CTAs**: ninguno crítico tras cleanup. `geography` tiene 3 (Lanzar / Stop / Canonicalize) pero están separados por zona.
- **Acciones compitiendo**: `enrichment` mezcla "estructura" y "criterios IA" sin separación de CTAs (raíz del `NEEDS_DECISION`).
- **Acciones ocultas**: `routes` "Verificar conexiones" oculta tras DIAG collapsible (correcto post-split A/B).
- **Sobredimensionadas**: `icons` (1 radio = página).

---

## SECCIÓN 7 — Error / failure states

Evidencia observada por código + `inferred` cuando no se inspeccionó manejo concreto:

| surface | tipo de fallo | manejo |
|---|---|---|
| users | edge fn purge-user falla (incl. last-master 409) | toast (sonner) — server enforcement |
| permissions | toggle falla o RLS rechaza | toast + revert local |
| markers/icons/routes/enrichment/sources | save → supabase error | toast + estado de loading |
| sources | provider sin secret | badge AlertTriangle + KeyRound icon |
| geography | job error mid-run | item_log en store + AlertTriangle |
| image-recovery | provider timeout / cooldown | metrics + honorsCooldown por modo |
| audit | preferences bus stale | secciones 3 y 4 detectan divergencia runtime↔persist |
| design-system | publish falla | `unknown` (no inspeccionado) |
| internal-tools | edge error | toast |
| confirms | typed-token mismatch | dialog bloquea acción |

Patrones ausentes / a vigilar (diagnóstico):
- **Race conditions** entre `geography` y `image-recovery` cuando comparten POIs → `unknown` (sin instrumentación cruzada).
- **Stale cache** tras publish de design-system → mitigado por `apply-overrides` runtime.
- **Offline**: `unknown` global.
- **Retry patterns**: jobs sí (tick); UI saves no.

---

## SECCIÓN 8 — Empty / loading states

| surface | empty | loading | skeleton | optimistic | disabled | first-run |
|---|---|---|---|---|---|---|
| users | `inferred:lista vacía` | Loader2 | no | no | botones disabled durante save | inferred |
| permissions | banner ámbar (rol vacío) | Loader2 | no | revert on fail | celdas disabled durante toggle | inferred |
| markers | no aplica | Loader2 | no | no | Save disabled si !hasChanges | inferred |
| routes | services [] hasta verify | Loader2 + checkingServices | no | no | Save disabled | services nunca verificados (servicesChecked=false) |
| icons | n/a | Loader2 | no | no | Save disabled si !hasChanges | seleccion default vía useIconLibrary |
| enrichment | n/a | Loader2 | no | no | Save disabled | DEFAULT_COLLAPSIBLE_SECTIONS |
| sources | grupo vacío `inferred` | Loader2 | no | revert toggle | per-row | n/a |
| geography | tree vacío según modo | useGeocodingJobStore loading | no | no | Lanzar disabled si subset=0 | broken users vacío |
| image-recovery | breakdown=0 | Loader2 + metrics | no | no | Lanzar disabled si N=0 | n/a |
| audit | trace vacío | n/a | no | n/a | n/a | n/a |
| design-system | `unknown` | n/a | no | drafts persisten | n/a | n/a |
| internal-tools | n/a | per-tool spinner | no | no | Run disabled while loading | n/a |

Carencias: ningún panel utiliza `AppSkeleton` ni `PanelShellLoading` para el primer paint (memorias `mem://ui/skeleton-patterns`, `mem://ui/panel-loading-pattern` no se aplican aquí). `inferred` que el coste es bajo por ser surfaces de operador, no de usuario final.

---

## SECCIÓN 9 — Dependency / causality map

Ver `docs/audits/diagrams/backoffice-dependency-graph.mmd` y `backoffice-causality-cascades.mmd`. Resumen:

| surface | escribe en | consumido por | recompute / invalida | side effects ocultos | warning necesario |
|---|---|---|---|---|---|
| users | user_roles, auth.users (via purge) | has_permission, RLS de todo schema | bypass master se mantiene siempre | cascadas RLS por purge | last-master guard server |
| permissions | role_permissions | has_permission(uid,cap) → cliente + edges | TODOS los gates re-evalúan | global recompute UX | confirm typed-token + banner roles vacíos |
| markers | app_settings.marker_config | LocationMap renderer | repintado completo de markers | invalida event bus | none |
| routes | per-user override + app_settings.route_engine | route-engine.ts | re-cálculo de rutas activas | persistencia layered | conflicto override↔global |
| icons | app_settings.icon_library | IconLibraryContext | re-render global de iconos | none | none |
| enrichment | app_settings.enrichment_card_config | createPopupContent (vía invalidateCardConfig) | invalida cache de popups | image_sources filtra `sources` activas | precedencia vs sources documentada |
| sources | data_sources | enrich-location, recover-missing-images | enrichments y recoveries cambian de mix | kill-switch global por enabled | requires_secret check |
| geography | geocoding_jobs (insert); canonical_admin_areas (canonicalize) | location FKs (region/zone/admin3/locality) | TODA location puede mover FK | global cascade en canonicalize | typed-token CANONICALIZE |
| image-recovery | recovery_jobs (insert) | image-recovery-job-tick edge | enriched_data.images cambia | cooldown por modo | none documentado |
| audit | none | n/a | n/a | n/a | n/a |
| design-system | drafts + publish | theme-provider → todo cliente | repinta tokens en vivo | runtime swap | publish irreversible sin History |
| internal-tools | varía por tool | varies | varies | varies | varía por tool |

---

## SECCIÓN 10 — Ownership / authority map

Dominios identificados (no son `AdminDomain` UX sino *ownership operativo*):

| ownership_domain | surfaces | authority_type | source_of_truth | conflicts/overlaps |
|---|---|---|---|---|
| Identity | users, permissions, AdminGate | RBAC global | auth.users + user_roles + role_permissions | bypass master (`PR-MASTER-BYPASS-1`) — read-only column |
| Runtime config | markers, routes, icons | global con override personal (routes) | app_settings.* | routes layered (global↔user) |
| Editorial | enrichment | global | app_settings.enrichment_card_config | image_sources overlaps con Providers |
| Providers | sources | global | data_sources | precedencia con Editorial (image_sources filter) |
| Geo | geography (incl. canonicalize) | global; canonicalize master-only | geocoding_jobs + canonical_admin_areas | image-recovery comparte universo de POIs |
| Image recovery | image-recovery | global | recovery_jobs | comparte filtros geográficos con Geo |
| Diagnostics | audit, design-system (inspect), CameraFitQaGate | read-only o local | preferences bus / token registry | design-system también muta (publish) → split candidato |
| Internal tooling | internal-tools | master-only on-demand | edges directos | none |

Fronteras claras tras PR-BACKOFFICE-CLEANUP-REALITY-1; ambigüedad residual: `enrichment.image_sources` filtra `sources` activas — documentado en cabecera de `DataSourcesPanel`.

---

## SECCIÓN 11 — Permission visibility audit

| surface | master | admin | moderator | editor |
|---|---|---|---|---|
| users | ejecuta | ejecuta | oculta | oculta |
| permissions | ejecuta | oculta | oculta | oculta |
| markers | ejecuta | ejecuta | oculta | oculta |
| routes | ejecuta | ejecuta | oculta | oculta |
| icons | ejecuta | ejecuta | oculta | oculta |
| enrichment | ejecuta | ejecuta | oculta | oculta |
| sources | ejecuta | ejecuta | oculta | oculta |
| geography | ejecuta (incl. canon) | ejecuta (sin canon) | oculta | oculta |
| image-recovery | ejecuta | ejecuta | oculta | oculta |
| audit | observa | observa (si cap) | observa (si cap) | oculta |
| design-system | ejecuta | oculta | oculta | oculta |
| internal-tools | ejecuta | oculta | oculta | oculta |
| AdminShell entry | abre | abre | oculta (salvo open_back_office) | oculta |
| AdminShellIndex | cards visibles | filtradas | n/a | n/a |
| CameraFitQaGate (?qa=1) | observa (si view_audit_log) | observa (si view_audit_log) | igual | n/a |

Carencia detectada (diagnóstico): no hay degradación visual intermedia ("ves pero no puedes ejecutar"). Surfaces son binarias (oculta vs ejecuta) por `groupAdminTabsByDomain` + `visibleTabs.filter(hasPermission)`.

---

## SECCIÓN 12 — Design system compliance

- **Componentes fuera de canon detectados**:
  - `RouteSettingsPanel.tsx` importa `@/components/ui/button` (legacy) en lugar de `@/design-system/primitives/button` (DS canon Phase 3).
  - `DesignSystemPanel.tsx` ya usa `@/design-system/primitives/*` correctamente — referencia.
  - Resto de panels mezclan `@/components/ui/*` y `@/shared/components/ui/*`. `inferred:codemod Phase 4` aún no aplicado universalmente al BackOffice.
- **Layouts custom**: ninguno tras eliminación de "second visual grammar" (gobernanza activa).
- **Headers**: 12/12 panels usan `<PanelEffectHeader />` (canon).
- **Footers**: heterogéneos (sticky en geography y design-system; inline en markers/routes/icons/enrichment/sources). No hay primitive "AdminPanelFooter".
- **Spacing**: `inferred` consistente (todos los panels respetan `flex-1 overflow-y-auto p-6 pb-8` heredado de `AdminRoutePage` / `AdminShellIndex`).
- **Cards arbitrarias**: ninguna detectada por código tras cleanup.
- **Primitives faltantes (gap)**:
  - `OperationDispatchZone` (compartido geography + image-recovery).
  - `AdminPanelFooter` (sticky save / dispatch canónico).
  - `AdminConfigSection` (header + descripción + body, replicable).
- **Primitives reutilizables reales presentes**: `PanelEffectHeader`, `EffectBadgeRow`, `OperationStatusCard`, `DestructiveConfirmDialog`, `AdminGate`, `AdminBrokenUsersList`.

---

## SECCIÓN 13 — Telemetry / auditability

| acción | actor | timestamp | scope | payload | resultado | rollback | failure |
|---|---|---|---|---|---|---|---|
| permissions toggle | server log (RLS) | server | global | cap×role | server return | manual revert | toast |
| purge-user | edge log | server | user | uid | RPC return | NO (irreversible) | toast + 409 last-master |
| canonicalize-admin-areas | edge log | server | global | scope | edge stream | NO | edge error |
| geocoding job insert | DB row | DB created_at | per scope | mode + ids | job rows | abort job | item_log |
| image-recovery job | DB row | DB | per scope | mode + filters | job rows | abort | item_log |
| markers/routes/icons/enrichment/sources save | DB update (app_settings/data_sources) | DB updated_at | global | full config | toast | reload+manual | toast |
| design-system publish | edit-mode-store | local | local→global | drafts | runtime swap | History tab | `unknown` |
| internal-tools run | edge log | server | varies | varies | toast | varies | toast |
| OperationStatusCard runs | localStorage | client | per opKey (per user/browser) | id + status + summary | local-only | clear localStorage | n/a |

Operaciones invisibles detectadas (diagnóstico):
- `OperationStatusCard` no se comparte entre operadores (decisión explícita: sin schema `operation_runs`). Riesgo bajo en fase tester-global, alto en multi-operador real → `NEEDS_DECISION` futuro.
- `markers/icons/routes` saves no dejan rastro (sólo `updated_at`) — ningún `audit_log` por config change. `inferred:aceptable` por reversibilidad.

---

## SECCIÓN 14 — Responsive / viewport audit

| surface | portátil (1280×800) | desktop (1920×1080) | altura baja | tabla ancha | scroll nested | sticky collision | fullscreen real |
|---|---|---|---|---|---|---|---|
| AdminShell | ok | ok | header+sidebar fijo | n/a | sidebar + main scrolls | ok | n/a |
| users | ok | ok | tabla densa | sí | sí | none | no necesario |
| permissions | apretado (matriz 4 cols) | ok | crítico | sí | sí | tooltip vs sticky leyenda `unknown` | recomendable |
| markers | ok | ok | ok | no | 1 | none | no |
| routes | ok | ok | ok | no | 1 | none | no |
| icons | ok | sobredimensionado | ok | no | 0 | none | no — DOWNGRADE |
| enrichment | ok | ok | denso | no | sí (slots) | none | recomendable |
| sources | ok | ok | denso | no | sí | none | no |
| geography | apretado | ok | crítico (3 zonas) | no | sí (tree + log) | sticky footer colisiona con OperationStatusCard `inferred` | recomendable |
| image-recovery | apretado | ok | crítico | no | sí (log) | similar geography | recomendable |
| audit | ok | ok | ok | sí (trace) | sí | none | no |
| design-system | apretado | ok | denso | tabla tokens | sí | EditModeBar sticky | recomendable |
| internal-tools | ok | sobredimensionado | ok | no | 0 | none | no |
| confirms | true modal | true modal | ok | n/a | n/a | n/a | n/a |
| overlays | `unknown` | `unknown` | n/a | n/a | n/a | n/a | n/a |

Diagnóstico: `geography` y `image-recovery` ganan con fullscreen explícito; `icons` y `internal-tools` ganan con downgrade.

---

## SECCIÓN 15 — Copy / terminology audit

Hallazgos verificables:
- **Mezcla técnica/humana**: "geocoding_jobs", "data_sources", "canonicalize" coexisten con "Mantenimiento geográfico" o "Fuentes de datos". Coherente para operador master, opaco si lo viera un admin no técnico.
- **Naming ambiguo**: "review" en geography colapsa antiguos `reconcile`/`overwrite` mediante un toggle interno — riesgo de malentendido (`forceOverwrite`).
- **Jargon engineering**: `DIAG`, `RBAC`, `kill-switch` aparecen en headers o tooltips. Aceptable por audiencia.
- **Duplicación semántica**: "Recuperar imágenes faltantes" (tab label) vs "Recuperar imágenes" (memoria de gobernanza) vs "missing/refresh/full" (modos). No contradictorio, redundante.
- **Lenguaje no humano**: `internal-tools` describe edges por nombre técnico (`create-test-users`). Intencional por contrato.
- **CTAs**: "Lanzar", "Parar", "Save", "Run", "Verificar conexiones", "Publish" — consistente verbo+sustantivo en español salvo "Save"/"Publish" (legacy).

---

## SECCIÓN 16 — Growth / lifecycle canon

Reglas inducidas a partir de la gobernanza vigente + esta auditoría:

1. **Crear panel nuevo** sólo si:
   - hay capability dedicada en `CAPABILITIES`,
   - hay `family`, `ownership_domain`, `runtime_semantics`, `interaction_type` declarados,
   - existe entry registrado en este dossier antes de diseñar layout.
2. **NO crear panel** si:
   - el caso de uso encaja en un `family` existente con una surface ya operativa (entonces extender o reusar `OperationDispatchZone`).
   - la acción puede vivir como `internal-tools` row.
3. **Dividir** cuando un panel mezcla `CONFIG` + `DIAG` o `INSPECTOR` + `mutating` (caso `design-system`).
4. **Split visual (mismo panel, dos zonas)** cuando la división lógica es 2 modos del mismo capability owner (caso `routes`).
5. **Degradar a `diagnostics`** cuando la audiencia es exclusivamente debug y la frecuencia < incident-only.
6. **Lifecycle**:
   - `proposed` → `live` (requiere dossier entry) → `KEEP` / `SPLIT` / `DOWNGRADE` / `MOVE` / `MERGE` / `REMOVE` / `DEBUG_ONLY` / `NEEDS_DECISION`.
7. **Sunset**: para `REMOVE` requiere eliminar la capability del catálogo y rutas; para `DEBUG_ONLY` mover bajo dominio `diagnostics` con badge DIAG.
8. **Tooling temporal**: declararse como `DEBUG_ONLY` con expiración explícita.
9. **Migraciones UI** entre canon viejo y nuevo: vivir simultáneas máximo 1 PR; el contract test `admin-route-tabs-contract` fuerza paridad.

Ver diagrama `docs/audits/diagrams/backoffice-lifecycle.mmd`.

---

## SECCIÓN 17 — Family system

7 familias canónicas. Cada surface principal pertenece a EXACTAMENTE una; chrome y confirms son transversales.

| family | miembros | estructura | layout | density | scroll | footer | header | action | responsive |
|---|---|---|---|---|---|---|---|---|---|
| CONFIG simple | icons, markers | hero único / radio | small modal (icons) o full simple | baja | none | inline Save | PanelEffectHeader | 1 primary | downsize a small-modal sin pérdida |
| CONFIG denso | permissions, sources, enrichment | tabla / lista / tree denso | full page XL | alta | nested | inline Save / per-row | PanelEffectHeader | N por row + 1 global | requiere ≥1024 |
| CONFIG + DIAG | routes | sección A (config) + sección B (diag colapsable) | full page | media | none | inline Save | PanelEffectHeader + subtitle DIAG | 1 primary + 1 diagnostic | ok ≥720 |
| OPERATION + OBSERVABILITY | geography, image-recovery | 3 zonas: scope → dispatch → observability | full page XL | media-alta | nested + sticky footer | sticky Lanzar/Parar + OperationStatusCard | PanelEffectHeader (badges deferred+batch) | 1 primary + 1 destructive + 1 abort | fullscreen recomendable |
| DATA / INSPECTOR | audit, design-system, users | tabla + filtros + (drawer/detalle `inferred`) | full page | media-alta | scroll vertical | inline Refresh / Publish | PanelEffectHeader | read-mostly | requiere ≥960 |
| CONFIRM destructivo | purge-user, permissions-toggle, geo-canonicalize | typed-token + resumen | true modal centrado | baja | none | OK destructivo + Cancel | título + warning | typed-token gate | min 480×280 |
| DEBUG registry | internal-tools | lista mono por tool | full page o lateral | alta | scroll | per-row Run | PanelEffectHeader + DIAG | per-tool primary | ok ≥720 |

---

## SECCIÓN 18 — Matriz final cruzada

Set permitido de `recommendation`: `KEEP | SPLIT | DOWNGRADE | MOVE | REMOVE | DEBUG_ONLY | MERGE | NEEDS_DECISION`. **Diagnóstico, no autorización.**

| surface | family | ownership | runtime | risk | frequency | complexity | recommendation | evidence_summary | reason |
|---|---|---|---|---|---|---|---|---|---|
| users | DATA/INSPECTOR | Identity | immediate + destructive | high (purge) | inferred:weekly | high | KEEP | AdminPanel inline + DestructiveConfirmDialog + last-master server guard | Surface canon, ya con confirms typed-token. |
| permissions | CONFIG denso | Identity | immediate + global | high (recompute) | inferred:incident | high | KEEP | PermissionsMatrixPanel + master-bypass + EffectBadgeRow | Vista canónica RBAC; columna master read-only. |
| markers | CONFIG simple | Runtime | immediate | low | inferred:weekly | medium | KEEP | MarkerSizeManager + updateMarkerSizeConfig | Encajado en familia. |
| routes | CONFIG + DIAG | Runtime | immediate config + read-only diag | medium | inferred:incident | medium | KEEP | Sección A/B canon (PR-BACKOFFICE-CLEANUP-REALITY-1) | Split visual ya aplicado. |
| icons | CONFIG simple | Runtime | immediate | low | inferred:one-shot | low | DOWNGRADE | 1 RadioGroup ocupa full page | Mejor ajuste familia "small modal". |
| enrichment | CONFIG denso | Editorial | immediate | medium (cascada popups) | inferred:weekly | high | NEEDS_DECISION | Mezcla estructura ficha + criterios IA + image_sources filter (cabecera DataSourcesPanel) | Ownership editorial vs providers requiere decisión antes de SPLIT. |
| sources | CONFIG denso | Providers | immediate | high (enrich pipeline) | inferred:weekly | medium | SPLIT (visual) | 4 grupos kind + per-provider status; mezcla config + status | Familia denso pero un sub-bloque es OBSERVABILITY. |
| geography | OPERATION+OBS | Geo | deferred + global | high (canonicalize) | inferred:daily/incident | high | KEEP | 951 líneas, 3 zonas + OperationStatusCard + DestructiveConfirmDialog canon | Familia canónica de OPERATION; primitive shared con image-recovery candidata. |
| image-recovery | OPERATION+OBS | Image recovery | deferred | medium | inferred:daily/incident | high | KEEP | 981 líneas, mismo patrón obs + useOperationHistory | Alinear primitives con geography. |
| audit | DATA/INSPECTOR | Diagnostics | read-only | none | inferred:incident | medium | KEEP | preferences bus snapshot + trace | Inspector puro. |
| design-system | DATA/INSPECTOR (+ mutating) | Diagnostics | read-only + immediate (publish) | medium | inferred:incident | high | SPLIT (por modo) | Inspector + EditModeBar publica drafts | Familia mezclada — split por modo (inspect vs edit) descrito en gobernanza. |
| internal-tools | DEBUG registry | Internal tooling | immediate one-shot | varies por tool | inferred:incident | low | KEEP (DEBUG_ONLY) | Registry inline + EffectBadge | Familia canónica; mantener bajo dominio diagnostics. |
| AdminShell | chrome | n/a | n/a | n/a | always | low | KEEP | groupAdminTabsByDomain + DiagBadge | Estructura canon. |
| AdminShellIndex | chrome | n/a | n/a | none | inferred:rare | low | NEEDS_DECISION | Cards redundantes con sidebar | Mantener o degradar a quick-actions, decisión UX. |
| AdminGate | chrome | Identity | n/a | n/a | always | low | KEEP | useCapability + mirror cliente has_permission | Único gate UX canónico. |
| AdminBrokenUsersList | DATA embebido | Geo/Identity | read-only | low | inferred:daily | medium | KEEP | Reusado en users + geography | Compartido — primitive embed correcta. |
| PanelEffectHeader + EffectBadgeRow | chrome | n/a | n/a | n/a | always | low | KEEP | Montado en 12/12 tabs | Canon de header. |
| OperationStatusCard | OBSERVABILITY chrome | n/a | n/a | low (local-only) | inferred:daily | low | KEEP | useOperationHistory (localStorage, MAX 10) | Decisión "sin operation_runs" reconfirmada; revisar si multi-operador real. |
| EditModeBar | chrome (DS) | Diagnostics | immediate | medium (publish) | inferred:incident | medium | KEEP | edit-mode-store | Coupling a design-system es intencional. |
| CameraFitQaGate | DEBUG overlay | Diagnostics | read-only | none | inferred:rare | low | DEBUG_ONLY | ?qa=1 + view_audit_log | Overlay debug gated correctamente. |
| purge-user confirm | CONFIRM destructivo | Identity | immediate | critical | inferred:rare | low | KEEP | DestructiveConfirmDialog typed-token + 409 last-master | Canon de CONFIRM. |
| permissions toggle confirm | CONFIRM destructivo (global) | Identity | immediate global | critical | inferred:rare | low | KEEP | DestructiveConfirmDialog 'MODIFICAR' | Canon de CONFIRM. |
| geo-canonicalize confirm | CONFIRM destructivo (global) | Geo | deferred global | critical | inferred:rare | low | KEEP | DestructiveConfirmDialog 'CANONICALIZE' | Canon de CONFIRM. |

---

## SECCIÓN 19 — Restricciones (eco literal del brief)

NO:
- rediseño visual final
- nuevos componentes
- cambios runtime
- cambios backend
- RLS
- schema
- capabilities
- migraciones
- refactors visuales grandes

Esto es discovery definitivo previo al reboot UX del BackOffice. Las recomendaciones son **diagnóstico** y NO autorizan implementación.

---

## Diagramas (ubicación canónica)

- `docs/audits/diagrams/backoffice-family-system.mmd`
- `docs/audits/diagrams/backoffice-ownership-map.mmd`
- `docs/audits/diagrams/backoffice-dependency-graph.mmd`
- `docs/audits/diagrams/backoffice-navigation-graph.mmd`
- `docs/audits/diagrams/backoffice-lifecycle.mmd`
- `docs/audits/diagrams/backoffice-causality-cascades.mmd`

## Memoria de gobernanza (entregable secundario)

`mem://governance/backoffice-discovery-dossier` — puntero al doc y regla:
> "Toda surface nueva del BackOffice debe declarar `family`, `ownership_domain`, `runtime_semantics` e `interaction_type` y registrar evidencia ANTES de diseñar layout. Las recomendaciones de este dossier son diagnóstico y no autorizan cambios."
