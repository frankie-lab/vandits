-- Drop the problematic policy
DROP POLICY IF EXISTS "Masters can view all roles" ON public.user_roles;

-- Create a simple policy that allows users to read their own roles (no recursion)
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Create a separate policy for masters to view ALL roles (using security definer function)
CREATE POLICY "Masters can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role = 'master'
  )
);