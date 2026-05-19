## PR-HYGIENE-3 — Ratificación del REMOVE de `view_all_locations` y `edit_all_locations`

PR-HYGIENE-2 ya purgó ambas capabilities del enum DB (`app_permission`), del SoT cliente (`src/domains/identity/capabilities.ts`), del espejo Deno (`supabase/functions/_shared/capabilities.ts`), de la metadata RBAC (`src/components/admin/permissions/capability-metadata.ts`) y de `role_permissions`. Existe contract test (`src/test/capabilities-hygiene-2-contract.test.ts`) que impide su resurrección.

Este PR no toca código ni DB. Su entregable único es **dejar formalizada la decisión** en `.lovable/plan.md` para que cualquier futura tentación de reintroducirlas tenga que pasar primero por reabrir este análisis.

### Análisis cerrado (a documentar en plan.md)

**Semántica esperada (modelo teórico)**
- `view_all_locations`: bypass del owner-scoping de SELECT sobre `public.locations` — permitiría a un rol no-master ver POIs `private`/`followers` ajenos sin estar siguiendo al owner.
- `edit_all_locations`: bypass del owner-scoping de UPDATE sobre `public.locations` — permitiría editar metadata (descripción, tags, fotos, enriched_data, geo FKs) de POIs ajenos.

**Auditoría de uso real (estado pre-PR-HYGIENE-2)**
- Client gates (`useCapability`, `hasPermission`): 0 referencias en `src/`.
- Edge functions (`requireCapability`): 0 referencias en `supabase/functions/`.
- RLS policies (`pg_policies`): 0 — `locations` usa `can_view_location()` + `owner_user_id = auth.uid()` + bypass por `has_role('admin'|'master')`.
- SQL functions / RPCs / loaders / map rendering / popup actions / selección / export / batch ops: ninguno consulta estas capabilities.
- Conclusión: paper-rights puras. Cablearlas exigiría diseñar desde cero qué tablas y operaciones cubren.

**Mapa RLS (por qué REMOVE no abre huecos)**
- `locations` SELECT: ya hay bypass master (visibilidad por `can_view_location` + role-check). Admin sigue editando vía `Admins can update any location` (UPDATE policy con `has_role admin|master`). El paper-right no añadía nada que no estuviera ya gobernado por role bypass.
- Ningún flow de moderación, popup action, destructive action ni export dependía de estas capabilities.

**Riesgos por opción**
- KEEP + cablear: alto. Exige decidir scope (¿solo `locations`? ¿también `documents`/`location_photos`/`location_notes`?), reescribir 4–6 policies por tabla, introducir un segundo eje de autorización paralelo al `has_role` master bypass y migrar al canon `has_permission` en RLS — trabajo grande que hoy no resuelve ningún problema de producto real.
- No cablear (statu quo previo): mantiene drift permanente entre matriz RBAC y semántica real, contradice el RBAC canon ("toda capability gobierna runtime real").
- REMOVE (elegido): cero impacto runtime (no había consumidores), elimina dos paper-rights del catálogo, libera la matriz RBAC de filas engañosas. Reversible vía nueva migración si el producto algún día necesita un rol "auditor cross-user".

**Recomendación cerrada: Opción B — REMOVE (ya aplicada en PR-HYGIENE-2)**

Si en el futuro se necesita un rol con acceso cross-user real (auditor de contenido, soporte avanzado), debe diseñarse como una capability nueva con scope explícito (ej. `view_other_user_locations_for_moderation`) cableada SIMULTÁNEAMENTE a RLS + UI + edge desde el primer commit. Reintroducir los nombres genéricos `view_all_locations` / `edit_all_locations` queda explícitamente prohibido.

### Cambios a aplicar (este PR)

1. Añadir sección **PR-HYGIENE-3 — Ratificación** a `.lovable/plan.md` con el resumen anterior (semántica, auditoría, mapa RLS, riesgos, decisión cerrada y guardarraíl para el futuro).

Sin cambios de código, migración, tests ni UI. El contract test de PR-HYGIENE-2 ya bloquea la resurrección.

---

