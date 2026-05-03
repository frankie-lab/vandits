
REVOKE EXECUTE ON FUNCTION public.get_my_home() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_profile_home(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_home() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_profile_home(uuid) TO authenticated;
