
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Create new policy: authenticated users can view profiles respecting privacy
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Own profile always visible
      id = auth.uid()
      OR
      -- Public profiles visible to all authenticated
      is_private = false
      OR
      -- Private profiles visible to accepted followers
      (
        is_private = true
        AND EXISTS (
          SELECT 1 FROM public.follows
          WHERE follower_id = auth.uid()
          AND following_id = profiles.id
          AND status = 'accepted'
        )
      )
      OR
      -- Masters/admins can see all
      has_role(auth.uid(), 'master'::app_role)
      OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  );
