## PR-RBAC-CAPABILITY-HYGIENE-1 — Auditoría RBAC (read-only)

Sin cambios de código. Catálogo trazado contra uso real: cliente (`useCapability`/`hasPermission`), edge (`requireCapability`), RLS (`has_permission`) y mapping `role_permissions` en DB.

### Hallazgos sistémicos

1. **Cero RLS usa `has_permission`** (43 policies usan `has_role`). Toda capability que sólo "vive" en `role_permissions` sin gate cliente ni gate edge es **paper-right**: no gobierna nada.
2. **Sólo 3 titulares reales**: master=1, editor=2. Roles `admin`, `moderator`, `supervisor` tienen 0 titulares → matriz capability×role es mayormente teórica.
3. **Supervisor** = 1 capability (`view_all_locations`) sin gate real → **zombie confirmado**.
4. **`role_permissions` y SoT TS/Deno están desincronizados**: `manage_permissions`, `manage_marker_config`, `manage_route_engine`, `manage_icon_library`, `manage_enrichment_config`, `view_audit_log`, `assign_master`, `run_internal_tooling`, `run_geo_canonicalize` sólo aparecen en master — no admin. Coherente con master-only canon, pero `admin` queda sin gobernanza de varios paneles que técnicamente debería ver.

### Inventario completo (28 capabilities)

| capability | roles_db | client gate | edge gate | RLS | runtime real | riesgo | dominio | estado | recomendación |
|---|---|---|---|---|---|---|---|---|---|
| `manage_users` | master, admin | AdminPanel users tab | — | 0 | abre tab modal users | high | governance | **active** | KEEP |
| `manage_permissions` | master | AdminPanel + PermissionsMatrix | — | 0 | edita matriz RBAC | critical | governance | **active** | KEEP, MASTER_ONLY |
| `assign_master` | master | AdminPanel | — | 0 | promoción a master | critical | destructive | **active** | KEEP, MASTER_ONLY |
| `open_back_office` | master, admin | App.tsx, AdminShell, AdminPanel, UserMenu | — | 0 | acceso superficie admin | low | governance | **active** | KEEP |
| `purge_user` | master, admin | AdminPanel | purge-user edge | 0 | borrado total user | critical | destructive | **active** | KEEP |
| `run_global_enrichment` | master | LocationMap, UserMenu | — | 0 | dispara enrichment masivo | high | recovery | **active** | KEEP |
| `run_image_recovery` | master, admin | admin-tabs (image-recovery) | recover-missing-images edge | 0 | batch recovery | medium | recovery | **active** | KEEP |
| `moderate_content` | master, admin, moderator | Index.tsx, LocationPhotoMenu | — | 0 | aprobar fotos | medium | editorial | **active** | KEEP |
| `delete_any_location` | master | use-popup-actions | — | 0 | borrar POI ajeno | high | destructive | **active** | KEEP |
| `manage_marker_config` | master | admin-tabs (markers) | — | 0 | edita app_settings marker | low | runtime_config | **active** | KEEP |
| `manage_route_engine` | master | admin-tabs (routes) | — | 0 | edita profile defaults | low | runtime_config | **active** | KEEP (ojo drift) |
| `manage_icon_library` | master | admin-tabs (icons) | — | 0 | edita app_settings iconos | low | runtime_config | **active** | KEEP |
| `manage_enrichment_config` | master | admin-tabs (enrichment) | — | 0 | edita app_settings cards | medium | runtime_config | **active** | KEEP |
| `manage_data_sources` | master, admin | admin-tabs (sources) | — | 0 | edita providers | medium | provider_orchestration | **active** | KEEP |
| `view_audit_log` | master | admin-tabs (audit) + CameraFitQaGate | — | 0 | abre AuditPanel | low | audit | **active** | KEEP |
| `manage_design_system` | master | admin-tabs (design-system) | — | 0 | inspector read-only | medium | audit | **drift semántico** | **RENAME → `view_design_system_inspector`** |
| `view_geo_maintenance` | master, admin | admin-tabs (geography) | — | 0 | abre panel geo | low | geo_ops | **active** | KEEP |
| `run_geo_canonicalize` | master | GeographyBackfillPanel | canonicalize-admin-areas edge | 0 | one-shot canonicalize | critical | destructive | **active** | KEEP, MASTER_ONLY |
| `run_internal_tooling` | master | InternalToolsPanel | create-test-users edge | 0 | tooling interno | high | internal_tooling | **active** | KEEP, INTERNAL_ONLY |
| `manage_geo_maintenance` | master, admin | — | comentario legacy en canonicalize edge | 0 | alias deprecated | low | geo_ops | **legacy alias** | **DEPRECATE** (ya marcado, planificar REMOVE post-grace) |
| `manage_criteria` | master | UserMenu "Criterios de actualización" | — | 0 | abre dialog criterios fuera del BackOffice canon | medium | editorial | **drift ownership** | **MOVE a `/admin/criteria` + RENAME `manage_editorial_criteria`** (overlap con `manage_enrichment_config`) |
| `run_geo_backfill` | master, admin | — | — | 0 | nada | high | geo_ops | **zombie (paper-right)** | **KEEP pero cablear** (split ya hecho en SoT — falta wiring) o REMOVE si no se reactiva |
| `view_all_locations` | master, admin, moderator, editor, supervisor | — | — | 0 | nada | medium | editorial | **zombie** | **REMOVE** o cablear a RLS (hoy bypass = master role check) |
| `edit_all_locations` | master, admin, editor | — | — | 0 | nada | high | editorial | **zombie** | **REMOVE** o cablear RLS |
| `manage_documents` | — | — | — | 0 | nada (ni en role_permissions) | medium | editorial | **dead** | **REMOVE** |
| `view_analytics` | master, admin, moderator | — | — | 0 | nada | low | audit | **zombie** | **REMOVE** o cablear panel real |
| `upload_files` | master, admin, editor | — | — | 0 | nada (import lo hace cualquier user) | low | editorial | **zombie** | **REMOVE** |
| `add_locations` | master, admin, moderator, editor | — | — | 0 | nada (alta de POIs no gateada por capability) | low | editorial | **zombie** | **REMOVE** |

