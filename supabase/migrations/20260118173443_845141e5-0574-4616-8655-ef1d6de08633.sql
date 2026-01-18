-- Create curators table for virtual curators (no auth user required)
CREATE TABLE public.curators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  color TEXT DEFAULT '#14b8a6',
  icon TEXT DEFAULT '📍',
  avatar_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.curators ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view active curators
CREATE POLICY "Authenticated users can view active curators"
ON public.curators FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

-- Masters can manage all curators
CREATE POLICY "Masters can manage curators"
ON public.curators FOR ALL
USING (has_role(auth.uid(), 'master'::app_role));

-- Create curator_documents table to link curators to documents
CREATE TABLE public.curator_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES public.curators(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(curator_id, document_id)
);

-- Enable RLS
ALTER TABLE public.curator_documents ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view curator documents
CREATE POLICY "Authenticated users can view curator documents"
ON public.curator_documents FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Masters can manage curator documents
CREATE POLICY "Masters can manage curator documents"
ON public.curator_documents FOR ALL
USING (has_role(auth.uid(), 'master'::app_role));

-- Create function to check if a location belongs to a virtual curator
CREATE OR REPLACE FUNCTION public.is_virtual_curator_location(loc_row locations)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.curator_documents cd
    JOIN public.curators c ON c.id = cd.curator_id
    WHERE cd.document_id = loc_row.document_id
    AND c.is_active = true
  )
$$;

-- Update can_view_location to include virtual curator locations
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
      -- 4. Es de un curador con usuario - visible para todos los autenticados
      (
        auth.uid() IS NOT NULL
        AND is_curator_location(loc_row)
      )
      OR
      -- 5. NUEVO: Es de un curador virtual - visible para todos los autenticados
      (
        auth.uid() IS NOT NULL
        AND is_virtual_curator_location(loc_row)
      )
    )
$$;

-- Allow Masters to update/delete virtual curator locations
CREATE POLICY "Masters can update virtual curator locations"
ON public.locations FOR UPDATE
USING (
  has_role(auth.uid(), 'master'::app_role) 
  AND is_virtual_curator_location(locations.*)
);

CREATE POLICY "Masters can delete virtual curator locations"
ON public.locations FOR DELETE
USING (
  has_role(auth.uid(), 'master'::app_role) 
  AND is_virtual_curator_location(locations.*)
);

-- Allow Masters to insert locations in curator documents
-- (They need to be able to insert in documents that are linked to curators)
-- First, update documents policy to allow masters to manage curator documents
CREATE POLICY "Masters can manage curator linked documents"
ON public.documents FOR ALL
USING (
  has_role(auth.uid(), 'master'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.curator_documents cd
    WHERE cd.document_id = documents.id
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_curators_updated_at
BEFORE UPDATE ON public.curators
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();