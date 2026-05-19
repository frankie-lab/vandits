-- PR-BACKOFFICE-GOVERNANCE F4 — master-only restrictions
-- manage_design_system: revocar de todos los roles ≠ master, asegurar en master.
DELETE FROM public.role_permissions
 WHERE permission = 'manage_design_system' AND role <> 'master';

INSERT INTO public.role_permissions (role, permission)
 VALUES ('master', 'manage_design_system')
 ON CONFLICT DO NOTHING;

-- manage_permissions: ya es master-only por canon. Re-asegurar (idempotente).
DELETE FROM public.role_permissions
 WHERE permission = 'manage_permissions' AND role <> 'master';

INSERT INTO public.role_permissions (role, permission)
 VALUES ('master', 'manage_permissions')
 ON CONFLICT DO NOTHING;