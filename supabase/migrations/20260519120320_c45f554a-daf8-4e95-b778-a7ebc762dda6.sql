-- PR-BACKOFFICE-GOVERNANCE F2 — Step 1: extend enum and add helpers.
-- NOTE: ALTER TYPE ... ADD VALUE cannot be referenced in the same tx where
-- it is added. We split into two migrations: this one adds enum values; the
-- next migration seeds role_permissions for those new values.

ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'assign_master';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'run_internal_tooling';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'view_geo_maintenance';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'run_geo_backfill';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'run_geo_canonicalize';

-- Guard helper: returns the current count of users holding the 'master' role.
-- Used by purge-user and by role-toggle flows to refuse degrading to 0 masters.
CREATE OR REPLACE FUNCTION public.count_masters()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.user_roles WHERE role = 'master';
$$;

REVOKE ALL ON FUNCTION public.count_masters() FROM public;
GRANT EXECUTE ON FUNCTION public.count_masters() TO authenticated, service_role;