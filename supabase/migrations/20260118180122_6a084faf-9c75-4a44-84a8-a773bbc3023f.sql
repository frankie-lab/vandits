-- Allow curators/admins to insert into curator_documents
CREATE POLICY "Curators can link documents to curators" 
ON public.curator_documents 
FOR INSERT 
WITH CHECK (
  public.has_role(auth.uid(), 'curator') OR 
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'master') OR
  public.has_permission(auth.uid(), 'manage_documents')
);

-- Allow curators/masters to insert locations for curator documents (user_id is null)
CREATE POLICY "Curators can insert locations for curator documents" 
ON public.locations 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.curator_documents cd
    WHERE cd.document_id = locations.document_id
  )
  AND (
    public.has_role(auth.uid(), 'curator') OR 
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'master') OR
    public.has_permission(auth.uid(), 'manage_documents')
  )
);