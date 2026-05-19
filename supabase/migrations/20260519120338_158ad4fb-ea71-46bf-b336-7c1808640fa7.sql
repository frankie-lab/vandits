-- PR-BACKOFFICE-GOVERNANCE F2 — Step 2: seed role_permissions for new caps.
INSERT INTO public.role_permissions (role, permission) VALUES
  ('master', 'assign_master'),
  ('master', 'run_internal_tooling'),
  ('master', 'view_geo_maintenance'),
  ('admin',  'view_geo_maintenance'),
  ('master', 'run_geo_backfill'),
  ('admin',  'run_geo_backfill'),
  ('master', 'run_geo_canonicalize')
ON CONFLICT (role, permission) DO NOTHING;