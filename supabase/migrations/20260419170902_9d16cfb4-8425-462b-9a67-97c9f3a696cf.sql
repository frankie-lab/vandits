
-- 1) Add owner_user_id to locations (persistent ownership)
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

-- 2) Backfill from documents.user_id
UPDATE public.locations l
SET owner_user_id = d.user_id
FROM public.documents d
WHERE l.document_id = d.id
  AND l.owner_user_id IS NULL;

-- Also backfill from pioneer_user_id when document already missing
UPDATE public.locations
SET owner_user_id = pioneer_user_id
WHERE owner_user_id IS NULL
  AND pioneer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_owner_user_id
  ON public.locations(owner_user_id);

-- 3) Replace FK: ON DELETE CASCADE -> ON DELETE SET NULL
ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_document_id_fkey;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE SET NULL;

-- 4) Update can_view_location to support orphan locations (document_id IS NULL)
CREATE OR REPLACE FUNCTION public.can_view_location(loc_row public.locations)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    loc_row.deleted_at IS NULL
    AND (
      -- Public
      loc_row.visibility = 'public'
      OR
      -- Owner via owner_user_id (works even when document is gone)
      loc_row.owner_user_id = auth.uid()
      OR
      -- Owner via document
      EXISTS (
        SELECT 1 FROM public.documents
        WHERE id = loc_row.document_id
          AND user_id = auth.uid()
      )
      OR
      -- Followers of the owner
      (
        loc_row.visibility IN ('followers', 'public')
        AND loc_row.owner_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE f.following_id = loc_row.owner_user_id
            AND f.follower_id = auth.uid()
            AND f.status = 'accepted'
        )
      )
      OR
      -- Followers via document owner
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

-- 5) Update can_view_deleted_location
CREATE OR REPLACE FUNCTION public.can_view_deleted_location(loc_row public.locations)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    loc_row.deleted_at IS NOT NULL
    AND loc_row.deleted_at > (NOW() - INTERVAL '30 days')
    AND (
      loc_row.owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.documents
        WHERE id = loc_row.document_id
          AND user_id = auth.uid()
      )
    )
$function$;

-- 6) Update RLS policies for INSERT/UPDATE/DELETE on locations to support owner_user_id
DROP POLICY IF EXISTS "Users can insert their own locations" ON public.locations;
CREATE POLICY "Users can insert their own locations"
ON public.locations
FOR INSERT
WITH CHECK (
  owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = locations.document_id
      AND documents.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update their own locations" ON public.locations;
CREATE POLICY "Users can update their own locations"
ON public.locations
FOR UPDATE
USING (
  owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = locations.document_id
      AND documents.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete their own locations" ON public.locations;
CREATE POLICY "Users can delete their own locations"
ON public.locations
FOR DELETE
USING (
  owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = locations.document_id
      AND documents.user_id = auth.uid()
  )
);

-- 7) Trigger: auto-fill owner_user_id on insert when missing
CREATE OR REPLACE FUNCTION public.set_location_owner_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    IF NEW.document_id IS NOT NULL THEN
      SELECT user_id INTO NEW.owner_user_id
      FROM public.documents
      WHERE id = NEW.document_id;
    END IF;
    IF NEW.owner_user_id IS NULL THEN
      NEW.owner_user_id := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_location_owner_user_id ON public.locations;
CREATE TRIGGER trg_set_location_owner_user_id
BEFORE INSERT ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.set_location_owner_user_id();
