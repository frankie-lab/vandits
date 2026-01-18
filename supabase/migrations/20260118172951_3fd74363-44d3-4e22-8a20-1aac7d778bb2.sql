-- Step 2: Add curator permissions
INSERT INTO public.role_permissions (role, permission) 
VALUES 
  ('curator', 'upload_files'),
  ('curator', 'add_locations')
ON CONFLICT DO NOTHING;

-- Step 3: Add curator metadata columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS curator_category TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS curator_color TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS curator_icon TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS curator_description TEXT DEFAULT NULL;

-- Step 4: Create function to check if a user is a curator
CREATE OR REPLACE FUNCTION public.is_curator(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'curator'
  )
$$;

-- Step 5: Create function to check if a location belongs to a curator
CREATE OR REPLACE FUNCTION public.is_curator_location(loc_row locations)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.user_roles ur ON ur.user_id = d.user_id
    WHERE d.id = loc_row.document_id 
    AND ur.role = 'curator'
  )
$$;

-- Step 6: Update can_view_location to include curator locations for all authenticated users
CREATE OR REPLACE FUNCTION public.can_view_location(loc_row locations)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Exclude soft-deleted items from normal view
    loc_row.deleted_at IS NULL
    AND (
      -- 1. Es público - cualquiera puede verlo
      loc_row.visibility = 'public'
      OR
      -- 2. El usuario actual es el dueño del documento
      EXISTS (
        SELECT 1 FROM public.documents 
        WHERE id = loc_row.document_id 
        AND user_id = auth.uid()
      )
      OR
      -- 3. Es de alguien que el usuario sigue Y la visibilidad lo permite
      (
        loc_row.visibility IN ('followers', 'public')
        AND EXISTS (
          SELECT 1 FROM public.documents d
          JOIN public.follows f ON f.following_id = d.user_id
          WHERE d.id = loc_row.document_id
          AND f.follower_id = auth.uid()
          AND f.status = 'accepted'
        )
      )
      OR
      -- 4. NUEVO: Es de un curador - visible para todos los autenticados
      (
        auth.uid() IS NOT NULL
        AND is_curator_location(loc_row)
      )
    )
$$;

-- Step 7: Allow Masters to update curator locations (they can manage any curator's points)
CREATE POLICY "Masters can update curator locations"
ON public.locations
FOR UPDATE
USING (
  has_role(auth.uid(), 'master'::app_role) 
  AND is_curator_location(locations.*)
);

-- Step 8: Allow Masters to delete curator locations
CREATE POLICY "Masters can delete curator locations"
ON public.locations
FOR DELETE
USING (
  has_role(auth.uid(), 'master'::app_role) 
  AND is_curator_location(locations.*)
);

-- Step 9: Allow Masters to insert locations for curators (via their documents)
-- This is handled by the existing document-based insert policy