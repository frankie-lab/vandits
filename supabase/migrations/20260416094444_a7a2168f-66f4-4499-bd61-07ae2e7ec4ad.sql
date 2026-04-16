
-- 1. Drop tables
DROP TABLE IF EXISTS curator_location_reviews CASCADE;
DROP TABLE IF EXISTS curator_documents CASCADE;
DROP TABLE IF EXISTS druid_locations CASCADE;
DROP TABLE IF EXISTS druids CASCADE;
DROP TABLE IF EXISTS curators CASCADE;

-- 2. Remove curator-related RLS policies on documents
DROP POLICY IF EXISTS "Curators can insert curator documents" ON documents;
DROP POLICY IF EXISTS "Masters can manage curator linked documents" ON documents;

-- 3. Remove curator-related RLS policies on locations
DROP POLICY IF EXISTS "Curators can insert locations for curator documents" ON locations;
DROP POLICY IF EXISTS "Masters can delete curator locations" ON locations;
DROP POLICY IF EXISTS "Masters can delete virtual curator locations" ON locations;
DROP POLICY IF EXISTS "Masters can update curator locations" ON locations;
DROP POLICY IF EXISTS "Masters can update virtual curator locations" ON locations;

-- 4. Drop curator helper functions
DROP FUNCTION IF EXISTS is_curator_location(locations) CASCADE;
DROP FUNCTION IF EXISTS is_virtual_curator_location(locations) CASCADE;

-- 5. Remove curator_id column from enrichment_jobs
ALTER TABLE enrichment_jobs DROP COLUMN IF EXISTS curator_id;

-- 6. Remove curator columns from profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS curator_category;
ALTER TABLE profiles DROP COLUMN IF EXISTS curator_color;
ALTER TABLE profiles DROP COLUMN IF EXISTS curator_icon;
ALTER TABLE profiles DROP COLUMN IF EXISTS curator_description;

-- 7. Clean up role_permissions for curator role
DELETE FROM role_permissions WHERE role = 'curator';
DELETE FROM user_roles WHERE role = 'curator';
DELETE FROM role_permissions WHERE permission = 'manage_documents';
