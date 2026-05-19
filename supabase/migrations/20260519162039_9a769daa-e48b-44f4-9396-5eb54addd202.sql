-- PR-BACKOFFICE-UX-CLOSURE-1 — Purga supervisor + curator + user del enum app_role.
-- Patrón: snapshot policies → drop functions CASCADE → recycle enum → recreate functions → replay policies.

BEGIN;

-- 1. Snapshot de policies que dependen de has_role (serán droppeadas por CASCADE).
CREATE TEMP TABLE _policy_backup ON COMMIT DROP AS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE qual LIKE '%has_role%' OR with_check LIKE '%has_role%';

-- 2. Drop funciones (CASCADE elimina las policies dependientes).
DROP FUNCTION IF EXISTS public.get_user_roles(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;

-- 3. Reciclar enum: columnas → text temporalmente.
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE public.role_permissions
  ALTER COLUMN role TYPE text USING role::text;

-- 4. Defensa en profundidad: limpiar cualquier fila con roles purgados (debe ser 0).
DELETE FROM public.user_roles
  WHERE role IN ('user', 'supervisor', 'curator');
DELETE FROM public.role_permissions
  WHERE role IN ('user', 'supervisor', 'curator');

-- 5. Recrear enum con sólo los 4 valores canon.
DROP TYPE public.app_role;
CREATE TYPE public.app_role AS ENUM ('master', 'admin', 'moderator', 'editor');

-- 6. Columnas → app_role nuevo.
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role USING role::public.app_role;
ALTER TABLE public.role_permissions
  ALTER COLUMN role TYPE public.app_role USING role::public.app_role;

-- 7. Recrear funciones con firma idéntica.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS SETOF public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;

-- 8. Replay de policies desde snapshot — idénticas, sin cambios semánticos.
DO $replay$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT * FROM _policy_backup LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      pol.permissive,
      pol.cmd,
      array_to_string(pol.roles, ','),
      CASE WHEN pol.qual IS NOT NULL
        THEN ' USING (' || pol.qual || ')' ELSE '' END,
      CASE WHEN pol.with_check IS NOT NULL
        THEN ' WITH CHECK (' || pol.with_check || ')' ELSE '' END
    );
  END LOOP;
END
$replay$;

-- 9. Assertion final.
DO $assert$
DECLARE
  leftover int;
BEGIN
  SELECT count(*) INTO leftover
  FROM pg_enum
  WHERE enumtypid = 'public.app_role'::regtype
    AND enumlabel IN ('user', 'supervisor', 'curator');
  IF leftover > 0 THEN
    RAISE EXCEPTION 'PR-BACKOFFICE-UX-CLOSURE-1: enum purge failed, % zombies remain', leftover;
  END IF;
END
$assert$;

COMMIT;