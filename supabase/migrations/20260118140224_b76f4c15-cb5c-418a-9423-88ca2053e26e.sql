-- Allow admins and masters to update any location
CREATE POLICY "Admins can update any location"
ON public.locations
FOR UPDATE
USING (
  has_role(auth.uid(), 'master'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);