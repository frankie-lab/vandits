# PR-BACKOFFICE-GOVERNANCE — Implementación priorizada

Cierre del backlog aprobado. 5 fases atómicas, ordenadas por dependencia (cada una compila y despliega sola). Fuera de scope: lazy extraction, versionado/rollback, refactors cosméticos.

---

## Fase 1 — SoT único de capabilities (foundation)

**Por qué primero**: los siguientes splits añaden capabilities nuevas; sin SoT único divergirán entre `use-permissions.ts`, `require-capability.ts`, `AdminPanel.tsx`.

### Cambios

- **Nuevo**: `src/domains/identity/capabilities.ts` exporta `CAPABILITIES` (array literal `as const`), `CAPABILITY_LABELS`, tipo `Capability` derivado.
- **Nuevo**: `supabase/functions/_shared/capabilities.ts` espejo del catálogo (Deno).
- **Refactor**: `use-permissions.ts` re-exporta desde el SoT; elimina `AppPermission` duplicado.
- **Refactor**: `AdminPanel.tsx` consume `CAPABILITIES` + `CAPABILITY_LABELS`; elimina `ALL_PERMISSIONS` y `PERMISSION_LABELS` locales.
- **Refactor**: `require-capability.ts` consume el SoT Deno; elimina unión literal local.
- Test: contract test que verifica que cliente y Deno exportan el mismo set (snapshot).

### Migración DB
Ninguna en esta fase. El enum `public.app_permission` ya es SoT real; este PR sólo elimina las copias TS divergentes.

### Riesgo
Bajo. Pure refactor sin cambio de comportamiento.

---

## Fase 2 — Split de capabilities críticas

### Nuevas capabilities (enum DB + SoT TS)

| Nueva | Reemplaza/separa | Asignación inicial |
|---|---|---|
| `assign_master` | sub-acción hoy implícita en `manage_users` | master únicamente |
| `run_internal_tooling` | hoy mezclada en `manage_permissions` | master únicamente |
| `view_geo_maintenance` | parte de `manage_geo_maintenance` | admin + master |
| `run_geo_backfill` | parte de `manage_geo_maintenance` | admin + master |
| `run_geo_canonicalize` | parte de `manage_geo_maintenance` (destructivo) | master únicamente |

`manage_geo_maintenance` queda como **alias compuesto** (deprecated) → se mantiene para no romper edges aún, pero el panel se gatea por las 3 nuevas.

### Migración DB (un solo PR)

```sql
ALTER TYPE public.app_permission ADD VALUE 'assign_master';
ALTER TYPE public.app_permission ADD VALUE 'run_internal_tooling';
ALTER TYPE public.app_permission ADD VALUE 'view_geo_maintenance';
ALTER TYPE public.app_permission ADD VALUE 'run_geo_backfill';
ALTER TYPE public.app_permission ADD VALUE 'run_geo_canonicalize';

-- Seed asignaciones iniciales
INSERT INTO public.role_permissions (role, permission) VALUES
  ('master', 'assign_master'),
  ('master', 'run_internal_tooling'),
  ('master', 'view_geo_maintenance'),
  ('admin',  'view_geo_maintenance'),
  ('master', 'run_geo_backfill'),
  ('admin',  'run_geo_backfill'),
  ('master', 'run_geo_canonicalize')
ON CONFLICT DO NOTHING;
```

### Cambios cliente

- **`AdminPanel` (users)**: botón "Asignar role master" gateado por `useCapability('assign_master')`; checkbox `master` deshabilitado si no allowed.
- **`AdminPanel` (users)**: botón "Purgar usuario" gateado adicionalmente por `useCapability('purge_user')` (defensa en profundidad cliente; el edge ya lo exige).
- **`GeographyBackfillPanel`**:
  - Apertura del panel: `view_geo_maintenance`.
  - Botones de backfill (`backfill-admin-fks`, `backfill-catalog-geo-once`): `run_geo_backfill`.
  - Botón de canonicalize: `run_geo_canonicalize` (master-only).
- **`admin-tabs.tsx`**: tab `geography` cambia su `capability` a `view_geo_maintenance`.

### Cambios edges

- `canonicalize-admin-areas`: `requireCapability(req, 'run_geo_canonicalize')`.
- `backfill-admin-fks`, `backfill-catalog-geo-once`: `requireCapability(req, 'run_geo_backfill')`.
- `migrate-v2`, `create-test-users`: `requireCapability(req, 'run_internal_tooling')`.
- `purge-user`: además del `purge_user` ya exigido, añadir guard "no degradar al último master" (ver Fase 3).

### Guard "último master" (server-side)

```sql
-- helper SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.count_masters() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.user_roles WHERE role = 'master';
$$;
```

`purge-user` y `manage_users` (revoke role) consultan `count_masters()` antes de remover el último master → 409 explícito.