## PR-HYGIENE-3 — Ratificación del REMOVE de `view_all_locations` y `edit_all_locations` (NO-OP)

PR-HYGIENE-2 ya purgó ambas capabilities. Este PR no toca código ni DB — solo formaliza el análisis para bloquear reintroducción accidental.

### Semántica esperada (modelo teórico)

- `view_all_locations`: bypass del owner-scoping de SELECT sobre `public.locations` — permitiría a un rol no-master ver POIs `private`/`followers` ajenos sin estar siguiendo al owner.
- `edit_all_locations`: bypass del owner-scoping de UPDATE sobre `public.locations` — permitiría editar metadata (descripción, tags, fotos, enriched_data, geo FKs) de POIs ajenos.

### Auditoría de uso real (estado pre-PR-HYGIENE-2)

- Client gates (`useCapability`, `hasPermission`): 0 referencias en `src/`.
- Edge functions (`requireCapability`): 0 referencias en `supabase/functions/`.
- RLS policies (`pg_policies`): 0 — `locations` usa `can_view_location()` + `owner_user_id = auth.uid()` + bypass por `has_role('admin'|'master')`.
- SQL functions / RPCs / loaders / map rendering / popup actions / selección / export / batch ops: ninguno consulta estas capabilities.
- Conclusión: paper-rights puras. Cablearlas exigiría diseñar desde cero qué tablas y operaciones cubren.

### Mapa RLS (por qué REMOVE no abre huecos)

- `locations` SELECT: ya hay bypass master (visibilidad por `can_view_location` + role-check). Admin sigue editando vía `Admins can update any location` (UPDATE policy con `has_role admin|master`). El paper-right no añadía nada que no estuviera ya gobernado por role bypass.
- Ningún flow de moderación, popup action, destructive action ni export dependía de estas capabilities.

### Riesgos por opción

- **KEEP + cablear**: alto. Exige decidir scope (¿solo `locations`? ¿también `documents`/`location_photos`/`location_notes`?), reescribir 4–6 policies por tabla, introducir un segundo eje de autorización paralelo al `has_role` master bypass y migrar al canon `has_permission` en RLS — trabajo grande que hoy no resuelve ningún problema de producto real.
- **No cablear (statu quo previo)**: mantiene drift permanente entre matriz RBAC y semántica real, contradice el RBAC canon ("toda capability gobierna runtime real").
- **REMOVE (elegido)**: cero impacto runtime (no había consumidores), elimina dos paper-rights del catálogo, libera la matriz RBAC de filas engañosas. Reversible vía nueva migración si el producto algún día necesita un rol "auditor cross-user".

### Decisión cerrada: Opción B — REMOVE (ya aplicada en PR-HYGIENE-2)

Si en el futuro se necesita un rol con acceso cross-user real (auditor de contenido, soporte avanzado), debe diseñarse como capability nueva con scope explícito (ej. `view_other_user_locations_for_moderation`) cableada SIMULTÁNEAMENTE a RLS + UI + edge desde el primer commit. **Reintroducir los nombres genéricos `view_all_locations` / `edit_all_locations` queda explícitamente prohibido**; el contract test `capabilities-hygiene-2-contract.test.ts` ya bloquea esa resurrección.

---

## PR-HYGIENE-4 — Higiene semántica del catálogo RBAC (renames)

Alinear nombres de capabilities con su runtime real y ownership operativo. Sin cambios de RLS, gating, scope efectivo ni runtime — solo naming.

### Renames aplicados

1. `manage_design_system` → **`inspect_design_system`**
   - El panel es Design System **Inspector**: read-only / audit / navegación. No edita tokens globales persistentes, no gobierna theming runtime, no persiste cambios estructurales. El nombre legacy introducía falsa semántica de escritura.
   - Metadata RBAC actualizada: `risk: low`, `runtime: none`, `masterOnly: true`, `domain: 'design-system'`.

2. `manage_criteria` → **`manage_editorial_criteria`**
   - "criteria" era ambiguo (no expresaba dominio ni ownership). Hoy gobierna reglas editoriales IA, freshness/update policy y enrichment thresholds.
   - Metadata RBAC actualizada: descripción reescrita, `domain: 'content'`, `runtime: future-only` (sin cambio).

