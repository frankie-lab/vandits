-- PR-HYGIENE-2: purgar capabilities zombie del enum app_permission y del SoT.
--
-- Capabilities a eliminar (sin consumidores en cliente, edge ni RLS):
--   view_all_locations, edit_all_locations, manage_documents,
--   view_analytics, upload_files, add_locations
--
-- Pasos:
-- 1) Drop funciones que dependen del enum.
-- 2) Borrar filas zombie de role_permissions.
-- 3) Renombrar enum viejo, crear enum nuevo sin zombies, recast columna.
-- 4) Recrear funciones has_permission / get_user_permissions.

BEGIN;

DROP FUNCTION IF EXISTS public.has_permission(uuid, public.app_permission);
DROP FUNCTION IF EXISTS public.get_user_permissions(uuid);

DELETE FROM public.role_permissions
WHERE permission::text IN (
  'view_all_locations',
  'edit_all_locations',
  'manage_documents',
  'view_analytics',
  'upload_files',
  'add_locations'
);

ALTER TYPE public.app_permission RENAME TO app_permission_old;

CREATE TYPE public.app_permission AS ENUM (
  'manage_users',
  'manage_criteria',
  'run_global_enrichment',
  'delete_any_location',
  'moderate_content',
  'manage_permissions',
  'manage_marker_config',
  'manage_route_engine',
  'manage_icon_library',
  'manage_enrichment_config',
  'view_audit_log',
  'manage_geo_maintenance',
  'manage_data_sources',
  'run_image_recovery',
  'manage_design_system',
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