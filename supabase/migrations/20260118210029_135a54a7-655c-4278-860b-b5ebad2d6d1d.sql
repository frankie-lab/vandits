-- Add RLS policies for the avatars bucket to allow curator avatar uploads

-- Allow authenticated users to upload files to the avatars bucket
CREATE POLICY "Authenticated users can upload curator avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Allow anyone to read files from the avatars bucket (it's public)
CREATE POLICY "Anyone can read avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow authenticated users to update their uploaded files
CREATE POLICY "Authenticated users can update curator avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

-- Allow authenticated users to delete files from avatars bucket
CREATE POLICY "Authenticated users can delete curator avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');