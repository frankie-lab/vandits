
-- 1) Drop obsolete backup table (no longer needed; geography data lives in admin_areas)
DROP TABLE IF EXISTS public.admin_areas_name_backup_2026_05_11;

-- 2) Restrict data_sources SELECT to admins/masters (edge functions use service-role, unaffected)
DROP POLICY IF EXISTS "data_sources select all auth" ON public.data_sources;
DROP POLICY IF EXISTS "data_sources admin read" ON public.data_sources;
CREATE POLICY "data_sources admin read"
  ON public.data_sources FOR SELECT
  TO authenticated
  USING (public._is_admin_or_master(auth.uid()));

-- 3) Restrict user_achievements SELECT to owner (+ admin/master)
DROP POLICY IF EXISTS "Authenticated users can read achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can read own achievements" ON public.user_achievements;
CREATE POLICY "Users can read own achievements"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public._is_admin_or_master(auth.uid()));
