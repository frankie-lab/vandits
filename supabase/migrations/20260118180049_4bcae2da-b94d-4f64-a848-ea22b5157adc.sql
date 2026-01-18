-- Add policy to allow curators to insert documents with null user_id
-- This is for curator-owned documents that are linked via curator_documents table

CREATE POLICY "Curators can insert curator documents" 
ON public.documents 
FOR INSERT 
WITH CHECK (
  -- Allow if user_id is null AND the user has curator role or manage_documents permission
  (user_id IS NULL AND (
    public.has_role(auth.uid(), 'curator') OR 
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'master') OR
    public.has_permission(auth.uid(), 'manage_documents')
  ))
);