-- Add soft-delete column to locations table
ALTER TABLE public.locations 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for efficient queries on deleted items
CREATE INDEX IF NOT EXISTS idx_locations_deleted_at ON public.locations(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update the can_view_location function to exclude soft-deleted items
CREATE OR REPLACE FUNCTION public.can_view_location(loc_row locations)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    -- Exclude soft-deleted items from normal view (unless owner viewing trash)
    loc_row.deleted_at IS NULL
    AND (
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
    )
$function$;

-- Create a function to view own deleted locations (for trash view)
CREATE OR REPLACE FUNCTION public.can_view_deleted_location(loc_row locations)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    loc_row.deleted_at IS NOT NULL
    AND loc_row.deleted_at > (NOW() - INTERVAL '30 days')
    AND EXISTS (
      SELECT 1 FROM public.documents 
      WHERE id = loc_row.document_id 
      AND user_id = auth.uid()
    )
$function$;

-- Add RLS policy for viewing trash
CREATE POLICY "Users can view their deleted locations"
ON public.locations
FOR SELECT
USING (can_view_deleted_location(locations.*));

-- Create a scheduled function to permanently delete old items (>30 days)
-- This will be called by a cron job or edge function
CREATE OR REPLACE FUNCTION public.cleanup_old_deleted_locations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.locations
  WHERE deleted_at IS NOT NULL
    AND deleted_at < (NOW() - INTERVAL '30 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;