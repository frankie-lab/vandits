
-- role_permissions: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can read role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated can read role permissions"
ON public.role_permissions FOR SELECT TO authenticated
USING (true);

-- achievement_definitions (catalogue of achievements): authenticated only
DROP POLICY IF EXISTS "Anyone can read active achievements" ON public.achievement_definitions;
CREATE POLICY "Authenticated can read active achievements"
ON public.achievement_definitions FOR SELECT TO authenticated
USING ((is_active = true) OR public.has_role(auth.uid(), 'master'::app_role));
