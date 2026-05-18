# PR-ADMIN-AUDIT-3 · Fase B — Ejecución migración enum `app_role`

Preflight ya validado en turno anterior: 0 policies, 0 funciones activas, 0 filas zombi, dependencias acotadas a `user_roles.role`, `role_permissions.role`, `has_role`, `get_user_roles`.

## Paso 1 — Migración (vía `supabase--migration`)

```sql
-- Nuevo enum sin curator/user (supervisor se mantiene)
CREATE TYPE public.app_role_new AS ENUM (
  'master', 'admin', 'moderator', 'editor', 'supervisor'
);

-- Drop de funciones que tipan el enum en su firma
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.get_user_roles(uuid);

-- Recasteo de columnas (falla si quedara alguna fila zombi)
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role_new
  USING role::text::public.app_role_new;

ALTER TABLE public.role_permissions
  ALTER COLUMN role TYPE public.app_role_new
  USING role::text::public.app_role_new;

-- Rotación del tipo
DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;

-- Recreación verbatim de funciones
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS SETOF public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;
```

## Paso 2 — 6 verificaciones post-migración (vía `supabase--read_query`)

1. `SELECT unnest(enum_range(NULL::public.app_role))::text` → debe devolver exactamente `master, admin, moderator, editor, supervisor`.
2. `SELECT public.has_role(<master_uid>, 'master')` → `true`.
3. `SELECT * FROM public.get_user_roles(<editor_uid>)` → `['editor']`.
4. `SELECT permission FROM public.get_user_permissions(<editor_uid>)` → 4 caps: `view_all_locations, edit_all_locations, upload_files, add_locations`.
5. `SELECT count(*) FROM public.role_permissions WHERE role = 'supervisor'` → cap count intacto (sanity de no-alteración).
6. `SELECT 'curator'::public.app_role` y `SELECT 'user'::public.app_role` → ambos deben fallar con `invalid input value for enum`.

Cada resultado se reporta 1:1 contra el criterio. Si alguno falla, STOP y diagnóstico antes de continuar al Paso 3.

## Paso 3 — Cierre BL-021 + canon

- `docs/audits/backlog.md`: BL-021 pasa de `open` → `resolved`, con timestamp y nota de los 6 checks. BL-022 sigue `open` (fuera de alcance).
- `mem://governance/rbac-canon`: anotar que el enum DB ya está alineado al catálogo UI; `curator`/`user` purgados también de la fuente; `supervisor` explícitamente "en revisión Fase C".
- `mem://index.md` (Core): actualizar la línea RBAC reemplazando *"pendiente purga del enum DB (Fase B)"* por *"enum DB alineado (Fase B cerrada)"*.

## Fuera de alcance (sin cambios)

- `supervisor` (Fase C separada).
- Branches `isCurator` en `map-popups.ts` (BL-022).
- Migraciones históricas con strings `'curator'`/`'user'` (inmutables).
- Master bypass en RLS / `has_permission`.
- Frontend: tipos ya alineados en Fase A, no requiere tocar nada.
