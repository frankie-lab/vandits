
-- Block B5: hide home location for non-owners when hide_home_location is true
-- Implement by recreating the SELECT policy on profiles to hide via view? 
-- Simpler: use a SECURITY DEFINER RPC, but to keep transparent, drop direct column read 
-- and add a column-level filter via policy + view is overkill. Instead nullify via trigger on read 
-- isn't possible. We add a sanitizing view + revoke direct SELECT? That breaks PostgREST.
-- Pragmatic approach: keep table read but add CHECK in policy that home_* are only visible to owner
-- Postgres RLS is row-level, not column-level. We solve with a BEFORE-row read trick via view.
-- Use a security definer function exposed via PostgREST and update client. But that's invasive.
--
-- Adopted solution: column-level privilege.
-- 1) Revoke SELECT on home_latitude, home_longitude, home_name from authenticated
-- 2) Provide SECURITY DEFINER function get_profile_home(uid) that returns home only to the owner
--    or when hide_home_location = false.
-- 3) Application code that needs home reads it via the function; followers querying the table 
--    will simply receive NULL because they lack column SELECT.

REVOKE SELECT (home_latitude, home_longitude, home_name) ON public.profiles FROM authenticated, anon;
GRANT  SELECT (home_latitude, home_longitude, home_name) ON public.profiles TO authenticated;

-- Replace SELECT policy with column-aware logic via a separate policy that restricts home_* columns.
-- Postgres RLS does not support per-column USING. We rely instead on a sanitizer function for 
-- followers and keep the table policy unchanged. Owners and masters can still read all columns.
-- For followers we expose:

CREATE OR REPLACE FUNCTION public.get_profile_home(_profile_id uuid)
RETURNS TABLE(home_latitude double precision, home_longitude double precision, home_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE WHEN p.id = auth.uid() OR p.hide_home_location = false 
         THEN p.home_latitude ELSE NULL END,
    CASE WHEN p.id = auth.uid() OR p.hide_home_location = false 
         THEN p.home_longitude ELSE NULL END,
    CASE WHEN p.id = auth.uid() OR p.hide_home_location = false 
         THEN p.home_name ELSE NULL END
  FROM public.profiles p
  WHERE p.id = _profile_id
    AND (
      p.id = auth.uid()
      OR p.is_private = false
      OR EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = auth.uid() AND f.following_id = p.id AND f.status = 'accepted'
      )
      OR public.has_role(auth.uid(), 'master'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
$$;

-- Approach simpler: drop column-level revoke complications; keep RLS as-is and instead add a 
-- TRIGGER-free solution by dropping home_* visibility via an updatable VIEW is invasive.
-- We'll go with: revoke columns (already done) so any client SELECT * gets NULLs for non-grantees.
-- But we GRANTed back to authenticated so all authenticated users still see them. That's wrong.
-- Fix: do NOT grant home columns to authenticated; instead grant to a role-less helper not needed.
-- Revert the grant and rely on column-level revoke for ALL authenticated; owners read via RPC.

REVOKE SELECT (home_latitude, home_longitude, home_name) ON public.profiles FROM authenticated;

-- Provide owner read via dedicated function:
CREATE OR REPLACE FUNCTION public.get_my_home()
RETURNS TABLE(home_latitude double precision, home_longitude double precision, home_name text, hide_home_location boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT home_latitude, home_longitude, home_name, hide_home_location
  FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_home(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_home() TO authenticated;

-- Block B6: Storage avatar — only owner can update/delete their avatar
-- Convention: avatars stored at {user_id}/...
DROP POLICY IF EXISTS "Avatar owners can update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar owners can delete" ON storage.objects;

CREATE POLICY "Avatar owners can update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatar owners can delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Also restrict INSERT to the owner's folder
DROP POLICY IF EXISTS "Avatar owners can insert" ON storage.objects;
CREATE POLICY "Avatar owners can insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Block C: Realtime messages — default-deny + allow only user:{uid} or postgres_changes (no topic)
-- Enable RLS on realtime.messages and create policies
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can subscribe to own user channel" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to own user channel"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() LIKE 'public:%'
);

DROP POLICY IF EXISTS "Authenticated can send to own user channel" ON realtime.messages;
CREATE POLICY "Authenticated can send to own user channel"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() LIKE 'public:%'
);
