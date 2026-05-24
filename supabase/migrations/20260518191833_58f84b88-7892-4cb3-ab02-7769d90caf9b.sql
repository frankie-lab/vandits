-- =====================================================================
-- RBAC capabilities-first — Step 1 (canon decisión aprobada)
-- =====================================================================
-- Contexto:
--   has_permission(uid, app_permission) ya existe SECURITY DEFINER.
--   Aquí ampliamos el enum app_permission con capabilities OPERATIVAS
--   alineadas 1-a-1 con cada panel admin real, y poblamos role_permissions
--   reflejando lo que las RLS ya enforcement (master full, admin = los paneles
--   gobernados por _is_admin_or_master).
--
-- No drop de valores del enum (Postgres no soporta DROP VALUE).
-- 'manage_documents' queda como cap muerta pero NO se asigna a ningún rol.
-- =====================================================================

-- 1. Añadir capabilities operativas que faltan
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'manage_permissions';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'manage_marker_config';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'manage_route_engine';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'manage_icon_library';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'manage_enrichment_config';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'view_audit_log';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'manage_geo_maintenance';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'manage_data_sources';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'run_image_recovery';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'manage_design_system';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'purge_user';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'open_back_office';
