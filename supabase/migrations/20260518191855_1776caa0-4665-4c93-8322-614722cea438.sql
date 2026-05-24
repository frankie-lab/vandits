-- =====================================================================
-- RBAC capabilities-first — Step 1b: poblar role_permissions
-- =====================================================================

-- Limpieza: cap zombi nunca-asignada, asegurar que no aparezca por error.
DELETE FROM public.role_permissions WHERE permission = 'manage_documents';

-- MASTER: todas las capabilities operativas nuevas + las clásicas suyas.
INSERT INTO public.role_permissions (role, permission)
VALUES
  ('master', 'manage_permissions'),
  ('master', 'manage_marker_config'),
  ('master', 'manage_route_engine'),
  ('master', 'manage_icon_library'),
  ('master', 'manage_enrichment_config'),
  ('master', 'view_audit_log'),
  ('master', 'manage_geo_maintenance'),
  ('master', 'manage_data_sources'),
  ('master', 'run_image_recovery'),
  ('master', 'manage_design_system'),
  ('master', 'purge_user'),
  ('master', 'open_back_office')
ON CONFLICT (role, permission) DO NOTHING;

-- ADMIN: paneles gobernados por _is_admin_or_master en RLS + gestión de usuarios + back office.
INSERT INTO public.role_permissions (role, permission)
VALUES
  ('admin', 'manage_users'),
  ('admin', 'manage_geo_maintenance'),
  ('admin', 'manage_data_sources'),
  ('admin', 'run_image_recovery'),
  ('admin', 'manage_design_system'),
  ('admin', 'purge_user'),
  ('admin', 'open_back_office')
ON CONFLICT (role, permission) DO NOTHING;
