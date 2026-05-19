-- PR-MASTER-BYPASS-1
-- Decisión arquitectónica: master es supercap implícita.
-- has_permission(uid, cap) corto-circuita a TRUE si el usuario tiene rol master.
-- Independiente de role_permissions (que sigue gobernando admin/moderator/editor).

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission app_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'master'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role = rp.role
      WHERE ur.user_id = _user_id
        AND rp.permission = _permission
    )
$$;

COMMENT ON FUNCTION public.has_permission(uuid, app_permission) IS
  'SoT de autorización. Master = supercap implícita (bypass vía has_role). Otros roles dependen de role_permissions. PR-MASTER-BYPASS-1.';
