-- Fix: remove references to deleted curator system from RLS helper function
-- The functions is_curator_location() and is_virtual_curator_location() no longer exist
-- because the curator system was completely removed from the codebase and database.
-- This was breaking ALL SELECT queries on the locations table with PGRST 42883.

CREATE OR REPLACE FUNCTION public.can_view_location(loc_row locations)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    -- Exclude soft-deleted items from normal view
    loc_row.deleted_at IS NULL
    AND (
      -- 1. Public - anyone can view
      loc_row.visibility = 'public'
      OR
      -- 2. Current user owns the document
      EXISTS (
        SELECT 1 FROM public.documents 
        WHERE id = loc_row.document_id 
        AND user_id = auth.uid()
      )
      OR
      -- 3. From someone the user follows AND visibility allows it
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
    )
$function$;