### Overlaps detectados

- **`manage_criteria` ↔ `manage_enrichment_config`**: ambos tocan políticas editoriales/cards. `manage_criteria` vive fuera del BackOffice canon (UserMenu). Candidato a fusión o split explícito (criteria=qué se considera enriched; enrichment_config=cómo se renderiza).
- **`manage_geo_maintenance` ↔ {`view_geo_maintenance`, `run_geo_backfill`, `run_geo_canonicalize`}**: el split ya existe; el alias legacy debe morir.
- **`view_all_locations` ↔ master bypass `has_role`**: hoy todo el bypass real lo hace `has_role(uid,'master')` en RLS. La capability es decorativa.

### Naming drift

- `manage_design_system` → es **inspector read-only**. Verbo `manage_` promete editor. Rename: `view_design_system_inspector` (o `inspect_design_system`).
- `manage_criteria` → ambiguo (¿criterios de qué?). Rename: `manage_editorial_criteria`.
- `manage_geo_maintenance` → DEPRECATED, mantener como alias durante grace, luego REMOVE.
- Verbos canónicos sugeridos: `view_*` (lectura), `manage_*` (CRUD config), `run_*` (job/edge), `assign_*` (governance escalation), `inspect_*` (read-only forense).

### Taxonomía canónica propuesta

```text
governance         → manage_users, manage_permissions, open_back_office, assign_master
editorial          → moderate_content, manage_editorial_criteria
                     (REMOVE: view_all_locations, edit_all_locations,
                              manage_documents, upload_files, add_locations)
geo_ops            → view_geo_maintenance, run_geo_backfill
runtime_config     → manage_marker_config, manage_route_engine,
                     manage_icon_library, manage_enrichment_config
provider_orch.     → manage_data_sources
recovery           → run_image_recovery, run_global_enrichment
audit              → view_audit_log, inspect_design_system
                     (REMOVE: view_analytics si no se cablea)
internal_tooling   → run_internal_tooling
destructive        → delete_any_location, purge_user, run_geo_canonicalize
legacy/deprecated  → manage_geo_maintenance
```

### Resumen ejecutivo

- **28 capabilities** declaradas, **~13 con runtime real**, **9 zombie/dead/paper-right**, **2 con drift semántico**, **1 alias legacy**.
- **RLS no usa capabilities** — toda autorización de datos hoy se apoya en `has_role` (master bypass) y owner-scoping. La promesa "capability gobierna acceso a datos" es **falsa** para todo `*_all_locations`, `manage_documents`, `upload_files`, `add_locations`.
- **Matriz capability×role es ornamental** para roles sin titulares (admin/moderator/supervisor).
- **Supervisor** es un rol fantasma con una sola capability paper-right.

### Recomendaciones priorizadas (para PRs siguientes, no en este)

1. **PR-HYGIENE-2 (limpieza)**: REMOVE `manage_documents`, `upload_files`, `add_locations`, `view_analytics` del enum DB + SoT (migración destructiva). Decidir antes si se cablean.
2. **PR-HYGIENE-3 (zombies con valor potencial)**: decidir entre cablear `view_all_locations` / `edit_all_locations` a RLS real (sustituir bypass `has_role` por `has_permission`) o REMOVE.
3. **PR-HYGIENE-4 (drift semántico)**: RENAME `manage_design_system → inspect_design_system`; mover `manage_criteria` al BackOffice canon como `manage_editorial_criteria` (o MERGE con `manage_enrichment_config`).
4. **PR-HYGIENE-5 (legacy)**: REMOVE `manage_geo_maintenance` tras confirmar 0 consumidores; sustituir el comentario en `canonicalize-admin-areas` por referencia al split nuevo.
5. **PR-HYGIENE-6 (rol supervisor)**: decidir KEEP+propósito real o DROP del enum `app_role`.
6. **PR-HYGIENE-7 (run_geo_backfill)**: cablear botón explícito o REMOVE.

### Out of scope (este PR)

- No tocar enum DB, SoT TS/Deno, RLS, edges ni UI.
- Entregable = este informe. Cada recomendación se materializa como PR independiente.