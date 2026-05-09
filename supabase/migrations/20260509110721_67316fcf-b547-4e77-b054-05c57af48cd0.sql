
-- Pin search_path on the pure helper.
ALTER FUNCTION public._compute_location_geo_health(
  double precision, double precision, uuid, uuid, uuid, uuid,
  text, text, text, text, text, uuid, text, text, uuid, text, uuid
) SET search_path = public;

-- Revoke from public/anon, grant to authenticated.
REVOKE EXECUTE ON FUNCTION public.admin_user_geo_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_geo_tree(uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_geo_locations(uuid, text, text, text, text, text[], integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_geo_scope_ids(uuid, text[], text, text, text, text, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_user_geo_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_geo_tree(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_geo_locations(uuid, text, text, text, text, text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_geo_scope_ids(uuid, text[], text, text, text, text, integer, integer) TO authenticated;
