-- PR-HYGIENE-5: purgar alias legacy `manage_geo_maintenance` del enum
-- app_permission y del catálogo RBAC. Reemplazado hace tiempo por el split
-- view_geo_maintenance / run_geo_backfill / run_geo_canonicalize.
--
-- Mismo patrón que PR-HYGIENE-2 (drop funciones que dependen del enum,
-- borrar filas de role_permissions, rename + recast, recrear funciones).

BEGIN;

DROP FUNCTION IF EXISTS public.has_permission(uuid, public.app_permission);
DROP FUNCTION IF EXISTS public.get_user_permissions(uuid);

DELETE FROM public.role_permissions
WHERE permission::text = 'manage_geo_maintenance';

ALTER TYPE public.app_permission RENAME TO app_permission_old;

CREATE TYPE public.app_permission AS ENUM (
  'manage_users',
  'manage_editorial_criteria',
  'run_global_enrichment',
  'delete_any_location',
  'moderate_content',
  'manage_permissions',
  'manage_marker_config',
  'manage_route_engine',
  'manage_icon_library',
  'manage_enrichment_config',
  'view_audit_log',
  'manage_data_sources',
  'run_image_recovery',
  'inspect_design_system',
  'purge_user',
  'open_back_office',
  'assign_master',
  'run_internal_tooling',
  'view_geo_maintenance',
  'run_geo_backfill',
  'run_geo_canonicalize'
);

ALTER TABLE public.role_permissions
  ALTER COLUMN permission TYPE public.app_permission
  USING permission::text::public.app_permission;

DROP TYPE public.app_permission_old;

CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS SETOF public.app_permission
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT rp.permission
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role = rp.role
  WHERE ur.user_id = _user_id
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission public.app_permission)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    WHERE ur.user_id = _user_id
      AND rp.permission = _permission
  )
$function$;

COMMIT;