### Riesgo
Medio. Mitigado: caps nuevas son aditivas, `manage_geo_maintenance` permanece como puente; tests de capability contract; un master existente sigue funcionando sin tocar.

---

## Fase 3 — Confirmaciones fuertes destructivas

Patrón único reutilizable: `<DestructiveConfirmDialog>` con typed-token ("escribe CANONICALIZE para continuar") + preview obligatorio cuando aplica.

### Acciones a confirmar (con typed-token)

| Acción | Panel | Token | Preview previo |
|---|---|---|---|
| Mutar `role_permissions` (toggle de capability) | Permisos | "MODIFICAR" | snapshot del diff |
| Asignar/revocar `master` | Usuarios | "MASTER" | n/a |
| Purgar usuario | Usuarios | "PURGAR <username>" | counts (ya existe `mode:preview`) — sólo añadir typed-token al execute |
| Canonicalize admin areas | Geo | "CANONICALIZE" | conteo de filas afectadas (dry-run nuevo, ver abajo) |
| Toggle `data_sources.enabled` | Fuentes | confirm simple (no destructivo permanente) | n/a |

### Dry-run canonicalize

`canonicalize-admin-areas` añade `mode: 'preview' | 'execute'` (paridad con `purge-user`); preview devuelve `{ affected: number, sampleNames: string[] }` sin escribir.

### Riesgo
Bajo. Sólo añade fricción + endpoints opcionales.

---

## Fase 4 — Master-only restrictions

- `manage_permissions` ya es master-only por canon → verificar (no asignar a `admin` aunque exista capability). Test de seed.
- `manage_design_system` → **revocar de roles ≠ master**:
  ```sql
  DELETE FROM public.role_permissions
   WHERE permission = 'manage_design_system' AND role <> 'master';
  INSERT INTO public.role_permissions(role, permission)
   VALUES ('master','manage_design_system') ON CONFLICT DO NOTHING;
  ```
- `run_internal_tooling`, `assign_master`, `run_geo_canonicalize` → seed master-only (ya cubierto en Fase 2).

### Riesgo
Bajo. Restricción aditiva; admins pierden Design System, lo cual coincide con el dictamen.

---

## Fase 5 — Hygiene / tooling residual

### Acciones

- **`migrate-v2`**: comprobar uso real → si V2 ya activa y `migrate-v2` no se invoca desde UI, **eliminar** la función edge y su entrada en `supabase/config.toml` si existiera. Documentar en `docs/audits/backlog.md`.
- **`backfill-catalog-geo-once`**: validar idempotencia y last-run; si one-shot histórico ya completado, **eliminar**.
- **`create-test-users`**: mantener, pero re-gatear a `run_internal_tooling` (ya en Fase 2). Documentar uso (sandbox fixture).
- **`CameraFitQaPanel`** (`src/components/debug/`): gate detrás de query `?qa=1` AND `useCapability('view_audit_log')` (mínimo) — hoy es accesible sin gate.

### Riesgo
Bajo. Eliminación de edges no usadas; el panel QA queda visible sólo para personal autorizado.

---

## Orden de ejecución y dependencias

```text
Fase 1 (SoT)
   └─ Fase 2 (split caps + migración enum + edges)
         ├─ Fase 3 (confirmaciones)
         ├─ Fase 4 (master-only)
         └─ Fase 5 (hygiene)
```

Fases 3/4/5 son paralelas entre sí tras Fase 2.

---

## Verificación por fase

- **F1**: typecheck verde; snapshot test caps cliente == Deno; AdminPanel renderiza idéntico.
- **F2**: caps aparecen en panel Permisos; geography panel reacciona a los 3 gates nuevos; edges devuelven 403 si falta cap específica; bypass master sigue funcionando.
- **F3**: ningún destructivo se ejecuta sin typed-token (test E2E sobre Permisos + Purge).
- **F4**: usuario `admin` no ve Design System; pierde `manage_permissions` y `manage_design_system`.
- **F5**: ruta a `migrate-v2` devuelve 404 (o gate); `CameraFitQaPanel` no monta sin `?qa=1`.

---

## Actualizaciones de memoria/contratos al cierre

- `mem://governance/rbac-canon`: extender catálogo con nuevas caps y reglas master-only.
- `mem://index.md` Core: actualizar línea "manage_permissions master-only" → añadir `manage_design_system`, `assign_master`, `run_geo_canonicalize`, `run_internal_tooling`.
- `docs/contracts/canon-change-policy.md`: añadir típica de "destructive action requires typed-token".
- `docs/audits/backlog.md`: cerrar items hygiene.

---

## Fuera de scope (deuda explícita anotada)

- Extracción lazy de `users`/`permissions` bodies fuera de `AdminPanel.tsx`.
- Versionado/rollback de `app_settings` y Design System overrides.
- Tope por sesión para `recover-missing-images`.
- Refactor cosmético del panel Permisos.

¿Procedo con Fase 1?
