-- Drop and recreate the function with fixed logic
CREATE OR REPLACE FUNCTION public.can_view_location(loc_row locations)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- 1. Es público - cualquiera puede verlo
    loc_row.visibility = 'public'
    OR
    -- 2. El usuario actual es el dueño del documento (siempre puede ver sus propios puntos)
    EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = loc_row.document_id 
      AND user_id = auth.uid()
    )
    OR
    -- 3. Es de alguien que el usuario sigue Y la visibilidad lo permite (followers o public)
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
$$;