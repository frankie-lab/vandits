-- Rename viewer to supervisor
ALTER TYPE app_role RENAME VALUE 'viewer' TO 'supervisor';

-- Add view_all_locations permission to supervisor
INSERT INTO role_permissions (role, permission)
VALUES ('supervisor', 'view_all_locations')
ON CONFLICT (role, permission) DO NOTHING;