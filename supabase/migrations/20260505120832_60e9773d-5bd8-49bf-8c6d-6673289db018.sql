
-- 1. role_permissions: require auth
DROP POLICY IF EXISTS "Authenticated can read role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Anyone can read role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated users can read role permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 2. user_achievements: require auth (was USING true)
DROP POLICY IF EXISTS "Users can read all achievements" ON public.user_achievements;
CREATE POLICY "Authenticated users can read achievements"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 3. profiles: hide home coordinates from non-owners at column level.
-- The app already reads home via get_my_home() / get_profile_home() RPCs (SECURITY DEFINER),
-- so direct column SELECT can be revoked from clients without breaking functionality.
REVOKE SELECT (home_latitude, home_longitude, home_name) ON public.profiles FROM anon, authenticated;

-- 4. storage avatars: drop overly broad policies and rely on owner-scoped ones already in place
DROP POLICY IF EXISTS "Authenticated users can delete curator avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update curator avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload curator avatars" ON storage.objects;

-- 5. realtime.messages: restrict subscriptions to own user topic or public:* topics
DROP POLICY IF EXISTS "Authenticated users can read own/public realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated users can read own/public realtime topics"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    (realtime.topic() = ('user:' || auth.uid()::text))
    OR (realtime.topic() LIKE 'public:%')
  );

DROP POLICY IF EXISTS "Authenticated users can broadcast to own/public topics" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast to own/public topics"
  ON realtime.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    (realtime.topic() = ('user:' || auth.uid()::text))
    OR (realtime.topic() LIKE 'public:%')
  );
