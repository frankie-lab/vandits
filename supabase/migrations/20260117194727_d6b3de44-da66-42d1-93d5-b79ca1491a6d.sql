-- Drop problematic policies
DROP POLICY IF EXISTS "Masters can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

-- Create a single, simple SELECT policy using security definer function
CREATE POLICY "Users can read roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR has_role(auth.uid(), 'master')
);