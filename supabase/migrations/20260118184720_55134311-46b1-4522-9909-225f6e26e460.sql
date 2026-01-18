-- Add new enrichment configuration columns to curators table
ALTER TABLE public.curators
ADD COLUMN IF NOT EXISTS enrichment_expected_nature TEXT DEFAULT 'poi',
ADD COLUMN IF NOT EXISTS enrichment_search_radius_meters INTEGER DEFAULT 500,
ADD COLUMN IF NOT EXISTS enrichment_include_contact BOOLEAN DEFAULT true;

-- Comment columns for documentation
COMMENT ON COLUMN public.curators.enrichment_expected_nature IS 'Expected type/nature of points: poi, beach, restaurant, hotel, monument, natural, city, village, etc.';
COMMENT ON COLUMN public.curators.enrichment_search_radius_meters IS 'Radius in meters from coordinates to search for matching results';
COMMENT ON COLUMN public.curators.enrichment_include_contact IS 'Whether to include contact data (phone, website, hours) in enrichment';