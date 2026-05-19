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
