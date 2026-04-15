-- Drop permissive SELECT policies on storage
DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view public location photos" ON storage.objects;

-- Restricted: users list only their own avatar folder + curator avatars
CREATE POLICY "Users list own avatars"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR name LIKE 'curator-%'
  )
);

-- Restricted: users list only their own photo folder + default (admin) folder
CREATE POLICY "Users list own location photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'location-photos' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = 'default'
  )
);