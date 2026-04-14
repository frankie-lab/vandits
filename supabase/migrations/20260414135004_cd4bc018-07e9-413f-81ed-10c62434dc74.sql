
-- 1. Add original_file_path column to documents
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS original_file_path text;

-- 2. Create storage bucket for original files
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-originals', 'document-originals', false)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS: users can upload their own originals
CREATE POLICY "Users can upload their own originals"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'document-originals'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. RLS: users can read their own originals
CREATE POLICY "Users can read their own originals"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'document-originals'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. RLS: users can delete their own originals
CREATE POLICY "Users can delete their own originals"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'document-originals'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