### Migración DB

`supabase/migrations/20260519_*_pr-hygiene-4-rename-capabilities.sql`:
- `ALTER TYPE public.app_permission RENAME VALUE 'manage_design_system' TO 'inspect_design_system'`
- `ALTER TYPE public.app_permission RENAME VALUE 'manage_criteria' TO 'manage_editorial_criteria'`
- Envuelto en `DO $$ ... IF EXISTS ... END $$` → idempotente.
- `RENAME VALUE` preserva el OID interno del enum → **todas las filas de `role_permissions` migran automáticamente** sin pérdida de asignaciones. Sin recreación de `has_permission` / `get_user_permissions` (firma del enum invariante).

### Cambios cliente / Deno / metadata

- `src/domains/identity/capabilities.ts`: SoT TS actualizado (lista + `CAPABILITY_LABELS`).
- `supabase/functions/_shared/capabilities.ts`: espejo Deno actualizado en paralelo (contract test `capabilities-sot-parity` lo verifica).
- `src/components/admin/permissions/capability-metadata.ts`: entradas renombradas; eliminado el hack de cast `as RuntimeImpact extends string ?...` y el override post-objeto que normalizaba `manage_design_system` — ahora la entrada canónica se define una sola vez con el runtime correcto.
- `src/components/UserMenu.tsx`: `hasPermission('manage_editorial_criteria')`.
- `src/components/admin/admin-tabs.tsx`: tab "Design System Inspector" usa `capability: 'inspect_design_system'`.
- `VANDITS-v2.0-DOCUMENTATION.md`: línea del catálogo actualizada.

### Contract test reforzado

`src/test/capabilities-hygiene-2-contract.test.ts` añade bloque PR-HYGIENE-4 que prohíbe la resurrección de los nombres legacy (`manage_design_system`, `manage_criteria`) en SoT cliente, Deno o metadata, y exige presencia de los nombres canon (`inspect_design_system`, `manage_editorial_criteria`).

### Rollback

Revertir el rename es simétrico: dos `ALTER TYPE ... RENAME VALUE` en sentido inverso + revert de los archivos cliente/Deno/metadata. Asignaciones de roles intactas en cualquier dirección.

### Auditoría de naming residual (sin acción — solo reporte)

Tras los dos renames, el catálogo restante se considera **canon-coherente**:

- `manage_users`, `manage_permissions`, `manage_marker_config`, `manage_route_engine`, `manage_icon_library`, `manage_enrichment_config`, `manage_data_sources` → ownership claro (configuración runtime sobre un dominio específico).
- `delete_any_location`, `purge_user`, `assign_master` → verbo destructivo + scope explícito; nombres ya alineados con poder real.
- `run_global_enrichment`, `run_image_recovery`, `run_internal_tooling`, `run_geo_backfill`, `run_geo_canonicalize` → prefijo `run_` correcto para jobs/batch deferred.
- `view_audit_log`, `view_geo_maintenance` → prefijo `view_` correcto para read-only.
- `moderate_content`, `open_back_office` → semántica directa.
- `manage_geo_maintenance` → ya marcado como **alias legacy deprecated** en metadata; no requiere rename (su deprecación está pendiente de purga futura, no de renombrado).

**No se introducen más renames en este PR.** El canon RBAC está ahora alineado con runtime real, ownership real y nivel de poder real.

### Verificación

- DB enum: `inspect_design_system`, `manage_editorial_criteria` presentes; los legacy no aparecen en `pg_enum`.
- `role_permissions`: asignaciones preservadas (mismo OID interno).
- SoT TS/Deno: byte-identical (verificado por `capabilities-sot-parity.test.ts`).
- Hygiene contract: PR-HYGIENE-2 + PR-HYGIENE-4 verde.
- Matriz RBAC UI: muestra los nuevos nombres con labels actualizados; gates intactos (`useCapability('inspect_design_system')` para el panel Design System, `useCapability('manage_editorial_criteria')` para Criterios).
